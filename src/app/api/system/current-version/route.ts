import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pkg = await fs.readFile(
      path.join(process.cwd(), "package.json"),
      "utf-8",
    );
    const data = JSON.parse(pkg) as { version?: string };
    return NextResponse.json({ version: data.version ?? "0.0.0" });
  } catch {
    return NextResponse.json({ version: "0.0.0" });
  }
}
