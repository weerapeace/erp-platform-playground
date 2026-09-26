/**
 * ของกลาง — "ใบส่งของจากร้านขนส่ง" (Delivery Bill) ที่แนบกับใบสำคัญรับ
 *   1. parseDeliveryBillImage(): ให้ AI อ่านรูปใบส่งของ → รหัสขนส่ง (EK-########) + รายการ (P/o.No, Description, Pack, Package, Qty, Weight, M3)
 *   2. splitBillLineToVoucherLines(): แบ่งน้ำหนัก/คิวของบรรทัดในใบส่งของ ลงสินค้าที่ผู้ใช้จับคู่ (ต่อชิ้นเท่ากันทุกตัวในกลุ่ม)
 *   3. applyDeliveryBill(): เขียน kg_per_unit / cbm_per_unit ลงบรรทัดใบสำคัญ + รหัสขนส่งลงหัวใบ แล้วคิดใหม่
 * ใช้ AI ตัวเดียวกับ AI แคปชั่น/รายละเอียดสินค้า (lib/ai-caption: OpenAI vision) — ไม่มี key = แจ้งผู้ใช้เป็นภาษาคน
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJson, imagesToDataUrls, productDetailModel } from "@/lib/ai-caption";
import { recomputeVoucher } from "@/lib/purchase-voucher-server";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const num = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => String(v ?? "").trim();

export type DeliveryBillLine = {
  stock: string | null;          // รหัสสต๊อกของขนส่ง เช่น 54GT2727
  po_no: string | null;          // P/o.No ของขนส่ง เช่น 4E260904580 (ไม่ใช่เลข PO เรา)
  description: string | null;    // BOX / CLOTH BLOCK …
  pack: number | null;
  package: string | null;        // เช่น "1-1"
  qty: number | null;
  weight_kg: number | null;
  m3: number | null;
  voucher_line_ids: string[];    // สินค้าในใบสำคัญที่จับคู่กับบรรทัดนี้ (เลือกได้หลายตัว)
};
export type DeliveryBillParsed = {
  tracking_no: string | null;    // EK-########
  bill_date: string | null;      // YYYY-MM-DD
  marking: string | null;
  delivery_area: string | null;
  carrier_text: string | null;
  total_weight_kg: number | null;
  total_m3: number | null;
  total_packages: number | null;
  lines: DeliveryBillLine[];
};

const SYSTEM = `คุณเป็นผู้ช่วยอ่านเอกสาร "ใบส่งของของบริษัทขนส่งสินค้าจากจีนมาไทย" (Delivery Bill) จากรูปถ่าย
ตอบเป็น JSON เท่านั้น ตามโครงนี้ (ค่าที่อ่านไม่ได้ให้เป็น null ห้ามเดา):
{
  "tracking_no": "รหัสขนส่ง มักขึ้นต้น EK- ตามด้วยตัวเลข 8 หลัก เช่น EK-08310926 (อยู่ในคอลัมน์ Stock แถวแรก หรือหัวเอกสาร)",
  "bill_date": "วันที่เอกสาร แปลงเป็น YYYY-MM-DD",
  "marking": "ค่าหลัง Marking:",
  "delivery_area": "ค่าหลัง Delivery Area:",
  "carrier_text": "ชื่อ/ที่อยู่บริษัทขนส่งถ้ามี",
  "total_weight_kg": ตัวเลขน้ำหนักรวม (แถว Total),
  "total_m3": ตัวเลขคิวรวม (แถว Total),
  "total_packages": จำนวนหีบห่อรวม,
  "lines": [
    { "stock": "รหัส Stock ของแถว เช่น 54GT2727", "po_no": "P/o.No เช่น 4E260904580", "description": "BOX หรือ CLOTH BLOCK ฯลฯ", "pack": ตัวเลข, "package": "เช่น 1-1", "qty": ตัวเลข Quantity, "weight_kg": ตัวเลข Weight, "m3": ตัวเลข M3 }
  ]
}
กฎ: แถวที่เป็น Total / Sub-Total ไม่ใช่รายการ ห้ามใส่ใน lines · แถว EK- ที่ไม่มีสินค้า = รหัสขนส่ง ไม่ใช่รายการ · ตัวเลขทศนิยมคงค่าตามที่อ่านได้ (เช่น 0.0099) · ห้ามแต่งข้อมูลที่ไม่มีในรูป`;

/** อ่านรูปใบส่งของด้วย AI → โครงสร้าง (โยน Error เป็นภาษาคนเมื่ออ่านไม่ได้) */
export async function parseDeliveryBillImage(r2Key: string): Promise<{ parsed: DeliveryBillParsed; raw: Record<string, unknown> }> {
  if (/\.pdf$/i.test(r2Key)) throw new Error("อ่านได้เฉพาะรูปภาพ (jpg/png/webp) — ไฟล์ PDF ให้ถ่ายรูป/แปลงเป็นรูปก่อน");
  const urls = await imagesToDataUrls([r2Key]);
  if (urls.length === 0) throw new Error("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจยังอัปโหลดไม่เสร็จ)");
  const model = await productDetailModel();
  // OCR ต้องการความละเอียดสูง — ไม่ใช้ detail:low ของ imageParts()
  const raw = await chatJson(SYSTEM, [
    { type: "text", text: "อ่านใบส่งของนี้ แล้วตอบ JSON ตามโครงที่กำหนด" },
    ...urls.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
  ], 1500, model);
  const linesRaw = Array.isArray(raw.lines) ? (raw.lines as Row[]) : [];
  const lines: DeliveryBillLine[] = linesRaw
    .map((l) => ({
      stock: str(l.stock) || null, po_no: str(l.po_no) || null, description: str(l.description) || null,
      pack: num(l.pack), package: str(l.package) || null, qty: num(l.qty), weight_kg: num(l.weight_kg), m3: num(l.m3),
      voucher_line_ids: [],
    }))
    // กันแถว EK-/Total ที่ AI เผลอใส่มา
    .filter((l) => !(l.stock && /^EK-?\d+/i.test(l.stock) && !l.qty && !l.weight_kg) && !/^(total|sub-?total)$/i.test(str(l.description)));
  let tracking = str(raw.tracking_no) || null;
  if (!tracking) { const hit = linesRaw.map((l) => str(l.stock)).find((s) => /^EK-?\d{6,}/i.test(s)); if (hit) tracking = hit; }
  if (tracking) tracking = tracking.toUpperCase().replace(/^EK(\d)/, "EK-$1");
  const parsed: DeliveryBillParsed = {
    tracking_no: tracking, bill_date: normDate(raw.bill_date), marking: str(raw.marking) || null, delivery_area: str(raw.delivery_area) || null,
    carrier_text: str(raw.carrier_text) || null,
    total_weight_kg: num(raw.total_weight_kg) ?? sumOf(lines, "weight_kg"), total_m3: num(raw.total_m3) ?? sumOf(lines, "m3"), total_packages: num(raw.total_packages) ?? sumOf(lines, "pack"),
    lines,
  };
  return { parsed, raw };
}

