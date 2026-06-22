/**
 * /api/issue-reports/upload — แนบรูปใบแจ้งปัญหา (เฉพาะผู้แจ้ง report.create)
 * อัปโหลดเข้า R2 → คืน { r2_key } (ไม่ต้องเปิดสิทธิ์ files.upload กว้าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { r2PutObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let fd: FormData;
  try { fd = await request.formData(); }
  catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }

  const file = fd.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ต้องแนบไฟล์" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `ประเภทไฟล์ไม่รองรับ: ${file.type}` }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: `ไฟล์ใหญ่เกิน 10MB` }, { status: 400 });

  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `issue-reports/${user.id}/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
  try {
    await r2PutObject(key, await file.arrayBuffer(), file.type);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ r2_key: key, error: null });
}
