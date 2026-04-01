import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Parse DATABASE_URL manually because TiDB Cloud appends ssl={"rejectUnauthorized":true}
// which mysql2 doesn't understand as a URL parameter.
const parsed = new URL(connectionString.replace(/^mysql:\/\//, "http://"));

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: parsed.hostname,
    port: Number(parsed.port) || 4000,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    ssl: "Amazon RDS",
  },
});
