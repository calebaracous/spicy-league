import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const sql = neon(process.env.DATABASE_URL);
const sqlText = readFileSync(
  resolve(__dirname, "../drizzle/0009_ten_mans.sql"),
  "utf8",
);
const statements = sqlText
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Applying ${statements.length} statements to Neon...`);
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const preview = stmt.replace(/\n/g, " ").substring(0, 80);
  process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}… `);
  try {
    await sql.query(stmt);
    console.log("✓");
  } catch (err) {
    // Skip "already exists" errors so the script is re-runnable
    if (
      err.message.includes("already exists") ||
      err.message.includes("duplicate")
    ) {
      console.log("(already exists, skipped)");
    } else {
      console.log("✗");
      console.error("\nFailed on statement", i + 1, ":", err.message);
      process.exit(1);
    }
  }
}
console.log("\n✓ Migration 0009_ten_mans applied successfully.");
