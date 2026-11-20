/**
 * 🔗 ลิงก์สั้น 1 ตัว
 * GET    /api/short-links/[id]  → รายละเอียด + คลิกรายวันแยกที่มา (60 วันล่าสุด)
 * PATCH  /api/short-links/[id]  { target_url?, label?, code?, is_active?, restore? } → แก้ (ลิงก์สั้นเดิมยังใช้ได้ เปลี่ยนแค่ปลายทาง)
 * DELETE /api/short-links/[id]  → ย้ายลงถังขยะ (กู้คืนได้ด้วย PATCH restore) · ลิงก์ที่ลบแล้วกดไปหน้าแรกร้าน
 * สิทธิ์: ดู = short_links.create · แก้/ลบ = เจ้าของลิงก์ (short_links.create) หรือ short_links.manage
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { cleanTargetUrl, normalizeShortCode, shortCodeProblem, shortUrlOf, type ShortLinkRow } from "@/lib/short-links";
import { SHORT_LINK_COLS } from "@/lib/short-links-db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function loadRow(id: string): Promise<ShortLinkRow | null> {
  const { data } = await supabaseAdmin().from("short_links").select(SHORT_LINK_COLS).eq("id", id).maybeSingle();
  return (data as ShortLinkRow | null) ?? null;
}

/** แก้/ลบได้ไหม: เจ้าของลิงก์ หรือมีสิทธิ์จัดการ */
async function canWrite(request: NextRequest, row: ShortLinkRow): Promise<{ ok: boolean; userId: string | null; email: string | null }> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return { ok: false, userId: null, email: null };
  if (row.created_by === user.id) return { ok: true, userId: user.id, email: user.email ?? null };
  return { ok: await apiCan(request, "short_links.manage"), userId: user.id, email: user.email ?? null };
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const denied = await guardApi(request, "short_links.create"); if (denied) return denied;
  const { id } = await ctx.params;
  const row = await loadRow(id);
  if (!row) return NextResponse.json({ data: null, error: "ไม่พบลิงก์นี้" }, { status: 404 });
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data: daily } = await supabaseAdmin().from("short_link_click_daily").select("day, source, clicks").eq("link_id", id).gte("day", since).order("day");
  return NextResponse.json({ data: { ...row, short_url: shortUrlOf(row.code), daily: daily ?? [] }, error: null });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const denied = await guardApi(request, "short_links.create"); if (denied) return denied;
  const { id } = await ctx.params;
  const row = await loadRow(id);
  if (!row) return NextResponse.json({ data: null, error: "ไม่พบลิงก์นี้" }, { status: 404 });
  const who = await canWrite(request, row);
  if (!who.ok) return NextResponse.json({ data: null, error: "แก้ได้เฉพาะลิงก์ที่คุณสร้าง (หรือขอสิทธิ์จัดการลิงก์สั้นจากหัวหน้า)" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { target_url?: string; label?: string | null; code?: string; is_active?: boolean; restore?: boolean };
  const patch: Record<string, unknown> = {};
  if (body.target_url !== undefined) {
    const url = cleanTargetUrl(body.target_url);
    if (!url) return NextResponse.json({ data: null, error: "ลิงก์ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    if (url !== row.target_url) patch.target_url = url;
  }
  if (body.label !== undefined) { const l = (body.label ?? "").trim().slice(0, 200) || null; if (l !== row.label) patch.label = l; }
  if (body.code !== undefined) {
    const code = normalizeShortCode(body.code);
    const p = shortCodeProblem(code);
    if (p) return NextResponse.json({ data: null, error: p }, { status: 400 });
    if (code !== row.code) { patch.code = code; patch.custom_code = true; }
  }
  if (typeof body.is_active === "boolean" && body.is_active !== row.is_active) patch.is_active = body.is_active;
  if (body.restore && row.deleted_at) patch.deleted_at = null;
  if (!Object.keys(patch).length) return NextResponse.json({ data: { ...row, short_url: shortUrlOf(row.code) }, error: null });

  patch.updated_at = new Date().toISOString();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("short_links").update(patch).eq("id", id).select(SHORT_LINK_COLS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ data: null, error: "ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น" }, { status: 409 });
    return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
  const action = body.restore && row.deleted_at ? "restore" : "update";
  await writeAudit(admin, {
    action, entityType: "short_link", entityId: id, actorId: who.userId, actorName: who.email,
    metadata: { code: (data as ShortLinkRow).code, name: row.label ?? row.code, ...auditChangeMeta(row as unknown as Record<string, unknown>, patch) },
  });
  return NextResponse.json({ data: { ...(data as ShortLinkRow), short_url: shortUrlOf((data as ShortLinkRow).code) }, error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const denied = await guardApi(request, "short_links.create"); if (denied) return denied;
  const { id } = await ctx.params;
  const row = await loadRow(id);
  if (!row) return NextResponse.json({ data: null, error: "ไม่พบลิงก์นี้" }, { status: 404 });
  const who = await canWrite(request, row);
  if (!who.ok) return NextResponse.json({ data: null, error: "ลบได้เฉพาะลิงก์ที่คุณสร้าง (หรือขอสิทธิ์จัดการลิงก์สั้นจากหัวหน้า)" }, { status: 403 });
  if (row.deleted_at) return NextResponse.json({ data: { id }, error: null });
  const admin = supabaseAdmin();
  const patch = { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await admin.from("short_links").update(patch).eq("id", id);
  if (error) return NextResponse.json({ data: null, error: "ลบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  await writeAudit(admin, { action: "delete", entityType: "short_link", entityId: id, actorId: who.userId, actorName: who.email, metadata: { code: row.code, name: row.label ?? row.code, soft: true, ...auditChangeMeta(row as unknown as Record<string, unknown>, { deleted_at: patch.deleted_at }) } });
  return NextResponse.json({ data: { id }, error: null });
}
