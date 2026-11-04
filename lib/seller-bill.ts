/**
 * ของกลางฝั่ง server — "บิลจากร้านจีน" (送货单/发货单) ของใบสำคัญรับ
 *   loadShopGroups()   บรรทัดใบสั่งซื้อที่ยังค้างของ "ร้านเดียวกับใบนี้" เท่านั้น (จัดกลุ่ม: สินค้า 1 ตัว × PO 1 ใบ) = เป้าหมายการจับคู่
 *   parseSellerBill()  ให้ AI อ่านรูป/PDF บิล → ชื่อจีน + แปลไทย + จำนวน + ราคา ¥ + เลือกบรรทัด PO ที่น่าจะใช่ (จากรายการที่ส่งให้เท่านั้น)
 *   applySellerBill()  แถวที่คนยืนยันแล้ว → ใส่ลงใบสำคัญ (ผูกบรรทัด PO · แบ่งจำนวนลงใบสั่งผลิตเก่าก่อน) + จำคู่ไว้ใช้ครั้งหน้า
 * กติกาจับคู่ (คะแนน/ระดับความมั่นใจ) อยู่ที่ lib/seller-bill-match.ts (pure) · เอกสาร docs/seller-bill-match.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJson } from "@/lib/ai-caption";
import { readFileRef } from "@/lib/file-ref-server";
import { isCNY } from "@/lib/landed-cost";
import { resolveSkuCover, coverUrl } from "@/lib/sku-cover";
import { recomputeVoucher, loadSkus, parentBasis } from "@/lib/purchase-voucher-server";
import { normDate } from "@/lib/delivery-bill";
import {
  groupKey, stripCode, matchBillLines, normalizeBillLine, distributeQty, aliasKey,
  type PoGroup, type PoGroupLine, type SellerBillLine, type AliasRow,
} from "@/lib/seller-bill-match";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();
const chunk = <T,>(arr: T[], size: number): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

/** โมเดลอ่านบิลจีน — ต้องอ่านลายมือ/ตัวจีนได้ดี (ค่าเริ่ม gpt-4.1-mini · เปลี่ยนด้วย env OPENAI_BILL_MODEL) */
export const SELLER_BILL_MODEL = (process.env.OPENAI_BILL_MODEL || "gpt-4.1-mini").trim();
const OPEN_PO_STATUS = ["draft", "purchase", "partial"];
const CLOSED_LINE_STATUS = ["received", "short_closed"];
const MAX_PROMPT_GROUPS = 220;

export type VoucherLite = { id: string; status: string; seller_name: string | null; seller_partner_id: string | null; currency: string };

export async function loadVoucherLite(admin: Admin, id: string): Promise<VoucherLite | null> {
  const { data } = await admin.from("purchase_vouchers_v2").select("id, status, seller_name, seller_partner_id, currency").eq("id", id).maybeSingle();
  const v = data as Row | null;
  if (!v) return null;
  return { id: String(v.id), status: str(v.status) || "draft", seller_name: (v.seller_name as string) ?? null, seller_partner_id: (v.seller_partner_id as string) ?? null, currency: str(v.currency) || "THB" };
}

/**
 * บรรทัดใบสั่งซื้อที่จับคู่ได้ = PO ที่ยังเปิด (ร่าง/สั่งแล้ว/รับบางส่วน) ของร้านเดียวกับใบ + สกุลเดียวกัน
 *   + บรรทัด PO ที่อยู่ในใบสำคัญนี้แล้ว (มาจากใบรับ) · บรรทัดที่รับครบ/ปิดยอดแล้วไม่นับ
 *   "ค้าง" = จำนวนสั่ง − ที่ออกใบสำคัญใบอื่นไปแล้ว (ใบที่ยกเลิกไม่นับ)
 */
