import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// TiDB Cloud uses ssl={"rejectUnauthorized":true} in the URL which mysql2
// doesn't understand. Strip it and pass ssl separately.
const cleanUrl = connectionString.replace(/[?&]ssl=[^&]*/g, "");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: cleanUrl,
    ssl: { rejectUnauthorized: true },
  },
});
