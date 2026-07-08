/**
 * /api/gif-poke/library — คลัง GIF
 * GET   → รายการ GIF ที่เปิดใช้งาน (ทุกคน) · ?all=1 → รวมที่ซ่อนด้วย (เฉพาะแอดมิน จัดการคลัง)
 * POST  multipart {file,title?} → อัปโหลด GIF เข้า R2 (ทุกคน) · หรือ JSON {gif_url,title?,category?} → เพิ่มลิงก์ (แอดมิน)
 * PATCH {id, title?, category?, is_active?, sort_order?} → แก้ไข (แอดมิน)
 * DELETE ?id= → ลบออกจากคลัง + ย้ายไฟล์ R2 เข้าถังขยะ (แอดมิน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject, r2MoveToTrash } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["image/gif", "image/webp", "image/png", "image/jpeg"]);
const MAX = 3 * 1024 * 1024;   // 3MB — GIF ใหญ่เกินทำจอหน่วง

type Admin = ReturnType<typeof supabaseAdmin>;

async function meFromReq(request: NextRequest): Promise<{ id: string } | null> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user ? { id: user.id } : null;
}

// แอดมิน/ผู้จัดการเท่านั้น (ใช้จัดการคลัง)
async function isManager(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin.from("user_profiles").select("role").eq("id", userId).maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === "admin" || role === "manager";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ", data: [] }, { status: 401 });
  const admin = supabaseAdmin();
  const all = new URL(request.url).searchParams.get("all") === "1";
  if (all && !(await isManager(admin, me.id))) return NextResponse.json({ error: "เฉพาะแอดมิน", data: [] }, { status: 403 });

  let q = admin.from("erp_gif_library")
    .select(all ? "id, gif_url, gif_key, title, category, is_active, sort_order" : "id, gif_url, gif_key, title, category");
  if (!all) q = q.eq("is_active", true);
  const { data } = await q.order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(500);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const admin = supabaseAdmin();
  const ctype = request.headers.get("content-type") ?? "";

  // เพิ่มลิงก์ GIF ภายนอก (แอดมิน) — JSON
  if (ctype.includes("application/json")) {
    if (!(await isManager(admin, me.id))) return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 });
    let body: { gif_url?: unknown; title?: unknown; category?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
    const url = String(body.gif_url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "ต้องเป็นลิงก์ http(s)" }, { status: 400 });
    const { data, error } = await admin.from("erp_gif_library")
      .insert({ gif_url: url, title: String(body.title ?? "").slice(0, 80).trim() || "GIF", category: String(body.category ?? "").slice(0, 40).trim() || "ทั่วไป", uploaded_by: me.id, sort_order: 50 })
      .select("id, gif_url, gif_key, title, category, is_active, sort_order").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }

  // อัปโหลดไฟล์ (ทุกคน) — multipart
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
  const { data, error } = await admin.from("erp_gif_library")
    .insert({ gif_key: key, title: title || "GIF ของฉัน", category: "อัปโหลด", uploaded_by: me.id, sort_order: 100 })
    .select("id, gif_url, gif_key, title, category, is_active, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!(await isManager(admin, me.id))) return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 });
  let body: { id?: unknown; title?: unknown; category?: unknown; is_active?: unknown; sort_order?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, 80).trim();
  if (typeof body.category === "string") patch.category = body.category.slice(0, 40).trim();
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.sort_order === "number") patch.sort_order = Math.round(body.sort_order);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  const { data, error } = await admin.from("erp_gif_library").update(patch).eq("id", id)
    .select("id, gif_url, gif_key, title, category, is_active, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!(await isManager(admin, me.id))) return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: row } = await admin.from("erp_gif_library").select("gif_key").eq("id", id).maybeSingle();
  const key = (row as { gif_key?: string | null } | null)?.gif_key;
  if (key) { try { await r2MoveToTrash(key); } catch { /* best-effort */ } }
  const { error } = await admin.from("erp_gif_library").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
