/**
 * GET /api/master/partner-data-check — คู่ค้าที่ข้อมูลไม่ครบสำหรับออกเอกสาร
 *
 * ทำไมต้องมี: ใบกำกับภาษี/ใบสั่งซื้อ ต้องมี ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี
 * แต่ข้อมูลจริงกรอกไม่ครบ (ส.ค. 2026: ลูกค้า 124 ราย มีเลขภาษีแค่ 4 ราย)
 * → เอกสารพิมพ์ออกมาช่องว่าง โดยไม่มีใครรู้จนกว่าจะพิมพ์
 *
 * เรียงตาม "จำนวนเอกสารที่เคยออก" มากไปน้อย → กรอกรายที่ใช้งานจริงก่อน คุ้มที่สุด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const t = (v: unknown) => String(v ?? "").trim();
const has = (v: unknown) => t(v).length > 0;

export type PartnerCheckRow = {
  id: string;
  name: string;
  roles: string;              // "ลูกค้า" / "ผู้จำหน่าย" / "ลูกค้า+ผู้จำหน่าย"
  is_customer: boolean;
  is_supplier: boolean;
  doc_count: number;          // จำนวนเอกสารที่เคยออกให้คู่ค้ารายนี้
  so_count: number;
  po_count: number;
  has_company_name: boolean;
  has_address: boolean;
  has_tax_id: boolean;
  has_phone: boolean;
  missing: string;            // สรุปเป็นภาษาคน
  missing_count: number;
  /** เลขภาษีไปอยู่ในช่องสาขา (กรอกสลับช่อง) — ต้องแก้ก่อนใช้งาน */
  tax_swapped: boolean;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  const admin = supabaseAdmin();
  const [pRes, soRes, poRes] = await Promise.all([
    admin.from("partners_v2")
      .select("id, display_name, name_th, company_name, address_line, district, province, tax_id, tax_branch, phone, mobile, is_customer, is_supplier, is_active")
      .limit(5000),
    admin.from("erp_playground_sales_orders").select("customer_id").limit(20000),
    admin.from("purchase_orders_v2").select("seller_partner_id").limit(20000),
  ]);

  if (pRes.error) return NextResponse.json({ data: [], error: pRes.error.message }, { status: 500 });

  const soBy = new Map<string, number>();
  for (const r of ((soRes.data ?? []) as Record<string, unknown>[])) {
    const k = t(r.customer_id); if (k) soBy.set(k, (soBy.get(k) ?? 0) + 1);
  }
  const poBy = new Map<string, number>();
  for (const r of ((poRes.data ?? []) as Record<string, unknown>[])) {
    const k = t(r.seller_partner_id); if (k) poBy.set(k, (poBy.get(k) ?? 0) + 1);
  }

  const rows: PartnerCheckRow[] = ((pRes.data ?? []) as Record<string, unknown>[])
    .filter((p) => p.is_active !== false)
    .map((p) => {
      const id = t(p.id);
      const so = soBy.get(id) ?? 0;
      const po = poBy.get(id) ?? 0;

      const hasCompany = has(p.company_name);
      // ที่อยู่ถือว่าใช้ได้ต่อเมื่อมีทั้งบรรทัดที่อยู่ + อำเภอ/เขต + จังหวัด (ไม่งั้นใบกำกับไม่สมบูรณ์)
      const hasAddress = has(p.address_line) && has(p.district) && has(p.province);
      const hasTax = has(p.tax_id);
      const hasPhone = has(p.phone) || has(p.mobile);
      // เจอเลข 13 หลักในช่องสาขา = กรอกสลับช่อง (เคสจริงที่เคยเจอ)
      const swapped = !hasTax && /^[0-9]{13}$/.test(t(p.tax_branch));

      const missingList = [
        !hasCompany && "ชื่อบริษัท",
        !hasAddress && "ที่อยู่",
        !hasTax && "เลขผู้เสียภาษี",
        !hasPhone && "เบอร์โทร",
      ].filter(Boolean) as string[];

      return {
        id,
        name: t(p.company_name) || t(p.name_th) || t(p.display_name) || "(ไม่มีชื่อ)",
        roles: p.is_customer && p.is_supplier ? "ลูกค้า+ผู้จำหน่าย" : p.is_customer ? "ลูกค้า" : p.is_supplier ? "ผู้จำหน่าย" : "—",
        is_customer: !!p.is_customer,
        is_supplier: !!p.is_supplier,
        doc_count: so + po, so_count: so, po_count: po,
        has_company_name: hasCompany, has_address: hasAddress, has_tax_id: hasTax, has_phone: hasPhone,
        missing: missingList.join(" · ") || "ครบแล้ว",
        missing_count: missingList.length,
        tax_swapped: swapped,
      };
    })
    // เอาเฉพาะรายที่ยังขาด แล้วเรียงตามที่ใช้งานจริงมากสุดก่อน
    .filter((r) => r.missing_count > 0 || r.tax_swapped)
    .sort((a, b) => b.doc_count - a.doc_count || b.missing_count - a.missing_count);

  return NextResponse.json({ data: rows, error: null });
}
