import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { rawPool, requestDbContext, RequestDbContext } from '../config/database';

/**
 * dbContextMiddleware
 * ───────────────────
 * Pour chaque requête authentifiée :
 *   1. Acquiert un client dédié depuis le pool brut
 *   2. Ouvre une transaction et pose les variables de session RLS :
 *        app.user_id   = ID de l'utilisateur courant
 *        app.user_role = rôle (admin | editor | viewer)
 *   3. Stocke le client dans AsyncLocalStorage → tous les pool.query()
 *      des controllers utilisent automatiquement ce client
 *   4. Commit (ou Rollback si erreur) + release à la fin de la réponse
 *
 * Résultat : les politiques RLS PostgreSQL (voir migration 008_rls.sql)
 * ont accès au contexte utilisateur sans que les controllers s'en préoccupent.
 */
export const dbContextMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Pas d'utilisateur identifié → pas de contexte RLS
  if (!req.user) {
    next();
    return;
  }

  let client;
  try {
    client = await rawPool.connect();
    // set_config(name, value, is_local=true) : accepte des paramètres bindés
    // et se réinitialise automatiquement à la fin de la transaction (équivalent SET LOCAL)
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.user_id',   $1, true),
              set_config('app.user_role', $2, true),
              set_config('app.tenant_id', $3, true)`,
      [req.user.id.toString(), req.user.role, (req.user.tenantId ?? 0).toString()]
    );
  } catch (err) {
    console.error('[db-context] Impossible d\'ouvrir le contexte DB:', err);
    if (client) client.release();
    // On continue sans contexte RLS (les filtres applicatifs restent actifs)
    next();
    return;
  }

  const ctx: RequestDbContext = {
    client,
    userId:   req.user.id.toString(),
    userRole: req.user.role,
    tenantId: (req.user.tenantId ?? 0).toString(),
  };

  // Exécute le reste de la chaîne Express dans le contexte AsyncLocalStorage
  requestDbContext.run(ctx, () => {
    // Libération propre à la fin de la réponse
    res.on('finish', async () => {
      try {
        await client!.query('COMMIT');
      } catch (e) {
        console.error('[db-context] Erreur COMMIT:', e);
        try { await client!.query('ROLLBACK'); } catch {}
      } finally {
        client!.release();
      }
    });

    next();
  });
};
