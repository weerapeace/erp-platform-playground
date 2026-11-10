/**
 * แก้สินค้าบน LINE จากลิ้นชักสินค้าบนร้าน — /api/line-shopping/listing-edit
 *  POST { listing_id, edit: LineEditState }  (products.platforms.publish — ส่งขึ้นร้านจริง)
 *   1) เทียบฟอร์มกับข้อมูลบนร้านที่ดึงมา (planLineEdit) → ส่งเฉพาะช่องที่เปลี่ยน · ตรวจค่าไม่ผ่าน = 400 ไม่ส่งอะไร
 *   2) รายละเอียด (ชื่อ/รายละเอียด/แบรนด์/หมวด/รูปสินค้า) → PATCH /products/{id} · พลาด = หยุด ไม่ส่งต่อ
 *   3) ราคาต่อตัวเลือก → PATCH /products/{id}/prices
 *   4) รายละเอียดตัวเลือก (น้ำหนัก/บาร์โค้ด/SKU/รูป) → PATCH /products/{id}/variant ทีละตัว
 *   5) ดึงสินค้าตัวนี้จาก LINE ใหม่ (lineGetProduct) → raw.line ตรงร้านเป๊ะ (รูปกลายเป็นลิงก์ของ LINE) · ดึงไม่ได้ = แก้สำเนาเองตามที่ส่งสำเร็จ
 *   6) ประวัติ (audit) ก่อน → หลัง เฉพาะส่วนที่สำเร็จ
 *  รูปจากคลังรูปในระบบ ("r2:<key>") → แปลงเป็นลิงก์สาธารณะ /api/r2-image ก่อนส่ง (แบบเดียวกับตอนสร้างสินค้า)
 *  → { ok, details, prices, variants: "ok"|"skip"|error, changes, error }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineGetProduct, lineUpdatePrices, lineUpdateProduct, lineUpdateVariant } from "@/lib/line-shopping";
import { lineApiKey, publicImageUrl } from "@/lib/line-shopping-server";
import { applyLineEditToRaw, lineEditStateFromRaw, planLineEdit, systemImageKey, type LineEditState } from "@/lib/line-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cleanState = (v: unknown): LineEditState | null => {
  const o = (v && typeof v === "object") ? v as Record<string, unknown> : null;
  if (!o || !Array.isArray(o.variants)) return null;
  const n = (x: unknown) => { if (x == null || x === "") return null; const k = Number(x); return Number.isFinite(k) ? k : null; };
  const s = (x: unknown) => (x == null ? null : String(x));
  return {
    name: String(o.name ?? ""), brand: String(o.brand ?? ""), description: String(o.description ?? ""),
    categoryId: n(o.categoryId), categoryName: s(o.categoryName),
    images: Array.isArray(o.images) ? (o.images as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [],
    variants: (o.variants as unknown[]).map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
      .map((x) => ({
        id: String(x.id ?? ""), label: String(x.label ?? ""), sku: s(x.sku), price: n(x.price), pay: n(x.pay),
        weight: n(x.weight), barcode: s(x.barcode), imageUrl: s(x.imageUrl),
      }))
      .filter((x) => x.id),
  };
};

/** "r2:<key>" → ลิงก์สาธารณะ · ลิงก์อื่น (ของ LINE) คงเดิม */
const resolveImage = (ref: string) => { const k = systemImageKey(ref); return k ? publicImageUrl(k) : ref; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; edit?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const listingId = String(body.listing_id ?? "").trim();
  const after = cleanState(body.edit);
  if (!listingId || !after) return NextResponse.json({ error: "ข้อมูลไม่ครบ (listing_id + edit)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, title, status, raw").eq("id", listingId).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; status: string | null; raw: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  if (isGoneStatus(row.status)) return NextResponse.json({ error: "สินค้านี้ไม่อยู่บนร้าน LINE แล้ว — แก้ไม่ได้" }, { status: 400 });
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "line_shopping") return NextResponse.json({ error: "แก้จากหน้านี้ได้เฉพาะสินค้าบน LINE" }, { status: 400 });
  const productId = String(row.external_product_id ?? "").trim();
  const line = row.raw?.line;
  const before = lineEditStateFromRaw(line);
  if (!productId || !before) return NextResponse.json({ error: "ยังไม่มีข้อมูลสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ก่อน" }, { status: 400 });

  const plan = planLineEdit(before, after);
  if (plan.errors.length) return NextResponse.json({ error: plan.errors.join(" · "), errors: plan.errors }, { status: 400 });
  if (plan.changes.length === 0) return NextResponse.json({ ok: true, details: "skip", prices: "skip", variants: "skip", changes: [], error: null });

  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return NextResponse.json({ error: key.error }, { status: 400 });

  // รูปจากระบบ → ลิงก์สาธารณะ (ทั้งรูปสินค้าและรูปตัวเลือก)
  const sendFields = { ...plan.fields, ...(plan.fields.imageUrls ? { imageUrls: plan.fields.imageUrls.map(resolveImage) } : {}) };
  const sendDetails = (plan.variantDetails ?? []).map((d) => (d.imageUrl ? { ...d, imageUrl: resolveImage(d.imageUrl) } : d));

  // 1) รายละเอียด + รูปสินค้า
  let details: string = "skip";
  if (Object.keys(sendFields).length) {
    const r = await lineUpdateProduct(key.apiKey, productId, sendFields);
    details = r.ok ? "ok" : (r.error || `HTTP ${r.status}`);
  }
  const blocked = details !== "skip" && details !== "ok";   // รายละเอียดพลาด = ไม่ส่งต่อ (กันส่งครึ่ง ๆ กลาง ๆ)
  // 2) ราคา
  let prices: string = "skip";
  if (plan.prices && blocked) prices = "ไม่ได้ส่ง (รายละเอียดไม่สำเร็จ)";
  else if (plan.prices) {
    const r = await lineUpdatePrices(key.apiKey, productId, plan.prices);
    prices = r.ok ? "ok" : (r.error || `HTTP ${r.status}`);
  }
  // 3) รายละเอียดตัวเลือก ทีละตัว
  let variants: string = "skip";
  const okDetailIds = new Set<string>();
  if (sendDetails.length && blocked) variants = "ไม่ได้ส่ง (รายละเอียดไม่สำเร็จ)";
  else if (sendDetails.length) {
    const fails: string[] = [];
    for (const d of sendDetails) {
      const r = await lineUpdateVariant(key.apiKey, productId, d);
      if (r.ok) okDetailIds.add(d.id);
      else fails.push(`${after.variants.find((v) => v.id === d.id)?.label ?? d.id}: ${r.error || `HTTP ${r.status}`}`);
    }
    variants = fails.length === 0 ? "ok" : fails.join(" | ");
  }

  // 4) สำเนาในระบบ: ดึงตัวนี้จาก LINE ใหม่ · ไม่ได้ = แก้เองเฉพาะส่วนที่สำเร็จ
  const okDetails = details === "ok"; const okPrices = prices === "ok";
  let refreshed = false;
  if (okDetails || okPrices || okDetailIds.size) {
    const fresh = await lineGetProduct(key.apiKey, productId);
    let nextLine: Record<string, unknown>;
    if (fresh.ok && fresh.row) { nextLine = fresh.row; refreshed = true; }
    else {
      nextLine = applyLineEditToRaw(line, {
        fields: okDetails ? sendFields : undefined, categoryName: after.categoryName, prices: okPrices ? plan.prices : undefined,
        variantDetails: sendDetails.filter((d) => okDetailIds.has(d.id)),
      });
    }
    const patch: Record<string, unknown> = { raw: { ...(row.raw ?? {}), line: nextLine }, updated_at: new Date().toISOString() };
    const newName = typeof nextLine.name === "string" ? nextLine.name : (okDetails ? plan.fields.name : undefined);
    if (newName) patch.title = newName;
    await admin.from("platform_catalog_listings").update(patch).eq("id", row.id);
  }

  const failed = [details, prices, variants].filter((x) => x !== "ok" && x !== "skip");
  const okChange = (label: string) => {
    if (label.startsWith("ราคา ")) return okPrices;
    if (label.startsWith("ตัวเลือก ")) { const v = after.variants.find((x) => `ตัวเลือก ${x.label}` === label); return !!v && okDetailIds.has(v.id); }
    return okDetails;
  };
  await writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      source: "line_listing_edit", external_product_id: productId, title: row.title,
      changes: plan.changes.filter((c) => okChange(c.label)),
      details, prices, variants, refreshed, ...(failed.length ? { error: failed.join(" · ") } : {}),
    },
  });

  const ok = failed.length === 0;
  return NextResponse.json({ ok, details, prices, variants, refreshed, changes: plan.changes, error: ok ? null : failed.join(" · ") }, { status: ok ? 200 : 502 });
}