export async function loadShopGroups(admin: Admin, v: VoucherLite): Promise<PoGroup[]> {
  const { data: mine } = await admin.from("purchase_voucher_lines_v2").select("id, po_id, po_line_id, gr_line_id").eq("voucher_id", v.id).not("is_active", "is", false);
  const myLines = (mine ?? []) as Row[];
  const myByPoLine = new Map<string, Row>();
  for (const l of myLines) if (l.po_line_id) myByPoLine.set(String(l.po_line_id), l);

  if (!v.seller_partner_id && !v.seller_name && myLines.length === 0) return [];
  let q = admin.from("purchase_orders_v2").select("id, po_no, order_date, currency, seller_partner_id, seller_name, status")
    .not("is_active", "is", false).in("status", OPEN_PO_STATUS).order("order_date", { ascending: false }).limit(600);
  q = v.seller_partner_id ? q.eq("seller_partner_id", v.seller_partner_id) : q.eq("seller_name", v.seller_name ?? "");
  const { data: pos } = await q;
  const poMap = new Map<string, Row>();
  for (const p of (pos ?? []) as Row[]) if (isCNY(str(p.currency) || "THB") === isCNY(v.currency)) poMap.set(String(p.id), p);
  // PO ของบรรทัดที่อยู่ในใบนี้แล้ว (แม้สถานะ PO จะไม่เปิดแล้ว)
  const extraPo = [...new Set(myLines.map((l) => str(l.po_id)).filter((id) => id && !poMap.has(id)))];
  if (extraPo.length) {
    const { data } = await admin.from("purchase_orders_v2").select("id, po_no, order_date, currency, seller_partner_id, seller_name, status").in("id", extraPo);
    for (const p of (data ?? []) as Row[]) poMap.set(String(p.id), p);
  }
  if (poMap.size === 0) return [];

  const poLines: Row[] = [];
  const res = await Promise.all(chunk([...poMap.keys()], 100).map((ids) => admin.from("purchase_order_lines_v2")
    .select("id, po_id, item_sku_id, item_name, qty, uom, price_est, note, sort_order, line_status, is_active")
    .in("po_id", ids).order("sort_order", { ascending: true }).limit(5000)));
  for (const r of res) for (const l of (r.data ?? []) as Row[]) {
    if (l.is_active === false) continue;
    const inMine = myByPoLine.has(String(l.id));
    if (!inMine && CLOSED_LINE_STATUS.includes(str(l.line_status))) continue;
    poLines.push(l);
  }
  if (poLines.length === 0) return [];

  // จำนวนที่ออกใบสำคัญใบอื่นไปแล้ว
  const billed = new Map<string, number>();
  const lineIds = poLines.map((l) => String(l.id));
  const vlRows: Row[] = [];
  for (const ids of chunk(lineIds, 200)) {
    const { data } = await admin.from("purchase_voucher_lines_v2").select("po_line_id, qty, voucher_id").in("po_line_id", ids).neq("voucher_id", v.id).not("is_active", "is", false);
    vlRows.push(...((data ?? []) as Row[]));
  }
  const otherVoucherIds = [...new Set(vlRows.map((r) => String(r.voucher_id)))];
  const cancelled = new Set<string>();
  for (const ids of chunk(otherVoucherIds, 200)) {
    const { data } = await admin.from("purchase_vouchers_v2").select("id, status").in("id", ids);
    for (const r of (data ?? []) as Row[]) if (r.status === "cancelled") cancelled.add(String(r.id));
  }
  for (const r of vlRows) if (!cancelled.has(String(r.voucher_id))) billed.set(String(r.po_line_id), (billed.get(String(r.po_line_id)) ?? 0) + num(r.qty));

  const skuMap = await loadSkus(admin, [...new Set(poLines.map((l) => str(l.item_sku_id)).filter(Boolean))]);
  const groups = new Map<string, PoGroup>();
  for (const l of poLines) {
    const po = poMap.get(String(l.po_id)); if (!po) continue;
    const skuId = str(l.item_sku_id) || null;
    const sku = skuId ? skuMap.get(skuId) : undefined;
    const key = groupKey(String(l.po_id), skuId, str(l.item_name));
    const my = myByPoLine.get(String(l.id));
    const remaining = Math.max(0, num(l.qty) - (billed.get(String(l.id)) ?? 0));
    const gl: PoGroupLine = { id: String(l.id), qty: num(l.qty), remaining, sort_order: num(l.sort_order), note: (l.note as string) ?? null, voucher_line_id: my ? String(my.id) : null, from_gr: !!my?.gr_line_id };
    const g = groups.get(key);
    if (g) {
      g.lines.push(gl); g.qty_total += gl.qty; g.remaining += remaining; g.in_voucher ||= !!my;
      if (num(l.price_est) > 0 && !(num(g.unit_price) > 0)) g.unit_price = num(l.price_est);
    } else {
      groups.set(key, {
        key, po_id: String(l.po_id), po_no: str(po.po_no), order_date: (po.order_date as string) ?? null,
        item_sku_id: skuId, code: sku ? str(sku.code) : (/^\s*\[([^\]]+)\]/.exec(str(l.item_name))?.[1] ?? ""), item_name: stripCode(str(l.item_name)), uom: (l.uom as string) ?? null,
        unit_price: num(l.price_est) > 0 ? num(l.price_est) : null, qty_total: gl.qty, remaining, lines: [gl], in_voucher: !!my,
        image_url: sku ? coverUrl(resolveSkuCover(sku).key) : null,
      });
    }
  }
  return [...groups.values()].map((g) => ({ ...g, qty_total: Math.round(g.qty_total * 10000) / 10000, remaining: Math.round(g.remaining * 10000) / 10000 }))
    .sort((a, b) => Number(b.in_voucher) - Number(a.in_voucher) || Number(b.remaining > 0) - Number(a.remaining > 0) || str(b.order_date).localeCompare(str(a.order_date)) || a.po_no.localeCompare(b.po_no));
}

