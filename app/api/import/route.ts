import { NextResponse } from "next/server";

import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with file field 'file'" },
      { status: 400 },
    );
  }
  return NextResponse.json({ imported: 0, note: "Wire SheetJS + excel-parser here." });
}
