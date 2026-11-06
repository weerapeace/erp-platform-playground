/**
 * 🖨 ใบเช็กสถานะใบสั่งขาย (เจ้าของเลือกจาก widget 2026-11-06 "ทำตามที่แนะนำ") — /print/so-order-status/<id>
 *   ไว้เดินเช็กของจริงหน้างาน เทียบกับที่ระบบบอก: รายการไหนอยู่ขั้นไหน · เปิดผลิตกี่ชิ้น/ขาด · ส่งไปแล้วกี่ชิ้น
 *   3 แบบสำเร็จรูป (ตัวสร้างเดียวกัน ต่างแค่ค่าตั้ง):
 *     ① ตารางขั้นตอน (ค่าเริ่ม) — 5 ช่องขั้นงานต่อแถว ● = ขั้นที่ระบบบอก · ☐ = ติ๊กขั้นที่เห็นจริง → ติ๊กไม่ตรงจุดดำ = ต้องแก้ในระบบ
 *     ② ใบเช็กละเอียด — จัดกลุ่มตามขั้น · รูปใหญ่ขึ้น · ช่าง · ใบขาย · ช่อง "เจอจริง" + "นับได้"
 *     ③ แยกแผ่นตามจุดงาน — ② + ขึ้นแผ่นใหม่ทุกขั้น (หัวใบย่อซ้ำทุกแผ่น) ฉีกแจกคนละฝ่าย
 *   ขั้นงาน = lib/so-order-stage (ตัวเดียวกับป๊อปใบสั่งขาย) · ยอดเปิด/ขาด = lib/mo-so-rule · ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print (ListPrintPanel)
 *   ข้อมูล = GET /api/so-orders/<id>?print=1 · pure ไม่มี React (เทสต์ lib/__tests__/so-status-print.test.ts)
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import {
  defaultListPrintSettings, escapeHtml as esc, fitListColumns, listPrintCss, listSummaryHtml, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import { SO_LINE_STAGES, soShipState, type SoLineStage } from "@/lib/so-order-stage";
import { modelKeyOf, commonNamePrefix } from "@/lib/so-order-view";
import { docFileName } from "@/lib/print-filename";

// ---------- ข้อมูล ----------
export type SoStatusBill = { no: string; date: string; qty: number };
export type SoStatusMo = {
  mo_no: string; qty: number; status: string | null; shipped: number;
  /** ช่างที่จ่ายงานไป (ใบจ่ายงาน) */
  assignees: string[];
  /** จ่ายงานแล้ว (บอร์ดจ่ายงาน) */
  dispatched: boolean;
  /** กำหนดเสร็จของใบผลิต (กำหนดภายในก่อน) — null = ยังไม่ตั้ง */
  due: string | null;
  /** พิมพ์ใบงานผลิตแล้วกี่ครั้ง (print_logs · นับตั้งแต่ 31 ต.ค. 69) */
  printed: number;
  bills: SoStatusBill[];
};
export type SoStatusLine = {
  id: string; line_no: number; sku: string | null; name: string; qty: number; unit: string | null;
  image_url: string | null; stage: SoLineStage; opened: number; shipped: number; mos: SoStatusMo[];
  group: string | null;
};
export type SoStatusHeader = {
  order_no: string; status: string; order_date: string | null; due_date: string | null;
  customer: string; seller: string | null; po_no: string | null; sale_person: string | null;
};
export type SoStatusInput = { header: SoStatusHeader; lines: SoStatusLine[] };

/**
 * แปลงผล GET /api/so-orders/<id>?print=1 → ข้อมูลใบพิมพ์ · sellerName = ชื่อบริษัทผู้ขาย (หาจาก company_code ที่หน้าเว็บ)
 * กำหนดเสร็จ = ของใบผลิต (ภายในก่อน) · ไม่มี = กำหนดส่งของรายการ
 */