export async function loadAliases(admin: Admin, partnerId: string | null): Promise<AliasRow[]> {
  if (!partnerId) return [];
  const { data } = await admin.from("supplier_item_aliases").select("alias_key, item_sku_id, item_name").eq("supplier_partner_id", partnerId).not("is_active", "is", false).limit(2000);
  return ((data ?? []) as Row[]).map((r) => ({ alias_key: str(r.alias_key), item_sku_id: (r.item_sku_id as string) ?? null, item_name: (r.item_name as string) ?? null }));
}

const SYSTEM = `คุณเป็นผู้ช่วยฝ่ายจัดซื้อ อ่าน "บิล / ใบส่งของจากร้านค้าในจีน" (送货单 / 发货单 / 销售单 / 出货单 / 收据) จากรูปหรือ PDF
ร้านขายอะไหล่กระเป๋า เครื่องหนัง ซิป ด้าย ผ้า ของโลหะ (คอหมา ตัวดี ห่วง นมหนู ตาไก่ หางซิป โซ่)
งานของคุณ:
1) ถอด "ทุกรายการสินค้า" ในบิลตามจริง (ชื่อจีน สเปก/สี/ขนาด/เบอร์ จำนวน หน่วย ราคาต่อหน่วย ยอด)
2) แปลชื่อเป็นภาษาไทยแบบที่ร้านเราเรียก
3) เลือก "รายการในใบสั่งซื้อของเรา" ที่เป็นของชิ้นเดียวกัน จากรายการที่ให้ไปเท่านั้น (รหัส P1, P2, …)

ตอบเป็น JSON เท่านั้น:
{
  "is_bill": true,
  "seller_name": "ชื่อร้านตามที่พิมพ์ในบิล (จีน) หรือ null",
  "bill_no": "เลขที่บิล หรือ null",
  "bill_date": "YYYY-MM-DD หรือ null",
  "currency": "CNY",
  "total_amount": ตัวเลขยอดรวมทั้งบิล (合计/总计) หรือ null,
  "lines": [
    { "name_cn": "品名ตามบิล", "spec_cn": "规格/颜色/尺寸/型号 ตามบิล หรือ null", "name_th": "ชื่อแปลไทย", "spec_th": "สเปกแปลไทย หรือ null",
      "qty": ตัวเลข, "unit": "个/条/米/码/卷/包… หรือ null", "unit_price": ตัวเลข, "amount": ตัวเลข,
      "is_fee": false, "candidate": "P12 หรือ null", "confidence": 0.0-1.0, "reason": "เหตุผลสั้น ๆ ภาษาไทย" }
  ]
}

กฎ:
- ตัวเลขอ่านตามบิลจริง ห้ามเดา อ่านไม่ออก = null · 1,000 → 1000 · ลายมือ: ตรวจด้วย จำนวน × ราคา = ยอด
- แถวรวม (合计 / 总计 / 小计 / 大写) ไม่ใช่รายการ → ใส่ใน total_amount
- ค่าส่ง ค่าขนส่ง ค่ากล่อง ค่าแพ็ก ภาษี (运费 / 快递费 / 物流费 / 包装费 / 纸箱 / 税) → is_fee = true, candidate = null
- candidate: เลือกได้เฉพาะรหัส P… ในรายการที่ให้ ถ้าไม่มีตัวที่เป็นของชิ้นเดียวกันจริง = null (ห้ามเลือกเพื่อให้ครบ)
  ดูชนิดของ + ขนาด (มม./ซม./เบอร์) + สี + เบอร์สี/รหัส (เช่น #402, G322) + ราคา ประกอบกัน · ชนิดเดียวกันแต่ขนาดหรือสีต่างกัน = ไม่ใช่
- คำแปล (ใช้คำแบบนี้): 狗扣/钩子=คอหมา · D扣/D字扣=ตัวดี · 日字扣=ห่วงเลขแปด · 方扣=ห่วงสี่เหลี่ยม · 圆环/O环=ห่วงกลม · 拉头/拉片=หางซิป · 拉链=ซิป · 尼龙拉链=ซิปไนล่อน · 金属拉链=ซิปฟันเหล็ก · 树脂拉链=ซิปฟันกระดูก · 链条=โซ่ · 气眼/鸡眼=ตาไก่ · 铆钉=นมหนู · 磁扣=กระดุมแม่เหล็ก · 线=ด้าย · 布=ผ้า · 织带=สายผ้า · 绳=เชือก
- สี: 镍色/白镍=สีนิเกิ้ล · 银色=สีเงิน · 枪色/枪黑/黑镍=สีรมดำ · 金色=สีทอง · 浅金=สีทองอ่อน · 黑色=สีดำ · 白色=สีขาว · 米白/米色=สีครีม · 古铜=สีทองแดงรมดำ · 玫瑰金=สีโรสโกลด์
- ถ้ารูปไม่ใช่บิลซื้อของ ให้ "is_bill": false และ lines = []`;

