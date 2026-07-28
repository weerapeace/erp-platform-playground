/**
 * GET /api/purchasing/orderable
 * รายการ "ขอซื้อ" (PR) ที่รอออกใบสั่งซื้อ — po_id ว่าง + ไม่ถูกปฏิเสธ/ยกเลิก
 * join skus_v2 เพื่อเอา รหัส (code) + รูปปก SKU จริง (cover_image_r2_key)
 * ใช้ในหน้า "สั่งซื้อ" (เลือก → /api/purchasing/create-po)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: prs, error } = await admin
    .from("purchase_requests_v2")
    .select("id, seller_name, item_sku_id, item_name, qty, uom, price_est, currency, order_date, requester, status, image_key, note, source_mo_no, used_for_label")
    .is("po_id", null)
    .eq("is_active", true)
    .not("status", "in", "(rejected,cancelled)")
    .order("seller_name", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  // ดึง code + รูปปก SKU จริง (batch)
  const skuIds = [...new Set((prs ?? []).map((p) => p.item_sku_id).filter(Boolean) as string[])];
  const skuMap = new Map<string, { code: string | null; cover: string | null; link: string | null; uom_id: string | null; supplier_sku_code: string | null; name_cn: string | null; name_en: string | null; purchase_uom_en: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key, purchase_link, uom_id, supplier_sku_code, name_cn, name_en, purchase_uom_en").in("id", chunk);
    for (const s of (sk ?? []) as Record<string, unknown>[]) skuMap.set(String(s.id), { code: (s.code as string) ?? null, cover: (s.cover_image_r2_key as string) ?? null, link: (s.purchase_link as string) ?? null, uom_id: (s.uom_id as string) ?? null, supplier_sku_code: (s.supplier_sku_code as string) ?? null, name_cn: (s.name_cn as string) ?? null, name_en: (s.name_en as string) ?? null, purchase_uom_en: (s.purchase_uom_en as string) ?? null });
  }

  // หน่วยนับจาก SKU (uoms.name) — ไว้เติมเมื่อใบขอซื้อไม่มีหน่วย เช่น "หลา"
  const uomIds = [...new Set([...skuMap.values()].map((s) => s.uom_id).filter(Boolean) as string[])];
  const uomMap = new Map<string, string>();
  for (let i = 0; i < uomIds.length; i += 300) {
    const chunk = uomIds.slice(i, i + 300);
    const { data: u } = await admin.from("uoms").select("id, name").in("id", chunk);
    for (const r of (u ?? []) as Record<string, unknown>[]) uomMap.set(String(r.id), String(r.name ?? ""));
  }

  // ดึง MOQ + leadtime จาก "ร้านหลัก" (is_default) ของแต่ละสินค้า — โชว์บนการ์ด
  const supMap = new Map<string, { moq: number | null; lead: number | null; tiers: { qty: number; price: number }[] }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: si } = await admin.from("supplier_items").select("item_sku_id, moq, lead_time_days, price_tiers").eq("is_default", true).in("item_sku_id", chunk);
    for (const s of (si ?? []) as Record<string, unknown>[]) supMap.set(String(s.item_sku_id), {
      moq: s.moq == null ? null : Number(s.moq), lead: s.lead_time_days == null ? null : Number(s.lead_time_days),
      tiers: Array.isArray(s.price_tiers) ? (s.price_tiers as { qty: number; price: number }[]) : [],
    });
  }

  // รหัสร้านต่อร้าน (supplier_items.supplier_sku) — match ด้วย (sku, ชื่อร้าน) → ใช้บนใบ PO ตามร้านที่สั่งจริง
  const shopSkuMap = new Map<string, string>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: si2 } = await admin.from("supplier_items").select("item_sku_id, supplier_partner, supplier_sku")
      .in("item_sku_id", chunk).eq("is_active", true).not("supplier_sku", "is", null);
    for (const s of (si2 ?? []) as Record<string, unknown>[]) {
      const pname = String(s.supplier_partner ?? "").trim();
      if (s.item_sku_id && s.supplier_sku && pname) shopSkuMap.set(`${s.item_sku_id}::${pname}`, String(s.supplier_sku));
    }
  }

  const rows = (prs ?? []).map((p) => {
    const sk = p.item_sku_id ? skuMap.get(String(p.item_sku_id)) : null;
    const shopSku = p.item_sku_id ? shopSkuMap.get(`${p.item_sku_id}::${String(p.seller_name ?? "").trim()}`) : null;
    const key = sk?.cover ?? p.image_key ?? null;
    return {
      id: String(p.id),
      seller_name: p.seller_name ?? "—",
      item_sku_id: p.item_sku_id ?? null,
      item_name: p.item_name ?? "",
      // รหัสวัตถุดิบ: จาก SKU ที่ผูกไว้ · ถ้ายังไม่ผูก (ใบที่มาจาก BOM) → ดึงจากวงเล็บหน้าชื่อ "[CODE] ชื่อ"
      code: sk?.code || (String(p.item_name ?? "").match(/^\s*\[([^\]]+)\]/)?.[1] ?? ""),
      qty: num(p.qty),
      uom: (p.uom as string) || (sk?.uom_id ? (uomMap.get(sk.uom_id) ?? "") : "") || "",
      price_est: num(p.price_est),
      line_total: num(p.qty) * num(p.price_est),
      currency: p.currency ?? "THB",
      order_date: p.order_date ?? null,
      requester: p.requester ?? "",
      note: p.note ?? "",
      status: p.status ?? "",
      source_mo_no: p.source_mo_no ?? null,
      used_for_label: p.used_for_label ?? null,
      approved: p.status === "approved",
      cover_key: key,   // r2 key ดิบ (ไว้แก้รูป SKU)
      image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
      purchase_link: sk?.link ?? null,   // ลิงก์ซื้อสินค้า (จาก SKU)
      supplier_sku_code: shopSku ?? sk?.supplier_sku_code ?? null,   // รหัสร้าน: per-shop (supplier_items) ก่อน แล้ว fallback ฟิลด์เดี่ยว SKU
      name_cn: sk?.name_cn ?? null, name_en: sk?.name_en ?? null, purchase_uom_en: sk?.purchase_uom_en ?? null,
      moq: (p.item_sku_id ? supMap.get(String(p.item_sku_id))?.moq : null) ?? null,
      lead_time_days: (p.item_sku_id ? supMap.get(String(p.item_sku_id))?.lead : null) ?? null,
      price_tiers: (p.item_sku_id ? supMap.get(String(p.item_sku_id))?.tiers : null) ?? [],
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
