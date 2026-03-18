import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';

dotenv.config();

// ─── Pool brut (utilisé uniquement par le middleware de contexte) ──────────────
export const rawPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'property_management',
  user: process.env.DB_USER || 'prop_admin',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

rawPool.on('connect', () => console.log('✅ Connected to PostgreSQL database'));
rawPool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// ─── Contexte de requête (AsyncLocalStorage) ──────────────────────────────────
// Stocke le client dédié + les métadonnées utilisateur pour RLS
export interface RequestDbContext {
  client: PoolClient;
  userId: string;
  userRole: string;
  tenantId: string;
}
export const requestDbContext = new AsyncLocalStorage<RequestDbContext>();

// ─── Pool proxy — transparent pour tous les controllers ───────────────────────
// • pool.query()   → utilise le client dédié de la requête si disponible
// • pool.connect() → fournit un client frais avec le contexte utilisateur injecté
const poolProxy = {
  query: async <T extends QueryResultRow = any>(
    text: string,
    values?: any[]
  ): Promise<QueryResult<T>> => {
    const ctx = requestDbContext.getStore();
    if (ctx) {
      return ctx.client.query<T>(text, values as any);
    }
    return rawPool.query<T>(text, values as any);
  },

  connect: async (): Promise<PoolClient> => {
    const ctx = requestDbContext.getStore();
    if (ctx) {
      // Client frais pour les controllers qui gèrent leurs propres transactions.
      // On injecte le contexte utilisateur en session (pas LOCAL) pour qu'il
      // reste disponible à l'intérieur du BEGIN/COMMIT interne du controller.
      const client = await rawPool.connect();
      await client.query(
        `SELECT set_config('app.user_id', $1, false),
                set_config('app.user_role', $2, false)`,
        [ctx.userId, ctx.userRole]
      );
      return client;
    }
    return rawPool.connect();
  },

  end: () => rawPool.end(),
  on:  (event: string, listener: any) => rawPool.on(event as any, listener),
};

export default poolProxy as unknown as Pool;
