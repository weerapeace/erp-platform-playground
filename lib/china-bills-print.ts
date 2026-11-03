/**
 * 🖨 ใบพิมพ์ "สรุปบิลจีน" (เจ้าของอนุมัติ 2026-11-03 จาก widget) — ปุ่มพิมพ์ในแท็บ "บิลจีนทั้งหมด" ของแอปโอนเงินจีน
 *   ติ๊กบิลไว้ = พิมพ์เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกบิลในตัวกรองที่เปิดอยู่ (ค้างโอน / รอโอน / …)
 *   สวิตช์เฉพาะใบ (settings.opts): เรท/เงินบาท · ค่าโอน · บัญชีธนาคารร้าน
 *     ปิดค่าโอน = ไม่มีช่องค่าโอน/รวม และยอดทุกจุด "ไม่รวมค่าโอน" (เจ้าของเลือก)
 *     เรท: บิลที่มีเรทแล้วใช้เรทของบิล · บิลที่ยังไม่มีเรท = ประมาณจากเรทฐาน (R1) ที่หน้าพิมพ์ส่งมา แล้วคิดชั้น R1–R4 จากยอดหยวนรวมของบิลกลุ่มนี้ (lib/china-pay)
 *   บิลค่าส่ง/VAT = ยอดบาทตรง ไม่ใช้เรท · บิลยกเลิกพิมพ์แบบขีดฆ่า ไม่นับรวม
 *   ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print · หน้าพิมพ์ app/app/china-pay/print · pure ไม่มี React
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  LIST_GROUP_ROW, LIST_TOTAL_ROW, defaultListPrintSettings, escapeHtml as esc, fitListColumns, listPrintCss, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import { TIER_NAMES, TIER_OFF, billDisplayName, billStatus3, isThbBill, rateForRmb, slipSumRmb, tierIdxForRmb } from "@/lib/china-pay";

/** หน้า "บิลจีนทั้งหมด" เขียนก่อนเปิดหน้าพิมพ์ = id บิลที่ติ๊กไว้ { ids, at } */
export const CHINA_BILLS_PRINT_PICK_KEY = "erp.chinaBillsPrint.pick";
export const CB_PRINT_SIGN = ["ผู้ทำรายการ", "ผู้ตรวจ", "ผู้โอน"];
export const cbPrintTitle = (filter: string) => (filter === "ทั้งหมด" || !filter ? "สรุปบิลจีน" : `สรุปบิลจีน${filter}`);

/** 1 บิลที่จะพิมพ์ */
export type CbPrintBill = {
  id: string; name: string; thb: boolean; supplierId: string | null; date: string | null;
  amount: number; fee: number; amountThb: number;
  /** เรทของบิล (0 = ยังไม่มี) */
  rate: number;
  /** ยอดสลิปที่แนบแล้ว (¥) */
  paid: number;
  status: string; note: string;
};
/** บัญชีธนาคารร้าน (ช่องที่ role นั้นอ่านไม่ได้ = ว่าง) */
export type CbBank = { bank: string; account: string; name: string };

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

/** แถวจาก /api/master-v2/china-bills */
export const cbBillsFromApi = (rows: Record<string, unknown>[]): CbPrintBill[] => rows.map((r) => ({
  id: str(r.id), name: billDisplayName(r), thb: isThbBill(r), supplierId: str(r.supplier_id) || null,
  date: str(r.transfer_date) || str(r.bill_date) || null,
  amount: num(r.amount_rmb), fee: num(r.fee_rmb), amountThb: num(r.amount_thb), rate: num(r.rate),
  paid: isThbBill(r) ? 0 : slipSumRmb(r), status: billStatus3(r), note: str(r.note),
}));

// ---------- ค่าเฉพาะใบ (settings.opts) ----------
export type CbPrintOpts = {
  /** คอลัมน์เรท + เงินบาท + กล่องคำนวณเงินบาท */
  rate: boolean;
  /** คอลัมน์ค่าโอน + รวม · ปิด = ยอดไม่รวมค่าโอน */
  fee: boolean;
  /** บัญชีธนาคารร้านใต้ชื่อร้าน */
  bank: boolean;
};
const OPT_DEFAULTS: CbPrintOpts = { rate: true, fee: true, bank: false };
export function cbPrintOpts(s: ListPrintSettings): CbPrintOpts {
  const o = (s.opts ?? {}) as Record<string, unknown>;
  const b = (k: keyof CbPrintOpts) => (typeof o[k] === "boolean" ? (o[k] as boolean) : OPT_DEFAULTS[k]);
  return { rate: b("rate"), fee: b("fee"), bank: b("bank") };
}

