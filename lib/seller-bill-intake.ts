/**
 * ของกลางฝั่ง server — "โยนรูปบิลร้าน → ออกใบสำคัญรับ" (ป๊อป ＋ ออกใบสำคัญรับ แท็บ บิลร้าน)
 *   readBillIntake()            AI อ่านรูป/PDF หลายไฟล์รอบเดียว → แยกบิลต่อร้าน (รูปเดียวมีหลายร้านได้) + ข้อมูลร้าน + รายการ
 *                               → เสนอร้านในทะเบียน (lib/seller-bill-shop rankShops) + เตือนบิลที่เคยออกใบแล้ว
 *   createVoucherFromSellerBill() คนยืนยันร้านแล้ว → สร้างใบสำคัญร่าง + บิลร้าน (kind=seller) → AI จับคู่รายการจากข้อความ
 *                               → จับคู่กับใบสั่งซื้อของร้านนั้น (lib/seller-bill-match) → จำชื่อจีน/เบอร์/บัญชีของร้าน (ช่องที่ว่าง)
 * ตัวอ่าน/ตัวจับคู่รายการใช้ของเดิมใน lib/seller-bill.ts · เอกสาร docs/seller-bill-match.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiChat } from "@/lib/paid-services-server";
import { writeAudit } from "@/lib/audit";
import { isCNY } from "@/lib/landed-cost";
import { createManualVoucher, fxRateForDate } from "@/lib/purchase-voucher-server";
import { normDate } from "@/lib/delivery-bill";
import { loadSkuCnNames } from "@/lib/sku-cn-name";
import {
  SELLER_BILL_MODEL, BILL_READ_RULES, billFileParts, sanitizeAiBillLines, billTotalOf, aiPickCandidates,
  loadVoucherLite, loadShopGroups, loadAliases,
} from "@/lib/seller-bill";
import { groupKey, stripCode, matchBillLines, type PoGroup, type SellerBillLine } from "@/lib/seller-bill-match";
import { rankShops, autoPick, voucherCurrency, accountMatch, phoneMatch, type ShopLite, type ShopCandidate } from "@/lib/seller-bill-shop";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const chunk = <T,>(arr: T[], size: number): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
const hasCn = (v: string) => /[一-鿿]/.test(v);
export const MAX_INTAKE_FILES = 6;
const OPEN_PO_STATUS = ["draft", "purchase", "partial"];
const CLOSED_LINE = ["received", "short_closed", "closed_short", "cancelled"];

export type IntakeBill = {
  idx: number;
  is_bill: boolean;
  seller_text: string | null; seller_phone: string | null; seller_account: string | null;
  bill_no: string | null; bill_date: string | null; currency: "RMB" | "THB" | "USD"; total_amount: number | null;
  fx_rate: number | null;
  lines: SellerBillLine[];
  fee_total: number;                       // ค่าส่งในจีน/ค่ากล่อง ฯลฯ ในบิล
  candidates: ShopCandidate[];
  picked: ShopCandidate | null;            // เลือกให้ล่วงหน้า (มั่นใจพอ) — คนเปลี่ยนได้
  duplicates: { partner_id: string | null; voucher_id: string; pv_no: string | null; status: string }[];
};

/** ร้านจีนในทะเบียน = ติ๊กประเทศจีน หรือเคยมีใบสั่งซื้อสกุลหยวน */
export async function loadCnShops(admin: Admin): Promise<ShopLite[]> {
  const { data: pos } = await admin.from("purchase_orders_v2").select("seller_partner_id, currency").not("is_active", "is", false).not("seller_partner_id", "is", null).limit(5000);
  const cnIds = new Set(((pos ?? []) as Row[]).filter((p) => isCNY(str(p.currency))).map((p) => String(p.seller_partner_id)));
  const { data } = await admin.from("partners_v2").select("id, display_name, name_th, name_en, company_name, phone, mobile, account_number, shop_country, is_supplier, is_active")
    .not("is_active", "is", false).limit(5000);
  return ((data ?? []) as Row[])
    .filter((p) => p.is_supplier !== false && (str(p.shop_country) === "จีน" || cnIds.has(String(p.id))))
    .map((p) => ({ id: String(p.id), name: str(p.display_name) || str(p.name_th) || str(p.name_en), name_th: (p.name_th as string) ?? null, name_en: (p.name_en as string) ?? null,
      company_name: (p.company_name as string) ?? null, phone: (p.phone as string) ?? null, mobile: (p.mobile as string) ?? null, account_number: (p.account_number as string) ?? null }));
}

