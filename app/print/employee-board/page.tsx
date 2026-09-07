"use client";

/**
 * พิมพ์รายชื่อพนักงานแยกตามแผนก — /print/employee-board?dept=<department_id|__all__|__none__>&salary=1
 *   dept=__all__   → ทุกแผนก (แผนกละ 1 หน้า) · ต่อท้ายด้วย "ยังไม่ระบุแผนก" ถ้ามี
 *   dept=__none__  → เฉพาะคนที่ยังไม่ระบุแผนก
 *   dept=<id>      → แผนกเดียว
 *   salary=1       → แสดงคอลัมน์ฐานเงินเดือน (ปิดเป็นค่าเริ่มต้น — ข้อมูลอ่อนไหว)
 *   layout=flow    → ทุกแผนกต่อเนื่องในชุดเดียว (หัวข้อคั่นแผนก ไม่ขึ้นหน้าใหม่ทุกแผนก — ประหยัดกระดาษ) · ค่าเริ่มต้น = แผนกละ 1 หน้า
 * ข้อมูลชุดเดียวกับหน้า "ผังพนักงาน (บอร์ด)" (/api/payroll/board) — เห็นเฉพาะที่บันทึกแล้ว (การย้ายที่ยังไม่กดบันทึกจะไม่ติดมา)
 * ของกลาง: ระบบพิมพ์ (buildReportHtmlMulti + PrintFrame) · apiFetch · r2ImageUrl
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { buildReportHtml, buildReportHtmlMulti, type ReportTemplate } from "@/lib/template";

type Card = {
  id: string; employee_code: string; nickname: string; full_name: string;
  contract_type_th: string; position_name: string; base_salary: number;
  head_of_department: string | null; supervisor_name: string;
  recurring_count: number; warning_count: number; photo_key: string | null;
};
type Section = { department_id: string; department_name: string; manager_employee_id: string | null; manager_name: string; headcount: number; total_salary: number; employees: Card[] };
type BoardResp = { sections: Section[]; no_department: Card[]; total_employees: number; error?: string };

const ALL = "__all__";
const NONE = "__none__";
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// ใส่ origin เต็ม — กัน path สั้น /api/... resolve ผิดฐานในหน้าต่าง Blob / iframe srcDoc (รูปไม่ขึ้น)
const ORIGIN = () => (typeof window !== "undefined" ? window.location.origin : "");
const photoCell = (key: string | null, initials: string) => {
  const u = r2ImageUrl(key, 96);
  return u ? `<img class="ph" src="${ORIGIN()}${u}" alt="" />` : `<span class="ph ph-txt">${esc(initials)}</span>`;
};
const initialsOf = (c: Card) => (c.nickname || c.full_name || c.employee_code).trim().slice(0, 2);

const CSS = `
.doc { font-size: 11px; color: #111827; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.t1 { font-size: 18px; font-weight: 800; }
.t2 { font-size: 10.5px; color: #6b7280; margin-top: 1mm; }
.no { text-align: right; font-size: 10px; color: #6b7280; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #cbd5e1; padding: 1.4mm 2mm; font-size: 10.5px; vertical-align: middle; }
th { background: #f1f5f9; font-weight: 700; text-align: left; }
td.c, th.c { text-align: center; }
td.r, th.r { text-align: right; white-space: nowrap; }
td.n { width: 7mm; color: #6b7280; text-align: center; }
td.img, th.img { width: 13mm; text-align: center; padding: 1mm; }
.ph { width: 11mm; height: 11mm; border-radius: 50%; object-fit: cover; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; }
.ph-txt { background: #f1f5f9; color: #475569; font-weight: 700; font-size: 9px; }
.nick { font-weight: 700; }
.full { color: #6b7280; font-size: 9.5px; }
.mono { font-family: ui-monospace, monospace; color: #475569; white-space: nowrap; }
.star { color: #d97706; }
.warn { color: #b91c1c; font-weight: 700; }
tfoot td { background: #f8fafc; font-weight: 800; }
.sign { margin-top: 10mm; display: flex; gap: 12mm; }
.sign div { flex: 1; text-align: center; font-size: 10px; color: #6b7280; }
.sign .line { border-top: 1px solid #94a3b8; margin-bottom: 1.5mm; padding-top: 10mm; }
.note { font-size: 9.5px; color: #94a3b8; margin-top: 2mm; }
.empty { text-align: center; color: #94a3b8; padding: 14mm 0; font-size: 12px; }
.sec { margin-bottom: 5mm; break-inside: avoid; page-break-inside: avoid; }
.sec-h { display: flex; justify-content: space-between; align-items: baseline; background: #e2e8f0; border: 1px solid #cbd5e1; border-bottom: 0; padding: 1.5mm 2.5mm; font-size: 12px; font-weight: 800; }
.sec-h .sub { font-size: 10px; font-weight: 400; color: #475569; }
.sec-h .star { color: #b45309; }`;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="hd">
    <div><div class="t1">รายชื่อพนักงาน — {{dept_name}}</div><div class="t2">{{headcount}} คน{{#manager_name}} · ⭐ หัวหน้าแผนก: {{manager_name}}{{/manager_name}}{{#show_salary}} · ฐานเงินเดือนรวม {{total_salary}}{{/show_salary}}</div></div>
    <div class="no">ผังพนักงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#has_rows}}<table>
    <thead><tr><th class="c">#</th><th class="img">รูป</th><th>รหัส</th><th>ชื่อเล่น / ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>ประเภทสัญญา</th><th>หัวหน้า</th><th class="c">ใบเตือน</th>{{#show_salary}}<th class="r">ฐานเงินเดือน</th>{{/show_salary}}</tr></thead>
    <tbody>{{#rows}}<tr><td class="n">{{n}}</td><td class="img">{{{photo}}}</td><td class="mono">{{code}}</td><td><div class="nick">{{#is_head}}<span class="star">⭐</span> {{/is_head}}{{nickname}}</div><div class="full">{{full_name}}</div></td><td>{{position}}</td><td>{{contract}}</td><td>{{supervisor}}</td><td class="c">{{{warnings}}}</td>{{#show_salary}}<td class="r">{{salary}}</td>{{/show_salary}}</tr>{{/rows}}</tbody>
    {{#show_salary}}<tfoot><tr><td colspan="8">รวม {{headcount}} คน</td><td class="r">{{total_salary}}</td></tr></tfoot>{{/show_salary}}
  </table>
  <div class="note">ข้อมูลตามที่บันทึกไว้ในผังพนักงาน · ⭐ = หัวหน้าประจำแผนก</div>
  <div class="sign"><div><div class="line"></div>หัวหน้าแผนก</div><div><div class="line"></div>ฝ่ายบุคคล</div><div><div class="line"></div>ผู้อนุมัติ</div></div>{{/has_rows}}
  {{^has_rows}}<div class="empty">แผนกนี้ยังไม่มีพนักงาน</div>{{/has_rows}}`,
  footer_html: "", custom_css: CSS,
};

// แบบต่อเนื่อง — ทุกแผนกอยู่ในชุดเดียว มีแถบหัวข้อคั่นแต่ละแผนก (แผนกเล็ก ๆ ไม่เปลืองกระดาษทั้งแผ่น)
// ใช้ thead/tbody ชุดเดียวกับแบบแผนกละหน้า — แก้คอลัมน์ที่ TEMPLATE ที่เดียวแล้วทั้งสองแบบเปลี่ยนตาม
const ROWS_HTML = TEMPLATE.body_html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? "";
const HEAD_HTML = TEMPLATE.body_html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? "";
const FLOW_TEMPLATE: ReportTemplate = {
  ...TEMPLATE,
  header_html: `<div class="hd">
    <div><div class="t1">รายชื่อพนักงานทั้งหมด — แยกตามแผนก</div><div class="t2">{{dept_count}} แผนก · {{total_count}} คน{{#show_salary}} · ฐานเงินเดือนรวม {{grand_salary}}{{/show_salary}}</div></div>
    <div class="no">ผังพนักงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#depts}}<div class="sec">
    <div class="sec-h"><span>{{dept_name}} <span class="sub">· {{headcount}} คน{{#manager_name}} · <span class="star">⭐</span> หัวหน้า: {{manager_name}}{{/manager_name}}</span></span>{{#show_salary}}<span class="sub">ฐานเงินเดือนรวม <b>{{total_salary}}</b></span>{{/show_salary}}</div>
    {{#has_rows}}<table>${HEAD_HTML}${ROWS_HTML}</table>{{/has_rows}}
    {{^has_rows}}<div class="empty" style="padding:4mm 0;border:1px solid #cbd5e1">ยังไม่มีพนักงาน</div>{{/has_rows}}
  </div>{{/depts}}
  <div class="note">ข้อมูลตามที่บันทึกไว้ในผังพนักงาน · ⭐ = หัวหน้าประจำแผนก</div>
  <div class="sign"><div><div class="line"></div>ผู้จัดทำ</div><div><div class="line"></div>ฝ่ายบุคคล</div><div><div class="line"></div>ผู้อนุมัติ</div></div>`,
};

function Inner() {
  const sp = useSearchParams(); const router = useRouter();
  const dept = sp.get("dept") || ALL;
  const flow = sp.get("layout") === "flow";
  const [showSalary, setShowSalary] = useState(sp.get("salary") === "1");
  const [data, setData] = useState<BoardResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch("/api/payroll/board");
        const j = (await r.json()) as BoardResp;
        if (j.error) { setErr(j.error); return; }
        setData(j);
      } catch { setErr("โหลดข้อมูลไม่ได้"); }
    })();
  }, []);

  // แผนกที่จะพิมพ์ — แปลง "ยังไม่ระบุแผนก" ให้หน้าตาเหมือน section ปกติ
  const groups = useMemo<Section[]>(() => {
    if (!data) return [];
    const noDept: Section = {
      department_id: NONE, department_name: "ยังไม่ระบุแผนก", manager_employee_id: null, manager_name: "",
      headcount: data.no_department.length, total_salary: data.no_department.reduce((t, c) => t + c.base_salary, 0), employees: data.no_department,
    };
    if (dept === NONE) return [noDept];
    if (dept === ALL) return [...data.sections, ...(noDept.headcount > 0 ? [noDept] : [])];
    const one = data.sections.find((s) => s.department_id === dept);
    return one ? [one] : [];
  }, [data, dept]);

  const html = useMemo(() => {
    if (!data) return "";
    const printedAt = new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    const list = groups.map((g) => {
      // หัวหน้าแผนกขึ้นบนสุด ที่เหลือเรียงตามรหัส
      const sorted = [...g.employees].sort((a, b) =>
        Number(b.id === g.manager_employee_id) - Number(a.id === g.manager_employee_id) || a.employee_code.localeCompare(b.employee_code));
      return {
        dept_name: g.department_name, headcount: g.headcount, manager_name: g.manager_name || "",
        show_salary: showSalary, total_salary: baht(g.employees.reduce((t, c) => t + c.base_salary, 0)),
        printed_at: printedAt, has_rows: sorted.length > 0,
        rows: sorted.map((c, i) => ({
          n: i + 1, photo: photoCell(c.photo_key, initialsOf(c)), code: c.employee_code,
          nickname: c.nickname, full_name: c.full_name || "—", position: c.position_name || "—",
          contract: c.contract_type_th || "—", supervisor: c.supervisor_name || "—",
          is_head: c.id === g.manager_employee_id,
          warnings: c.warning_count > 0 ? `<span class="warn">⚠️ ${c.warning_count}</span>` : "—",
          salary: baht(c.base_salary),
        })),
      };
    });
    if (list.length === 0) return buildReportHtmlMulti(TEMPLATE, [{ dept_name: "ไม่พบแผนก", headcount: 0, has_rows: false, printed_at: printedAt }], "รายชื่อพนักงาน");
    if (flow && list.length > 1) {
      const grand = groups.reduce((t, g) => t + g.employees.reduce((x, c) => x + c.base_salary, 0), 0);
      return buildReportHtml(FLOW_TEMPLATE, {
        depts: list, dept_count: list.length, total_count: groups.reduce((t, g) => t + g.headcount, 0),
        show_salary: showSalary, grand_salary: baht(grand), printed_at: printedAt,
      }, "รายชื่อพนักงานทั้งหมด — แยกตามแผนก");
    }
    return buildReportHtmlMulti(TEMPLATE, list, `รายชื่อพนักงาน — ${list.length === 1 ? list[0].dept_name : "ทุกแผนก"}`);
  }, [data, groups, showSalary, flow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); if (html) printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  const title = groups.length === 1 ? groups[0].department_name : `ทุกแผนก (${groups.length} แผนก${flow ? " · ต่อเนื่อง" : " · แผนกละหน้า"})`;
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/payroll/board"))} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ รายชื่อพนักงาน · {data ? title : "กำลังโหลด…"}</span>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showSalary} onChange={(e) => setShowSalary(e.target.checked)} /> แสดงฐานเงินเดือน
        </label>
        {groups.length > 1 && (
          <span className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden text-sm">
            {([["page", "แผนกละหน้า"], ["flow", "ต่อเนื่อง (ประหยัดกระดาษ)"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => router.replace(`/print/employee-board?dept=${encodeURIComponent(dept)}${k === "flow" ? "&layout=flow" : ""}${showSalary ? "&salary=1" : ""}`)}
                className={`px-3 h-9 ${(flow ? "flow" : "page") === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </span>
        )}
        <div className="flex-1" />
        <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html}
          className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      {err && <div className="mx-6 mt-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err}</div>}
      {!err && !data && <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลดรายชื่อพนักงาน…</div>}
      {html && <PrintFrame html={html} />}
    </div>
  );
}

export default function EmployeeBoardPrintPage() {
  return <Suspense fallback={<div className="p-8 text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
