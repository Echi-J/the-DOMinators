// db.js — the connection to MySQL, shared by every route.
//
// The settings come from the .env file (copy .env.example to .env and fill it in).
import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'access_london',
  connectionLimit: 10,
  timezone: 'Z',            // store and read times as UTC
});
