/**
 * POST /api/content-albums/[id]/upload-done  body = { ok, reused?, failed? }
 * อัปไฟล์เข้าอัลบั้มเสร็จ (งานเบื้องหลังฝั่งจอ) → แจ้งเตือนในกระดิ่ง/ศูนย์แจ้งเตือนของคนที่อัปเอง
 * (เห็นแม้ไปอยู่หน้าอื่นในระบบ · กดแล้วเปิดอัลบั้ม) · ใช้ของกลาง erp_notify · สิทธิ์ assets.upload
 * ไม่ลง audit — ไฟล์แต่ละไฟล์ลงประวัติไว้แล้วตอนเพิ่ม (file_add)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { isUuid } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const n = (v: unknown) => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  let body: { ok?: unknown; reused?: unknown; failed?: unknown };
  try { body = await request.json(); } catch { body = {}; }
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องล็อกอิน" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: col } = await admin.from("asset_collections").select("name").eq("id", id).maybeSingle();
  if (!col) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  const name = (col as { name: string }).name;
  const ok = n(body.ok) + n(body.reused), failed = n(body.failed);
  const { error } = await admin.rpc("erp_notify", {
    p_user_ids: [user.id], p_event_type: "content_album.upload_done",
    p_title: (failed ? `อัปเข้าอัลบั้ม “${name}” เสร็จ แต่มี ${failed} ไฟล์ไม่สำเร็จ` : `อัปเข้าอัลบั้ม “${name}” เสร็จแล้ว`).slice(0, 200),
    p_body: failed ? `ลงอัลบั้ม ${ok} ไฟล์ · ไม่สำเร็จ ${failed} ไฟล์ — เปิดอัลบั้มแล้วลากไฟล์ที่ค้างมาวางใหม่` : `${ok} ไฟล์ขึ้น Google Drive ครบ`,
    p_link_url: `/master/assets?source=contents&album=${id}`, p_entity_type: "content_album", p_entity_id: id, p_priority: failed ? "high" : "normal",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { ok: true }, error: null });
}
