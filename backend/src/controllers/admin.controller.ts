import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../middleware/auth.middleware';
import pool from '../config/database';

const VALID_ROLES = ['viewer', 'editor', 'admin']; // superadmin géré séparément

// ─── Helper : s'assurer qu'un user cible appartient au même tenant ────────────
async function assertSameTenant(
  requesterId: number,
  requesterTenantId: number | null,
  requesterRole: string,
  targetUserId: number,
  res: Response
): Promise<boolean> {
  if (requesterRole === 'superadmin') return true; // superadmin passe partout
  const r = await pool.query('SELECT tenant_id FROM users WHERE id = $1', [targetUserId]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return false;
  }
  if (r.rows[0].tenant_id !== requesterTenantId) {
    res.status(403).json({ error: 'Accès refusé — utilisateur hors de votre cabinet' });
    return false;
  }
  return true;
}

// GET /api/admin/users
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, role } = req.user!;
    let result;

    if (role === 'superadmin') {
      // Superadmin : tous les users de tous les tenants
      result = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at,
                t.name AS tenant_name
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         ORDER BY t.name, u.created_at DESC`
      );
    } else {
      // Admin : uniquement les users de son tenant
      result = await pool.query(
        `SELECT id, email, first_name, last_name, role, is_active, created_at
         FROM users
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );
    }

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/admin/users
export const createUser = async (req: AuthRequest, res: Response) => {
  const { email, password, first_name, last_name, role = 'viewer' } = req.body;
  const { tenantId, role: requesterRole } = req.user!;

  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min)' });
  }
  // Un admin non-superadmin doit avoir un tenant
  if (requesterRole !== 'superadmin' && !tenantId) {
    return res.status(400).json({ error: 'Tenant non défini' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, 12);
    // Le nouvel utilisateur hérite du tenant de l'admin qui le crée
    const assignedTenantId = requesterRole === 'superadmin'
      ? (req.body.tenant_id ?? null)
      : tenantId;

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, tenant_id)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, email, first_name, last_name, role, is_active, created_at`,
      [email.toLowerCase().trim(), hash, first_name.trim(), last_name.trim(), role, assignedTenantId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
};

// GET /api/admin/users/:id/sci-permissions
export const getUserSciPermissions = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const ok = await assertSameTenant(req.user!.id, req.user!.tenantId, req.user!.role, parseInt(id), res);
  if (!ok) return;
  try {
    const result = await pool.query(
      `SELECT sci_id FROM user_sci_permissions WHERE user_id = $1`,
      [id]
    );
    res.json({ sci_ids: result.rows.map((r: any) => r.sci_id) });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// PUT /api/admin/users/:id/sci-permissions
export const setUserSciPermissions = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { sci_ids } = req.body; // number[]

  const ok = await assertSameTenant(req.user!.id, req.user!.tenantId, req.user!.role, parseInt(id), res);
  if (!ok) return;

  if (!Array.isArray(sci_ids)) {
    return res.status(400).json({ error: 'sci_ids doit être un tableau' });
  }

  // Vérifier que tous les sci_ids appartiennent au tenant de l'admin
  if (req.user!.role !== 'superadmin' && req.user!.tenantId && sci_ids.length > 0) {
    const check = await pool.query(
      `SELECT COUNT(*) AS cnt FROM sci WHERE id = ANY($1::int[]) AND tenant_id = $2`,
      [sci_ids, req.user!.tenantId]
    );
    if (parseInt(check.rows[0].cnt) !== sci_ids.length) {
      return res.status(403).json({ error: 'Certaines SCI n\'appartiennent pas à votre cabinet' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_sci_permissions WHERE user_id = $1', [id]);
    for (const sciId of sci_ids) {
      await client.query(
        'INSERT INTO user_sci_permissions (user_id, sci_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, sciId]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Permissions mises à jour', sci_ids });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('setUserSciPermissions error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des permissions' });
  } finally {
    client.release();
  }
};

// PUT /api/admin/users/:id
export const updateUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { first_name, last_name, role, is_active, password } = req.body;

  const ok = await assertSameTenant(req.user!.id, req.user!.tenantId, req.user!.role, parseInt(id), res);
  if (!ok) return;

  // Empêcher l'admin de se modifier lui-même (rôle ou désactivation)
  if (parseInt(id) === req.user?.id) {
    if (role && role !== req.user.role) {
      return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
    }
    if (is_active === false) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous désactiver vous-même' });
    }
  }

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }

  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (first_name !== undefined) { fields.push(`first_name = $${idx++}`); values.push(first_name.trim()); }
    if (last_name  !== undefined) { fields.push(`last_name = $${idx++}`);  values.push(last_name.trim()); }
    if (role       !== undefined) { fields.push(`role = $${idx++}`);       values.push(role); }
    if (is_active  !== undefined) { fields.push(`is_active = $${idx++}`);  values.push(is_active); }
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court' });
      const hash = await bcrypt.hash(password, 12);
      fields.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(parseInt(id));

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, email, first_name, last_name, role, is_active`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
};

// ─── Journal d'audit (superadmin uniquement) ──────────────────────────────────
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50', user_id, action, entity_type, date_from, date_to } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const conditions: string[] = []
    const params: any[] = []
    let p = 1

    if (user_id)     { conditions.push(`al.user_id = $${p++}`);       params.push(parseInt(user_id)) }
    if (action)      { conditions.push(`al.action ILIKE $${p++}`);    params.push(`%${action}%`) }
    if (entity_type) { conditions.push(`al.entity_type = $${p++}`);   params.push(entity_type) }
    if (date_from)   { conditions.push(`al.created_at >= $${p++}`);   params.push(date_from) }
    if (date_to)     { conditions.push(`al.created_at <= $${p++}`);   params.push(date_to + ' 23:59:59') }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [logsRes, countRes] = await Promise.all([
      pool.query(`
        SELECT
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.details,
          al.ip_address,
          al.created_at,
          u.email        AS user_email,
          u.first_name   AS user_first_name,
          u.last_name    AS user_last_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}
        ORDER BY al.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM audit_logs al ${where}`, params),
    ])

    res.json({
      logs:  logsRes.rows,
      total: parseInt(countRes.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit),
    })
  } catch (error) {
    console.error('getAuditLogs error:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