/** ส่งรูป/PDF + รายการ PO ของร้านนี้ให้ AI อ่าน → หัวบิล + แถว (มีคู่ที่ AI เลือก) */
export async function parseSellerBill(admin: Admin, ref: string, groups: PoGroup[]): Promise<{
  header: { is_bill: boolean; seller_text: string | null; bill_no: string | null; bill_date: string | null; currency: string | null; total_amount: number | null };
  lines: SellerBillLine[]; raw: Row; model: string;
}> {
  const f = await readFileRef(admin, ref);
  if (!f) throw new Error("อ่านไฟล์บิลไม่ได้ (ไฟล์อาจยังอัปโหลดไม่เสร็จ) — ลองแนบใหม่อีกครั้ง");
  const isPdf = /pdf/i.test(f.contentType) || /\.pdf$/i.test(ref);
  const b64 = Buffer.from(f.bytes).toString("base64");
  const filePart = isPdf
    ? { type: "file", file: { filename: "bill.pdf", file_data: `data:application/pdf;base64,${b64}` } }
    : { type: "image_url", image_url: { url: `data:${f.contentType.startsWith("image/") ? f.contentType : "image/jpeg"};base64,${b64}`, detail: "high" } };

  // รายการ PO ที่ให้ AI เลือก (ของค้างก่อน) — ส่งเป็นข้อความสั้น ๆ ประหยัด token
  const list = groups.slice(0, MAX_PROMPT_GROUPS);
  const idOf = new Map<string, string>();
  const lines = list.map((g, i) => {
    const pid = `P${i + 1}`; idOf.set(pid, g.key);
    return `${pid} | ${g.code || "-"} | ${g.item_name} | ${g.unit_price != null ? `¥${g.unit_price}` : "ไม่มีราคา"} | ค้าง ${g.remaining} ${g.uom ?? ""}`.trim();
  });
  const text = `รายการในใบสั่งซื้อของเรากับร้านนี้ (${list.length} รายการ · รหัส | ชื่อไทย | ราคาต่อหน่วยใน PO | จำนวนที่ค้าง):\n${lines.join("\n") || "(ไม่มี)"}\n\nอ่านบิลในไฟล์ แล้วตอบ JSON ตามโครงที่กำหนด`;
  const raw = await chatJson(SYSTEM, [{ type: "text", text }, filePart], 4000, SELLER_BILL_MODEL);

  const rawLines = Array.isArray(raw.lines) ? (raw.lines as Row[]) : [];
  const parsed = rawLines.map((r) => {
    const pid = str(r.candidate).toUpperCase();
    const key = idOf.get(pid) ?? null;
    const fee = r.is_fee === true || /运费|快递|物流|包装|纸箱|税/.test(`${str(r.name_cn)}${str(r.spec_cn)}`);
    return normalizeBillLine({ ...r, is_fee: fee, ai_pick: fee ? null : key, ai_conf: r.confidence, decision: null, manual: false, voucher_line_ids: [] });
  }).filter((l) => l.name_cn || l.name_th || l.qty != null || l.amount != null)
    .filter((l) => !/^(合计|总计|小计|大写|total)/i.test(str(l.name_cn)));
  const header = {
    is_bill: raw.is_bill !== false,
    seller_text: str(raw.seller_name) || null, bill_no: str(raw.bill_no) || null, bill_date: normDate(raw.bill_date),
    currency: str(raw.currency) || null, total_amount: raw.total_amount == null || raw.total_amount === "" ? null : (Number.isFinite(Number(String(raw.total_amount).replace(/[,，¥￥\s]/g, ""))) ? Number(String(raw.total_amount).replace(/[,，¥￥\s]/g, "")) : null),
  };
  return { header, lines: parsed, raw, model: SELLER_BILL_MODEL };
}

