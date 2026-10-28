/**
 * 🎟️ คูปองส่วนลดของเว็บร้าน (ERP) — /api/website/coupons
 *
 * GET    ?shop=<slug>          → { coupons: (StoreCoupon & { used })[] } (ใหม่สุดก่อน · used = ใช้ไปกี่ครั้ง ไม่นับออเดอร์ยกเลิก)
 * POST   { shopId, ...คูปอง }  → สร้าง
 * PATCH  { id, ...คูปอง }      → แก้ทั้งใบ (หรือ { id, active } = เปิด/ปิดอย่างเดียว)
 * DELETE ?id=                  → ลบได้เฉพาะคูปองที่ยังไม่เคยถูกใช้ (ใช้แล้ว = ปิดใช้งานแทน เก็บประวัติไว้)
 *
 * ตรวจข้อมูลด้วยกฎกลาง lib/website-coupons (sanitizeCouponInput) · ทุกการกระทำลง audit log
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { couponFromRow, couponToRow, sanitizeCouponInput } from "@/lib/website-coupons";
import { couponUseCounts } from "@/lib/website-coupons-db";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "store_coupons";
const ENTITY = "store_coupon";

async function actor(request: NextRequest) {
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null };
}

const dupError = (e: { code?: string } | null) => (e?.code === "23505" ? "โค้ดนี้มีอยู่แล้วในร้านนี้ — ตั้งโค้ดอื่น" : null);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, slug);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  // โค้ดชวนเพื่อนของสมาชิก (referrer_id) ไม่โชว์ในรายการคูปอง — มีคนละ 1 โค้ด จะรกตาราง (ตั้งค่าที่ 🏪 ข้อมูลร้าน › 🎁)
  const { data, error } = await sb.from(TABLE).select("*").eq("shop_id", (shop as { id: string }).id).is("referrer_id", null).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "โหลดคูปองไม่สำเร็จ" }, { status: 500 });
  const coupons = ((data ?? []) as Record<string, unknown>[]).map(couponFromRow);
  const used = await couponUseCounts(sb, coupons.map((c) => c.id));
  return NextResponse.json({ coupons: coupons.map((c) => ({ ...c, used: used[c.id] ?? 0 })) }, { headers: { "Cache-Control": "no-store" } });
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
  const v = sanitizeCouponInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sb = supabaseAdmin();
  const who = await actor(request);
  const { data, error } = await sb
    .from(TABLE)
    .insert({ ...couponToRow(v.coupon), shop_id: shopId, created_by: who.id, created_by_name: who.name })
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: dupError(error) ?? "บันทึกคูปองไม่สำเร็จ" }, { status: error?.code === "23505" ? 409 : 500 });
  const id = (data as { id: string }).id;
  await writeAudit(sb, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { shop_id: shopId, ...couponToRow(v.coupon) } });
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
  if (!id) return NextResponse.json({ error: "ต้องระบุคูปอง" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบคูปอง (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const prev = couponFromRow(before as Record<string, unknown>);

  // เปิด/ปิดอย่างเดียว
  const onlyToggle = Object.keys(body).every((k) => k === "id" || k === "active");
  let patch: Record<string, unknown>;
  if (onlyToggle) patch = { active: body.active !== false };
  else {
    const v = sanitizeCouponInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch = couponToRow(v.coupon);
  }
  const { error } = await sb.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: dupError(error) ?? "บันทึกคูปองไม่สำเร็จ" }, { status: error.code === "23505" ? 409 : 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "update", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { before: couponToRow(prev), after: patch } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุคูปอง" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: before } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบคูปอง (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { count } = await sb.from("store_coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: `คูปองนี้ถูกใช้ไปแล้ว ${count} ครั้ง — ลบไม่ได้ (เก็บประวัติออเดอร์) ใช้ "ปิดใช้งาน" แทน` }, { status: 409 });
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบคูปองไม่สำเร็จ" }, { status: 500 });
  const who = await actor(request);
  await writeAudit(sb, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: couponToRow(couponFromRow(before as Record<string, unknown>)) });
  return NextResponse.json({ ok: true });
}
