/**
 * ของกลาง — "ใบส่งของจากร้านขนส่ง" (Delivery Bill) ที่แนบกับใบสำคัญรับ
 *   1. parseDeliveryBillImage(): ให้ AI อ่านรูปใบส่งของ → รหัสขนส่ง (EK-########) + รายการ (P/o.No, Description, Pack, Package, Qty, Weight, M3)
 *   2. splitBillLineToVoucherLines(): แบ่งน้ำหนัก/คิวของบรรทัดในใบส่งของ ลงสินค้าที่ผู้ใช้จับคู่ (ต่อชิ้นเท่ากันทุกตัวในกลุ่ม)
 *   3. applyVoucherBoxes(): ★ 11-28 รวมกล่องของใบนี้ที่ใช้แล้ว (ทุกใบส่งของ) → เกลี่ยให้สินค้าทุกตัวตามมูลค่า → เขียน kg/cbm ต่อชิ้น + รหัสขนส่งลงหัวใบ แล้วคิดใหม่
 * ใช้ AI ตัวเดียวกับ AI แคปชั่น/รายละเอียดสินค้า (lib/ai-caption: OpenAI vision) — ไม่มี key = แจ้งผู้ใช้เป็นภาษาคน
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { imagesToDataUrls } from "@/lib/ai-caption";
import { aiChat } from "@/lib/paid-services-server";
import type { UseCtx } from "@/lib/paid-services-server";
import { recomputeVoucher } from "@/lib/purchase-voucher-server";
import { isSupabaseRef } from "@/lib/file-ref";
import { billFileParts } from "@/lib/bill-file-parts";
import { BILL_ORDER_RULE as ORDER_RULE, orderByBillPosition } from "@/lib/bill-line-order";
import { spreadBoxesByValue, type SpreadBox, type SpreadLine, type SpreadResult } from "@/lib/delivery-bill-check";
import { rowOwner } from "@/lib/delivery-bill-share";

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
  method?: "cube" | "weight" | null;   // คิดค่าส่งกล่องนี้จากคิวหรือน้ำหนัก (auto จากกฎ Description · แก้ได้)
  voucher_line_ids: string[];    // สินค้าในใบสำคัญที่จับคู่กับบรรทัดนี้ (เลือกได้หลายตัว)
  no?: number | null;            // เลขบรรทัดบนกระดาษ (lib/bill-line-order) — ใบเก่าไม่มี
  /** ★ 2026-11-22 แถวนี้เป็นของใบสำคัญไหน (ว่าง = ใบเจ้าของบิล) · พักไว้ / ไม่ใช่ของเรา · ใช้แล้วเมื่อไร — lib/delivery-bill-share */
  for_voucher_id?: string | null;
  hold?: "parked" | "not_ours" | null;
  applied_at?: string | null;
  /** ★ 2026-11-23 ระบบจับคู่สินค้าให้เอง (แบบ A · lib/delivery-bill-check autoMatchBoxes) — คนแก้การจับคู่ = false */
  auto?: boolean;
};

/** กฎ "คำใน Description → วิธีคิด" จากตั้งค่ากลาง (/m/freight-description-rules) · เรียงตาม sort_order กฎแรกที่เข้าชนะ */
export async function loadDescriptionRules(admin: Admin): Promise<{ keyword: string; method: "cube" | "weight" }[]> {
  const { data } = await admin.from("freight_description_rules").select("keyword, method, sort_order, is_active").not("is_active", "is", false).order("sort_order");
  return ((data ?? []) as Row[]).map((r) => ({ keyword: str(r.keyword).toUpperCase(), method: r.method === "weight" ? "weight" as const : "cube" as const })).filter((r) => r.keyword);
}
// สูตรจับกฎย้ายไป lib/delivery-bill-check (pure — หน้าเว็บใช้ได้ด้วย · เทียบแบบไม่สนช่องว่างซ้ำ) · คงชื่อเดิมไว้ให้ผู้เรียกเก่า
export { methodForDescription } from "@/lib/delivery-bill-check";
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
export async function parseDeliveryBillImage(r2Key: string, admin?: Admin, who?: UseCtx): Promise<{ parsed: DeliveryBillParsed; raw: Record<string, unknown> }> {
  // r2Key = ที่อยู่ไฟล์กลาง (lib/file-ref) — บิลใหม่อยู่ Supabase ส่วนตัว (กฎที่เก็บไฟล์ หมวด supplier_bills)
  // ★ 2026-11-14 รับ PDF ได้แล้ว (ของกลาง lib/bill-file-parts — วิธีเดียวกับบิลร้านจีน) · OCR ต้องการความละเอียดสูง (detail:high)
  let fileParts: unknown[];
  if (admin) {
    fileParts = await billFileParts(admin, [r2Key], "ใบส่งของ");
  } else {
    if (/\.pdf$/i.test(r2Key)) throw new Error("อ่านได้เฉพาะรูปภาพ (jpg/png/webp) — ไฟล์ PDF ให้ถ่ายรูป/แปลงเป็นรูปก่อน");
    const urls = isSupabaseRef(r2Key) ? [] : await imagesToDataUrls([r2Key]);
    if (urls.length === 0) throw new Error("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจยังอัปโหลดไม่เสร็จ)");
    fileParts = urls.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } }));
  }
  const model = "gpt-4.1-mini";   // งานอ่านเอกสาร = รุ่นที่เหมาะกับงานนี้ (ไม่ตามรุ่นหลัก · เปลี่ยนเฉพาะได้ที่ศูนย์ AI)
  const raw = await aiChat("ai.delivery_bill", SYSTEM + ORDER_RULE, [
    { type: "text", text: "อ่านใบส่งของนี้ แล้วตอบ JSON ตามโครงที่กำหนด" },
    ...fileParts,
  ], 1500, model, who);
  // เรียงตามเอกสารจริง (หน้า + เลขบรรทัด) กัน AI สลับ — lib/bill-line-order
  const linesRaw = orderByBillPosition(Array.isArray(raw.lines) ? (raw.lines as Row[]) : [], (l) => ({ page: l.page, line_no: l.line_no }));
  const lines: DeliveryBillLine[] = linesRaw
    .map((l) => ({
      stock: str(l.stock) || null, po_no: str(l.po_no) || null, description: str(l.description) || null,
      pack: num(l.pack), package: str(l.package) || null, qty: num(l.qty), weight_kg: num(l.weight_kg), m3: num(l.m3),
      method: null, voucher_line_ids: [],
    }))
    // กันแถว EK-/Total ที่ AI เผลอใส่มา
    .filter((l) => !(l.stock && /^EK-?\d+/i.test(l.stock) && !l.qty && !l.weight_kg) && !/^(total|sub-?total)$/i.test(str(l.description)))
    .map((l, i) => ({ ...l, no: i + 1 }));   // เลขบรรทัดบนกระดาษ (โชว์ #) — ลากย้ายแถวแล้วยังติดแถวเดิม
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
  const kg = line.weight_kg != null ? Math.round((line.weight_kg / sumQty) * 1e9) / 1e9 : null;
  const cbm = line.m3 != null ? Math.round((line.m3 / sumQty) * 1e9) / 1e9 : null;
  return targets.map((t) => ({ id: t.id, kg_per_unit: kg, cbm_per_unit: cbm }));
}

