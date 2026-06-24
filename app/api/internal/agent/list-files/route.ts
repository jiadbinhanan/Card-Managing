import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Security: Use a shared secret between Hub and Spoke
const HUB_SECRET = process.env.HUB_SECRET;

const IGNORE_DIRS = ["node_modules", ".git", ".next", "dist", "build"];

async function getFiles(dir: string, baseDir: string): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const res = path.resolve(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (IGNORE_DIRS.includes(dirent.name)) return [];
        return getFiles(res, baseDir);
      } else {
        return res.replace(baseDir, "").replace(/^[/\\]/, "");
      }
    })
  );
  return Array.prototype.concat(...files);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${HUB_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rootDir = process.cwd();
    const files = await getFiles(rootDir, rootDir);
    return NextResponse.json({ files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