// ---------- คอลัมน์ / กลุ่ม / เรียง / แบบสำเร็จรูป ----------
export const CB_PRINT_COLUMNS: ListPrintColumn[] = [
  { key: "no", label: "#", align: "right", widthMm: 8 },
  { key: "date", label: "วันที่", widthMm: 18 },
  { key: "shop", label: "ร้าน", locked: true },
  { key: "status", label: "สถานะ", widthMm: 22 },
  { key: "amount", label: "ยอดบิล ¥", align: "right", widthMm: 24 },
  { key: "fee", label: "ค่าโอน ¥", align: "right", widthMm: 16 },
  { key: "total", label: "รวม ¥", align: "right", widthMm: 24 },
  { key: "paid", label: "โอนแล้ว ¥", align: "right", widthMm: 22 },
  { key: "remain", label: "คงค้าง ¥", align: "right", widthMm: 22 },
  { key: "rate", label: "เรท", align: "right", widthMm: 15 },
  { key: "thb", label: "เงินบาท", align: "right", widthMm: 28 },
  { key: "note", label: "หมายเหตุบิล", widthMm: 32 },
];
const FEE_COLS = ["fee", "total"];
const RATE_COLS = ["rate", "thb"];
/** คอลัมน์ที่ใช้ได้ตามสวิตช์ (ปิดค่าโอน/เรท = คอลัมน์ของมันหายจากใบและจากรายการคอลัมน์ในแผง) */
export const cbPrintColumnsFor = (o: CbPrintOpts) =>
  CB_PRINT_COLUMNS.filter((c) => (o.fee || !FEE_COLS.includes(c.key)) && (o.rate || !RATE_COLS.includes(c.key)));

export const CB_PRINT_GROUPS = [{ value: "", label: "ไม่จัดกลุ่ม" }, { value: "status", label: "ตามสถานะ" }, { value: "shop", label: "ตามร้าน" }, { value: "date", label: "ตามวันที่" }];
export const CB_PRINT_SORTS = [{ value: "date_desc", label: "ล่าสุดก่อน" }, { value: "date_asc", label: "เก่าสุดก่อน" }, { value: "shop", label: "ชื่อร้าน ก-ฮ" }, { value: "amount", label: "ยอดมากก่อน" }];

const presetCols = (on: string[]) => CB_PRINT_COLUMNS.map((c) => ({ key: c.key, on: !!c.locked || on.includes(c.key) }));
type PresetDef = { id: string; name: string; on: string[]; signature: boolean; opts: CbPrintOpts };
const PRESET_DEFS: PresetDef[] = [
  { id: "cb-full", name: "สรุปครบ (เรท + ค่าโอน)", on: ["no", "date", "amount", "fee", "total", "rate", "thb"], signature: true, opts: { rate: true, fee: true, bank: false } },
  { id: "cb-plain", name: "ยอดบิลอย่างเดียว", on: ["no", "date", "status", "amount"], signature: false, opts: { rate: false, fee: false, bank: false } },
  { id: "cb-transfer", name: "ใบให้คนโอน (มีบัญชีร้าน)", on: ["no", "amount", "fee", "total", "remain"], signature: true, opts: { rate: false, fee: true, bank: true } },
];
export const cbPrintPresets = (): ListPrintPreset[] => PRESET_DEFS.map((p) => ({
  id: p.id, name: p.name, settings: { signature: p.signature, columns: presetCols(p.on), opts: { ...p.opts } },
}));
export const cbPrintDefaults = (): ListPrintSettings => {
  const p = PRESET_DEFS[0];
  return defaultListPrintSettings(CB_PRINT_COLUMNS, { image: "none", sortBy: "date_desc", signature: p.signature, columns: presetCols(p.on), opts: { ...p.opts } });
};

// ---------- สร้างใบ ----------
export type CbPrintRate = {
  /** เรทฐาน R1 ที่ใช้ประมาณบิลที่ยังไม่มีเรท (0 = ไม่มี → "รอเรท") */
  r1: number;
  /** ที่มาของเรทฐาน เช่น "เรทวันที่ 28 ก.ย. 69" */
  label: string;
};
type CRow = CbPrintBill & { no: number; base: number; rateUsed: number; est: boolean; thbAmt: number | null; remain: number; cancelled: boolean };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
/** เรทมีทศนิยม 3–4 ตำแหน่ง (5.165) — ห้ามปัดเหลือ 2 */
const fmtRate = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
const rmb = (n: number) => `¥${fmt(n)}`;
const baht = (n: number) => `฿${fmt(n)}`;
const ymdUtc = (ymd: string) => { const [y, m, d] = ymd.slice(0, 10).split("-").map(Number); return y && m && d ? Date.UTC(y, m - 1, d) : NaN; };
export const cbThDate = (ymd: string | null) => {
  if (!ymd) return "—";
  const t = ymdUtc(ymd);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : esc(ymd);
};

