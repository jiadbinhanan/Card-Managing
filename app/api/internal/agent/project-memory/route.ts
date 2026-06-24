import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const HUB_SECRET = process.env.HUB_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${HUB_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const memoryDir = path.join(process.cwd(), ".agendevai");
    
    const readIfExists = async (filename: string) => {
      try {
        return await fs.readFile(path.join(memoryDir, filename), "utf-8");
      } catch {
        return null;
      }
    };

    const projectMemory = await readIfExists("project_memory.md");
    const architecture = await readIfExists("architecture.md");
    const fileDescriptions = await readIfExists("file_descriptions.json");
    const terminology = await readIfExists("terminology.json");

    return NextResponse.json({
      project_memory: projectMemory,
      architecture: architecture,
      file_descriptions: fileDescriptions ? JSON.parse(fileDescriptions) : null,
      terminology: terminology ? JSON.parse(terminology) : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