export function soStatusInputFromApi(d: Record<string, unknown>, sellerName: string | null): SoStatusInput {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const print = (d.print ?? {}) as { mos?: Record<string, Partial<SoStatusMo>>; group_names?: Record<string, string> };
  const lines = (Array.isArray(d.lines) ? d.lines : []) as Record<string, unknown>[];
  return {
    header: {
      order_no: s(d.order_no) || "—", status: s(d.status), order_date: (d.order_date as string) ?? null, due_date: (d.due_date as string) || null,
      customer: s(d.customer_name), seller: sellerName, po_no: (d.customer_po_no as string) || null, sale_person: (d.sale_person_name as string) || null,
    },
    lines: lines.map((l, i) => {
      const p = (l.progress ?? null) as { opened?: number; shipped?: number; mos?: { mo_no: string; qty: number; status: string | null; shipped: number }[] } | null;
      return {
        id: s(l.id), line_no: Number(l.line_no) || i + 1, sku: (l.sku as string) || null, name: s(l.product_name) || s(l.sku),
        qty: Number(l.qty) || 0, unit: (l.unit as string) || null, image_url: (l.image_url as string) || null,
        stage: (Math.min(4, Math.max(0, Number(l.stage) || 0)) as SoLineStage),
        opened: Number(p?.opened) || 0, shipped: Number(p?.shipped) || 0,
        group: l.mo_group_id ? print.group_names?.[String(l.mo_group_id)] ?? null : null,
        mos: (p?.mos ?? []).map((m) => {
          const x = print.mos?.[m.mo_no] ?? {};
          return {
            mo_no: m.mo_no, qty: Number(m.qty) || 0, status: m.status ?? null, shipped: Number(m.shipped) || 0,
            assignees: x.assignees ?? [], dispatched: !!x.dispatched, due: x.due ?? ((l.due_date as string) || null),
            printed: Number(x.printed) || 0, bills: x.bills ?? [],
          };
        }),
      };
    }),
  };
}

const EPS = 0.0001;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
/** 17 ก.ย. 69 (วันที่ล้วน ไม่เลื่อนวันตามเขตเวลา) */
export const thDay = (ymd: string | null | undefined) => {
  if (!ymd) return "";
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(ymd) : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
};

/** ช่องขั้นงาน 5 ช่อง (แบบตารางขั้นตอน) */
const STAGE_COL = (s: SoLineStage) => `st${s}`;
const STAGE_HEAD: Record<SoLineStage, string> = { 0: "รอเปิด", 1: "เปิดผลิต", 2: "กำลังผลิต", 3: "เสร็จ", 4: "ส่งลูกค้า" };
const ALL_STAGES: SoLineStage[] = [0, 1, 2, 3, 4];

// ---------- จุดที่ระบบเห็นว่าควรเช็ก ----------
export type SoStatusFlag = "under" | "over" | "no_mo" | "ship_no_wo";
const live = (l: SoStatusLine) => l.mos.filter((m) => m.status !== "cancelled");
const moDone = (m: SoStatusMo) => m.status === "done" || m.status === "closed";
/** ธงต่อรายการ — เปิดผลิตขาด/เกิน · ยังไม่มีใบผลิต · ส่งลูกค้าแล้วแต่ใบผลิตยังไม่จ่ายงาน (ของจากสต๊อก? / ยังไม่อัปเดตบอร์ด) */
export function lineFlags(l: SoStatusLine): { key: SoStatusFlag; text: string }[] {
  const out: { key: SoStatusFlag; text: string }[] = [];
  const mos = live(l);
  if (!mos.length) { out.push({ key: "no_mo", text: "ยังไม่มีใบผลิต" }); return out; }
  if (l.opened + EPS < l.qty) out.push({ key: "under", text: `เปิดผลิตขาด ${fmt(l.qty - l.opened)}` });
  else if (l.opened > l.qty + EPS) out.push({ key: "over", text: `เปิดผลิตเกิน ${fmt(l.opened - l.qty)}` });
  if (l.shipped > EPS && mos.every((m) => !m.dispatched && !moDone(m))) out.push({ key: "ship_no_wo", text: "ส่งแล้ว แต่ใบผลิตยังไม่จ่ายงาน" });
  return out;
}