/** จับคู่ใหม่ทั้งบิล (แถวที่คนตัดสินแล้วไม่แตะ) */
export async function rematchLines(admin: Admin, v: VoucherLite, lines: SellerBillLine[]): Promise<{ lines: SellerBillLine[]; groups: PoGroup[] }> {
  const groups = await loadShopGroups(admin, v);
  const aliases = await loadAliases(admin, v.seller_partner_id);
  return { lines: matchBillLines(lines, groups, aliases), groups };
}

export type ApplyResult = { inserted: number; updated: number; expenses: number; remembered: number; lines: SellerBillLine[] };

/**
 * ใส่แถวที่ยืนยันแล้วลงใบสำคัญ — ตรวจทุกแถวก่อนเขียน (กันเขียนครึ่ง ๆ กลาง ๆ)
 *   • บรรทัด PO ที่มาจากใบรับในใบนี้แล้ว → ใส่ราคาจากบิลอย่างเดียว (จำนวนยึดใบรับ)
 *   • บรรทัด PO ที่ยังไม่อยู่ในใบ → เพิ่มรายการผูก PO (แบ่งจำนวนลงใบสั่งผลิตเก่าก่อน)
 *   • กดใส่ซ้ำ = รายการที่บิลนี้เคยเพิ่มไว้ถูกแทนด้วยชุดใหม่
 *   • ค่าใช้จ่าย (ค่าส่งในจีน ฯลฯ) ที่เลือก "เพิ่มเป็นค่าใช้จ่าย" → รายการเพิ่มเองไม่ผูก PO
 */