const PO_SELECT = "id, po_no, order_date, currency, seller_partner_id, seller_name, payment_status, paid_amount_thb, china_bill_id";

/** ใบสั่งซื้อสกุลหยวนที่ยังค้างของหลายร้าน (โหลดรอบเดียว) — ใช้ดูว่าของในบิลตรงกับร้านไหน (ค้าง = สั่ง − รับแล้ว) */
async function loadOpenCnGroupsByShop(admin: Admin, partnerIds: string[]): Promise<Map<string, PoGroup[]>> {
  const out = new Map<string, PoGroup[]>();
  if (partnerIds.length === 0) return out;
  const poRows: Row[] = [];
  for (const ids of chunk(partnerIds, 100)) {
    const { data } = await admin.from("purchase_orders_v2").select(PO_SELECT)
      .not("is_active", "is", false).in("status", OPEN_PO_STATUS).in("seller_partner_id", ids).limit(3000);
    poRows.push(...((data ?? []) as Row[]).filter((p) => isCNY(str(p.currency))));
  }
  for (const g of await buildOpenGroups(admin, poRows)) {
    const pid = str(g.partner_id);
    out.set(pid, [...(out.get(pid) ?? []), g]);
  }
  return out;
}

/**
 * "PO ร้านอื่น" (แท็บ ② ป๊อปเลือกจับคู่เอง) — ใบสั่งซื้อที่ยังค้างของทุกร้าน ยกเว้นร้านของใบนี้ · สกุลเดียวกับใบ
 *   แต่ละกลุ่มบอกร้าน + เหตุผลที่ "ย้าย PO มาร้านนี้" ไม่ได้ (จ่ายเงิน / รับของ / ผูกบิลโอนเงินแล้ว)
 */
export async function loadOtherShopGroups(admin: Admin, v: { seller_partner_id: string | null; seller_name: string | null; currency: string }): Promise<PoGroup[]> {
  const { data } = await admin.from("purchase_orders_v2").select(PO_SELECT)
    .not("is_active", "is", false).in("status", OPEN_PO_STATUS).order("order_date", { ascending: false }).limit(1500);
  const rows = ((data ?? []) as Row[]).filter((p) => isCNY(str(p.currency) || "THB") === isCNY(v.currency)
    && (v.seller_partner_id ? str(p.seller_partner_id) !== v.seller_partner_id : str(p.seller_name) !== str(v.seller_name)));
  return (await buildOpenGroups(admin, rows)).sort((a, b) => str(b.order_date).localeCompare(str(a.order_date)) || a.po_no.localeCompare(b.po_no));
}

/** แถว PO (ยังเปิด) → กลุ่มสินค้า×PO พร้อมร้าน + เหตุผลที่ย้ายร้านไม่ได้ */
async function buildOpenGroups(admin: Admin, poRows: Row[]): Promise<PoGroup[]> {
  const poMap = new Map(poRows.map((p) => [String(p.id), p]));
  const received = new Set<string>();
  const lines: Row[] = [];
  for (const ids of chunk([...poMap.keys()], 100)) {
    const { data } = await admin.from("purchase_order_lines_v2").select("id, po_id, item_sku_id, item_name, qty, qty_received, uom, price_est, sort_order, line_status, is_active, note").in("po_id", ids).limit(5000);
    for (const l of (data ?? []) as Row[]) {
      if (l.is_active === false) continue;
      if (num(l.qty_received) > 0) received.add(String(l.po_id));
      if (!CLOSED_LINE.includes(str(l.line_status))) lines.push(l);
    }
  }
  const cn = await loadSkuCnNames(admin, lines.map((l) => str(l.item_sku_id)).filter(Boolean));
  const lockOf = (po: Row): string | null =>
    po.china_bill_id ? "ผูกบิลโอนเงินจีนแล้ว" : str(po.payment_status) === "paid" || num(po.paid_amount_thb) > 0 ? "จ่ายเงินแล้ว" : received.has(String(po.id)) ? "รับของไปแล้วบางส่วน" : null;
  const groups = new Map<string, PoGroup>();
  for (const l of lines) {
    const po = poMap.get(String(l.po_id)); if (!po) continue;
    const skuId = str(l.item_sku_id) || null;
    const key = groupKey(String(l.po_id), skuId, str(l.item_name));
    const rem = Math.max(0, num(l.qty) - num(l.qty_received));
    const gl = { id: String(l.id), qty: num(l.qty), remaining: rem, qty_received: num(l.qty_received), sort_order: num(l.sort_order), note: (l.note as string) ?? null, voucher_line_id: null, from_gr: false };
    const g = groups.get(key);
    if (g) { g.lines.push(gl); g.qty_total += gl.qty; g.remaining += rem; if (!(num(g.unit_price) > 0) && num(l.price_est) > 0) g.unit_price = num(l.price_est); continue; }
    groups.set(key, { key, po_id: String(l.po_id), po_no: str(po.po_no), order_date: (po.order_date as string) ?? null, item_sku_id: skuId,
      code: /^\s*\[([^\]]+)\]/.exec(str(l.item_name))?.[1] ?? "", item_name: stripCode(str(l.item_name)), name_cn: skuId ? cn.get(skuId) ?? null : null, uom: (l.uom as string) ?? null,
      unit_price: num(l.price_est) > 0 ? num(l.price_est) : null, qty_total: gl.qty, remaining: rem, lines: [gl], in_voucher: false, image_url: null,
      partner_id: (po.seller_partner_id as string) ?? null, partner_name: str(po.seller_name) || null, po_locked: lockOf(po) });
  }
  return [...groups.values()];
}

