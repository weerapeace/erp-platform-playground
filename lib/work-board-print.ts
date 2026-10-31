/**
 * ใบพิมพ์บอร์ดจ่ายงาน (/print/work-board) — สร้าง HTML จากข้อมูลบอร์ด + ค่าตั้งหน้าพิมพ์กลาง (lib/list-print)
 *   type=pending     รายการรอจ่าย (+ งานเหมารอจ่าย)
 *   type=piece       งานเหมารอจ่าย
 *   type=production  กำลังผลิต แยกตามโต๊ะ/ช่าง
 *   type=plan        จ่ายงานตามแผน (ร่าง) แยกตามโต๊ะ
 *   type=all         ทั้งหมดในใบเดียว
 * pure (ไม่มี "use client") → เทสต์ได้ lib/__tests__/work-board-print.test.ts · หน้าพิมพ์แค่โหลดข้อมูล + แผงตั้งค่า
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { docFileName } from "@/lib/print-filename";
import {
  escapeHtml as esc, listPrintCss, renderListTable, resolveListColumns, signatureHtml,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";
import type { DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

export type WorkBoardPrintType = "pending" | "piece" | "production" | "plan" | "all";
type Labor = { prod_plan: number; prod_actual: number; piece_plan: number; piece_actual: number };
export type PlanResp = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; lines: DispatchPlanLine[] };
export type AssigneeResp = { craftsmen: { id: string; name: string; nickname?: string | null; department_id?: string | null }[]; dept_wages: Record<string, number> };
export type PendingMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null; internal_due_date?: string | null; order_date?: string | null;
  brand: string | null; image_url: string | null; labor?: Labor; central_rate?: number;
};
export type PendingPiece = { id: string; mo_no: string; job_name: string; rate: number; qty: number; product_sku: string | null; product_name: string | null; image_url: string | null };
export type WorkOrder = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; product_name: string | null;
  stage: string; assignee_name: string | null; assignee_id?: string | null; department_name: string | null;
  qty: number; status: string; labor_cost?: number | null; image_url?: string | null; central_rate?: number;
  due_date?: string | null;
};
export type BoardResp = { departments: { id: string; name: string }[]; workOrders: WorkOrder[]; pending: PendingMO[]; pending_piece: PendingPiece[] };
export type MoGroup = { name: string; mo_nos: string[] };
export type PrintCompany = { id: string; name: string; logo_key: string | null };

export const WORK_BOARD_PRINT_TITLE: Record<WorkBoardPrintType, string> = {
  pending: "รายการรอจ่ายทั้งหมด",
  piece: "รายการรอจ่ายเหมาทั้งหมด",
  production: "รายการกำลังผลิต — แยกตามโต๊ะ/ช่าง",
  plan: "รายการจ่ายงานตามแผน",
  all: "สรุปงานทั้งหมดบนบอร์ด",
};

// ── คอลัมน์ ──
const C: Record<string, ListPrintColumn> = {
  img: { key: "img", label: "รูป", align: "center" },
  assignee: { key: "assignee", label: "ช่าง" },
  mo: { key: "mo", label: "รหัส MO", mono: true },
  job: { key: "job", label: "งาน (เหมา)" },
  sku: { key: "sku", label: "SKU", mono: true },
  name: { key: "name", label: "ชื่อสินค้า" },
  due: { key: "due", label: "กำหนดส่ง", align: "right" },
  qty: { key: "qty", label: "จำนวน", align: "right" },
  rate: { key: "rate", label: "ค่าแรง/ชิ้น", align: "right" },
  labor: { key: "labor", label: "ยอดรวม", align: "right" },
};
const cols = (...keys: string[]) => keys.map((k) => C[k]);
const PENDING_COLS = [C.img, C.mo, C.sku, C.name, C.due, { ...C.qty, label: "เหลือจ่าย" }, C.rate, C.labor];
const PIECE_COLS = cols("img", "mo", "job", "sku", "name", "qty", "rate", "labor");
const PRODUCTION_COLS = cols("img", "mo", "sku", "name", "assignee", "due", "qty", "rate", "labor");
const PLAN_COLS = [...cols("img", "assignee", "mo", "sku", "name", "due", "qty"), { ...C.labor, label: "ค่าแรง" }];

/** คอลัมน์ที่เลือกได้ในแผงตั้งค่า ต่อชนิดใบ */
export function workBoardPrintColumns(type: WorkBoardPrintType): ListPrintColumn[] {
  if (type === "piece") return PIECE_COLS;
  if (type === "production") return PRODUCTION_COLS;
  if (type === "plan") return PLAN_COLS;
  if (type === "pending") return [C.img, C.mo, C.job, C.sku, C.name, C.due, { ...C.qty, label: "เหลือจ่าย" }, C.rate, C.labor];
  return cols("img", "assignee", "mo", "job", "sku", "name", "due", "qty", "rate", "labor");
}

