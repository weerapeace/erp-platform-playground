/**
 * POST /api/purchasing/pr-enrich — เติมข้อมูลที่ขาด จากป๊อปรายละเอียด (แผงเจาะรายการ)
 * เติมทีละ field แล้ว "save กลับ SKU (แม่) + เอกสาร (ใบขอซื้อ ถ้ามี)"
 *
 * body: {
 *   entity: "pr" | "po_line",   // เอกสารต้นทาง
 *   id: string,                 // id ของเอกสาร
 *   sku_id?: string | null,     // SKU ที่ผูก (ไว้ save ค่ากลับแม่)
 *   field: "image" | "price" | "link" | "seller",
 *   value: string | number,     // image=r2_key · price=ตัวเลข · link=url · seller=ชื่อร้าน
 *   currency?: string            // price → เลือก standard_price (บาท) / rmb_cost (หยวน)
 * }
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());
const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { entity?: string; id?: string; sku_id?: string | null; field?: string; value?: string | number; currency?: string;
    source2?: { seller?: string; price?: string | number | null; currency?: string; link?: string } };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const entity = body.entity === "po_line" ? "po_line" : "pr";
  const id = body.id;
  const field = body.field ?? "";
  const skuId = body.sku_id || null;
  if (!id) return NextResponse.json({ error: "ไม่ระบุเอกสาร" }, { status: 400 });

  const admin = supabaseAdmin();
  const docTable = entity === "po_line" ? "purchase_order_lines_v2" : "purchase_requests_v2";
  const skuPatch: Record<string, unknown> = {};
  const docPatch: Record<string, unknown> = {};

  if (field === "image") {
    const key = String(body.value ?? "").trim();
    if (!key || !SAFE_KEY.test(key)) return NextResponse.json({ error: "รูปไม่ถูกต้อง" }, { status: 400 });
    if (skuId) skuPatch.cover_image_r2_key = key;
    if (entity === "pr") docPatch.image_key = key;
  } else if (field === "price") {
    const n = Number(body.value);
    if (!isFinite(n) || n < 0) return NextResponse.json({ error: "ราคาไม่ถูกต้อง" }, { status: 400 });
    if (skuId) skuPatch[isCNY(body.currency) ? "rmb_cost" : "standard_price"] = n;
    docPatch.price_est = n;
    if (body.currency) docPatch.currency = isCNY(body.currency) ? "YUAN" : "THB";   // ให้ราคา+สกุลตรงกัน
  } else if (field === "link") {
    const url = String(body.value ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) return NextResponse.json({ error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    if (skuId) skuPatch.purchase_link = url || null;
    if (entity === "pr") docPatch.purchase_url = url || null;
  } else if (field === "seller") {
    if (entity !== "pr") return NextResponse.json({ error: "แก้ร้านค้าได้เฉพาะใบขอซื้อ" }, { status: 400 });
    docPatch.seller_name = String(body.value ?? "").trim() || null;
  } else if (field === "source2") {
    // แหล่งซื้อที่ 2 → เก็บบน SKU เท่านั้น (ต้องมี SKU ผูก)
    if (!skuId) return NextResponse.json({ error: "รายการนี้ยังไม่ผูก SKU — เพิ่มแหล่งซื้อที่ 2 ไม่ได้" }, { status: 400 });
    const s = body.source2 ?? {};
    const link = String(s.link ?? "").trim();
    if (link && !/^https?:\/\//i.test(link)) return NextResponse.json({ error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    const p = s.price === "" || s.price == null ? null : Number(s.price);
    if (p != null && (!isFinite(p) || p < 0)) return NextResponse.json({ error: "ราคาที่ 2 ไม่ถูกต้อง" }, { status: 400 });
    skuPatch.alt_seller = String(s.seller ?? "").trim() || null;
    skuPatch.alt_price = p;
    skuPatch.alt_currency = isCNY(s.currency) ? "YUAN" : "THB";
    skuPatch.alt_link = link || null;
  } else {
    return NextResponse.json({ error: "field ไม่ถูกต้อง" }, { status: 400 });
  }

  // เขียนกลับ SKU (แม่) + เอกสาร
  if (skuId && Object.keys(skuPatch).length) {
    const { error } = await admin.from("skus_v2").update(skuPatch).eq("id", skuId);
    if (error) return NextResponse.json({ error: "อัปเดต SKU ไม่สำเร็จ: " + error.message }, { status: 400 });
  }
  if (Object.keys(docPatch).length) {
    const { error } = await admin.from(docTable).update(docPatch).eq("id", id);
    if (error) return NextResponse.json({ error: "อัปเดตเอกสารไม่สำเร็จ: " + error.message }, { status: 400 });
  }

  await writeAudit(admin, {
    action: "update", entityType: "purchasing_enrich", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { entity, field, sku_id: skuId, sku: skuPatch, doc: docPatch },
  });
  return NextResponse.json({ ok: true, error: null });
}
