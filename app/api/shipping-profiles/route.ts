/**
 * 🚚 จุดส่งของต่อแบรนด์ (shipping_profiles) — /api/shipping-profiles   (ศูนย์ออเดอร์ › ขนส่ง ขั้น 1)
 * GET   ?brand_id=   (platform_orders.view)   → { profile | null } · ไม่ส่ง brand_id = ทุกแบรนด์ที่ตั้งแล้ว
 * PATCH { brand_id, sender_*, default_box?, default_weight_g?, default_courier? }  (platform_orders.manage) → upsert + audit ค่าเดิม→ใหม่
 * ชื่อ/ที่อยู่ผู้ส่งนี้พิมพ์บนใบปะหน้า + ส่งให้ SHIPPOP ตอนจอง · กุญแจ SHIPPOP ไม่อยู่ที่นี่ (ขั้น 2)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { SHIPPOP_COURIERS, telOf } from "@/lib/shippop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "brand_id, sender_name, sender_phone, sender_address, sender_subdistrict, sender_district, sender_province, sender_postal, default_box, default_weight_g, default_courier, updated_at";
const UUID = /^[0-9a-f-]{36}$/i;
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n) || null;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const admin = supabaseAdmin();
  if (brandId) {
    const { data } = await admin.from("shipping_profiles").select(COLS).eq("brand_id", brandId).maybeSingle();
    return NextResponse.json({ profile: data ?? null, error: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data } = await admin.from("shipping_profiles").select(COLS);
  return NextResponse.json({ profiles: data ?? [], error: null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const brandId = String(b?.brand_id ?? "").trim();
  if (!UUID.test(brandId)) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  const box = String(b?.default_box ?? "20x30x10").replace(/\s/g, "");
  if (!/^\d{1,3}[x×]\d{1,3}[x×]\d{1,3}$/i.test(box)) return NextResponse.json({ error: "ขนาดกล่องต้องเป็น กว้างxยาวxสูง (ซม.) เช่น 20x30x10" }, { status: 400 });
  const weight = Math.round(Number(b?.default_weight_g) || 0);
  if (weight < 50 || weight > 30000) return NextResponse.json({ error: "น้ำหนักต่อชิ้นตั้งต้นต้องอยู่ระหว่าง 50–30,000 กรัม" }, { status: 400 });
  const courier = String(b?.default_courier ?? "").trim();
  if (courier && !SHIPPOP_COURIERS.some((c) => c.code === courier)) return NextResponse.json({ error: "ขนส่งไม่ถูกต้อง" }, { status: 400 });
  const postal = String(b?.sender_postal ?? "").replace(/\D/g, "").slice(0, 5);
  const row = {
    brand_id: brandId,
    sender_name: clip(b?.sender_name, 120), sender_phone: telOf(b?.sender_phone) || null, sender_address: clip(b?.sender_address, 300),
    sender_subdistrict: clip(b?.sender_subdistrict, 80), sender_district: clip(b?.sender_district, 80), sender_province: clip(b?.sender_province, 80),
    sender_postal: postal || null, default_box: box.replace(/×/g, "x"), default_weight_g: weight, default_courier: courier || null,
    updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
  };
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("shipping_profiles").select(COLS).eq("brand_id", brandId).maybeSingle();
  const { error } = await admin.from("shipping_profiles").upsert(row, { onConflict: "brand_id" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  const { updated_by: _u, updated_at: _a, brand_id: _b, ...changed } = row;
  await writeAudit(admin, { action: before ? "update" : "create", entityType: "shipping_profile", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, ...auditChangeMeta(before as Record<string, unknown> | null, changed) } });
  return NextResponse.json({ ok: true, error: null });
}
