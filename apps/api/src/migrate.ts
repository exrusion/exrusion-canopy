import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { db } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../../infra/schema.sql");
const sql = await readFile(schemaPath, "utf8");
await db.query(sql);
await db.end();
console.log("database schema is current");

