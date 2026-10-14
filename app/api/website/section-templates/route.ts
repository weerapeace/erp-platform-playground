/**
 * ⭐ แม่แบบ Section (ตาราง website_section_templates) — บันทึก Section ที่ตั้งค่าแล้วไว้ใช้ซ้ำกับหน้าอื่น/ร้านอื่น
 *
 * GET                        → { templates: SectionTemplate[] } (ทุกร้าน ใหม่สุดก่อน — หน้าจอแยก "ร้านนี้ / ร้านอื่น")
 * POST   { shopId, name, block } → บันทึก Section นี้เป็นแม่แบบใหม่
 * PATCH  { id, name }         → แก้ชื่อ
 * DELETE ?id=                 → ลบแม่แบบ (Section ที่เคยใช้แม่แบบไปแล้วไม่กระทบ — คัดลอกไปแล้ว)
 *
 * ทำความสะอาดด้วยตัวกลาง lib/website-section-templates (normalizeBlocks) · ผืนผ้าใบในแม่แบบบันทึก "รูปถูกใช้ที่ไหน" · ทุกการกระทำลง audit log
 * แบบเดียวกับ /api/website/canvas-templates
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { syncCanvasAssetUsages } from "@/lib/website-canvas-usage";
import { cleanTemplateBlock, cleanTemplateName, type SectionTemplate } from "@/lib/website-section-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "website_section_templates";
const USAGE = "website_section_template" as const;
const ENTITY = "website_section_template";

type Row = { id: string; shop_id: string | null; name: string; section_type: string; block: Record<string, unknown>; created_by_name: string | null; updated_at: string; shops?: { name?: string } | null };

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
    .select("id, shop_id, name, section_type, block, created_by_name, updated_at, shops(name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "โหลดแม่แบบไม่สำเร็จ" }, { status: 500 });
  const templates: SectionTemplate[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    shopId: r.shop_id,
    shopName: r.shops?.name ?? null,
    name: r.name,
    type: r.section_type,
    block: r.block,
    createdByName: r.created_by_name,
    updatedAt: r.updated_at,
  }));
  return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { shopId?: string; name?: string; block?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = cleanTemplateName(body.name);
  if (!name) return NextResponse.json({ error: "ตั้งชื่อแม่แบบก่อน" }, { status: 400 });
  const block = cleanTemplateBlock(body.block);
  if (!block) return NextResponse.json({ error: "Section นี้บันทึกเป็นแม่แบบไม่ได้" }, { status: 400 });

  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data: row, error } = await sb
    .from(TABLE)
    .insert({ shop_id: body.shopId || null, name, section_type: String(block.type), block, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "บันทึกแม่แบบไม่สำเร็จ" }, { status: 500 });
  const id = (row as { id: string }).id;
  await syncCanvasAssetUsages(sb, { module: USAGE, recordId: id, recordLabel: `แม่แบบ Section: ${name}`, field: "data", blocks: [block] });
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name, type: block.type, shop_id: body.shopId ?? null } });
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
  const name = cleanTemplateName(body.name);
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
  const { data: before } = await sb.from(TABLE).select("id, name, shop_id, section_type").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบแม่แบบไม่สำเร็จ" }, { status: 500 });
  await syncCanvasAssetUsages(sb, { module: USAGE, recordId: id, recordLabel: "", field: "data", blocks: [] });
  const who = await actor(request);
  const b = before as { name: string; shop_id: string | null; section_type: string };
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name: b.name, type: b.section_type, shop_id: b.shop_id } });
  return NextResponse.json({ ok: true });
}
