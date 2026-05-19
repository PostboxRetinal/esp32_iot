import mysql, { type ResultSetHeader } from "mysql2/promise";
import type { ExecuteValues } from "mysql2";

import { config } from "./config";

export const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  database: config.mysql.database,
  user: config.mysql.user,
  password: config.mysql.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  enableKeepAlive: true
});

export async function queryRows<T>(sql: string, params: ExecuteValues[] = []) {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function executeStatement(sql: string, params: ExecuteValues[] = []) {
  const [result] = await pool.execute(sql, params);
  return result as ResultSetHeader;
}