export function buildChinaBillsPrint(input: {
  bills: CbPrintBill[]; settings: ListPrintSettings; rate: CbPrintRate;
  /** ข้อความขอบเขตบนหัวใบ เช่น "ตัวกรอง: ค้างโอน · เฉพาะที่ติ๊ก" */
  scopeText: string; defaultTitle: string;
  banks?: Map<string, CbBank>; printedAt: string; printedBy?: string; origin: string;
  company?: { name: string; logo_key: string | null } | null;
}): { html: string; title: string; groupCounts: number[]; count: number } {
  const { settings: s, origin } = input;
  const o = cbPrintOpts(s);
  const title = s.title.trim() || input.defaultTitle;

  // 1) ยอดต่อบิล — ปิดค่าโอน = ไม่รวมค่าโอนทุกจุด
  const base0 = input.bills.map((b, i) => {
    const cancelled = b.status === "ยกเลิก";
    const base = b.thb ? b.amountThb : b.amount + (o.fee ? b.fee : 0);
    const remain = b.thb ? (b.status === "โอนครบแล้ว" ? 0 : b.amountThb) : Math.max(0, base - b.paid);
    return { ...b, no: i + 1, base, remain, cancelled, rateUsed: 0, est: false, thbAmt: null as number | null };
  });
  // 2) เรท — บิลที่ยังไม่มีเรท ประมาณจากเรทฐาน · ชั้นเรทคิดจากยอดหยวนรวมของบิลกลุ่มนี้ (โอนพร้อมกัน)
  const estRmb = base0.filter((r) => !r.thb && !r.cancelled && r.rate <= 0).reduce((a, r) => a + r.base, 0);
  const estRate = rateForRmb(estRmb, input.rate.r1);
  const rows: CRow[] = base0.map((r) => {
    if (r.thb) return { ...r, thbAmt: r.amountThb };
    const rateUsed = r.rate > 0 ? r.rate : estRate;
    return { ...r, rateUsed, est: r.rate <= 0, thbAmt: rateUsed > 0 ? r.base * rateUsed : null };
  });

  // 3) เรียง
  const byDate = (a: CRow, b: CRow) => (a.date ?? "").localeCompare(b.date ?? "");
  const byShop = (a: CRow, b: CRow) => a.name.localeCompare(b.name, "th");
  const cmp: Record<string, (a: CRow, b: CRow) => number> = {
    date_desc: (a, b) => byDate(b, a) || byShop(a, b), date_asc: (a, b) => byDate(a, b) || byShop(a, b),
    // ยอดมากก่อน: บิลหยวนก่อน (เทียบ ¥) แล้วค่อยบิลบาท (เทียบ ฿)
    shop: (a, b) => byShop(a, b) || byDate(b, a), amount: (a, b) => Number(a.thb) - Number(b.thb) || b.base - a.base || byShop(a, b),
  };
  const sorted = [...rows].sort(cmp[s.sortBy] ?? cmp.date_desc);
  sorted.forEach((r, i) => { r.no = i + 1; });

  // 4) คอลัมน์ (สวิตช์ปิด = ตัดคอลัมน์ของมันทิ้ง) · ย่อให้พอดีกระดาษ
  const cols = fitListColumns(resolveListColumns(s, cbPrintColumnsFor(o)), s);
  const live = (list: CRow[]) => list.filter((r) => !r.cancelled);
  const sumRmb = (list: CRow[], k: "base" | "paid" | "remain" | "amount" | "fee") => live(list).filter((r) => !r.thb).reduce((a, r) => a + r[k], 0);
  const sumThbBills = (list: CRow[]) => live(list).filter((r) => r.thb).reduce((a, r) => a + r.amountThb, 0);
  const sumBaht = (list: CRow[]) => live(list).reduce((a, r) => a + (r.thbAmt ?? 0), 0);
  const waiting = (list: CRow[]) => live(list).some((r) => !r.thb && r.thbAmt == null);

  const bankLine = (r: CRow) => {
    if (!o.bank || r.thb) return "";
    const b = r.supplierId ? input.banks?.get(r.supplierId) : undefined;
    const parts = b ? [b.bank, b.account, b.name].filter(Boolean) : [];
    return `<div class="bank">${parts.length ? esc(parts.join(" · ")) : "ยังไม่มีเลขบัญชี"}</div>`;
  };
  const cellsOf = (r: CRow): Record<string, string> => {
    const thbOnly = r.thb ? `<span class="sub">${baht(r.amountThb)}</span>` : "";
    const out: Record<string, string> = {
      no: String(r.no),
      date: cbThDate(r.date),
      shop: `${esc(r.name)}${r.thb ? ` <span class="tag">บาท</span>` : ""}${bankLine(r)}`,
      status: esc(r.status),
      amount: r.thb ? thbOnly : rmb(r.amount),
      fee: r.thb ? "—" : r.fee ? fmt(r.fee) : "-",
      total: r.thb ? thbOnly : `<b>${rmb(r.base)}</b>`,
      paid: r.thb ? "—" : r.paid ? rmb(r.paid) : "-",
      remain: r.thb ? (r.remain ? baht(r.remain) : "-") : r.remain ? `<b>${rmb(r.remain)}</b>` : "-",
      rate: r.thb ? "—" : r.rateUsed > 0 ? `${r.est ? `<span class="est">~${fmtRate(r.rateUsed)}</span>` : fmtRate(r.rateUsed)}` : "-",
      thb: r.thbAmt == null ? `<span class="wait">รอเรท</span>` : r.est ? `<span class="est">~${baht(r.thbAmt)}</span>` : baht(r.thbAmt),
      note: esc(r.note),
    };
    // ปิดค่าโอน: ยอดบิลคือยอดหลัก (ตัวหนา)
    if (!o.fee && !r.thb) out.amount = `<b>${rmb(r.amount)}</b>`;
    if (r.cancelled) for (const k of Object.keys(out)) if (k !== "no" && k !== "status") out[k] = `<s>${out[k]}</s>`;
    return out;
  };

  // 5) จัดกลุ่ม
  const grouped = !!s.groupBy && CB_PRINT_GROUPS.some((g) => g.value === s.groupBy && g.value);
  const keyOf = (r: CRow) => (s.groupBy === "status" ? r.status : s.groupBy === "shop" ? r.name : s.groupBy === "date" ? r.date ?? "" : "");
  const groups = new Map<string, CRow[]>();
  for (const r of sorted) { const k = grouped ? keyOf(r) : ""; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const sumText = (list: CRow[]) => {
    const parts = [`${fmt(live(list).length)} บิล`];
    if (sumRmb(list, "base")) parts.push(rmb(sumRmb(list, "base")));
    if (sumThbBills(list)) parts.push(baht(sumThbBills(list)));
    return parts.join(" · ");
  };
  const blocks: Record<string, string>[][] = [];
  const counts: number[] = [];
  for (const [k, list] of groups) {
    const out: Record<string, string>[] = [];
    if (grouped) out.push({ [LIST_GROUP_ROW]: `<span class="g-sum">${sumText(list)}</span>${s.groupBy === "date" ? cbThDate(k || null) : esc(k || "—")}` });
    for (const r of list) out.push(cellsOf(r));
    if (grouped && groups.size > 1) out.push({ [LIST_TOTAL_ROW]: `รวม ${sumText(list)}` });
    blocks.push(out);
    counts.push(out.length);
  }

  // 6) แถวรวมท้ายตาราง
  const all = sorted;
  const cancelledN = all.filter((r) => r.cancelled).length;
  const thbBills = sumThbBills(all);
  const foot = {
    label: `รวม ${fmt(live(all).length)} บิล${cancelledN ? ` (ไม่นับยกเลิก ${fmt(cancelledN)})` : ""}${thbBills && !o.rate ? ` + ค่าส่ง/VAT ${baht(thbBills)}` : ""}`,
    cells: {
      amount: rmb(sumRmb(all, "amount")),
      fee: fmt(sumRmb(all, "fee")),
      total: rmb(sumRmb(all, "base")),
      paid: rmb(sumRmb(all, "paid")),
      remain: rmb(sumRmb(all, "remain")),
      thb: `${live(all).some((r) => r.est && r.thbAmt != null) ? "~" : ""}${baht(sumBaht(all))}${waiting(all) ? `<div class="wait">+ รอเรท</div>` : ""}`,
    } as Record<string, string>,
  };
  if (!o.fee) foot.cells.amount = rmb(sumRmb(all, "base"));
  for (const k of Object.keys(foot.cells)) if (!cols.some((c) => c.key === k)) delete foot.cells[k];

  // 7) กล่องคำนวณเงินบาท (เปิดเรท)
  let rateBox = "";
  if (o.rate && all.length) {
    const L = live(all);
    const known = L.filter((r) => !r.thb && !r.est), est = L.filter((r) => !r.thb && r.est), thb = L.filter((r) => r.thb);
    const lines: string[] = [];
    if (known.length) lines.push(`บิลที่มีเรทแล้ว ${fmt(known.length)} บิล ${rmb(sumRmb(known, "base"))} = <b>${baht(sumBaht(known))}</b>`);
    if (est.length) {
      const tier = tierIdxForRmb(estRmb), off = TIER_OFF[tier];
      lines.push(estRate > 0
        ? `บิลที่ยังไม่มีเรท ${fmt(est.length)} บิล ${rmb(estRmb)} × เรท ${fmtRate(estRate)} (ชั้น ${TIER_NAMES[tier]}${off ? ` = ${fmtRate(input.rate.r1)} − ${off}` : ""}${input.rate.label ? ` · ${esc(input.rate.label)}` : ""}) = <b>~${baht(sumBaht(est))}</b>`
        : `บิลที่ยังไม่มีเรท ${fmt(est.length)} บิล ${rmb(estRmb)} = <b>รอเรท</b>`);
    }
    if (thb.length) lines.push(`ค่าส่ง/VAT ${fmt(thb.length)} บิล = <b>${baht(sumThbBills(thb))}</b>`);
    if (lines.length > 1) lines.push(`<span class="tot">รวมเป็นเงินบาท ${waiting(all) ? "(ไม่รวมบิลที่รอเรท) " : ""}<b>${est.length ? "~" : ""}${baht(sumBaht(all))}</b></span>`);
    const foot2 = est.length && estRate > 0 ? `<div class="sub">* ~ = เรทประมาณการ — เรทจริงจะได้ตอนตัดโอนเข้าจีน</div>` : "";
    rateBox = `<div class="cb-rate">${lines.map((l) => `<div>${l}</div>`).join("")}${foot2}</div>`;
  }

  // 8) หัวใบ + เนื้อ
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const sub = [input.scopeText, `${fmt(all.length)} บิล`, o.fee ? "" : "ยอดไม่รวมค่าโอน"].filter(Boolean).join(" · ");
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(sub)}</div></div>`
    + `<div class="wb-no">พิมพ์ ${esc(input.printedAt)}${input.printedBy ? `<br/>โดย ${esc(input.printedBy)}` : ""}</div></div>`;
  let body = "";
  if (!all.length) body += `<div class="wb-empty">ไม่มีบิลตามที่เลือก</div>`;
  else if (grouped && s.pageBreakPerGroup) body += blocks.map((b, i) => `<div class="${i ? "grp-break" : ""}">${renderListTable(cols, b, i === blocks.length - 1 ? foot : undefined)}</div>`).join("");
  else body += renderListTable(cols, blocks.flat(), foot);
  body += rateBox;
  if (s.signature) body += signatureHtml(CB_PRINT_SIGN);

  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: CB_PRINT_CSS + listPrintCss(s),
  };
  return { html: buildReportHtml(tpl, { header, body }, `${title} ${input.printedAt.replace(/\//g, "-")}`), title, groupCounts: counts.length ? counts : [0], count: all.length };
}

const CB_PRINT_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #ea580c; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t td.r, .wb-t th.r { text-align: right; white-space: nowrap; }
.wb-t tfoot td { font-weight: 700; background: #fff7ed; color: #9a3412; }
.wb-t tfoot td.r { color: #9a3412; }
.sub { font-size: 0.85em; color: #64748b; font-weight: 400; }
.bank { font-size: 0.85em; color: #475569; margin-top: 0.5mm; }
.tag { font-size: 0.75em; padding: 0 1.2mm; border: 1px solid #c4b5fd; color: #6d28d9; border-radius: 1mm; }
.est { color: #b45309; }
.wait { color: #b45309; font-size: 0.85em; font-weight: 400; }
.g-sum { float: right; font-weight: 400; color: #475569; margin-left: 3mm; }
.cb-rate { margin-top: 3mm; padding: 2mm 3mm; border: 1px solid #fcd34d; background: #fffbeb; border-radius: 1mm; color: #78350f; line-height: 1.6; break-inside: avoid; }
.cb-rate .tot { display: block; border-top: 1px dashed #fcd34d; margin-top: 1mm; padding-top: 1mm; }
.cb-rate .sub { color: #92400e; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;
