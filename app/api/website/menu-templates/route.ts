/**
 * 🧭 แม่แบบแผงเมนูใหญ่ (ตาราง website_menu_templates) — บันทึกแผงเมนูที่จัดไว้แล้วไว้ใช้ซ้ำกับเมนูอื่น/ร้านอื่น
 *
 * GET                           → { templates: MenuTemplate[] } (ทุกร้าน ใหม่สุดก่อน — หน้าจอแยก "ร้านนี้ / ร้านอื่น")
 * POST   { shopId, name, panel } → บันทึกแผงนี้เป็นแม่แบบใหม่
 * PATCH  { id, name }           → แก้ชื่อ
 * DELETE ?id=                   → ลบ (เมนูที่เคยใช้แม่แบบไปแล้วไม่กระทบ — ใช้แล้วคือคัดลอกไป)
 *
 * ทำความสะอาดด้วยตัวกลาง lib/website-mega-menu (normalizeMegaPanel) · ทุกการกระทำลง audit log · แบบเดียวกับ /api/website/saved-themes
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { megaHasContent, normalizeMegaPanel, type MegaTemplate, type MenuTemplate } from "@/lib/website-mega-menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "website_menu_templates";
const ENTITY = "website_menu_template";

type Row = { id: string; shop_id: string | null; name: string; template: MegaTemplate; panel: unknown; created_by_name: string | null; updated_at: string; shops?: { name?: string } | null };

const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, shop_id, name, template, panel, created_by_name, updated_at, shops(name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "โหลดแม่แบบเมนูไม่สำเร็จ" }, { status: 500 });
  const templates: MenuTemplate[] = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const panel = normalizeMegaPanel(r.panel);
      return panel ? { id: r.id, shopId: r.shop_id, shopName: r.shops?.name ?? null, name: r.name, template: r.template, panel, createdByName: r.created_by_name, updatedAt: r.updated_at } : null;
    })
    .filter((t): t is MenuTemplate => !!t);
  return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { shopId?: string; name?: string; panel?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "ตั้งชื่อแม่แบบก่อน" }, { status: 400 });
  const panel = normalizeMegaPanel(body.panel);
  if (!panel || !megaHasContent(panel)) return NextResponse.json({ error: "แผงนี้ยังว่าง — ใส่เนื้อหาก่อนบันทึก" }, { status: 400 });

  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data: row, error } = await sb
    .from(TABLE)
    .insert({ shop_id: body.shopId || null, name, template: panel.template, panel, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "บันทึกแม่แบบไม่สำเร็จ" }, { status: 500 });
  const id = (row as { id: string }).id;
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name, template: panel.template, shop_id: body.shopId ?? null } });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุแม่แบบ" }, { status: 400 });
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "ชื่อแม่แบบว่างไม่ได้" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).update({ name, updated_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "บันทึกชื่อไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "update", entityType: ENTITY, entityId: body.id, actorId: who.id, actorName: who.name, metadata: { name_before: (before as { name: string }).name, name_after: name } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุแม่แบบ" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name, shop_id, template").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบแม่แบบไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  const b = before as { name: string; shop_id: string | null; template: string };
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name: b.name, template: b.template, shop_id: b.shop_id } });
  return NextResponse.json({ ok: true });
}