export const WORK_BOARD_SORTS: { value: string; label: string }[] = [
  { value: "opened", label: "วันที่เปิดใบงาน" },
  { value: "due", label: "กำหนดส่ง" },
  { value: "name", label: "ชื่อสินค้า" },
  { value: "sku", label: "รหัส SKU" },
  { value: "qty", label: "จำนวน (มาก→น้อย)" },
];
/** ใบแยกโต๊ะ (กำลังผลิต/แผน) จัดกลุ่มตามโต๊ะเสมอ — ใบอื่นเลือกได้ */
export function workBoardPrintGroups(type: WorkBoardPrintType): { value: string; label: string }[] {
  if (type === "production" || type === "plan") return [{ value: "", label: "แยกตามโต๊ะ/ช่าง (ใบนี้แยกเสมอ)" }];
  return [{ value: "", label: "ไม่จัดกลุ่ม" }, { value: "brand", label: "แบรนด์" }, { value: "mo_group", label: "กลุ่มใบสั่งผลิต" }];
}

/** แบบสำเร็จรูป (กดทีเดียวเปลี่ยนทั้งชุด) */
export const WORK_BOARD_PRINT_PRESETS: ListPrintPreset[] = [
  { id: "sys-check", name: "ใบเช็กของ (รูปใหญ่)", settings: { image: "l", density: "normal", fontPx: 12, zebra: false, signature: false, groupBy: "",
    columns: ["img", "mo", "sku", "name", "qty", "x_check"].map((key) => ({ key, on: true })) } },
  { id: "sys-short", name: "ใบสรุปย่อ (ไม่มีรูป)", settings: { image: "none", density: "compact", fontPx: 10, zebra: true, signature: false, groupBy: "",
    columns: ["mo", "sku", "name", "due", "qty"].map((key) => ({ key, on: true })) } },
  { id: "sys-dispatch", name: "ใบจ่ายงาน (มีช่องเซ็น)", settings: { image: "s", density: "normal", fontPx: 11, zebra: false, signature: true, groupBy: "brand",
    columns: ["img", "assignee", "sku", "name", "qty", "rate", "labor", "x_sign"].map((key) => ({ key, on: true })) } },
];

// ── ตัวช่วยแสดงผล ──
const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const money = (n: number) => (Math.round(n * 100) / 100 === 0 ? "0" : (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }));
const dueText = (d: string | null | undefined) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const BLANK = `<span class="blank"></span>`;
export const groupLabelOf = (group: string) => (!group || group === "__all__" ? "ทั้งหมด" : group === "__none__" ? "ยังไม่จับกลุ่ม" : group);

const COMMON_CSS = `
.doc { color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; white-space: nowrap; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t td.r, .wb-t th.r { text-align: right; white-space: nowrap; }
.wb-t .mono { font-family: ui-monospace, monospace; color: #475569; white-space: nowrap; }
td.img, th.img { text-align: center; }
.thumb { object-fit: cover; border: 1px solid #e2e8f0; border-radius: 3px; display: block; margin: 0 auto; }
.no-img { color: #cbd5e1; }
.wb-t tfoot td { background: #f8fafc; font-weight: 800; }
.blank { display: inline-block; width: 16mm; height: 4.5mm; border: 1px solid #94a3b8; border-radius: 2px; }
.wb-note { font-size: 9.5px; color: #94a3b8; margin-top: 2mm; }
.wb-sec { font-size: 12px; font-weight: 800; margin: 4mm 0 1.5mm; }
.grp-head { display: flex; justify-content: space-between; align-items: center; gap: 3mm; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 3px; padding: 1.5mm 2.5mm; margin: 3mm 0 0; break-after: avoid; page-break-after: avoid; }
.grp-name { font-size: 12px; font-weight: 800; }
.grp-staff { font-size: 9.5px; font-weight: 400; color: #475569; margin-top: 0.5mm; }
.grp-sum { font-size: 10.5px; color: #4338ca; font-weight: 700; white-space: nowrap; }
.grp-total { margin-top: 4mm; background: #f1f5f9; border-color: #cbd5e1; }
.grp-total .grp-sum { color: #334155; }
.wb-empty { text-align: center; color: #94a3b8; padding: 12mm 0; font-size: 12px; }`;