export type SoStatusWarning = { key: string; text: string };
/** กล่องเตือนหัวใบ — สรุปจุดที่ควรเช็ก (บอกรหัสสินค้าไม่เกิน 4 ตัว ที่เหลือ "+N") */
export function statusWarnings(input: SoStatusInput): SoStatusWarning[] {
  const list = (ls: SoStatusLine[], f: (l: SoStatusLine) => string) => {
    const head = ls.slice(0, 4).map(f).join(" · ");
    return ls.length > 4 ? `${head} · +${ls.length - 4}` : head;
  };
  const flagged = (k: SoStatusFlag) => input.lines.filter((l) => lineFlags(l).some((f) => f.key === k));
  const out: SoStatusWarning[] = [];
  const noMo = flagged("no_mo");
  if (noMo.length) out.push({ key: "no_mo", text: `ยังไม่มีใบผลิต ${noMo.length} รายการ: ${list(noMo, (l) => l.sku ?? l.name)}` });
  const under = flagged("under");
  if (under.length) out.push({ key: "under", text: `เปิดผลิตขาด ${under.length} รายการ: ${list(under, (l) => `${l.sku ?? l.name} (${fmt(l.opened)}/${fmt(l.qty)} · ขาด ${fmt(l.qty - l.opened)})`)}` });
  const over = flagged("over");
  if (over.length) out.push({ key: "over", text: `เปิดผลิตเกิน ${over.length} รายการ: ${list(over, (l) => `${l.sku ?? l.name} (${fmt(l.opened)}/${fmt(l.qty)})`)}` });
  const noWo = flagged("ship_no_wo");
  if (noWo.length) {
    const pcs = noWo.reduce((a, l) => a + l.shipped, 0);
    out.push({ key: "ship_no_wo", text: `ส่งลูกค้าแล้วแต่ใบผลิตยังไม่จ่ายงาน ${noWo.length} รายการ (รวม ${fmt(pcs)} ชิ้น — ของจากสต๊อก หรือยังไม่อัปเดตบอร์ด?): ${list(noWo, (l) => l.sku ?? l.name)}` });
  }
  const mos = input.lines.flatMap(live);
  if (!input.header.due_date && mos.length && mos.every((m) => !m.due)) out.push({ key: "no_due", text: "ยังไม่มีกำหนดส่ง ทั้งใบสั่งขายและใบผลิตทุกใบ" });
  const waiting = input.lines.filter((l) => l.stage === 1).flatMap(live).filter((m) => !m.dispatched && m.printed === 0);
  if (waiting.length) out.push({ key: "wo_unprinted", text: `ใบงานผลิตที่รอจ่ายงานแต่ยังไม่เคยพิมพ์ ${waiting.length} ใบ (นับตั้งแต่ 31 ต.ค. 69)` });
  return out;
}

