import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

const HUB_SECRET = process.env.HUB_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${HUB_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("get_db_schema");

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Run supabase/sql/create_get_db_schema_fn.sql in Supabase SQL Editor first.",
      },
      { status: 500 }
    );
  }

  // supabase/db-schema.json এ persist করো
  try {
    const outputPath = path.join(process.cwd(), "supabase", "db-schema.json");
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // file write failure non-fatal
  }

  return NextResponse.json(data);
}