export async function applySellerBill(admin: Admin, v: VoucherLite, billLines: SellerBillLine[], opts: { remember: boolean; actorName: string | null; previousIds: string[] }): Promise<ApplyResult> {
  // 1) ตรวจทุกแถวก่อนเขียน — ต้องจับกับบรรทัดใบสั่งซื้อของร้านนี้เท่านั้น
  const check = new Map((await loadShopGroups(admin, v)).map((g) => [g.key, g]));
  billLines.forEach((l, i) => {
    if (l.decision !== "confirmed" || l.is_fee) return;
    if (!l.match_key || !check.has(l.match_key)) throw new Error(`แถวที่ ${i + 1} (${l.name_th || l.name_cn || "—"}) — บรรทัดใบสั่งซื้อที่เลือกไม่อยู่ในใบสั่งซื้อของร้านนี้แล้ว ให้เลือกจับคู่ใหม่`);
    const g = check.get(l.match_key)!;
    if (!g.lines.every((x) => x.from_gr) && !(num(l.qty) > 0)) throw new Error(`แถวที่ ${i + 1} ยังไม่มีจำนวน — ใส่จำนวนก่อน`);
  });

  // 2) ถอดรายการที่บิลนี้เคยเพิ่มไว้ (กดใส่ซ้ำ) — เฉพาะรายการที่ไม่ได้มาจากใบรับ แล้วโหลดใหม่
  if (opts.previousIds.length) {
    await admin.from("purchase_voucher_lines_v2").update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", opts.previousIds).eq("voucher_id", v.id).is("gr_line_id", null);
  }
  const groups = opts.previousIds.length ? await loadShopGroups(admin, v) : [...check.values()];
  const gMap = new Map(groups.map((g) => [g.key, g]));
  if (billLines.some((l) => l.decision === "confirmed" && !l.is_fee && l.match_key && !gMap.has(l.match_key))) {
    // บรรทัด PO ปิดไปแล้ว (เช่น รับครบ) — คืนรายการเดิมแล้วให้ผู้ใช้เลือกใหม่
    if (opts.previousIds.length) await admin.from("purchase_voucher_lines_v2").update({ is_active: true }).in("id", opts.previousIds).eq("voucher_id", v.id);
    throw new Error("บางบรรทัดใบสั่งซื้อที่เลือกปิดไปแล้ว (รับครบ/ปิดยอด) — กด \"จับคู่ใหม่\" แล้วเลือกอีกครั้ง");
  }

  // 3) เขียน
  const skuIds = [...new Set(groups.map((g) => g.item_sku_id ?? "").filter(Boolean))];
  const skuMap = await loadSkus(admin, skuIds);
  const { data: mx } = await admin.from("purchase_voucher_lines_v2").select("sort_order").eq("voucher_id", v.id).order("sort_order", { ascending: false }).limit(1);
  let sort = num(((mx ?? [])[0] as Row | undefined)?.sort_order) + 1;
  let inserted = 0, updated = 0, expenses = 0;
  const now = new Date().toISOString();
  const out: SellerBillLine[] = [];
  const { data: poLineRows } = groups.length
    ? await admin.from("purchase_order_lines_v2").select("id, item_name").in("id", groups.flatMap((g) => g.lines.map((x) => x.id)).slice(0, 2000))
    : { data: [] as Row[] };
  const fullName = new Map(((poLineRows ?? []) as Row[]).map((r) => [String(r.id), str(r.item_name)]));

  for (const l of billLines) {
    const ids: string[] = [];
    const price = num(l.unit_price) > 0 ? num(l.unit_price) : null;
    if (l.decision === "expense" && l.is_fee) {
      const name = [l.name_th, l.name_cn ? `(${l.name_cn})` : null].filter(Boolean).join(" ") || "ค่าใช้จ่ายในบิลร้าน";
      const qty = num(l.qty) > 0 ? num(l.qty) : 1;
      const unit = price ?? (num(l.amount) > 0 ? num(l.amount) / qty : null);
      const { data: ins, error } = await admin.from("purchase_voucher_lines_v2").insert({ voucher_id: v.id, item_name: name, qty, unit_price: unit, price_source: unit != null ? "bill" : "none", sort_order: sort++ }).select("id").single();
      if (error || !ins) throw new Error("เพิ่มค่าใช้จ่ายไม่สำเร็จ: " + (error?.message ?? ""));
      ids.push(String((ins as Row).id)); expenses++;
    } else if (l.decision === "confirmed" && l.match_key) {
      const g = gMap.get(l.match_key)!;
      // ใส่ราคาให้บรรทัดที่มาจากใบรับ (จำนวนยึดใบรับ)
      for (const gl of g.lines.filter((x) => x.from_gr && x.voucher_line_id)) {
        if (price != null) {
          await admin.from("purchase_voucher_lines_v2").update({ unit_price: price, price_source: "bill", updated_at: now }).eq("id", gl.voucher_line_id!).eq("voucher_id", v.id);
          updated++;
        }
      }
      // บรรทัดที่ยังไม่ได้มาจากใบรับ → เพิ่ม/อัปเดตรายการผูก PO
      const open = g.lines.filter((x) => !x.from_gr);
      const hasGr = g.lines.some((x) => x.from_gr);
      if (open.length && !hasGr) {
        const sku = g.item_sku_id ? skuMap.get(g.item_sku_id) : undefined;
        const basis = parentBasis(sku);
        for (const a of distributeQty(num(l.qty), open)) {
          const gl = open.find((x) => x.id === a.id)!;
          if (gl.voucher_line_id) {
            await admin.from("purchase_voucher_lines_v2").update({ qty: a.qty, unit_price: price, price_source: price != null ? "bill" : "none", updated_at: now }).eq("id", gl.voucher_line_id).eq("voucher_id", v.id);
            ids.push(gl.voucher_line_id); updated++;
            continue;
          }
          const { data: ins, error } = await admin.from("purchase_voucher_lines_v2").insert({
            voucher_id: v.id, po_id: g.po_id, po_line_id: gl.id, po_no: g.po_no, item_sku_id: g.item_sku_id,
            item_name: fullName.get(gl.id) || (g.code ? `[${g.code}] ${g.item_name}` : g.item_name), uom: g.uom, qty: a.qty,
            unit_price: price ?? g.unit_price, price_source: price != null ? "bill" : g.unit_price != null ? "po" : "none",
            cbm_per_unit: basis.cbm, kg_per_unit: basis.kg, sort_order: sort++,
          }).select("id").single();
          if (error || !ins) throw new Error("เพิ่มรายการไม่สำเร็จ: " + (error?.message ?? ""));
          ids.push(String((ins as Row).id)); inserted++;
        }
      }
    }
    out.push({ ...l, voucher_line_ids: ids });
  }

  // 4) จำคู่ (ชื่อจีน ↔ สินค้า ของร้านนี้)
  let remembered = 0;
  const partnerId = v.seller_partner_id;
  if (opts.remember && partnerId) {
    for (const l of billLines) {
      if (l.decision !== "confirmed" || l.is_fee || !l.match_key || !l.name_cn) continue;
      const g = gMap.get(l.match_key); if (!g) continue;
      const key = aliasKey(l.name_cn, l.spec_cn); if (!key || key === "|") continue;
      const { data: ex } = await admin.from("supplier_item_aliases").select("id, times_used").eq("supplier_partner_id", partnerId).eq("alias_key", key).maybeSingle();
      const patch = { name_cn: l.name_cn, spec_cn: l.spec_cn, name_th: [l.name_th, l.spec_th].filter(Boolean).join(" ") || null, item_sku_id: g.item_sku_id, item_name: g.item_sku_id ? null : g.item_name, last_unit_price: num(l.unit_price) > 0 ? num(l.unit_price) : null, currency: v.currency, last_used_at: now, updated_at: now, is_active: true };
      const { error } = ex
        ? await admin.from("supplier_item_aliases").update({ ...patch, times_used: num((ex as Row).times_used) + 1 }).eq("id", String((ex as Row).id))
        : await admin.from("supplier_item_aliases").insert({ ...patch, supplier_partner_id: partnerId, alias_key: key, created_by: opts.actorName, times_used: 1 });
      if (!error) remembered++;
    }
  }
  await recomputeVoucher(admin, v.id);
  return { inserted, updated, expenses, remembered, lines: out };
}
