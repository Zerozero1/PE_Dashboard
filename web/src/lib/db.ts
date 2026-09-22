import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DW_DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
});

export async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params as never[]);
  } finally {
    client.release();
  }
}

export default pool;