export interface WorkBoardPrintInput {
  type: WorkBoardPrintType;
  group: string;
  board: BoardResp;
  moGroups: MoGroup[];
  plan: PlanResp | null;
  assignees: AssigneeResp;
  settings: ListPrintSettings;
  /** origin ของเว็บ — รูปใช้ URL เต็ม (หน้าต่างพิมพ์/iframe srcDoc resolve path สั้นผิด) */
  origin: string;
  company: PrintCompany | null;
  printedAt: string;
}
export interface WorkBoardPrintResult {
  html: string;
  title: string;
  /** จำนวนแถวต่อก้อนตาราง (ไว้ประมาณจำนวนหน้า) */
  groupCounts: number[];
}

type Section = { html: string; counts: number[] };
type Group<T> = { key: string; rows: T[] };

export function buildWorkBoardPrint(input: WorkBoardPrintInput): WorkBoardPrintResult {
  const { type, group, board, moGroups, plan, assignees, settings: s, origin } = input;
  const title = s.title.trim() || WORK_BOARD_PRINT_TITLE[type];

  // ── แผนที่ข้อมูลกลาง (ประกาศก่อนใช้ทุกส่วน — เดิมใบ "ทั้งหมด" เรียกก่อนประกาศ ทำให้หน้าพัง) ──
  const groupOfMo = new Map<string, string>();
  for (const g of moGroups) for (const no of g.mo_nos) if (!groupOfMo.has(no)) groupOfMo.set(no, g.name);
  const groupOk = (moNo: string) =>
    group === "__all__" || !group ? true : group === "__none__" ? !groupOfMo.has(moNo) : groupOfMo.get(moNo) === group;
  const dueByMo = new Map<string, string | null>();
  const openedByMo = new Map<string, string>();
  const brandByMo = new Map<string, string>();
  for (const m of board.pending) {
    dueByMo.set(m.mo_no, m.internal_due_date ?? m.due_date ?? null);   // วันส่งภายในก่อน (กรอกไว้มากกว่า) แล้วค่อยวันส่งลูกค้า
    openedByMo.set(m.mo_no, (m.order_date ?? "") || m.mo_no);
    if (m.brand) brandByMo.set(m.mo_no, m.brand);
  }
  for (const w of board.workOrders) {
    if (!dueByMo.has(w.mo_no)) dueByMo.set(w.mo_no, w.due_date ?? null);
    if (!openedByMo.has(w.mo_no)) openedByMo.set(w.mo_no, w.mo_no);
  }
  const thumb = (url: string | null) => (url ? `${url.startsWith("/") ? origin : ""}${url}${url.includes("?") ? "&" : "?"}w=120` : "");
  const imgCell = (url: string | null | undefined) => (url ? `<img class="thumb" src="${esc(thumb(url))}" alt="" />` : `<span class="no-img">—</span>`);

  type SortKey = { moNo: string | null; name: string | null; sku: string | null; qty: number };
  const sortRows = <T,>(rows: T[], get: (r: T) => SortKey): T[] =>
    [...rows].sort((a, b) => {
      const A = get(a), B = get(b);
      if (s.sortBy === "qty") return B.qty - A.qty;
      if (s.sortBy === "name") return (A.name ?? "").localeCompare(B.name ?? "", "th");
      if (s.sortBy === "sku") return (A.sku ?? "").localeCompare(B.sku ?? "", "th");
      if (s.sortBy === "due") return (dueByMo.get(A.moNo ?? "") ?? "9999").localeCompare(dueByMo.get(B.moNo ?? "") ?? "9999");
      return (openedByMo.get(A.moNo ?? "") ?? "zzz").localeCompare(openedByMo.get(B.moNo ?? "") ?? "zzz");
    });
  const groupKeyOf = (moNo: string) =>
    s.groupBy === "brand" ? brandByMo.get(moNo) ?? "ไม่ระบุแบรนด์" : s.groupBy === "mo_group" ? groupOfMo.get(moNo) ?? "ยังไม่จับกลุ่ม" : "";
  const splitGroups = <T,>(rows: T[], moOf: (r: T) => string): Group<T>[] => {
    if (!s.groupBy) return [{ key: "", rows }];
    const map = new Map<string, T[]>();
    for (const r of rows) { const k = groupKeyOf(moOf(r)); map.set(k, [...(map.get(k) ?? []), r]); }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")).map(([key, list]) => ({ key, rows: list }));
  };
  let tableNo = 0;   // ขึ้นหน้าใหม่ทุกกลุ่ม: กลุ่มแรกของเอกสารไม่ต้องขึ้นหน้าใหม่
  const grpHead = (name: string, sum: string, staff = "") =>
    `<div class="grp-head${s.pageBreakPerGroup && tableNo++ > 0 ? " grp-break" : ""}"><div><span class="grp-name">${esc(name)}</span>${staff}</div><span class="grp-sum">${esc(sum)}</span></div>`;

  // พนักงานในโต๊ะ (ชื่อเล่น + เงินเดือนรวม) → หัวโต๊ะในใบแผน/กำลังผลิต
  const deptIdByName = new Map(board.departments.map((d) => [d.name, d.id]));
  const namesByDept = new Map<string, string[]>();
  for (const c of assignees.craftsmen) if (c.department_id) namesByDept.set(c.department_id, [...(namesByDept.get(c.department_id) ?? []), c.nickname || c.name]);
  const staffHtml = (dept: string) => {
    if (/เหมา/.test(dept)) return "";
    const id = deptIdByName.get(dept); if (!id) return "";
    const names = namesByDept.get(id) ?? []; const wage = assignees.dept_wages[id] ?? 0;
    if (names.length === 0 && wage === 0) return "";
    return `<div class="grp-staff">พนักงาน ${names.length} คน${names.length ? ": " + esc(names.join(", ")) : ""}${wage > 0 ? ` · เงินเดือนรวม ฿${money(wage)}` : ""}</div>`;
  };
  const nickById = new Map<string, string>();
  for (const c of assignees.craftsmen) if (c.nickname) nickById.set(c.id, c.nickname);
  const shortAssignee = (name: string | null | undefined, id: string | null | undefined) => {
    const byId = id ? nickById.get(id) : null; if (byId) return byId;
    if (!name) return ""; const m = name.match(/\(([^)]+)\)/); return m ? m[1] : name;
  };
  const laborPerPiece = (m: PendingMO) => (m.central_rate && m.central_rate > 0 ? m.central_rate : m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0);

  // ── ส่วน: รอจ่าย ──
  const pendingSection = (): Section => {
    const list = sortRows(board.pending.filter((m) => groupOk(m.mo_no)), (m) => ({ moNo: m.mo_no, name: m.product_name, sku: m.product_sku, qty: m.remaining }));
    if (list.length === 0) return { html: "", counts: [] };
    const colsOf = resolveListColumns(s, PENDING_COLS);
    const groups = splitGroups(list, (m) => m.mo_no);
    let gQty = 0, gLabor = 0;
    const html = groups.map((g) => {
      let qty = 0, labor = 0;
      const rows = g.rows.map((m) => {
        const pp = laborPerPiece(m); const has = pp > 0; const total = has ? pp * m.remaining : 0;
        qty += m.remaining; if (has) labor += total;
        return { img: imgCell(m.image_url), mo: esc(m.mo_no), sku: esc(m.product_sku || "—"), name: esc(m.product_name || "—"),
          due: esc(dueText(dueByMo.get(m.mo_no))), qty: num(m.remaining), rate: has ? money(pp) : BLANK, labor: has ? money(total) : BLANK };
      });
      gQty += qty; gLabor += labor;
      const head = g.key ? grpHead(g.key, `${g.rows.length} รายการ · ${num(qty)} ชิ้น · ฿${money(labor)}`) : "";
      return head + renderListTable(colsOf, rows, { label: `รวม ${g.rows.length} รายการ`, cells: { qty: num(qty), rate: "", labor: money(labor) } });
    }).join("");
    const total = groups.length > 1 ? `<div class="grp-head grp-total"><span class="grp-name">รวมรอจ่ายทั้งหมด</span><span class="grp-sum">${list.length} รายการ · ${num(gQty)} ชิ้น · ฿${money(gLabor)}</span></div>` : "";
    return { html: html + total + `<div class="wb-note">ช่องว่าง = ยังไม่ตั้งค่าแรง · เขียนกรอกด้วยมือ (ยอดรวมนับเฉพาะรายการที่มีค่าแรงแล้ว)</div>`, counts: groups.map((g) => g.rows.length) };
  };

  // ── ส่วน: งานเหมารอจ่าย ──
  const pieceSection = (): Section & { grand: number; count: number } => {
    const list = sortRows(board.pending_piece.filter((p) => groupOk(p.mo_no)), (p) => ({ moNo: p.mo_no, name: p.product_name, sku: p.product_sku, qty: p.qty }));
    if (list.length === 0) return { html: "", counts: [], grand: 0, count: 0 };
    const colsOf = resolveListColumns(s, PIECE_COLS);
    const groups = splitGroups(list, (p) => p.mo_no);
    let grand = 0;
    const html = groups.map((g) => {
      let sum = 0;
      const rows = g.rows.map((p) => {
        const t = p.rate * p.qty; sum += t;
        return { img: imgCell(p.image_url), mo: esc(p.mo_no), job: esc(p.job_name), sku: esc(p.product_sku || "—"), name: esc(p.product_name || "—"),
          qty: num(p.qty), rate: money(p.rate), labor: money(t), due: esc(dueText(dueByMo.get(p.mo_no))) };
      });
      grand += sum;
      const head = g.key ? grpHead(g.key, `${g.rows.length} รายการ · ฿${money(sum)}`) : "";
      return head + renderListTable(colsOf, rows, { label: `รวม ${g.rows.length} รายการ`, cells: { labor: money(sum) } });
    }).join("");
    return { html, counts: groups.map((g) => g.rows.length), grand, count: list.length };
  };

  // ── ส่วน: กำลังผลิต (แยกโต๊ะ) ──
  const productionSection = (): Section & { qty: number; labor: number; count: number } => {
    const wos = board.workOrders.filter((w) => w.status !== "done" && w.stage !== "cut" && groupOk(w.mo_no));
    const byDept = new Map<string, WorkOrder[]>();
    for (const w of wos) { const k = w.department_name || "— ไม่ระบุโต๊ะ —"; byDept.set(k, [...(byDept.get(k) ?? []), w]); }
    const colsOf = resolveListColumns(s, PRODUCTION_COLS);
    let tQty = 0, tLabor = 0;
    const counts: number[] = [];
    const html = [...byDept.entries()].map(([dept, list]) => {
      const gQty = list.reduce((a, w) => a + (w.qty || 0), 0);
      const gLabor = list.reduce((a, w) => a + (w.labor_cost || 0), 0);
      tQty += gQty; tLabor += gLabor; counts.push(list.length);
      const rows = sortRows(list, (w) => ({ moNo: w.mo_no, name: w.product_name, sku: w.product_sku, qty: w.qty || 0 })).map((w) => {
        const qty = w.qty || 0;
        const total = w.labor_cost != null && w.labor_cost > 0 ? w.labor_cost : 0;
        const pp = total > 0 && qty > 0 ? total / qty : 0;   // ค่าแรง/ชิ้นจริง = ยอดใบจ่ายงาน ÷ จำนวน
        return { img: imgCell(w.image_url), mo: esc(w.mo_no), assignee: esc(shortAssignee(w.assignee_name, w.assignee_id) || w.department_name || "—"),
          sku: esc(w.product_sku || "—"), name: esc(w.product_name || "—"), due: esc(dueText(dueByMo.get(w.mo_no))),
          qty: num(qty), rate: pp > 0 ? money(pp) : BLANK, labor: total > 0 ? money(total) : BLANK };
      });
      return grpHead(dept, `${num(gQty)} ชิ้น · ฿${money(gLabor)}`, staffHtml(dept))
        + renderListTable(colsOf, rows, { label: `รวม ${list.length} รายการ`, cells: { qty: num(gQty), rate: "", labor: money(gLabor) } });
    }).join("");
    return { html, counts, qty: tQty, labor: tLabor, count: wos.length };
  };

  // ── ส่วน: แผนจ่ายงาน (แยกโต๊ะ) ──
  const planSection = (p: PlanResp): Section & { qty: number; labor: number } => {
    const imgBySku = new Map<string, string | null>();
    for (const m of board.pending) if (m.product_sku) imgBySku.set(m.product_sku, m.image_url);
    for (const w of board.workOrders) if (w.product_sku && !imgBySku.has(w.product_sku)) imgBySku.set(w.product_sku, w.image_url ?? null);
    for (const x of board.pending_piece) if (x.product_sku && !imgBySku.has(x.product_sku)) imgBySku.set(x.product_sku, x.image_url);
    const rateByMo = new Map<string, number>();
    for (const m of board.pending) { const r = laborPerPiece(m); if (r > 0) rateByMo.set(m.mo_no, r); }
    for (const w of board.workOrders) if (!rateByMo.has(w.mo_no) && w.central_rate && w.central_rate > 0) rateByMo.set(w.mo_no, w.central_rate);
    const deptOrder = new Map(board.departments.map((d, i) => [d.name, i]));
    const byDept = new Map<string, DispatchPlanLine[]>();
    for (const l of p.lines) { const k = l.department_name || "— ยังไม่จัดโต๊ะ —"; byDept.set(k, [...(byDept.get(k) ?? []), l]); }
    const colsOf = resolveListColumns(s, PLAN_COLS);
    let tQty = 0, tLabor = 0;
    const counts: number[] = [];
    const html = [...byDept.entries()].sort((a, b) => (deptOrder.get(a[0]) ?? 999) - (deptOrder.get(b[0]) ?? 999)).map(([dept, list]) => {
      let gQty = 0, gLabor = 0;
      const rows = sortRows(list, (l) => ({ moNo: l.mo_no, name: l.product_name, sku: l.product_sku, qty: l.qty || 0 })).map((l) => {
        const rate = l.mo_no ? rateByMo.get(l.mo_no) ?? 0 : 0; const qty = l.qty || 0; const labor = rate > 0 ? rate * qty : 0;
        gQty += qty; if (labor > 0) gLabor += labor;
        return { img: imgCell(l.product_sku ? imgBySku.get(l.product_sku) ?? null : null), assignee: esc(shortAssignee(l.assignee_name, l.assignee_id) || "(ทั้งโต๊ะ)"),
          mo: esc(l.mo_no || "—"), sku: esc(l.product_sku || "—"), name: esc(l.product_name || "—"), due: esc(dueText(dueByMo.get(l.mo_no ?? ""))),
          qty: num(qty), labor: rate > 0 ? money(labor) : BLANK };
      });
      tQty += gQty; tLabor += gLabor; counts.push(list.length);
      return grpHead(dept, `${num(gQty)} ชิ้น · ฿${money(gLabor)}`, staffHtml(dept))
        + renderListTable(colsOf, rows, { label: `รวม ${list.length} รายการ`, cells: { qty: num(gQty), labor: money(gLabor) } });
    }).join("");
    return { html, counts, qty: tQty, labor: tLabor };
  };

  const empty = (text: string) => `<div class="wb-empty">${esc(text)}</div>`;
  const sec = (text: string) => `<div class="wb-sec">${esc(text)}</div>`;
  const totalHead = (name: string, qty: number, labor: number) =>
    `<div class="grp-head grp-total"><span class="grp-name">${esc(name)}</span><span class="grp-sum">${num(qty)} ชิ้น · ฿${money(labor)}</span></div>`;

  let sub = `กลุ่ม: ${groupLabelOf(group)}`;
  let body = "";
  const counts: number[] = [];
  if (type === "pending") {
    const pd = pendingSection(); const pc = pieceSection();
    sub += ` · ${board.pending.filter((m) => groupOk(m.mo_no)).length} รายการ`;
    body = (pd.html || empty("ไม่มีรายการรอจ่าย")) + (pc.html ? sec("งานเหมารอจ่าย") + pc.html : "");
    counts.push(...pd.counts, ...pc.counts);
  } else if (type === "piece") {
    const pc = pieceSection();
    sub += ` · ${pc.count} รายการ`;
    body = pc.html || empty("ไม่มีงานเหมารอจ่าย");
    counts.push(...pc.counts);
  } else if (type === "production") {
    const pr = productionSection();
    sub = `${groupLabelOf(group)} · ${pr.counts.length} โต๊ะ · ${num(pr.qty)} ชิ้น`;
    body = pr.html ? pr.html + totalHead("รวมทั้งหมด", pr.qty, pr.labor) + `<div class="wb-note">ช่องว่าง = ยังไม่ใส่ค่าแรงของใบจ่ายงานนั้น (เขียนกรอกด้วยมือได้) · ค่าแรง/ชิ้น = ยอดรวม ÷ จำนวน</div>` : empty("ไม่มีงานกำลังผลิต");
    counts.push(...pr.counts);
  } else if (type === "plan") {
    if (!plan) return { html: "", title, groupCounts: [] };
    const pl = planSection(plan);
    const range = plan.start_date || plan.end_date ? `${dueText(plan.start_date)} – ${dueText(plan.end_date)}` : "ทั้งแผน";
    sub = `แผน: ${plan.name} · ${range} · ${plan.lines.length} รายการ`;
    body = pl.html ? pl.html + totalHead("รวมทั้งหมด", pl.qty, pl.labor) + `<div class="wb-note">ช่องว่างค่าแรง = ยังไม่ตั้งค่าแรงต่อชิ้น (เขียนกรอกด้วยมือ)</div>` : empty("แผนนี้ยังไม่มีรายการจ่าย");
    counts.push(...pl.counts);
  } else {
    const pd = pendingSection(); const pc = pieceSection(); const pr = productionSection();
    sub += ` · รอจ่าย ${board.pending.filter((m) => groupOk(m.mo_no)).length} · เหมา ${pc.count} · กำลังผลิต ${pr.count} รายการ`;
    body = sec("1) รายการรอจ่าย") + (pd.html || empty("ไม่มีรายการรอจ่าย"))
      + sec("2) งานเหมารอจ่าย") + (pc.html || empty("ไม่มีงานเหมารอจ่าย"))
      + sec("3) กำลังผลิต (แยกตามโต๊ะ/ช่าง)") + (pr.html ? pr.html + totalHead("รวมกำลังผลิต", pr.qty, pr.labor) : empty("ไม่มีงานกำลังผลิต"));
    counts.push(...pd.counts, ...pc.counts, ...pr.counts);
  }
  const sortLabel = WORK_BOARD_SORTS.find((x) => x.value === s.sortBy)?.label;
  if (sortLabel) sub += ` · เรียงตาม${sortLabel}`;

  const co = input.company;
  const coHtml = co
    ? `<div class="wb-co">${co.logo_key ? `<img class="wb-logo" src="${esc(`${origin}/api/r2-image?key=${encodeURIComponent(co.logo_key)}&w=300`)}" alt="" />` : ""}<div class="wb-co-name">${esc(co.name)}</div></div>`
    : "";
  const header = `<div class="wb-head"><div>${coHtml}<div class="wb-title">${esc(title)}</div><div class="wb-sub">${esc(sub)}</div></div>`
    + `<div class="wb-no">บอร์ดจ่ายงาน<br/>พิมพ์ ${esc(input.printedAt)}</div></div>`;
  if (s.signature) body += signatureHtml(type === "production" ? ["ผู้ตรวจ", "หัวหน้าโต๊ะ"] : ["ผู้จ่ายงาน", "ผู้รับงาน"]);

  const tpl: ReportTemplate = {
    paper_size: s.paper, orientation: s.orientation,
    header_html: "{{{header}}}", body_html: "{{{body}}}", footer_html: "",
    custom_css: COMMON_CSS + listPrintCss(s),
  };
  return { html: buildReportHtml(tpl, { header, body }, docFileName(title, input.printedAt.replace(/\//g, "-"))), title, groupCounts: counts.length ? counts : [0] };
}
