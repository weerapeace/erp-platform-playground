/**
 * แก้สินค้าบน LINE จากลิ้นชักสินค้าบนร้าน — /api/line-shopping/listing-edit
 *  POST { listing_id, edit: LineEditState }  (products.platforms.publish — ส่งขึ้นร้านจริง)
 *   1) เทียบฟอร์มกับข้อมูลบนร้านที่ดึงมา (planLineEdit) → ส่งเฉพาะช่องที่เปลี่ยน · ตรวจค่าไม่ผ่าน = 400 ไม่ส่งอะไร
 *   2) รายละเอียด (ชื่อ/รายละเอียด/แบรนด์/หมวด) → PATCH /products/{id} · พลาด = หยุด ไม่ส่งราคา
 *   3) ราคาต่อตัวเลือก → PATCH /products/{id}/prices
 *   4) แก้สำเนา raw.line ในระบบตามที่ส่งสำเร็จ (applyLineEditToRaw) + ชื่อรายการ
 *   5) ประวัติ (audit) ก่อน → หลัง ทุกช่อง
 *  → { ok, details: "ok"|"skip"|error, prices: "ok"|"skip"|error, changes, error }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineUpdatePrices, lineUpdateProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";
import { applyLineEditToRaw, lineEditStateFromRaw, planLineEdit, type LineEditState } from "@/lib/line-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cleanState = (v: unknown): LineEditState | null => {
  const o = (v && typeof v === "object") ? v as Record<string, unknown> : null;
  if (!o || !Array.isArray(o.variants)) return null;
  const n = (x: unknown) => { if (x == null || x === "") return null; const k = Number(x); return Number.isFinite(k) ? k : null; };
  return {
    name: String(o.name ?? ""), brand: String(o.brand ?? ""), description: String(o.description ?? ""),
    categoryId: n(o.categoryId), categoryName: o.categoryName == null ? null : String(o.categoryName),
    variants: (o.variants as unknown[]).map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
      .map((x) => ({ id: String(x.id ?? ""), label: String(x.label ?? ""), sku: x.sku == null ? null : String(x.sku), price: n(x.price), pay: n(x.pay) }))
      .filter((x) => x.id),
  };
};

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
  if (plan.changes.length === 0) return NextResponse.json({ ok: true, details: "skip", prices: "skip", changes: [], error: null });

  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return NextResponse.json({ error: key.error }, { status: 400 });

  // 1) รายละเอียด
  let details: string = "skip";
  const sentFields = Object.keys(plan.fields).length ? plan.fields : null;
  if (sentFields) {
    const r = await lineUpdateProduct(key.apiKey, productId, sentFields);
    details = r.ok ? "ok" : (r.error || `HTTP ${r.status}`);
  }
  // 2) ราคา (รายละเอียดพลาด = ไม่ส่งต่อ กันส่งครึ่ง ๆ กลาง ๆ)
  let prices: string = "skip";
  if (plan.prices && details !== "skip" && details !== "ok") prices = "ไม่ได้ส่ง (รายละเอียดไม่สำเร็จ)";
  else if (plan.prices) {
    const r = await lineUpdatePrices(key.apiKey, productId, plan.prices);
    prices = r.ok ? "ok" : (r.error || `HTTP ${r.status}`);
  }

  // 3) แก้สำเนาในระบบเฉพาะส่วนที่ส่งสำเร็จ
  const okDetails = details === "ok"; const okPrices = prices === "ok";
  if (okDetails || okPrices) {
    const nextLine = applyLineEditToRaw(line, {
      fields: okDetails ? plan.fields : undefined, categoryName: after.categoryName, prices: okPrices ? plan.prices : undefined,
    });
    const patch: Record<string, unknown> = { raw: { ...(row.raw ?? {}), line: nextLine }, updated_at: new Date().toISOString() };
    if (okDetails && plan.fields.name) patch.title = plan.fields.name;
    await admin.from("platform_catalog_listings").update(patch).eq("id", row.id);
  }

  const failed = [details, prices].filter((x) => x !== "ok" && x !== "skip");
  await writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      source: "line_listing_edit", external_product_id: productId, title: row.title,
      changes: plan.changes.filter((c) => (c.label.startsWith("ราคา ") ? okPrices : okDetails)),
      details, prices, ...(failed.length ? { error: failed.join(" · ") } : {}),
    },
  });

  const ok = failed.length === 0;
  return NextResponse.json({ ok, details, prices, changes: plan.changes, error: ok ? null : failed.join(" · ") }, { status: ok ? 200 : 502 });
}
