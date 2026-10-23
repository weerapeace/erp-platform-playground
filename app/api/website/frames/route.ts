/**
 * 🖼 คลังกรอบรูปที่สร้างเอง (ตาราง website_frames) — ตัวสร้างกรอบ 3 แบบในผืนผ้าใบ
 *
 * GET    ?shop=<slug>                     → { frames: SavedFrame[] } (ของร้านนี้ + ใช้ได้ทุกร้าน · ใหม่สุดก่อน)
 * POST   { shopId|null, name, def }        → สร้างกรอบใหม่ (shopId null = ทุกร้าน)
 * PATCH  { id, name?, def?, shopId? }     → แก้ชื่อ/ค่ากรอบ/ขอบเขต
 * DELETE ?id=                             → ลบ (รูปที่ใช้กรอบนี้ไปแล้วไม่กระทบ — ใช้แล้วคือคัดลอกค่าไป)
 *
 * ทำความสะอาดด้วยตัวกลาง lib/website-frames (normalizeFrameDef — ทรงที่อัปเก็บเป็นเส้นทางที่ผ่านตัวกรองเท่านั้น)
 * ทุกการกระทำลง audit log · แบบเดียวกับ /api/website/menu-templates
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeFrameDef, type SavedFrame } from "@/lib/website-frames";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "website_frames";
const ENTITY = "website_frame";

type Row = { id: string; shop_id: string | null; name: string; def: unknown; updated_at: string };

const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

const toFrame = (r: Row): SavedFrame => ({ id: r.id, shopId: r.shop_id, name: r.name, def: normalizeFrameDef(r.def), updatedAt: r.updated_at });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  let shopId: string | null = null;
  if (slug) {
    const shop = await shopBySlug(sb, slug);
    shopId = (shop as { id: string } | null)?.id ?? null;
  }
  let q = sb.from(TABLE).select("id, shop_id, name, def, updated_at").order("updated_at", { ascending: false }).limit(200);
  q = shopId ? q.or(`shop_id.is.null,shop_id.eq.${shopId}`) : q.is("shop_id", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "โหลดคลังกรอบไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ frames: ((data ?? []) as Row[]).map(toFrame) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { shopId?: string | null; name?: string; def?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "ตั้งชื่อกรอบก่อนบันทึก" }, { status: 400 });
  const def = normalizeFrameDef(body.def);
  const shopId = isUuid(body.shopId) ? body.shopId : null;
  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data: row, error } = await sb.from(TABLE).insert({ shop_id: shopId, name, def, created_by: who.id, created_by_name: who.name }).select("id, shop_id, name, def, updated_at").maybeSingle();
  if (error || !row) return NextResponse.json({ error: "บันทึกกรอบไม่สำเร็จ" }, { status: 500 });
  const frame = toFrame(row as Row);
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: frame.id, actorId: who.id, actorName: who.name, metadata: { name, mode: def.mode, frame: def.frame, shop_id: shopId } });
  return NextResponse.json({ ok: true, frame });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { id?: string; name?: string; def?: unknown; shopId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isUuid(body.id)) return NextResponse.json({ error: "ต้องระบุกรอบ" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name, shop_id").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบกรอบ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "ชื่อกรอบว่างไม่ได้" }, { status: 400 });
    patch.name = name;
  }
  if (body.def !== undefined) patch.def = normalizeFrameDef(body.def);
  if (body.shopId !== undefined) patch.shop_id = isUuid(body.shopId) ? body.shopId : null;
  const { data: row, error } = await sb.from(TABLE).update(patch).eq("id", body.id).select("id, shop_id, name, def, updated_at").maybeSingle();
  if (error || !row) return NextResponse.json({ error: "บันทึกกรอบไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  const b = before as { name: string; shop_id: string | null };
  await writeAudit(sb, {
    action: "update",
    entityType: ENTITY,
    entityId: body.id,
    actorId: who.id,
    actorName: who.name,
    metadata: { name_before: b.name, name_after: patch.name ?? b.name, def_changed: body.def !== undefined, shop_before: b.shop_id, shop_after: patch.shop_id ?? b.shop_id },
  });
  return NextResponse.json({ ok: true, frame: toFrame(row as Row) });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "ต้องระบุกรอบ" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("id, name, shop_id").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบกรอบ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบกรอบไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  const b = before as { name: string; shop_id: string | null };
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { name: b.name, shop_id: b.shop_id } });
  return NextResponse.json({ ok: true });
}