/**
 * ★ 2026-11-28 ใส่น้ำหนัก/คิวจากใบส่งของ (เจ้าของเลือก "เอาที่เลือกสินค้าออก" + เกลี่ยตามมูลค่า)
 *   รวมกล่องของใบนี้ "ที่ใช้แล้ว" จากทุกใบส่งของ (ของใบนี้ + ใบที่ใช้ร่วม) → เกลี่ยให้สินค้าทุกตัวในใบตามมูลค่า (lib/delivery-bill-check spreadBoxesByValue)
 *   → เขียน กก./คิว ต่อชิ้น + วิธีคิด (กล่องส่วนใหญ่) ลงบรรทัด · รหัสขนส่งลงหัวใบ (ถ้ายังว่าง) · คิดใบใหม่
 *   ใบส่งของหลายใบ (ของมาหลายรอบ) = นับรวมกันเสมอ ไม่ทับกันเอง · คนเรียกต้องติด applied_at ที่แถวก่อนแล้วค่อยเรียก
 * คืน { updated: จำนวนบรรทัดที่เขียน, spread }
 */
export async function applyVoucherBoxes(admin: Admin, voucherId: string, opts: { tracking_no?: string | null } = {}): Promise<{ updated: number; spread: SpreadResult }> {
  const [{ data: own }, { data: shared }, { data: vls }] = await Promise.all([
    admin.from("purchase_delivery_bills").select("id, voucher_id, status, lines").eq("voucher_id", voucherId).neq("kind", "seller").not("is_active", "is", false),
    admin.from("purchase_delivery_bills").select("id, voucher_id, status, lines").contains("lines", [{ for_voucher_id: voucherId }]).neq("kind", "seller").not("is_active", "is", false),
    admin.from("purchase_voucher_lines_v2").select("id, qty, unit_price, discount, discount_pct, item_sku_id").eq("voucher_id", voucherId).not("is_active", "is", false),
  ]);
  const seen = new Set<string>();
  const boxes: SpreadBox[] = [];
  for (const b of [...((own ?? []) as Row[]), ...((shared ?? []) as Row[])]) {
    const bid = String(b.id); if (seen.has(bid)) continue; seen.add(bid);
    const home = String(b.voucher_id);
    const ls = (Array.isArray(b.lines) ? b.lines : []) as DeliveryBillLine[];
    const legacy = b.status === "applied" && home === voucherId && !ls.some((l) => l.applied_at);   // ใช้ก่อนมีป้ายรายแถว = ทั้งใบใช้แล้ว
    for (const l of ls) if (rowOwner(l, home) === voucherId && (l.applied_at || legacy)) boxes.push({ weight_kg: l.weight_kg ?? null, m3: l.m3 ?? null, method: l.method ?? null });
  }
  const lines: SpreadLine[] = ((vls ?? []) as Row[]).map((r) => ({ id: String(r.id), qty: num(r.qty), unit_price: num(r.unit_price), discount: num(r.discount), discount_pct: num(r.discount_pct), is_product: !!r.item_sku_id }));
  const spread = spreadBoxesByValue(boxes, lines);
  let updated = 0;
  for (const p of spread.per) {
    const patch: Row = {};
    if (p.kg_per_unit != null) patch.kg_per_unit = p.kg_per_unit;
    if (p.cbm_per_unit != null) patch.cbm_per_unit = p.cbm_per_unit;
    if (spread.method) patch.ship_method = spread.method;   // วิธีคิดของกล่อง (BOX=คิว, CLOTH BLOCK=กก.) ติดไปที่สินค้า
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("purchase_voucher_lines_v2").update(patch).eq("id", p.id).eq("voucher_id", voucherId);
    if (!error) updated++;
  }
  if (opts.tracking_no) {
    const { data: v } = await admin.from("purchase_vouchers_v2").select("tracking_no").eq("id", voucherId).maybeSingle();
    if (!str((v as Row | null)?.tracking_no)) await admin.from("purchase_vouchers_v2").update({ tracking_no: opts.tracking_no }).eq("id", voucherId);
  }
  await recomputeVoucher(admin, voucherId);
  return { updated, spread };
}