// ---------- ค่าเฉพาะใบ (settings.opts) ----------
export type SoStatusOpts = {
  /** ขั้นที่จะพิมพ์ (ปิดขั้นที่ไม่ต้องเช็ก เช่น ส่งครบแล้ว) */
  stages: SoLineStage[];
  /** กล่องตัวเลข 5 ขั้นหัวใบ */
  summary: boolean;
  /** กล่อง "จุดที่ควรเช็ก" */
  warn: boolean;
  /** ข้อความ "ต้องเช็ก" ใต้ชื่อสินค้า */
  flags: boolean;
  /** ช่อง ผู้ตรวจ / วันที่ตรวจ มุมขวาบน */
  checker: boolean;
};
export const SO_STATUS_OPT_DEFAULTS: SoStatusOpts = { stages: [...ALL_STAGES], summary: true, warn: true, flags: true, checker: true };
export function soStatusOpts(s: ListPrintSettings): SoStatusOpts {
  const o = (s.opts ?? {}) as Record<string, unknown>;
  const b = (k: "summary" | "warn" | "flags" | "checker") => (typeof o[k] === "boolean" ? (o[k] as boolean) : SO_STATUS_OPT_DEFAULTS[k]);
  const stages = Array.isArray(o.stages)
    ? ALL_STAGES.filter((x) => (o.stages as unknown[]).includes(x))
    : [...SO_STATUS_OPT_DEFAULTS.stages];
  return { stages, summary: b("summary"), warn: b("warn"), flags: b("flags"), checker: b("checker") };
}
/** ปุ่มลัด "พิมพ์ขั้นไหนบ้าง" */
export const SO_STATUS_STAGE_QUICK: { id: string; label: string; stages: SoLineStage[] }[] = [
  { id: "all", label: "ทุกขั้น", stages: [...ALL_STAGES] },
  { id: "open", label: "เฉพาะที่ยังไม่ส่งครบ", stages: [0, 1, 2, 3] },
  { id: "floor", label: "เฉพาะที่อยู่ในโรงงาน", stages: [1, 2, 3] },
];

// ---------- คอลัมน์ / กลุ่ม / เรียง / แบบสำเร็จรูป ----------
/** คอลัมน์ที่พิมพ์ได้ — ความกว้างคิดสำหรับ A4 แนวนอน (แนวตั้ง/A5 ระบบย่อให้พอดีเอง) */
export function soStatusColumns(): ListPrintColumn[] {
  return [
    { key: "idx", label: "#", align: "center", widthMm: 9, minMm: 8 },
    { key: "img", label: "รูป" },
    { key: "product", label: "สินค้า", locked: true },
    { key: "qty", label: "สั่ง", align: "right", widthMm: 15, minMm: 11 },
    { key: "mo", label: "ใบผลิต · เปิด", widthMm: 29, minMm: 22 },
    { key: "stage", label: "ขั้น (ระบบ)", widthMm: 22, minMm: 16 },
    ...ALL_STAGES.map((s): ListPrintColumn => ({ key: STAGE_COL(s), label: STAGE_HEAD[s], align: "center", widthMm: 12, minMm: 10 })),
    { key: "crew", label: "ช่าง", widthMm: 22, minMm: 14 },
    { key: "due", label: "กำหนดเสร็จ", widthMm: 18, minMm: 14 },
    { key: "shipped", label: "ส่งแล้ว (ชิ้น)", align: "right", widthMm: 19, minMm: 13 },
    { key: "bills", label: "ใบขายที่ส่ง", widthMm: 32, minMm: 20 },
    { key: "wo", label: "ใบงาน", widthMm: 16, minMm: 12 },
    { key: "seen", label: "เจอจริง", blank: "box", widthMm: 14 },
    { key: "count", label: "นับได้", blank: "line", widthMm: 18 },
  ];
}
const colsOn = (keys: string[]) => {
  const all = soStatusColumns().map((c) => c.key);
  return [...keys.map((key) => ({ key, on: true })), ...all.filter((k) => !keys.includes(k)).map((key) => ({ key, on: false })), { key: "x_note", on: true, widthMm: 28 }];
};
const MATRIX_COLS = ["idx", "img", "product", "qty", "mo", ...ALL_STAGES.map(STAGE_COL), "shipped", "count"];
const DETAIL_COLS = ["idx", "img", "product", "qty", "mo", "crew", "shipped", "bills", "seen", "count"];