const SYSTEM_INTAKE = `คุณเป็นผู้ช่วยฝ่ายจัดซื้อ อ่าน "บิล / ใบส่งของจากร้านค้าในจีน" (送货单 / 发货单 / 销售单 / 出货单 / 收据) จากรูปหรือ PDF ที่แนบมา (อาจมีหลายไฟล์)
ร้านขายอะไหล่กระเป๋า เครื่องหนัง ซิป ด้าย ผ้า ของโลหะ
- หลายไฟล์ของร้านเดียวกัน (หลายหน้า) = บิลเดียวกัน รวมรายการ
- รูปเดียวมีหลายร้าน หรือหลายไฟล์ต่างร้าน = แยกเป็นคนละบิล (1 บิลต่อ 1 ร้าน)
- เลือก "ร้านในทะเบียนของเรา" ที่น่าจะเป็นร้านในบิล จากรายชื่อที่ให้ (รหัส S1, S2, …) · ชื่อร้านในทะเบียนมักเป็นภาษาไทยทับศัพท์ เช่น 义隆 = อี้หลง · ไม่แน่ใจ = null (ห้ามเดา)

ตอบเป็น JSON เท่านั้น:
{
  "bills": [
    { "is_bill": true,
      "seller_name": "ชื่อร้านตามที่พิมพ์ในบิล (จีน) หรือ null", "seller_phone": "เบอร์ร้านในบิล หรือ null", "seller_account": "เลขบัญชีรับเงินในบิล หรือ null",
      "shop_candidate": "S3 หรือ null", "shop_confidence": 0.0-1.0,
      "bill_no": "เลขที่บิล หรือ null", "bill_date": "YYYY-MM-DD หรือ null", "currency": "CNY หรือ THB", "total_amount": ตัวเลขยอดรวมทั้งบิล หรือ null,
      "lines": [ { "name_cn": "品名ตามบิล", "spec_cn": "规格/颜色/尺寸 หรือ null", "name_th": "ชื่อแปลไทย", "spec_th": "สเปกแปลไทย หรือ null",
                   "qty": ตัวเลข, "unit": "个/条/米/码… หรือ null", "unit_price": ตัวเลข, "amount": ตัวเลข, "is_fee": false } ] }
  ],
  "unreadable_reason": "ถ้าอ่านไม่ได้เลย บอกเหตุผลสั้น ๆ ภาษาไทย (เช่น รูปเบลอ / ไม่ใช่บิลซื้อของ) หรือ null"
}
กฎ:
${BILL_READ_RULES}`;

