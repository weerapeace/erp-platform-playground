/**
 * Platform Account Registry — /api/platform-accounts (ร้านต่อ แบรนด์ × แพลตฟอร์ม)
 * GET   ?brand_id=  (products.platforms.view)            → แพลตฟอร์มที่เปิด + ร้านของแบรนด์นี้ (by platform_id)
 * PATCH { brand_id, platform_id, label?, external_shop_id?, is_active?, tax_invoice_company_id? } (products.platforms.manage_accounts) → upsert
 *   tax_invoice_company_id = บริษัทที่ออกใบกำกับภาษีของร้านนี้ (ศูนย์ออเดอร์ /master/platform-orders)
 * หมายเหตุ: credential/token จริงจะเก็บฝั่ง server ตอนต่อ API จริง (เฟสถัดไป) — ตอนนี้เก็บแค่ชื่อร้าน/shop id
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const admin = supabaseAdmin();
  const [{ data: pf }, { data: br }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th, icon_key, capabilities").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("brands").select("id, name, color, hide_in_sales_channels").eq("is_active", true).order("name", { ascending: true }),
  ]);
  // 🛒 brands = ตัวเลือกแบรนด์ของแอปช่องทางขาย (ไม่เอาที่ตั้ง "ซ่อนในช่องทางขาย" ที่หน้าแบรนด์ · เดิมผูกกับงานลูกค้า)
  //    brands_all = ทุกแบรนด์ + hidden + shop_count — ใช้หาชื่อแบรนด์ของออเดอร์ (ใบพิมพ์) และหน้าตั้งค่าร้าน (แบรนด์ที่ซ่อนแต่มีร้าน ยังตั้งค่าได้)
  const { data: allAccts } = await admin.from("platform_accounts").select("brand_id");
  const shopCount = new Map<string, number>();
  for (const a of (allAccts ?? []) as { brand_id: string | null }[]) if (a.brand_id) shopCount.set(a.brand_id, (shopCount.get(a.brand_id) ?? 0) + 1);
  // can_publish = มีตัวเชื่อมลงสินค้าจริง (capabilities.api) — ตัวช่วยลงสินค้าใช้บอกว่าร้านไหน "ลงจริงได้" / "เตรียมร่างได้อย่างเดียว"
  const platforms = ((pf ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""), icon_key: (p.icon_key as string) ?? null,
    can_publish: (p.capabilities as Record<string, unknown> | null)?.api === true }));
  const brandsAll = ((br ?? []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name ?? ""), color: (b.color as string) ?? null,
    hidden: b.hide_in_sales_channels === true, shop_count: shopCount.get(String(b.id)) ?? 0 }));
  const brands = brandsAll.filter((b) => !b.hidden).map(({ id, name, color }) => ({ id, name, color }));
  const accounts: Record<string, { label: string | null; external_shop_id: string | null; is_active: boolean; tax_invoice_company_id: string | null }> = {};
  if (brandId) {
    const { data: accts } = await admin.from("platform_accounts").select("platform_id, label, external_shop_id, is_active, tax_invoice_company_id").eq("brand_id", brandId);
    for (const a of ((accts ?? []) as Record<string, unknown>[])) accounts[String(a.platform_id)] = { label: (a.label as string) ?? null, external_shop_id: (a.external_shop_id as string) ?? null, is_active: a.is_active !== false, tax_invoice_company_id: (a.tax_invoice_company_id as string) ?? null };
  }
  return NextResponse.json({ platforms, brands, brands_all: brandsAll, accounts, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; platform_id?: string; label?: string; external_shop_id?: string; is_active?: boolean; tax_invoice_company_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  const platform_id = (body.platform_id ?? "").trim();
  if (!brand_id || !platform_id) return NextResponse.json({ error: "ต้องมี brand_id + platform_id" }, { status: 400 });
  const row: Record<string, unknown> = { brand_id, platform_id, updated_by: user?.id ?? null, updated_at: new Date().toISOString(), created_by: user?.id ?? null };
  if ("label" in body) row.label = (body.label ?? "").trim() || null;
  if ("external_shop_id" in body) row.external_shop_id = (body.external_shop_id ?? "").trim() || null;
  if ("is_active" in body) row.is_active = body.is_active !== false;
  // บริษัทที่ออกใบกำกับของร้านนี้ (ศูนย์ออเดอร์ › ใบกำกับภาษี) — ว่าง = ยังไม่ตั้ง (ระบบไม่เดาให้)
  if ("tax_invoice_company_id" in body) row.tax_invoice_company_id = String(body.tax_invoice_company_id ?? "").trim() || null;
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("platform_accounts").select("label, external_shop_id, is_active, tax_invoice_company_id").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const { error } = await admin.from("platform_accounts").upsert(row, { onConflict: "brand_id,platform_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { created_by: _c, updated_by: _u, brand_id: _b, platform_id: _p, ...changed } = row;
  await writeAudit(admin, { action: "update", entityType: "platform_account", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id, platform_id, ...auditChangeMeta(before as Record<string, unknown> | null, changed) } });
  return NextResponse.json({ ok: true, error: null });
}
