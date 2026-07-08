/**
 * /api/gif-poke/library — คลัง GIF (เลือกส่ง) + อัปโหลดเอง (ทุกคนที่ล็อกอิน)
 * GET  → รายการ GIF ที่เปิดใช้งาน (คลัง + ที่อัปโหลดไว้)
 * POST (multipart: file, title?) → อัปโหลด GIF เข้า R2 แล้วเพิ่มเข้าคลัง → คืนรายการใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["image/gif", "image/webp", "image/png", "image/jpeg"]);
const MAX = 3 * 1024 * 1024;   // 3MB — GIF ใหญ่เกินทำจอหน่วง

async function meFromReq(request: NextRequest): Promise<{ id: string } | null> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user ? { id: user.id } : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ", data: [] }, { status: 401 });
  const admin = supabaseAdmin();
  const { data } = await admin.from("erp_gif_library")
    .select("id, gif_url, gif_key, title, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(300);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let fd: FormData;
  try { fd = await request.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }

  const file = fd.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ต้องแนบไฟล์" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `ประเภทไฟล์ไม่รองรับ: ${file.type} (รองรับ GIF/PNG/WebP/JPG)` }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 3MB" }, { status: 400 });

  const title = String(fd.get("title") ?? "").slice(0, 80).trim();
  const ext = (file.type.split("/")[1] || "gif").replace(/[^a-z0-9]/gi, "");
  const key = `gif-poke/${me.id}/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
  try {
    await r2PutObject(key, await file.arrayBuffer(), file.type);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }, { status: 500 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_gif_library")
    .insert({ gif_key: key, title: title || "GIF ของฉัน", category: "อัปโหลด", uploaded_by: me.id, sort_order: 100 })
    .select("id, gif_url, gif_key, title, category").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
