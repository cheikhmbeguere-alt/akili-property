import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Rechercher l'utilisateur
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active, tenant_id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Vérifier le mot de passe
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Générer le token JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, tenantId: user.tenant_id },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, ip_address) 
       VALUES ($1, $2, $3, $4)`,
      [user.id, 'login', 'user', req.ip]
    );

    res.json({
      token,
      user: {
        id:       user.id,
        email:    user.email,
        firstName: user.first_name,
        lastName:  user.last_name,
        role:     user.role,
        tenantId: user.tenant_id ?? null,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, tenant_id FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      id:        user.id,
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
      role:      user.role,
      tenantId:  user.tenant_id ?? null,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Les deux champs sont obligatoires' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 8 caractères' });
    }

    // Récupérer le hash actuel
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user!.id]
    );

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    // Log de l'activité
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, ip_address) 
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, 'logout', 'user', req.ip]
    );

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