export const SO_STATUS_TITLE = "ใบเช็กสถานะใบสั่งขาย";
/** ชื่อไฟล์ตอนบันทึกเป็น PDF: "ใบเช็กสถานะ - SO2569-11-002" */
export const soStatusFileName = (orderNo: string) => docFileName("ใบเช็กสถานะ", orderNo);
export const SO_STATUS_GROUPS = [
  { value: "", label: "ไม่จัดกลุ่ม (ลำดับในใบ)" },
  { value: "stage", label: "ขั้นงาน (ที่ระบบบอก)" },
  { value: "model", label: "รุ่น" },
];
export const SO_STATUS_SORTS = [
  { value: "", label: "ลำดับในใบ" },
  { value: "sku", label: "รหัสสินค้า" },
  { value: "stage", label: "ขั้นงาน (ช้าสุดก่อน)" },
  { value: "qty", label: "จำนวนสั่ง (มากก่อน)" },
];
export const soStatusDefaults = (): ListPrintSettings => defaultListPrintSettings(soStatusColumns(), {
  orientation: "landscape", image: "s", density: "normal", signature: true, columns: colsOn(MATRIX_COLS),
});
/** แบบสำเร็จรูป 3 แบบ (เจ้าของเลือก ① เป็นค่าเริ่ม) */
export const SO_STATUS_PRESETS: ListPrintPreset[] = [
  { id: "so-status-matrix", name: "ตารางขั้นตอน (ค่าเริ่ม)", settings: { orientation: "landscape", image: "s", density: "normal", groupBy: "", sortBy: "", pageBreakPerGroup: false, columns: colsOn(MATRIX_COLS) } },
  { id: "so-status-detail", name: "ใบเช็กละเอียด (จัดกลุ่มตามขั้น)", settings: { orientation: "landscape", image: "m", density: "normal", groupBy: "stage", sortBy: "", pageBreakPerGroup: false, columns: colsOn(DETAIL_COLS) } },
  { id: "so-status-sheets", name: "แยกแผ่นตามจุดงาน (1 ขั้น = 1 แผ่น)", settings: { orientation: "landscape", image: "m", density: "normal", groupBy: "stage", sortBy: "", pageBreakPerGroup: true, columns: colsOn(DETAIL_COLS) } },
];

// ---------- สร้างใบ ----------
type Group = { key: string; label: string; rows: SoStatusLine[] };

