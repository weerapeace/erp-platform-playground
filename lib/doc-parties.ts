/**
 * ของกลาง — เติม "หัวบิลบริษัทผู้ขาย" และ "ข้อมูลลูกค้า" ลงในเอกสารก่อนพิมพ์
 *
 * เอกสารทุกชนิด (ใบขาย/ใบเสนอราคา/ใบส่งสินค้า/ใบลดหนี้) ต้องการชุดข้อมูลเดียวกัน:
 *   - บริษัทผู้ออกเอกสาร: ชื่อ/ที่อยู่/โทร/เลขประจำตัวผู้เสียภาษี  (จากทะเบียน companies)
 *   - ลูกค้า: ชื่อ/ที่อยู่/เบอร์/เลขประจำตัวผู้เสียภาษี            (จาก partners_v2)
 * เดิมแต่ละ API ก๊อปโค้ดชุดนี้ไปเอง — รวมไว้ที่นี่ที่เดียว
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";

type Admin = ReturnType<typeof supabaseAdmin>;

export const firstText = (...values: unknown[]) => {
  for (const v of values) { const t = String(v ?? "").trim(); if (t) return t; }
  return "";
};

export type CompanyHeader = {
  company_code: string;
  company_name_th: string;
  company_name_en: string;
  company_address: string;
  company_phone: string;
  company_fax: string;
  company_tax_id: string;
  company_logo_key: string;
};

/** หัวบิลผู้ขาย — ไม่ระบุบริษัท = ใช้บริษัทตั้งต้น (เอกสารจะได้ไม่มีหัวว่าง) */
export async function companyHeader(admin: Admin, companyId?: string | null): Promise<CompanyHeader | null> {
  const id = String(companyId ?? "").trim();
  const q = admin.from("companies").select("*");
  const { data } = id ? await q.eq("id", id).maybeSingle() : await q.eq("is_default", true).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    company_code:     firstText(row.company_code),
    company_name_th:  firstText(row.name_th, row.name),
    company_name_en:  firstText(row.name_en),
    company_address:  formatThaiAddress(row),
    company_phone:    firstText(row.phone),
    company_fax:      firstText(row.fax),
    company_tax_id:   formatTaxId(row.tax_id, row.tax_branch),
    company_logo_key: firstText(row.logo_key),
  };
}

export type CustomerHeader = {
  customer_name: string;
  customer_code: string;
  customer_address: string;
  customer_phone: string;
  customer_tax_id: string;
};

/** ข้อมูลลูกค้าจากทะเบียนคู่ค้า — ค่าที่บันทึกไว้บนเอกสารมาก่อนเสมอ (เอกสารเก่าต้องไม่เปลี่ยนตามทะเบียน) */
export async function customerHeader(
  admin: Admin, customerId?: string | null, onDoc: Partial<CustomerHeader> = {},
): Promise<CustomerHeader> {
  const id = String(customerId ?? "").trim();
  const base: CustomerHeader = {
    customer_name:    firstText(onDoc.customer_name),
    customer_code:    firstText(onDoc.customer_code),
    customer_address: firstText(onDoc.customer_address),
    customer_phone:   firstText(onDoc.customer_phone),
    customer_tax_id:  firstText(onDoc.customer_tax_id),
  };
  if (!id) return base;
  const { data } = await admin.from("partners_v2").select("*").eq("id", id).maybeSingle();
  if (!data) return base;
  const row = data as Record<string, unknown>;
  return {
    customer_name:    firstText(base.customer_name, row.name_th, row.name_en, row.display_name, row.code),
    customer_code:    firstText(base.customer_code, row.code),
    customer_address: firstText(base.customer_address, formatThaiAddress(row)),
    customer_phone:   firstText(base.customer_phone, row.phone, row.mobile, row.tel, row.contact_phone),
    customer_tax_id:  firstText(base.customer_tax_id, formatTaxId(firstText(row.tax_id, row.tax_no, row.vat_id), row.tax_branch)),
  };
}
