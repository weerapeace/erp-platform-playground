/**
 * ตรวจ "บริษัท" ที่หน้าจอส่งมา (ฝั่ง server) — ใช้ร่วมกันทุก API ที่ให้เลือกบริษัทในกลุ่มได้
 *   - ว่าง / null = ยังไม่ระบุบริษัท (อนุญาต — ไปอยู่กอง "ยังไม่ระบุ")
 *   - ต้องเป็นบริษัทที่มีอยู่ในทะเบียน companies จริง (กันส่ง id มั่ว ๆ เข้าตาราง)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkCompanyId(
  db: ReturnType<typeof supabaseAdmin>,
  raw: unknown,
): Promise<{ companyId: string | null } | { error: string }> {
  const v = raw == null ? "" : String(raw).trim();
  if (!v) return { companyId: null };
  if (!UUID_RE.test(v)) return { error: "บริษัทที่เลือกไม่ถูกต้อง" };
  const { data } = await db.from("companies").select("id").eq("id", v).maybeSingle();
  if (!data) return { error: "ไม่พบบริษัทนี้ในทะเบียน — อาจถูกลบไปแล้ว ลองโหลดหน้าใหม่" };
  return { companyId: v };
}

/**
 * ใบขายที่จะรวมเป็นเอกสารเดียว (ใบวางบิล) ต้องเป็นของบริษัทเดียวกัน — ใบกำกับภาษี/หัวบิลแยกบริษัท รวมกันไม่ได้
 * คืนข้อความไทยถ้าปนกัน · null = ใช้ได้
 */
export async function checkSameCompanySOs(
  db: ReturnType<typeof supabaseAdmin>,
  soIds: unknown,
): Promise<string | null> {
  const ids = (Array.isArray(soIds) ? soIds : []).map((x) => String(x ?? "")).filter((x) => UUID_RE.test(x));
  if (ids.length < 2) return null;
  const { data } = await db.from("erp_playground_sales_orders").select("company_id").in("id", ids);
  const coIds = [...new Set((data ?? []).map((r) => r.company_id).filter(Boolean).map(String))];
  if (coIds.length <= 1) return null;
  const { data: cos } = await db.from("companies").select("name").in("id", coIds);
  const names = (cos ?? []).map((c) => String(c.name ?? "")).filter(Boolean);
  return `ใบวางบิลรวมใบขายต่างบริษัทไม่ได้ (${names.join(" / ")}) — แยกเป็นใบวางบิลของแต่ละบริษัท`;
}
