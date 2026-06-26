"use client";

/**
 * พิมพ์รายงานจากบอร์ดจ่ายงาน — /print/work-board?type=pending|production&group=<ชื่อกลุ่ม>
 *   type=pending     → รายการรอจ่ายทั้งหมด (งานปกติ + งานเหมา) พร้อมค่าแรง/ชิ้น · ตัวที่ยังไม่ตั้งค่าแรง = ช่องว่างให้กรอกมือ
 *   type=production  → รายการกำลังผลิต แยกตามโต๊ะ/ช่าง (หัวโต๊ะมีสรุปจำนวน+ค่าแรง)
 *   group            → กรองตามกลุ่มใบสั่งผลิต (__all__ = ทั้งหมด, __none__ = ยังไม่จับกลุ่ม)
 * ของกลาง: ระบบพิมพ์ (buildReportHtml + PrintFrame) · ดึง /api/mo/work-board ตัวเดียวกับบอร์ด
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

type Labor = { prod_plan: number; prod_actual: number; piece_plan: number; piece_actual: number };
type PlanResp = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; lines: DispatchPlanLine[] };
type AssigneeResp = { craftsmen: { id: string; name: string; nickname?: string | null; department_id?: string | null }[]; dept_wages: Record<string, number> };
type PendingMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null;
  brand: string | null; image_url: string | null; labor?: Labor; central_rate?: number;
};
type PendingPiece = { id: string; mo_no: string; job_name: string; rate: number; qty: number; product_sku: string | null; product_name: string | null; image_url: string | null };
type WorkOrder = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; product_name: string | null;
  stage: string; assignee_name: string | null; assignee_id?: string | null; department_name: string | null;
  qty: number; status: string; labor_cost?: number | null; image_url?: string | null; central_rate?: number;
};
type BoardResp = { departments: { id: string; name: string }[]; workOrders: WorkOrder[]; pending: PendingMO[]; pending_piece: PendingPiece[] };

const FMT_OPT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const money = (n: number) => Math.round(n * 100) / 100 === 0 ? "0" : (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const dueText = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const BLANK = `<span class="blank"></span>`;
// ใส่ origin เต็ม + ย่อรูป — กัน path สั้น /api/... resolve ผิดฐานในหน้าต่าง Blob / iframe srcDoc (รูปไม่ขึ้น)
const ORIGIN = () => (typeof window !== "undefined" ? window.location.origin : "");
const thumb = (url: string | null) => (url ? `${url.startsWith("/") ? ORIGIN() : ""}${url}${url.includes("?") ? "&" : "?"}w=120` : "");
const imgCell = (url: string | null) => (url ? `<img class="thumb" src="${thumb(url)}" alt="" />` : `<span class="no-img">—</span>`);

const COMMON_CSS = `
.doc { font-size: 11px; color: #111827; }
.wb-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.wb-title { font-size: 18px; font-weight: 800; }
.wb-sub { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.wb-no { text-align: right; font-size: 10px; color: #6b7280; }
.wb-t { width: 100%; border-collapse: collapse; }
.wb-t th, .wb-t td { border: 1px solid #cbd5e1; padding: 1.4mm 2mm; font-size: 10.5px; vertical-align: top; }
.wb-t th { background: #f1f5f9; font-weight: 700; text-align: left; }
.wb-t td.r, .wb-t th.r { text-align: right; white-space: nowrap; }
.wb-t .mono { font-family: ui-monospace, monospace; color: #475569; white-space: nowrap; }
td.img, th.img { width: 15mm; text-align: center; padding: 1mm; }
.thumb { width: 13mm; height: 13mm; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 3px; display: block; margin: 0 auto; }
.no-img { color: #cbd5e1; }
.wb-t tfoot td { background: #f8fafc; font-weight: 800; }
.blank { display: inline-block; width: 16mm; height: 4.5mm; border: 1px solid #94a3b8; border-radius: 2px; }
.wb-note { font-size: 9.5px; color: #94a3b8; margin-top: 2mm; }
.wb-sec { font-size: 12px; font-weight: 800; margin: 4mm 0 1.5mm; }
.grp-head { display: flex; justify-content: space-between; align-items: center; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 3px; padding: 1.5mm 2.5mm; margin: 3mm 0 0; }
.grp-name { font-size: 12px; font-weight: 800; }
.grp-staff { font-size: 9.5px; font-weight: 400; color: #475569; margin-top: 0.5mm; }
.grp-sum { font-size: 10.5px; color: #4338ca; font-weight: 700; }
.grp-rows { width: 100%; border-collapse: collapse; margin-top: 0; }
.grp-rows th, .grp-rows td { border: 1px solid #cbd5e1; border-top: none; padding: 1.3mm 2mm; font-size: 10.5px; }
.grp-rows th { background: #f8fafc; font-weight: 700; text-align: left; }
.grp-rows td.r, .grp-rows th.r { text-align: right; white-space: nowrap; }
.wb-empty { text-align: center; color: #94a3b8; padding: 12mm 0; font-size: 12px; }
@media print { .doc { padding: 12mm 12mm !important; } }`;

const TEMPLATE_PENDING: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="wb-head">
    <div><div class="wb-title">รายการรอจ่ายทั้งหมด</div><div class="wb-sub">กลุ่ม: {{group_label}} · {{count}} รายการ</div></div>
    <div class="wb-no">บอร์ดจ่ายงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#has_rows}}<table class="wb-t">
    <thead><tr><th class="img">รูป</th><th>รหัส MO</th><th>SKU</th><th>ชื่อสินค้า</th><th class="r">กำหนดส่ง</th><th class="r">เหลือจ่าย</th><th class="r">ค่าแรง/ชิ้น</th><th class="r">ยอดรวม</th></tr></thead>
    <tbody>{{#rows}}<tr><td class="img">{{{img_cell}}}</td><td class="mono">{{mo_no}}</td><td class="mono">{{sku}}</td><td>{{name}}</td><td class="r">{{due}}</td><td class="r">{{remaining}}</td><td class="r">{{{rate_cell}}}</td><td class="r">{{{total_cell}}}</td></tr>{{/rows}}</tbody>
    <tfoot><tr><td colspan="5">รวม {{count}} รายการ</td><td class="r">{{total_qty}}</td><td class="r"></td><td class="r">{{grand_total}}</td></tr></tfoot>
  </table>
  <div class="wb-note">ช่องว่าง = ยังไม่ตั้งค่าแรง · เขียนกรอกด้วยมือ (ยอดรวมด้านล่างนับเฉพาะรายการที่มีค่าแรงแล้ว)</div>{{/has_rows}}
  {{#has_piece}}<div class="wb-sec">งานเหมารอจ่าย</div>
  <table class="wb-t">
    <thead><tr><th class="img">รูป</th><th>รหัส MO</th><th>งาน</th><th>SKU</th><th>ชื่อสินค้า</th><th class="r">จำนวน</th><th class="r">ค่าแรง/ชิ้น</th><th class="r">ยอดรวม</th></tr></thead>
    <tbody>{{#piece_rows}}<tr><td class="img">{{{img_cell}}}</td><td class="mono">{{mo_no}}</td><td>{{job}}</td><td class="mono">{{sku}}</td><td>{{name}}</td><td class="r">{{qty}}</td><td class="r">{{rate}}</td><td class="r">{{total}}</td></tr>{{/piece_rows}}</tbody>
    <tfoot><tr><td colspan="7">รวมงานเหมา {{piece_count}} รายการ</td><td class="r">{{piece_grand}}</td></tr></tfoot>
  </table>{{/has_piece}}
  {{#empty}}<div class="wb-empty">ไม่มีรายการรอจ่าย</div>{{/empty}}`,
  footer_html: "", custom_css: COMMON_CSS,
};

const TEMPLATE_PIECE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="wb-head">
    <div><div class="wb-title">รายการรอจ่ายเหมาทั้งหมด</div><div class="wb-sub">กลุ่ม: {{group_label}} · {{count}} รายการ</div></div>
    <div class="wb-no">บอร์ดจ่ายงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#has_rows}}<table class="wb-t">
    <thead><tr><th class="img">รูป</th><th>รหัส MO</th><th>งาน</th><th>SKU</th><th>ชื่อสินค้า</th><th class="r">จำนวน</th><th class="r">ค่าแรง/ชิ้น</th><th class="r">ยอดรวม</th></tr></thead>
    <tbody>{{#rows}}<tr><td class="img">{{{img_cell}}}</td><td class="mono">{{mo_no}}</td><td>{{job}}</td><td class="mono">{{sku}}</td><td>{{name}}</td><td class="r">{{qty}}</td><td class="r">{{rate}}</td><td class="r">{{total}}</td></tr>{{/rows}}</tbody>
    <tfoot><tr><td colspan="7">รวม {{count}} รายการ</td><td class="r">{{grand_total}}</td></tr></tfoot>
  </table>{{/has_rows}}
  {{#empty}}<div class="wb-empty">ไม่มีงานเหมารอจ่าย</div>{{/empty}}`,
  footer_html: "", custom_css: COMMON_CSS,
};

const TEMPLATE_PRODUCTION: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="wb-head">
    <div><div class="wb-title">รายการกำลังผลิต — แยกตามโต๊ะ/ช่าง</div><div class="wb-sub">{{group_label}} · {{dept_count}} โต๊ะ · {{total_qty}} ชิ้น</div></div>
    <div class="wb-no">บอร์ดจ่ายงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#groups}}<div class="grp-head"><div><span class="grp-name">{{dept}}</span>{{{staff_html}}}</div><span class="grp-sum">{{g_qty}} ชิ้น · ฿{{g_labor}}</span></div>
  <table class="grp-rows">
    <thead><tr><th>ช่าง</th><th>สินค้า</th><th class="r">จำนวน</th><th class="r">ค่าแรง</th></tr></thead>
    <tbody>{{#rows}}<tr><td>{{assignee}}</td><td><span class="mono">{{sku}}</span> · {{name}}</td><td class="r">{{qty}}</td><td class="r">{{{labor_cell}}}</td></tr>{{/rows}}</tbody>
  </table>{{/groups}}
  {{#empty}}<div class="wb-empty">ไม่มีงานกำลังผลิต</div>{{/empty}}
  {{#has_groups}}<div class="grp-head" style="margin-top:4mm;background:#f1f5f9;border-color:#cbd5e1;"><span class="grp-name">รวมทั้งหมด</span><span class="grp-sum" style="color:#334155;">{{total_qty}} ชิ้น · ฿{{total_labor}}</span></div>{{/has_groups}}`,
  footer_html: "", custom_css: COMMON_CSS,
};

const TEMPLATE_PLAN: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="wb-head">
    <div><div class="wb-title">รายการจ่ายงานตามแผน</div><div class="wb-sub">แผน: {{plan_name}} · {{date_range}} · {{count}} รายการ</div></div>
    <div class="wb-no">บอร์ดจ่ายงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#groups}}<div class="grp-head"><div><span class="grp-name">{{dept}}</span>{{{staff_html}}}</div><span class="grp-sum">{{g_qty}} ชิ้น · ฿{{g_labor}}</span></div>
  <table class="grp-rows">
    <thead><tr><th class="img">รูป</th><th>ช่าง</th><th>สินค้า</th><th class="r">จำนวน</th><th class="r">ค่าแรง</th></tr></thead>
    <tbody>{{#rows}}<tr><td class="img">{{{img_cell}}}</td><td>{{assignee}}</td><td><span class="mono">{{sku}}</span> · {{name}}</td><td class="r">{{qty}}</td><td class="r">{{{labor_cell}}}</td></tr>{{/rows}}</tbody>
  </table>{{/groups}}
  {{#empty}}<div class="wb-empty">แผนนี้ยังไม่มีรายการจ่าย</div>{{/empty}}
  {{#has_groups}}<div class="grp-head" style="margin-top:4mm;background:#f1f5f9;border-color:#cbd5e1;"><span class="grp-name">รวมทั้งหมด</span><span class="grp-sum" style="color:#334155;">{{total_qty}} ชิ้น · ฿{{total_labor}}</span></div>
  <div class="wb-note">ช่องว่างค่าแรง = ยังไม่ตั้งค่าแรงต่อชิ้น (เขียนกรอกด้วยมือ)</div>{{/has_groups}}`,
  footer_html: "", custom_css: COMMON_CSS,
};

function groupLabelOf(group: string): string {
  if (!group || group === "__all__") return "ทั้งหมด";
  if (group === "__none__") return "ยังไม่จับกลุ่ม";
  return group;
}

function WorkBoardPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const typeParam = sp.get("type");
  const type = (typeParam === "production" ? "production" : typeParam === "piece" ? "piece" : typeParam === "plan" ? "plan" : "pending") as "pending" | "production" | "piece" | "plan";
  const group = sp.get("group") ?? "__all__";
  const planId = sp.get("plan") ?? "";

  const [board, setBoard] = useState<BoardResp | null>(null);
  const [moGroups, setMoGroups] = useState<{ name: string; mo_nos: string[] }[]>([]);
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [assignees, setAssignees] = useState<AssigneeResp>({ craftsmen: [], dept_wages: {} });
  const [error, setError] = useState<string | null>(null);
  const withStaff = type === "plan" || type === "production";   // ใบที่แยกตามโต๊ะ → โชว์พนักงานในโต๊ะ

  useEffect(() => {
    let on = true;
    Promise.all([
      apiFetch("/api/mo/work-board").then((r) => r.json()),
      apiFetch("/api/mo/groups").then((r) => r.json()).catch(() => ({ data: [] })),
      type === "plan" && planId
        ? apiFetch(`/api/mo/dispatch-plans/${planId}`).then((r) => r.json()).catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
      withStaff
        ? apiFetch("/api/mo/assignees").then((r) => r.json()).catch(() => ({ craftsmen: [], dept_wages: {} }))
        : Promise.resolve({ craftsmen: [], dept_wages: {} }),
    ])
      .then(([b, g, p, a]: [BoardResp & { error?: string }, { data?: { name: string; mo_nos: unknown }[] }, { data?: PlanResp | null; error?: string }, AssigneeResp]) => {
        if (!on) return;
        if (b.error) throw new Error(b.error);
        setBoard(b);
        setMoGroups((g.data ?? []).map((x) => ({ name: x.name, mo_nos: (Array.isArray(x.mo_nos) ? x.mo_nos : []) as string[] })));
        setAssignees({ craftsmen: a.craftsmen ?? [], dept_wages: a.dept_wages ?? {} });
        if (type === "plan") {
          if (!p.data) throw new Error(p.error || "ไม่พบแผนที่เลือก");
          setPlan(p.data);
        }
      })
      .catch((e) => { if (on) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); });
    return () => { on = false; };
  }, [type, planId, withStaff]);

  const html = useMemo(() => {
    if (!board) return "";
    const groupOf = (moNo: string) => moGroups.find((x) => x.mo_nos.includes(moNo))?.name ?? null;
    const groupOk = (moNo: string) =>
      group === "__all__" ? true : group === "__none__" ? groupOf(moNo) === null : groupOf(moNo) === group;
    const printed_at = new Date().toLocaleDateString("th-TH", FMT_OPT);
    const group_label = groupLabelOf(group);

    // พนักงานในโต๊ะ (ชื่อ+จำนวน+เงินเดือนรวม) ตามชื่อโต๊ะ → โชว์ในหัวกลุ่มของใบแผน/กำลังผลิต
    const deptIdByName = new Map<string, string>();
    for (const d of board.departments) deptIdByName.set(d.name, d.id);
    const namesByDeptId = new Map<string, string[]>();
    for (const c of assignees.craftsmen) { if (!c.department_id) continue; const a = namesByDeptId.get(c.department_id) ?? []; a.push(c.nickname || c.name); namesByDeptId.set(c.department_id, a); }
    const staffHtmlOf = (deptName: string) => {
      if (/เหมา/.test(deptName)) return "";   // งานเหมา = ใครก็ทำได้ ไม่ต้องโชว์รายชื่อพนักงาน
      const id = deptIdByName.get(deptName); if (!id) return "";
      const names = namesByDeptId.get(id) ?? []; const wage = assignees.dept_wages[id] ?? 0;
      if (names.length === 0 && wage === 0) return "";
      return `<div class="grp-staff">👥 ${names.length} คน${names.length ? ": " + names.join(", ") : ""}${wage > 0 ? ` · เงินเดือนรวม ฿${money(wage)}` : ""}</div>`;
    };
    // ชื่อช่างในคอลัมน์ → ใช้ชื่อเล่น (จาก employee id ก่อน, ไม่มีก็ดึงจากวงเล็บในชื่อเต็ม)
    const nickById = new Map<string, string>();
    for (const c of assignees.craftsmen) if (c.nickname) nickById.set(c.id, c.nickname);
    const shortAssignee = (name: string | null | undefined, id: string | null | undefined) => {
      const byId = id ? nickById.get(id) : null; if (byId) return byId;
      if (!name) return ""; const m = name.match(/\(([^)]+)\)/); return m ? m[1] : name;
    };

    const pieceRowsOf = () => board.pending_piece.filter((p) => groupOk(p.mo_no)).map((p) => {
      const t = p.rate * p.qty;
      return { img_cell: imgCell(p.image_url), mo_no: p.mo_no, job: p.job_name, sku: p.product_sku || "—", name: p.product_name || "—", qty: num(p.qty), rate: money(p.rate), total: money(t), _t: t };
    });

    if (type === "piece") {
      const rows = pieceRowsOf();
      const grand = rows.reduce((a, r) => a + r._t, 0);
      return buildReportHtml(TEMPLATE_PIECE, {
        group_label, printed_at, count: rows.length, has_rows: rows.length > 0, rows, grand_total: money(grand), empty: rows.length === 0,
      });
    }

    if (type === "pending") {
      const laborPP = (m: PendingMO) => (m.central_rate && m.central_rate > 0) ? m.central_rate : (m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0);
      const pend = board.pending.filter((m) => groupOk(m.mo_no));
      let grand = 0, qtySum = 0;
      const rows = pend.map((m) => {
        const pp = laborPP(m); const has = pp > 0; const total = has ? pp * m.remaining : 0;
        if (has) grand += total; qtySum += m.remaining;
        return { img_cell: imgCell(m.image_url), mo_no: m.mo_no, sku: m.product_sku || "—", name: m.product_name || "—", due: dueText(m.due_date),
          remaining: num(m.remaining), rate_cell: has ? money(pp) : BLANK, total_cell: has ? money(total) : BLANK };
      });
      const piece_rows = pieceRowsOf();
      const pieceGrand = piece_rows.reduce((a, r) => a + r._t, 0);
      return buildReportHtml(TEMPLATE_PENDING, {
        group_label, printed_at, count: rows.length, has_rows: rows.length > 0, rows,
        total_qty: num(qtySum), grand_total: money(grand),
        has_piece: piece_rows.length > 0, piece_rows, piece_count: piece_rows.length, piece_grand: money(pieceGrand),
        empty: rows.length === 0 && piece_rows.length === 0,
      });
    }

    if (type === "plan") {
      if (!plan) return "";
      // แผนที่ + ค่าแรง/รูป จากบอร์ด (plan lines ไม่มีรูป/เรต → ดึงจาก pending/workOrders ตาม sku/mo)
      const imgBySku = new Map<string, string | null>();
      for (const m of board.pending) if (m.product_sku) imgBySku.set(m.product_sku, m.image_url);
      for (const w of board.workOrders) if (w.product_sku && !imgBySku.has(w.product_sku)) imgBySku.set(w.product_sku, w.image_url ?? null);
      for (const p of board.pending_piece) if (p.product_sku && !imgBySku.has(p.product_sku)) imgBySku.set(p.product_sku, p.image_url);
      const rateByMo = new Map<string, number>();
      for (const m of board.pending) { const r = (m.central_rate && m.central_rate > 0) ? m.central_rate : (m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0); if (r > 0) rateByMo.set(m.mo_no, r); }
      for (const w of board.workOrders) if (!rateByMo.has(w.mo_no) && w.central_rate && w.central_rate > 0) rateByMo.set(w.mo_no, w.central_rate);
      const deptOrder = new Map<string, number>();
      board.departments.forEach((d, i) => deptOrder.set(d.name, i));
      const byDept = new Map<string, DispatchPlanLine[]>();
      for (const l of plan.lines) { const k = l.department_name || "— ยังไม่จัดโต๊ะ —"; const arr = byDept.get(k) ?? []; arr.push(l); byDept.set(k, arr); }
      let totQty = 0, totLabor = 0;
      const groups = [...byDept.entries()].sort((a, b) => (deptOrder.get(a[0]) ?? 999) - (deptOrder.get(b[0]) ?? 999)).map(([dept, list]) => {
        let gQty = 0, gLabor = 0;
        const rows = list.map((l) => {
          const rate = l.mo_no ? (rateByMo.get(l.mo_no) ?? 0) : 0; const qty = l.qty || 0; const labor = rate > 0 ? rate * qty : 0;
          gQty += qty; if (labor > 0) gLabor += labor;
          return { img_cell: imgCell(l.product_sku ? (imgBySku.get(l.product_sku) ?? null) : null),
            assignee: shortAssignee(l.assignee_name, l.assignee_id) || "(ทั้งโต๊ะ)", sku: l.product_sku || "—", name: l.product_name || "—",
            qty: num(qty), labor_cell: rate > 0 ? money(labor) : BLANK };
        });
        totQty += gQty; totLabor += gLabor;
        return { dept, staff_html: staffHtmlOf(dept), g_qty: num(gQty), g_labor: money(gLabor), rows };
      });
      const date_range = (plan.start_date || plan.end_date) ? `${dueText(plan.start_date)} – ${dueText(plan.end_date)}` : "ทั้งแผน";
      return buildReportHtml(TEMPLATE_PLAN, {
        plan_name: plan.name, date_range, printed_at, count: plan.lines.length, groups, has_groups: groups.length > 0,
        total_qty: num(totQty), total_labor: money(totLabor), empty: groups.length === 0,
      });
    }

    // production
    const wos = board.workOrders.filter((w) => w.status !== "done" && w.stage !== "cut" && groupOk(w.mo_no));
    const byDept = new Map<string, WorkOrder[]>();
    for (const w of wos) { const k = w.department_name || "— ไม่ระบุโต๊ะ —"; const arr = byDept.get(k) ?? []; arr.push(w); byDept.set(k, arr); }
    let totQty = 0, totLabor = 0;
    const groups = [...byDept.entries()].map(([dept, list]) => {
      const gQty = list.reduce((a, w) => a + (w.qty || 0), 0);
      const gLabor = list.reduce((a, w) => a + (w.labor_cost || 0), 0);
      totQty += gQty; totLabor += gLabor;
      return { dept, staff_html: staffHtmlOf(dept), g_qty: num(gQty), g_labor: money(gLabor),
        rows: list.map((w) => ({ assignee: shortAssignee(w.assignee_name, w.assignee_id) || w.department_name || "—", sku: w.product_sku || "—", name: w.product_name || "—",
          qty: num(w.qty || 0), labor_cell: (w.labor_cost != null && w.labor_cost > 0) ? money(w.labor_cost) : BLANK })) };
    });
    return buildReportHtml(TEMPLATE_PRODUCTION, {
      group_label, printed_at, dept_count: groups.length, groups, has_groups: groups.length > 0,
      total_qty: num(totQty), total_labor: money(totLabor), empty: groups.length === 0,
    });
  }, [board, moGroups, plan, assignees, type, group]);

  // กด Ctrl/Cmd+P → เด้งหน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่างเกินจาก iframe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (html) printReportHtmlInNewWindow(html);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  const title = type === "production" ? "รายการกำลังผลิต (ตามโต๊ะ/ช่าง)" : type === "piece" ? "รายการรอจ่ายเหมาทั้งหมด" : type === "plan" ? "รายการจ่ายงานตามแผน" : "รายการรอจ่ายทั้งหมด";
  const subLabel = type === "plan" ? (plan ? `แผน ${plan.name}` : "แผน…") : `กลุ่ม ${groupLabelOf(group)}`;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ {title} · {subLabel}</span>
        <div className="flex-1" />
        <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : (!board || (type === "plan" && !plan)) ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
          : <PrintFrame html={html} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function WorkBoardPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><WorkBoardPrintInner /></Suspense>;
}