export function buildSoStatusPrint(input: SoStatusInput & {
  settings: ListPrintSettings; printedAt: string; origin: string; company?: { name: string; logo_key: string | null } | null;
}): { html: string; title: string; groupCounts: number[]; count: number } {
  const { header: h, settings: s, origin } = input;
  const o = soStatusOpts(s);
  const title = s.title.trim() || SO_STATUS_TITLE;
  const cols = fitListColumns(resolveListColumns(s, soStatusColumns()), s);
  const hasMatrix = cols.some((c) => /^st[0-4]$/.test(c.key));

  // พิมพ์เฉพาะขั้นที่เลือก · เรียง
  const keep = new Set(o.stages);
  const rows = input.lines.filter((l) => keep.has(l.stage)).sort((a, b) => {
    if (s.sortBy === "sku") return String(a.sku ?? "").localeCompare(String(b.sku ?? "")) || a.line_no - b.line_no;
    if (s.sortBy === "stage") return a.stage - b.stage || a.line_no - b.line_no;
    if (s.sortBy === "qty") return b.qty - a.qty || a.line_no - b.line_no;
    return a.line_no - b.line_no;
  });

  // จัดกลุ่ม: ขั้นงาน = เรียง ทำเสร็จ → ผลิต → รอเปิด → ส่งแล้ว (ของที่ต้องตามก่อน) · รุ่น = ตามที่เจอครั้งแรก
  let groups: Group[];
  if (s.groupBy === "stage") {
    const order: SoLineStage[] = [3, 2, 1, 0, 4];
    groups = order.map((st) => ({ key: String(st), label: SO_LINE_STAGES[st].label, rows: rows.filter((r) => r.stage === st) })).filter((g) => g.rows.length);
  } else if (s.groupBy === "model") {
    const map = new Map<string, SoStatusLine[]>();
    for (const r of rows) { const k = modelKeyOf(r.sku); map.set(k, [...(map.get(k) ?? []), r]); }
    groups = [...map.entries()].sort((a, b) => Number(!a[0]) - Number(!b[0]))
      .map(([key, list]) => ({ key, label: key ? `${key} · ${commonNamePrefix(list.map((x) => x.name))}` : "ไม่มีรหัสสินค้า", rows: list }));
  } else groups = [{ key: "", label: "", rows }];

  const img = (u: string | null) => (u ? `<img class="thumb" src="${esc(`${u.startsWith("/") ? origin : ""}${u}`)}" alt="" />` : `<span class="no-img">—</span>`);
  const cell = (l: SoStatusLine): Record<string, string> => {
    const mos = live(l);
    const flags = o.flags ? lineFlags(l) : [];
    const shipSt = soShipState(l.qty, l.shipped);
    const r: Record<string, string> = {
      idx: String(l.line_no),
      img: img(l.image_url),
      product: `${esc(l.name)}${l.sku ? `<div class="sub mono">${esc(l.sku)}</div>` : ""}${flags.map((f) => `<div class="flag">ต้องเช็ก · ${esc(f.text)}</div>`).join("")}`,
      // หน่วย "ชิ้น" (เกือบทุกรายการ) ไม่ต้องพิมพ์ซ้ำทุกแถว — แถวเตี้ยลง
      qty: `${fmt(l.qty)}${l.unit && l.unit !== "ชิ้น" ? `<div class="sub">${esc(l.unit)}</div>` : ""}`,
      // เปิดครบพอดีใบเดียว = เลขใบอย่างเดียว · ขาด/เกิน/หลายใบ = บอกยอดเปิด
      mo: mos.length
        ? mos.map((m) => `<span class="mono">${esc(m.mo_no)}</span>`).join("<br/>")
          + (mos.length > 1 || Math.abs(l.opened - l.qty) > EPS
            ? `<div class="sub">เปิด ${fmt(l.opened)}/${fmt(l.qty)}${l.opened + EPS < l.qty ? ` <b class="warn">ขาด ${fmt(l.qty - l.opened)}</b>` : l.opened > l.qty + EPS ? ` <b class="warn">เกิน ${fmt(l.opened - l.qty)}</b>` : ""}</div>`
            : "")
        : `<b class="warn">ยังไม่มีใบผลิต</b>`,
      stage: `${esc(SO_LINE_STAGES[l.stage].label)}${l.stage < 4 && shipSt === "part" ? `<div class="sub">ส่งบางส่วน</div>` : ""}`,
      crew: esc([...new Set(mos.flatMap((m) => m.assignees))].join(", ")) || `<span class="no-img">—</span>`,
      due: esc([...new Set(mos.map((m) => thDay(m.due)).filter(Boolean))].join(", ")) || `<span class="no-img">—</span>`,
      shipped: l.shipped > EPS ? `${fmt(l.shipped)}/${fmt(l.qty)}${shipSt === "full" ? `<div class="sub">ครบ</div>` : ""}` : `<span class="no-img">—</span>`,
      bills: mos.flatMap((m) => m.bills).map((b) => `<div><span class="mono">${esc(b.no)}</span> <span class="sub">${esc(thDay(b.date))} · ${fmt(b.qty)}</span></div>`).join("") || `<span class="no-img">—</span>`,
      wo: mos.length ? mos.map((m) => (m.printed > 0 ? `พิมพ์แล้ว` : `<b class="warn">ยังไม่พิมพ์</b>`)).join("<br/>") : `<span class="no-img">—</span>`,
    };
    // ● = ขั้นที่ระบบบอก · ☐ = ติ๊กขั้นที่เห็นจริง · ช่องส่งแล้วบอกจำนวนที่ส่งไปบางส่วน
    for (const st of ALL_STAGES) {
      r[STAGE_COL(st)] = `<span class="stc">${st === l.stage ? `<span class="sdot"></span>` : ""}<span class="chk"></span></span>`
        + (st === 4 && l.stage < 4 && l.shipped > EPS ? `<div class="sub">ส่ง ${fmt(l.shipped)}</div>` : "");
    }
    return r;
  };

  // หัวใบ
  const co = input.company;
  const coHtml = co ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>` : "";
  const groupNames = [...new Set(input.lines.map((l) => l.group).filter(Boolean))] as string[];
  const totalQty = input.lines.reduce((a, l) => a + l.qty, 0);
  const totalShip = input.lines.reduce((a, l) => a + Math.min(l.shipped, l.qty), 0);
  const sub1 = [h.order_no, groupNames.length ? `ชุด ${groupNames.join(", ")}` : "", h.order_date ? `สั่ง ${thDay(h.order_date)}` : "", `กำหนดส่ง ${h.due_date ? thDay(h.due_date) : "ยังไม่ระบุ"}`, h.po_no ? `PO ลูกค้า ${h.po_no}` : ""].filter(Boolean).join(" · ");
  const sub2 = [h.customer, h.seller ?? "", h.sale_person ? `ผู้ขาย ${h.sale_person}` : ""].filter(Boolean).join(" · ");
  const sub3 = `${fmt(input.lines.length)} รายการ · ${fmt(totalQty)} ชิ้น · ส่งแล้ว ${fmt(totalShip)} ชิ้น${rows.length < input.lines.length ? ` · ใบนี้พิมพ์ ${fmt(rows.length)} รายการ (เลือกเฉพาะบางขั้น)` : ""}`;
  const checker = o.checker ? `<div class="chkr">ผู้ตรวจ <span class="wl"></span><br/>วันที่ตรวจ <span class="wl"></span></div>` : "";
  const head = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(sub1)}</div><div class="wb-sub">${esc(sub2)}</div><div class="wb-sub">${esc(sub3)}</div></div>`
    + `<div class="wb-no">พิมพ์ ${esc(input.printedAt)}${h.status === "cancelled" ? `<div class="warn">ใบนี้ถูกยกเลิกแล้ว</div>` : ""}${checker}</div></div>`;

  // กล่องตัวเลข: นับทุกรายการในใบ (ไม่ขึ้นกับขั้นที่เลือกพิมพ์)
  const cnt = (st: SoLineStage) => input.lines.filter((l) => l.stage === st).length;
  const part = input.lines.filter((l) => l.stage < 4 && soShipState(l.qty, l.shipped) === "part").length;
  const summary = o.summary ? listSummaryHtml(ALL_STAGES.map((st) => ({
    label: SO_LINE_STAGES[st].label,
    value: `${fmt(cnt(st))}${st === 4 && part ? ` <span class="sum-sub">+ ส่งบางส่วน ${fmt(part)}</span>` : ""}`,
  }))) : "";
  const warns = o.warn ? statusWarnings(input) : [];
  const warnHtml = warns.length ? `<div class="so-warn"><b>จุดที่ระบบเห็นว่าควรเช็ก</b><ul>${warns.map((w) => `<li>${esc(w.text)}</li>`).join("")}</ul></div>` : "";
  const legend = hasMatrix ? `<div class="so-legend"><span class="sdot"></span> = ขั้นที่ระบบบอก · <span class="chk"></span> = ติ๊กขั้นที่เห็นจริง · ติ๊กไม่ตรงจุดดำ = ต้องแก้ในระบบ</div>` : "";

  // ตาราง: จัดกลุ่ม = หัวกลุ่ม + ตารางต่อกลุ่ม · ขึ้นแผ่นใหม่ทุกกลุ่ม = หัวใบย่อซ้ำทุกแผ่น
  const sheets = s.groupBy && s.pageBreakPerGroup && groups.length > 1;
  let body = "";
  groups.forEach((g, i) => {
    if (!g.rows.length) return;
    const table = renderListTable(cols, g.rows.map(cell));
    if (!g.label) { body += table; return; }
    const pcs = g.rows.reduce((a, r) => a + r.qty, 0);
    const mini = sheets ? `<div class="grp-mini">${esc(h.order_no)} · ${esc(h.customer)} · แผ่น ${i + 1}/${groups.length}</div>` : "";
    body += `<div class="grp-head${sheets && i > 0 ? " grp-break" : ""}">${mini}<div class="grp-line"><span class="grp-name">${esc(g.label)}</span><span class="grp-sum">${fmt(g.rows.length)} รายการ · ${fmt(pcs)} ชิ้น</span></div></div>${table}`;
  });
  if (!rows.length) body = `<div class="wb-empty">ไม่มีรายการในขั้นที่เลือก — เปิดขั้นเพิ่มที่แผงตั้งค่า “พิมพ์ขั้นไหนบ้าง”</div>`;
  if (s.signature) body += signatureHtml(["ผู้ตรวจนับ", "หัวหน้าผลิต", "ผู้คีย์เข้าระบบ"]);

  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: SO_STATUS_CSS + listPrintCss(s),
  };
  return {
    html: buildReportHtml(tpl, { header: head, body: summary + warnHtml + legend + body }, soStatusFileName(h.order_no)),
    title, groupCounts: groups.map((g) => g.rows.length + (g.label ? 1 : 0)).filter((n) => n > 0).concat(rows.length ? [] : [0]), count: rows.length,
  };
}

