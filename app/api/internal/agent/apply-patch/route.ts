import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const HUB_SECRET = process.env.HUB_SECRET;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${HUB_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { filePath, content, patchType } = await req.json();
    
    if (!filePath || filePath.includes("..") || !content) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const fullPath = path.join(process.cwd(), filePath);
    
    // Write the new content to the file
    // The AI Hub will send the fully resolved new content for safety and simplicity
    await fs.writeFile(fullPath, content, "utf-8");
    
    return NextResponse.json({ success: true, filePath });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