/** AI อ่านไฟล์บิล (หลายไฟล์ = รอบเดียว) → บิลแยกตามร้าน + ร้านที่น่าจะใช่ + บิลซ้ำ */
export async function readBillIntake(admin: Admin, refs: string[]): Promise<{ bills: IntakeBill[]; unreadable_reason: string | null; model: string; raw: Row }> {
  const files = [...new Set(refs.map(str).filter(Boolean))].slice(0, MAX_INTAKE_FILES);
  if (files.length === 0) throw new Error("ยังไม่ได้แนบรูปบิล");
  const [parts, shops] = await Promise.all([billFileParts(admin, files), loadCnShops(admin)]);
  const sid = new Map<string, string>();
  const shopText = shops.map((p, i) => {
    const code = `S${i + 1}`; sid.set(code, p.id);
    const cn = [p.company_name, p.name_en].map(str).filter((x) => x && hasCn(x));
    return `${code} | ${p.name}${cn.length ? ` (จีน: ${cn.join(" / ")})` : ""}`;
  }).join("\n");
  const raw = await aiChat("ai.seller_bill", SYSTEM_INTAKE, [{ type: "text", text: `ร้านจีนในทะเบียนของเรา (${shops.length} ร้าน · รหัส | ชื่อ):\n${shopText || "(ไม่มี)"}\n\nอ่านบิลในไฟล์ที่แนบ แล้วตอบ JSON ตามโครงที่กำหนด` }, ...parts], 6000, SELLER_BILL_MODEL);

  const rawBills = Array.isArray(raw.bills) ? (raw.bills as Row[]) : [];
  const groupsByShop = await loadOpenCnGroupsByShop(admin, shops.map((s) => s.id));
  const bills: IntakeBill[] = [];
  for (const [idx, b] of rawBills.entries()) {
    const lines = sanitizeAiBillLines(b.lines);
    if (b.is_bill === false && lines.length === 0) continue;
    const info = { seller_name: str(b.seller_name) || null, seller_phone: str(b.seller_phone) || null, seller_account: str(b.seller_account) || null,
      ai_shop: sid.get(str(b.shop_candidate).toUpperCase()) ?? null, ai_conf: b.shop_confidence == null ? null : num(b.shop_confidence) };
    const candidates = rankShops(info, lines, shops, groupsByShop);
    const billDate = normDate(b.bill_date);
    bills.push({
      idx, is_bill: b.is_bill !== false, seller_text: info.seller_name, seller_phone: info.seller_phone, seller_account: info.seller_account,
      bill_no: str(b.bill_no) || null, bill_date: billDate, currency: voucherCurrency(b.currency), total_amount: billTotalOf(b.total_amount),
      fx_rate: null, lines, fee_total: Math.round(lines.filter((l) => l.is_fee).reduce((a, l) => a + num(l.amount ?? num(l.qty) * num(l.unit_price)), 0) * 100) / 100,
      candidates, picked: autoPick(candidates), duplicates: [],
    });
  }
  // เรทของวันที่บิล + บิลที่เคยออกใบสำคัญแล้ว (เลขที่บิลเดียวกัน)
  for (const b of bills) {
    b.fx_rate = b.currency === "THB" ? null : await fxRateForDate(admin, b.bill_date && b.bill_date <= todayBkk() ? b.bill_date : null);
    if (!b.bill_no) continue;
    const { data: dup } = await admin.from("purchase_delivery_bills").select("voucher_id").eq("kind", "seller").eq("bill_no", b.bill_no).not("is_active", "is", false).limit(20);
    const vids = [...new Set(((dup ?? []) as Row[]).map((r) => str(r.voucher_id)).filter(Boolean))];
    if (vids.length === 0) continue;
    const { data: vs } = await admin.from("purchase_vouchers_v2").select("id, pv_no, status, seller_partner_id").in("id", vids);
    b.duplicates = ((vs ?? []) as Row[]).filter((v) => v.status !== "cancelled")
      .map((v) => ({ partner_id: (v.seller_partner_id as string) ?? null, voucher_id: String(v.id), pv_no: (v.pv_no as string) ?? null, status: str(v.status) }));
  }
  return { bills, unreadable_reason: bills.length ? null : str(raw.unreadable_reason) || "อ่านไม่ได้ — รูปอาจเบลอ / เอียง หรือไม่ใช่บิลซื้อของ", model: SELLER_BILL_MODEL, raw };
}
const todayBkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export type CreateFromBillInput = {
  partner_id: string;
  refs: string[];
  currency?: string | null;
  bill_no?: string | null; bill_date?: string | null; seller_text?: string | null; seller_phone?: string | null; seller_account?: string | null;
  total_amount?: number | null;
  lines: SellerBillLine[];
  remember_shop?: boolean;   // เติมชื่อจีน/เบอร์/บัญชีของร้าน (เฉพาะช่องที่ยังว่าง)
};

