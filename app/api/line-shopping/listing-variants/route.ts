/**
 * เพิ่ม/ลบค่าตัวเลือกของสินค้าบน LINE จากลิ้นชักสินค้าบนร้าน — /api/line-shopping/listing-variants
 *  POST { listing_id, action: "add", option_index, value, rows: NewVariantRow[] }
 *  POST { listing_id, action: "delete", option_index, value }
 *  (products.platforms.publish — ส่งขึ้นร้านจริง)
 *  กันพลาด (เฟสแรก): ทำได้เฉพาะสินค้าที่ "ปิดขายอยู่" (ลูกค้าไม่เห็นระหว่างแก้) · ไม่อยู่บนร้านแล้ว = ไม่ได้
 *  ลบ = LINE ลบทุกตัวเลือกที่มีค่านี้ → ตรวจ planDeleteOptionValue (ห้ามลบจนไม่เหลือ) ก่อนส่ง
 *  สำเร็จ → ดึงตัวนี้จาก LINE ใหม่ (lineGetProduct) แทนสำเนาในระบบ + ประวัติ (audit)
 *  กฎ: lib/line-variant-structure
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineAddVariants, lineDeleteVariantOption, lineGetProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";
import { lineOptionStructure, planAddOptionValue, planDeleteOptionValue, type NewVariantRow } from "@/lib/line-variant-structure";
import { isGoneStatus } from "@/lib/platform-listing-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const n = (x: unknown) => { if (x == null || x === "") return null; const k = Number(x); return Number.isFinite(k) ? k : null; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; action?: string; option_index?: unknown; value?: unknown; rows?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const listingId = String(body.listing_id ?? "").trim();
  const action = body.action === "add" || body.action === "delete" ? body.action : null;
  const optIdx = Number(body.option_index);
  const value = String(body.value ?? "").trim();
  if (!listingId || !action || !(optIdx === 0 || optIdx === 1) || !value) return NextResponse.json({ error: "ข้อมูลไม่ครบ (listing_id · action · option_index · value)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, title, status, raw").eq("id", listingId).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; status: string | null; raw: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  if (isGoneStatus(row.status)) return NextResponse.json({ error: "สินค้านี้ไม่อยู่บนร้าน LINE แล้ว" }, { status: 400 });
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "line_shopping") return NextResponse.json({ error: "ทำได้เฉพาะสินค้าบน LINE" }, { status: 400 });
  const productId = String(row.external_product_id ?? "").trim();
  const line = (row.raw?.line && typeof row.raw.line === "object") ? row.raw.line as Record<string, unknown> : null;
  const st = lineOptionStructure(line);
  if (!productId || !line || !st) return NextResponse.json({ error: "ยังไม่มีข้อมูลตัวเลือกของสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ก่อน" }, { status: 400 });
  if (line.isDisplay !== false) return NextResponse.json({ error: "ปิดขายสินค้านี้ก่อน แล้วค่อยเพิ่ม/ลบตัวเลือก (กันลูกค้าเห็นระหว่างแก้)" }, { status: 400 });

  const k = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!k.apiKey) return NextResponse.json({ error: k.error }, { status: 400 });
  const key = k.apiKey;

  let metaChange: Record<string, unknown>;
  let send: () => Promise<{ ok: boolean; status: number; error?: string }>;
  if (action === "delete") {
    const p = planDeleteOptionValue(st, optIdx, value);
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });
    metaChange = { action, option: p.name, value: p.value, affected: p.affected.map((v) => v.sku ?? v.id) };
    send = () => lineDeleteVariantOption(key, productId, p.name, p.value);
  } else {
    const rows: NewVariantRow[] = (Array.isArray(body.rows) ? body.rows : []).map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
      .map((x) => ({ otherValue: x.otherValue == null ? null : String(x.otherValue), price: n(x.price), weight: n(x.weight), sku: String(x.sku ?? ""), barcode: x.barcode == null ? null : String(x.barcode) }));
    const p = planAddOptionValue(st, optIdx, value, rows);
    if (p.errors.length || !p.payload) return NextResponse.json({ error: p.errors.join(" · "), errors: p.errors }, { status: 400 });
    const payload = p.payload;
    metaChange = { action, option: st.options[optIdx].name, value, added: payload.variants.map((v) => v.sku) };
    send = () => lineAddVariants(key, productId, payload as unknown as Record<string, unknown>);
  }

  const res = await send();

  // สำเร็จ → ดึงตัวนี้จาก LINE ใหม่ (โครงตัวเลือก/รหัสตัวเลือกใหม่มาจากร้าน)
  let refreshed = false;
  if (res.ok) {
    const fresh = await lineGetProduct(key, productId);
    if (fresh.ok && fresh.row) {
      refreshed = true;
      await admin.from("platform_catalog_listings").update({ raw: { ...(row.raw ?? {}), line: fresh.row }, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  await writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "line_listing_variants", external_product_id: productId, title: row.title, ...metaChange, ok: res.ok, refreshed, ...(res.ok ? {} : { error: res.error ?? `HTTP ${res.status}` }) },
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error ?? `HTTP ${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true, refreshed, error: null });
}
