import mysql from 'mysql2/promise';
import config from '../../config/index.js';

let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(config.db);
  }
  return pool;
}

export async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function getConnection() {
  const pool = getPool();
  return pool.getConnection();
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default { getPool, query, getConnection, closePool };