/** สร้างใบสำคัญร่างจากบิลร้าน (ร้านที่คนยืนยันแล้ว) → คืน id ใบ + สรุปการจับคู่ */
export async function createVoucherFromSellerBill(admin: Admin, input: CreateFromBillInput, actor: { id: string | null; name: string | null }): Promise<{ voucher_id: string; ok: number; mid: number; no: number; shop_filled: string[] }> {
  const { data: p } = await admin.from("partners_v2").select("id, display_name, name_th, name_en, company_name, phone, mobile, account_number, is_active").eq("id", input.partner_id).maybeSingle();
  const partner = p as Row | null;
  if (!partner || partner.is_active === false) throw new Error("ไม่พบร้านที่เลือกในทะเบียน — เลือกร้านใหม่");
  const sellerName = str(partner.display_name) || str(partner.name_th) || str(partner.name_en);
  const currency = voucherCurrency(input.currency ?? "CNY");
  const billDate = normDate(input.bill_date);
  const refs = [...new Set((input.refs ?? []).map(str).filter(Boolean))].slice(0, MAX_INTAKE_FILES);
  if (refs.length === 0) throw new Error("ไม่มีไฟล์บิล");

  const voucherId = await createManualVoucher(admin, {
    seller_name: sellerName, seller_partner_id: String(partner.id), currency,
    voucher_date: billDate && billDate <= todayBkk() ? billDate : null,
    note: input.bill_no ? `บิลร้าน No. ${input.bill_no}` : null, actor: actor.name,
  });

  // จับคู่รายการกับใบสั่งซื้อของร้านนี้ — AI เลือกจากข้อความ (ไม่ส่งรูปซ้ำ) แล้วให้คะแนนด้วยกติกากลาง
  const v = (await loadVoucherLite(admin, voucherId))!;
  const groups = await loadShopGroups(admin, v);
  const aliases = await loadAliases(admin, v.seller_partner_id);
  const picked = await aiPickCandidates(input.lines ?? [], groups);
  const lines = matchBillLines(picked, groups, aliases);
  const { error } = await admin.from("purchase_delivery_bills").insert({
    voucher_id: voucherId, r2_key: refs[0], kind: "seller",
    bill_no: str(input.bill_no) || null, seller_text: str(input.seller_text) || null, bill_date: billDate, total_amount: input.total_amount ?? null, currency: input.currency ?? null,
    lines, raw: { intake: true, files: refs, seller_phone: input.seller_phone ?? null, seller_account: input.seller_account ?? null },
    status: "parsed", created_by: actor.name,
  });
  if (error) throw new Error("บันทึกบิลร้านไม่สำเร็จ: " + error.message);

  // จำร้าน: เติมช่องที่ยังว่าง (ไม่ทับของเดิม) — ครั้งหน้าจับร้านจากบิลได้ทันที
  const shopFilled: string[] = [];
  if (input.remember_shop !== false) {
    const patch: Row = {};
    const cn = str(input.seller_text);
    if (cn && hasCn(cn) && !str(partner.company_name)) { patch.company_name = cn.slice(0, 200); shopFilled.push("ชื่อจีน"); }
    if (input.seller_phone && !str(partner.phone) && !phoneMatch(input.seller_phone, partner.mobile)) { patch.phone = str(input.seller_phone).slice(0, 60); shopFilled.push("เบอร์"); }
    const acc = str(input.seller_account).replace(/\s+/g, "");
    if (acc && /^\d{8,}$/.test(acc) && !str(partner.account_number)) { patch.account_number = acc; shopFilled.push("เลขบัญชี"); }
    else if (acc && str(partner.account_number) && !accountMatch(acc, partner.account_number)) { /* บัญชีไม่ตรงทะเบียน — ไม่ทับ (อาจเปลี่ยนบัญชี) */ }
    if (Object.keys(patch).length) {
      const { error: pe } = await admin.from("partners_v2").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", String(partner.id));
      if (pe) shopFilled.length = 0;
      else await writeAudit(admin, { action: "update", entityType: "partners_v2", entityId: String(partner.id), actorId: actor.id, actorName: actor.name, metadata: { fields: Object.keys(patch), source: "seller_bill_intake", voucher_id: voucherId } });
    }
  }
  await writeAudit(admin, { action: "create", entityType: "purchase_vouchers_v2", entityId: voucherId, actorId: actor.id, actorName: actor.name,
    metadata: { from_seller_bill: true, bill_no: input.bill_no ?? null, lines: lines.length, files: refs.length } });
  const cnt = (lv: string) => lines.filter((l) => l.level === lv).length;
  return { voucher_id: voucherId, ok: cnt("ok"), mid: cnt("mid"), no: cnt("no"), shop_filled: shopFilled };
}
