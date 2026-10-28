/**
 * แม่แบบผืนผ้าใบอิสระ (ตาราง website_canvas_templates) — บันทึกผืนที่จัดแล้วไว้ใช้ซ้ำกับหน้าอื่น/ร้านอื่น
 *
 * GET                       → { templates: [{ id, shopId, shopName, name, data, createdByName, updatedAt }] } (ทุกร้าน ใหม่สุดก่อน)
 * POST   { shopId, name, block }       → บันทึกผืนนี้เป็นแม่แบบใหม่
 * PATCH  { id, name?, block? }         → แก้ชื่อ / บันทึกทับด้วยผืนปัจจุบัน
 * DELETE ?id=                          → ลบแม่แบบ (ผืนที่เคยใช้แม่แบบนี้ไปแล้วไม่กระทบ — คัดลอกไปแล้ว)
 *
 * เนื้อผืนผ่านตัวทำความสะอาดชุดเดียวกับตอนบันทึกหน้าเว็บ (normalizeBlocks) · รูปในแม่แบบบันทึก "ถูกใช้ที่ไหน" (กันลบจากคลัง)
 * การกระทำทุกอย่างลง audit log
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { normalizeBlocks } from "@/lib/website-blocks";
import { canvasTemplateData } from "@/lib/website-canvas";
import { syncCanvasAssetUsages } from "@/lib/website-canvas-usage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "website_canvas_templates";
const USAGE = "website_canvas_template" as const;

type Row = { id: string; shop_id: string | null; name: string; data: Record<string, unknown>; created_by_name: string | null; created_at: string; updated_at: string; shops?: { name?: string } | null };

/** ผืนจากตัวจัดหน้า → เนื้อผืนที่ทำความสะอาดแล้ว (null = ไม่ใช่ผืนผ้าใบ) */
function cleanData(block: unknown): Record<string, unknown> | null {
  const raw = (block ?? {}) as Record<string, unknown>;
  const [b] = normalizeBlocks([{ ...raw, id: "tpl", type: "canvas" }]);
  if (!b || b.type !== "canvas") return null;
  return canvasTemplateData(b as unknown as Record<string, unknown>);
}

const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, shop_id, name, data, created_by_name, created_at, updated_at, shops(name)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "โหลดแม่แบบไม่สำเร็จ" }, { status: 500 });
  const templates = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    shopId: r.shop_id,
    shopName: r.shops?.name ?? null,
    name: r.name,
    data: r.data,
    createdByName: r.created_by_name,
    updatedAt: r.updated_at,
  }));
  return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: { shopId?: string; name?: string; block?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "ตั้งชื่อแม่แบบก่อน" }, { status: 400 });
  const data = cleanData(body.block);
  if (!data) return NextResponse.json({ error: "ไม่ใช่ผืนผ้าใบ" }, { status: 400 });

  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data: row, error } = await sb
    .from(TABLE)
    .insert({ shop_id: body.shopId || null, name, data, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "บันทึกแม่แบบไม่สำเร็จ" }, { status: 500 });
  const id = (row as { id: string }).id;
  await syncCanvasAssetUsages(sb, { module: USAGE, recordId: id, recordLabel: `แม่แบบผืน: ${name}`, field: "data", blocks: [{ type: "canvas", ...data }] });
  await writeAudit(sb, { action: "create", entityType: "website_canvas_template", entityId: id, actorId: who.id, actorName: who.name, metadata: { name, shop_id: body.shopId ?? null, items: Array.isArray(data.items) ? data.items.length : 0 } });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: { id?: string; name?: string; block?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุแม่แบบ" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "ชื่อแม่แบบว่างไม่ได้" }, { status: 400 });
    patch.name = name;
  }
  let data: Record<string, unknown> | null = null;
  if (body.block !== undefined) {
    data = cleanData(body.block);
    if (!data) return NextResponse.json({ error: "ไม่ใช่ผืนผ้าใบ" }, { status: 400 });
    patch.data = data;
  }
  const { error } = await sb.from(TABLE).update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: "บันทึกแม่แบบไม่สำเร็จ" }, { status: 500 });
  const name = String(patch.name ?? (before as { name: string }).name);
  if (data) await syncCanvasAssetUsages(sb, { module: USAGE, recordId: body.id, recordLabel: `แม่แบบผืน: ${name}`, field: "data", blocks: [{ type: "canvas", ...data }] });
  const who = await actor(request);
  await writeAudit(sb, {
    action: "update",
    entityType: "website_canvas_template",
    entityId: body.id,
    actorId: who.id,
    actorName: who.name,
    metadata: { name_before: (before as { name: string }).name, name_after: name, overwrote_content: !!data },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุแม่แบบ" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name, shop_id").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแม่แบบ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบแม่แบบไม่สำเร็จ" }, { status: 500 });
  // ไม่ใช้รูปแล้ว → ล้าง "ถูกใช้ที่ไหน" (คลังไฟล์ลบรูปได้ถ้าไม่มีที่อื่นใช้)
  await syncCanvasAssetUsages(sb, { module: USAGE, recordId: id, recordLabel: "", field: "data", blocks: [] });
  const who = await actor(request);
  await writeAudit(sb, { action: "delete", entityType: "website_canvas_template", entityId: id, actorId: who.id, actorName: who.name, metadata: { name: (before as { name: string }).name, shop_id: (before as { shop_id: string | null }).shop_id } });
  return NextResponse.json({ ok: true });
}