const sumOf = (lines: DeliveryBillLine[], k: "weight_kg" | "m3" | "pack"): number | null => {
  const vals = lines.map((l) => l[k]).filter((v): v is number => v != null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 10000) / 10000 : null;
};
/** วันที่จาก AI อาจเป็น 11-09-2026 / 2026-09-11 / 11/09/2026 → YYYY-MM-DD (ไม่รู้ = null) */
export function normDate(v: unknown): string | null {
  const s = str(v); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * แบ่งน้ำหนัก/คิวของ 1 บรรทัดในใบส่งของ ให้สินค้าที่จับคู่ (หลายตัว)
 * สมมติทุกชิ้นในกล่องเดียวกันหนัก/ใหญ่เท่ากัน → ต่อชิ้น = ยอดรวม ÷ จำนวนชิ้นรวมของทุกสินค้าที่จับคู่
 */
export function splitBillLineToVoucherLines(line: { weight_kg: number | null; m3: number | null }, targets: { id: string; qty: number }[]): { id: string; kg_per_unit: number | null; cbm_per_unit: number | null }[] {
  const sumQty = targets.reduce((a, t) => a + (Number(t.qty) || 0), 0);
  if (sumQty <= 0) return targets.map((t) => ({ id: t.id, kg_per_unit: null, cbm_per_unit: null }));
  const kg = line.weight_kg != null ? Math.round((line.weight_kg / sumQty) * 1_000_000) / 1_000_000 : null;
  const cbm = line.m3 != null ? Math.round((line.m3 / sumQty) * 1_000_000) / 1_000_000 : null;
  return targets.map((t) => ({ id: t.id, kg_per_unit: kg, cbm_per_unit: cbm }));
}

/** เอาน้ำหนัก/คิวจากใบส่งของ ไปใส่บรรทัดใบสำคัญที่จับคู่ไว้ + รหัสขนส่งลงหัวใบ แล้วคิดใหม่ · คืนจำนวนบรรทัดที่ถูกอัปเดต */
export async function applyDeliveryBill(admin: Admin, voucherId: string, bill: { tracking_no: string | null; lines: DeliveryBillLine[] }): Promise<number> {
  const { data: vls } = await admin.from("purchase_voucher_lines_v2").select("id, qty").eq("voucher_id", voucherId).not("is_active", "is", false);
  const qtyOf = new Map(((vls ?? []) as Row[]).map((r) => [String(r.id), Number(r.qty) || 0]));
  // สินค้าตัวหนึ่งอาจถูกจับคู่กับหลายบรรทัดในใบส่งของ (เช่น แยกกล่อง) → รวมค่าต่อชิ้น
  const acc = new Map<string, { kg: number; cbm: number; hasKg: boolean; hasCbm: boolean }>();
  for (const l of bill.lines) {
    const targets = (l.voucher_line_ids ?? []).filter((id) => qtyOf.has(id)).map((id) => ({ id, qty: qtyOf.get(id) ?? 0 }));
    if (targets.length === 0) continue;
    for (const s of splitBillLineToVoucherLines(l, targets)) {
      const a = acc.get(s.id) ?? { kg: 0, cbm: 0, hasKg: false, hasCbm: false };
      if (s.kg_per_unit != null) { a.kg += s.kg_per_unit; a.hasKg = true; }
      if (s.cbm_per_unit != null) { a.cbm += s.cbm_per_unit; a.hasCbm = true; }
      acc.set(s.id, a);
    }
  }
  let n = 0;
  for (const [id, a] of acc) {
    const patch: Row = {};
    if (a.hasKg) patch.kg_per_unit = Math.round(a.kg * 1_000_000) / 1_000_000;
    if (a.hasCbm) patch.cbm_per_unit = Math.round(a.cbm * 1_000_000) / 1_000_000;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("purchase_voucher_lines_v2").update(patch).eq("id", id).eq("voucher_id", voucherId);
    if (!error) n++;
  }
  if (bill.tracking_no) {
    const { data: v } = await admin.from("purchase_vouchers_v2").select("tracking_no").eq("id", voucherId).maybeSingle();
    if (!str((v as Row | null)?.tracking_no)) await admin.from("purchase_vouchers_v2").update({ tracking_no: bill.tracking_no }).eq("id", voucherId);
  }
  await recomputeVoucher(admin, voucherId);
  return n;
}
