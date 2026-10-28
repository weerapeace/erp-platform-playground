/**
 * 🏷 โปรโมชันอัตโนมัติของเว็บร้าน (ERP แท็บ 🏷 โปรโมชัน) : /api/website/promotions
 * GET    ?shop=<slug>          → { promotions, used: { [id]: { orders, discount } } }
 * POST   { shopId, ...promo }  → สร้าง
 * PATCH  { id, ...promo } | { id, active } → แก้ / เปิด-ปิด
 * DELETE ?id=                  → ลบ (ออเดอร์เก่าที่ใช้ไปแล้วยังเก็บชื่อ/ยอดไว้ในออเดอร์)
 * สิทธิ์: ดู products.view · แก้ products.edit · ทุกการเปลี่ยนลง audit · กฎตรวจ lib/website-promotions sanitizePromotion
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { promotionFromRow, sanitizePromotion, type Promotion } from "@/lib/website-promotions";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "store_promotions";
const ENTITY = "store_promotion";

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

const toRow = (p: Omit<Promotion, "id">) => ({ name: p.name, kind: p.kind, active: p.active, starts_at: p.startsAt, ends_at: p.endsAt, rule: p.rule });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, slug);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;
  const { data, error } = await sb.from(TABLE).select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "โหลดโปรโมชันไม่สำเร็จ" }, { status: 500 });
  // ใช้ไปกี่ออเดอร์ / ลดไปเท่าไร (ออเดอร์ 90 วันล่าสุด ไม่นับยกเลิก)
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data: orders } = await sb.from("store_orders").select("promos").eq("shop_id", shopId).neq("status", "cancelled").gte("created_at", since).not("promos", "is", null).limit(5000);
  const used: Record<string, { orders: number; discount: number }> = {};
  for (const o of (orders ?? []) as { promos: { id?: string; amount?: number }[] | null }[]) {
    for (const p of o.promos ?? []) {
      if (!p.id) continue;
      const u = (used[p.id] ??= { orders: 0, discount: 0 });
      u.orders += 1;
      u.discount = Math.round((u.discount + (Number(p.amount) || 0)) * 100) / 100;
    }
  }
  return NextResponse.json({ promotions: ((data ?? []) as Record<string, unknown>[]).map(promotionFromRow), used }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const shopId = String(body.shopId ?? "");
  if (!shopId) return NextResponse.json({ error: "ต้องระบุร้าน" }, { status: 400 });
  const v = sanitizePromotion(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data, error } = await sb
    .from(TABLE)
    .insert({ ...toRow(v.promo), shop_id: shopId, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "บันทึกโปรโมชันไม่สำเร็จ" }, { status: 500 });
  const id = (data as { id: string }).id;
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { shop_id: shopId, ...toRow(v.promo) } });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "ต้องระบุโปรโมชัน" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบโปรโมชัน (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const onlyToggle = Object.keys(body).every((k) => k === "id" || k === "active");
  let patch: Record<string, unknown>;
  if (onlyToggle) patch = { active: body.active !== false };
  else {
    const v = sanitizePromotion(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch = toRow(v.promo);
  }
  const { error } = await sb.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกโปรโมชันไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: onlyToggle ? (patch.active ? "enable" : "disable") : "update", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { before: { name: (before as { name: string }).name, active: (before as { active: boolean }).active }, after: patch } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุโปรโมชัน" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบโปรโมชัน" }, { status: 404 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: before as Record<string, unknown> });
  return NextResponse.json({ ok: true });
}
