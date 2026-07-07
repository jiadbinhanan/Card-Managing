/**
 * DB Schema Fetcher Script
 * ─────────────────────────
 * Run: npm run db:schema
 *
 * Prerequisite: Run supabase/sql/create_get_db_schema_fn.sql in Supabase SQL Editor once.
 *
 * Supabase থেকে live schema fetch করে supabase/db-schema.json এ লিখে দেয়।
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "❌ NEXT_PUBLIC_SUPABASE_URL এবং SUPABASE_SERVICE_ROLE_KEY environment variables দরকার।"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("🔍 Supabase থেকে DB schema fetch করা হচ্ছে...");

  const { data, error } = await supabase.rpc("get_db_schema");

  if (error) {
    console.error("❌ Error:", error.message);
    console.error(
      "💡 Hint: supabase/sql/create_get_db_schema_fn.sql টি Supabase SQL Editor-এ রান করুন।"
    );
    process.exit(1);
  }

  const outputPath = path.join(process.cwd(), "supabase", "db-schema.json");
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2), "utf-8");

  const schema = data as any;
  const tableCount = schema?.tables?.length ?? 0;
  const totalColumns = (schema?.tables ?? []).reduce(
    (sum: number, t: any) => sum + (t.columns?.length ?? 0),
    0
  );

  console.log(`✅ Schema saved → supabase/db-schema.json`);
  console.log(`   📦 Tables: ${tableCount}`);
  console.log(`   📋 Total columns: ${totalColumns}`);

  if (Array.isArray(schema?.tables)) {
    console.log("\n📊 Tables found:");
    for (const t of schema.tables) {
      const cols = (t.columns ?? []).map((c: any) => c.name).join(", ");
      console.log(`   • ${t.name} (${t.columns?.length ?? 0} cols): ${cols}`);
    }
  }
}

main().catch(console.error);
