import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

const BUNDLE_PATH = "/tmp/virtuoso-stage1a-inc.bundle";

export async function GET() {
  try {
    const fileBuffer = await readFile(BUNDLE_PATH);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="virtuoso-stage1a.bundle"',
        "Content-Length": String(fileBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Bundle file not found on server." },
      { status: 404 },
    );
  }
}
