import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
export const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.NODE_ENV === "production" ? 20 : 5,
  ssl: config.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});