const SO_STATUS_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 2.5mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 0.92em; color: #4b5563; margin-top: 0.6mm; }
.wb-no { text-align: right; font-size: 0.9em; color: #6b7280; white-space: nowrap; }
.chkr { margin-top: 2mm; line-height: 2.1; color: #374151; }
.chkr .wl { display: inline-block; width: 34mm; border-bottom: 1px dotted #6b7280; }
.sum-sub { font-size: 0.6em; font-weight: 400; color: #64748b; }
.so-warn { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 1mm; padding: 1.5mm 2.5mm; margin: 0 0 3mm; break-inside: avoid; }
.so-warn ul { margin: 0.5mm 0 0; padding-left: 4.5mm; }
.so-warn li { margin: 0.3mm 0; }
.so-legend { font-size: 0.9em; color: #475569; margin: 0 0 1.5mm; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t th.c { text-align: center; }
.wb-t td.c { white-space: nowrap; }
.wb-t td.r, .wb-t th.r { text-align: right; white-space: nowrap; }
.wb-t tbody tr { break-inside: avoid; page-break-inside: avoid; }
.wb-t thead { display: table-header-group; }
.mono { font-family: ui-monospace, monospace; }
.wb-t .sub { font-size: 0.85em; color: #64748b; font-weight: 400; }
.wb-t .flag { font-size: 0.85em; color: #b45309; font-weight: 700; margin-top: 0.4mm; }
.warn { color: #b45309; }
td.img, th.img { text-align: center; }
.thumb { object-fit: cover; border: 1px solid #e2e8f0; border-radius: 3px; display: block; margin: 0 auto; }
.no-img { color: #cbd5e1; }
.stc { display: inline-flex; align-items: center; gap: 1mm; }
.sdot { display: inline-block; width: 3mm; height: 3mm; border-radius: 50%; background: #111827; vertical-align: middle; }
.grp-head { margin: 3mm 0 0; break-after: avoid; page-break-after: avoid; }
.grp-mini { font-size: 0.85em; color: #6b7280; margin-bottom: 0.8mm; }
.grp-line { display: flex; justify-content: space-between; align-items: center; gap: 3mm; background: #eef2ff; border: 1px solid #c7d2fe; border-bottom: 0; border-radius: 1mm 1mm 0 0; padding: 1.2mm 2.5mm; }
.grp-name { font-weight: 800; }
.grp-sum { font-size: 0.92em; color: #4338ca; font-weight: 700; white-space: nowrap; }
.wb-empty { padding: 10mm 0; text-align: center; color: #94a3b8; }
`;
