import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query<T = any>(text: string, params: Array<any> = []) {
  const result = await pool.query(text, params);
  return result as { rows: T[] };
}

export default pool;
