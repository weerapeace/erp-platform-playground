/**
 * 📝 ใบจดผลงานตามใบงาน (Work Log Sheet) — ของกลาง สร้าง HTML สำหรับพิมพ์ A4 แนวตั้ง
 *   เจ้าของขอ 2026-11-05: "ใบจดอยากได้แบบ จดจาก ใบงาน (จะได้เพิ่มขั้นตอนทีหลังได้ด้วย) … ออกแบบให้เวลาโยนเข้าระบบแล้วอ่านลายมือง่าย"
 *     + "เอาเป็นชื่อคนดีกว่า (ใส่ทีหลัง) ตรงช่องทำได้ ขอ 4 หลัก"
 *
 *   1 ใบสั่งผลิต = 1 ชุดใบ · แถว = ขั้นตอนจากสูตร BOM (bom_work_steps) · 1 ขั้นตอน = หลายบรรทัด (หลายคน/หลายวัน)
 *   ท้ายใบ = "ขั้นตอนเพิ่ม" ให้เขียนชื่อขั้นตอนเอง (ภายหลังระบบถามว่าจะเพิ่มเข้าสูตรไหม)
 *
 *   ออกแบบให้ AI อ่านลายมือง่าย (เฟสถัดไป: ถ่ายรูป → อ่าน → หน้าตรวจ):
 *     • ตัวเลขทุกช่องเป็นกล่องแยกทีละหลัก (ทำได้ 4 หลัก · เสีย 3 หลัก · เวลา HH:MM · วันที่ วว/ดด)
 *     • ชื่อคน = เขียนมือบนเส้นประ (ระบบจับคู่กับรายชื่อพนักงานในแผนก ไม่ใช่อ่านเดาเปล่า ๆ)
 *     • QR ทุกหน้า บอกใบสั่งผลิต + หน้า + ขั้นตอนบนหน้านั้น (ไม่ต้องอ่านเลข MO จากลายมือ)
 *     • จุดดำ 4 มุม ใช้ดึงภาพที่ถ่ายเอียงให้ตรง · ความสูงหน้า/แถวล็อกเป็น มม. → ตำแหน่งช่องคงที่ทุกใบ
 *   เส้น/ขอบใช้ มม. ทั้งหมด (px บางไม่ลงบนกระดาษ — ดู report_print_system)
 *
 *   ใช้ที่: /print/work-steps/<mo_id>?mode=worklog  (โหมด "📝 ใบจดผลงาน")
 */
import { escapeHtml as esc } from "@/lib/list-print";

export type WorkLogMo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; due_date: string | null;
};
export type WorkLogStep = { id: string; sequence: number; step_name: string; station?: string | null };

export type WorkLogOptions = {
  /** บรรทัดต่อ 1 ขั้นตอน (หลายคนทำขั้นเดียวกัน / ทำต่อหลายวัน) — 1..6 */
  linesPerStep: number;
  /** บรรทัด "ขั้นตอนเพิ่ม" ท้ายใบ — 0..30 (สินค้าที่ยังไม่มีขั้นตอนในสูตร ใช้ BLANK_ONLY_ROWS แทน) */
  extraRows: number;
};

export const WORK_LOG_DEFAULTS: WorkLogOptions = { linesPerStep: 3, extraRows: 4 };
/** สินค้าที่ยังไม่มีขั้นตอนในสูตร → ทั้งใบเป็นบรรทัดว่างให้เขียนชื่อขั้นตอนเอง */
const BLANK_ONLY_ROWS = 24;

// ── เลย์เอาต์ (มม.) — ล็อกตายตัวเพื่อให้ตำแหน่งช่องคงที่สำหรับการอ่านภาพ ─────────────────────
const ROW_MM = 8;          // ความสูงบรรทัดเขียน
const SEC_MM = 6;          // แถบหัวช่วง "ขั้นตอนเพิ่ม"
const BODY_MM = 214;       // พื้นที่ตัวตารางต่อหน้า (A4 297 − ขอบ 24 − หัวใบ 31 − หัวตาราง 8 − ท้ายใบ 20)

export type WorkLogItem =
  | { kind: "step"; step: WorkLogStep; code: string; lines: number }
  | { kind: "sec"; title: string }
  | { kind: "extra"; n: number };

export type WorkLogPage = { index: number; total: number; items: WorkLogItem[]; qrText: string };

export const stepCode = (seq: number) => `S${String(Math.max(0, seq)).padStart(2, "0")}`;
const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
export function normalizeWorkLogOptions(o: Partial<WorkLogOptions> | null | undefined): WorkLogOptions {
  return {
    linesPerStep: clampInt(o?.linesPerStep, 1, 6, WORK_LOG_DEFAULTS.linesPerStep),
    extraRows: clampInt(o?.extraRows, 0, 30, WORK_LOG_DEFAULTS.extraRows),
  };
}

/**
 * ข้อความใน QR ของแต่ละหน้า — สั้นพอให้ QR เล็ก (~20 มม.) ยังสแกนติด
 *   WL1|<mo_id>|<หน้า>/<ทั้งหมด>|<บรรทัดต่อขั้น>|<รหัสขั้นตอนย่อ 8 ตัว คั่น .>
 *   รหัสขั้นตอน = 8 ตัวแรกของ bom_work_steps.id ตามลำดับบนหน้านั้น (ขั้นตอนเพิ่ม = ไม่มีรหัส)
 */
export function workLogQrText(moId: string, page: number, total: number, linesPerStep: number, stepIds: string[]): string {
  return `WL1|${moId}|${page}/${total}|${linesPerStep}|${stepIds.map((id) => id.replace(/-/g, "").slice(0, 8)).join(".")}`;
}

/** แบ่งหน้า: ขั้นตอนหนึ่งไม่ถูกตัดข้ามหน้า · ช่วงขั้นตอนเพิ่มต่อหน้าได้ (หัวช่วงซ้ำให้) */
export function planWorkLogPages(mo: Pick<WorkLogMo, "id">, steps: WorkLogStep[], opts: WorkLogOptions): WorkLogPage[] {
  const o = normalizeWorkLogOptions(opts);
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
  const blocks: WorkLogItem[] = sorted.map((s, i) => ({ kind: "step", step: s, code: stepCode(s.sequence || i + 1), lines: o.linesPerStep }));
  const extraCount = sorted.length === 0 ? BLANK_ONLY_ROWS : o.extraRows;
  const secTitle = sorted.length === 0
    ? "สินค้านี้ยังไม่มีขั้นตอนในสูตร — เขียนชื่อขั้นตอน/ชิ้นส่วนเองในช่องแรก (ระบบจะถามว่าจะเพิ่มเข้าสูตรไหม)"
    : "ขั้นตอนเพิ่ม — เขียนชื่อขั้นตอนเอง (ระบบจะถามว่าจะเพิ่มเข้าสูตรของสินค้านี้ไหม)";

  const pages: WorkLogItem[][] = [];
  let cur: WorkLogItem[] = [];
  let used = 0;
  const flush = () => { if (cur.length) pages.push(cur); cur = []; used = 0; };

  for (const b of blocks) {
    const h = (b as { lines: number }).lines * ROW_MM;
    if (used + h > BODY_MM && cur.length) flush();
    cur.push(b); used += h;
  }
  if (extraCount > 0) {
    // หัวช่วงต้องมีอย่างน้อย 1 บรรทัดตามในหน้าเดียวกัน
    if (used + SEC_MM + ROW_MM > BODY_MM && cur.length) flush();
    cur.push({ kind: "sec", title: secTitle }); used += SEC_MM;
    for (let n = 1; n <= extraCount; n++) {
      if (used + ROW_MM > BODY_MM) { flush(); cur.push({ kind: "sec", title: `${secTitle} (ต่อ)` }); used += SEC_MM; }
      cur.push({ kind: "extra", n }); used += ROW_MM;
    }
  }
  flush();
  if (pages.length === 0) pages.push([]);

  const total = pages.length;
  return pages.map((items, i) => ({
    index: i + 1, total, items,
    qrText: workLogQrText(mo.id, i + 1, total, o.linesPerStep,
      items.filter((it): it is Extract<WorkLogItem, { kind: "step" }> => it.kind === "step").map((it) => it.step.id)),
  }));
}

// ── HTML ───────────────────────────────────────────────────────────────────────────────
const boxes = (n: number) => `<span class="dg">${"<i></i>".repeat(n)}</span>`;
const timeBoxes = () => `<span class="dg"><i></i><i></i></span><b class="sep">:</b><span class="dg"><i></i><i></i></span>`;
const dateBoxes = () => `<span class="dg"><i></i><i></i></span><b class="sep">/</b><span class="dg"><i></i><i></i></span>`;
const writeCells = () =>
  `<td class="nm"><span class="ln"></span></td><td class="c">${dateBoxes()}</td><td class="c">${timeBoxes()}</td><td class="c">${timeBoxes()}</td>` +
  `<td class="c">${boxes(4)}</td><td class="c">${boxes(3)}</td><td class="c"><span class="o"></span></td><td></td>`;

const thDate = (s: string | null) =>
  s ? new Date(s.slice(0, 10) + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }) : "—";

const CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Sarabun", "Noto Sans Thai", "Tahoma", sans-serif; color: #111827; font-size: 3.3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { position: relative; width: 210mm; height: 297mm; padding: 12mm 11mm; overflow: hidden; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  @media screen { body { background: #e2e8f0; } .sheet { background: #fff; margin: 0 auto 6mm; } }
  .cm { position: absolute; width: 5mm; height: 5mm; background: #000; }
  .cm.tl { top: 5mm; left: 5mm; } .cm.tr { top: 5mm; right: 5mm; } .cm.bl { bottom: 5mm; left: 5mm; } .cm.br { bottom: 5mm; right: 5mm; }
  .hd { height: 31mm; display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-bottom: 0.4mm solid #111827; padding-bottom: 2mm; }
  .hd h1 { font-size: 5.4mm; margin: 0 0 1mm; font-weight: 700; }
  .meta { font-size: 3.3mm; line-height: 1.55; }
  .meta b { color: #475569; font-weight: 500; display: inline-block; min-width: 17mm; }
  .meta .pn { display: inline-block; max-width: 120mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
  .qr { text-align: center; width: 26mm; flex: none; }
  .qr svg { width: 22mm; height: 22mm; display: block; margin: 0 auto; }
  .qr div { font-size: 2.4mm; color: #334155; margin-top: 0.6mm; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2mm; }
  th, td { border: 0.2mm solid #475569; padding: 0 0.8mm; vertical-align: middle; }
  thead th { height: 8mm; background: #f1f5f9; font-size: 3mm; font-weight: 600; text-align: center; line-height: 1.15; }
  thead th small { display: block; font-weight: 400; font-size: 2.4mm; color: #475569; }
  tbody td { height: ${ROW_MM}mm; }
  td.c { text-align: center; white-space: nowrap; }
  td.st { background: #f8fafc; vertical-align: top; padding-top: 1mm; }
  td.st .cd { font-family: ui-monospace, Menlo, monospace; font-size: 2.8mm; color: #334155; font-weight: 600; }
  td.st .sn { font-weight: 600; font-size: 3.3mm; line-height: 1.25; }
  td.st .ss { font-size: 2.6mm; color: #475569; }
  td.nm .ln { display: block; height: 5.4mm; border-bottom: 0.25mm dotted #334155; }
  td.ex .ln { display: block; height: 5.4mm; border-bottom: 0.25mm dotted #334155; }
  .dg { display: inline-flex; gap: 0.4mm; vertical-align: middle; }
  .dg i { display: inline-block; width: 4.2mm; height: 5.6mm; border: 0.25mm solid #334155; background: #fff; }
  .sep { display: inline-block; width: 1.6mm; text-align: center; font-weight: 700; vertical-align: middle; }
  .o { display: inline-block; width: 3.8mm; height: 3.8mm; border: 0.3mm solid #334155; border-radius: 50%; vertical-align: middle; }
  tr.sec td { height: ${SEC_MM}mm; background: #e2e8f0; font-weight: 600; font-size: 2.9mm; }
  tr.gs td { border-top: 0.45mm solid #111827; }
  .ft { position: absolute; left: 11mm; right: 11mm; bottom: 11mm; font-size: 2.7mm; color: #334155; display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; }
  .ft .how { line-height: 1.5; }
  .ft .how .dg i { width: 3.4mm; height: 4.4mm; font-style: normal; text-align: center; font-size: 3mm; line-height: 4.2mm; color: #1d4ed8; font-family: "Sarabun", sans-serif; }
  .ft .sg { white-space: nowrap; text-align: right; line-height: 1.9; }
`;

const COLGROUP = `<colgroup><col style="width:38mm"><col style="width:24mm"><col style="width:21mm"><col style="width:21mm"><col style="width:21mm"><col style="width:20mm"><col style="width:16mm"><col style="width:7mm"><col></colgroup>`;
const THEAD = `<thead><tr><th>ขั้นตอน · ชิ้นส่วน</th><th>ชื่อ<small>ชื่อเล่น ตัวบรรจง</small></th><th>วันที่<small>วว / ดด</small></th><th>เริ่ม<small>24 ชม.</small></th><th>เลิก<small>24 ชม.</small></th><th>ทำได้<small>ชิ้น</small></th><th>เสีย<small>ชิ้น</small></th><th>เสร็จ</th><th>หมายเหตุ</th></tr></thead>`;

function rowsHtml(items: WorkLogItem[]): string {
  let h = "";
  for (const it of items) {
    if (it.kind === "sec") { h += `<tr class="sec"><td colspan="9">${esc(it.title)}</td></tr>`; continue; }
    if (it.kind === "extra") { h += `<tr><td class="ex"><span class="ln"></span></td>${writeCells()}</tr>`; continue; }
    const s = it.step;
    for (let i = 0; i < it.lines; i++) {
      h += `<tr${i === 0 ? ` class="gs"` : ""}>` +
        (i === 0 ? `<td class="st" rowspan="${it.lines}"><div class="cd">${esc(it.code)}</div><div class="sn">${esc(s.step_name)}</div>${s.station ? `<div class="ss">${esc(s.station)}</div>` : ""}</td>` : "") +
        writeCells() + `</tr>`;
    }
  }
  return h;
}

/**
 * ประกอบ HTML ทั้งชุด
 * @param qrSvgs SVG ของ QR ต่อหน้า (ลำดับเดียวกับ pages) — หน้าเรียก `qrcode.toString(page.qrText, {type:"svg"})` แล้วส่งมา
 */
export function renderWorkLogHtml(mo: WorkLogMo, pages: WorkLogPage[], qrSvgs: (string | null)[], opts?: { title?: string; printedAt?: Date }): string {
  const printed = (opts?.printedAt ?? new Date()).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
  const sheets = pages.map((p, i) => `<section class="sheet">
    <span class="cm tl"></span><span class="cm tr"></span><span class="cm bl"></span><span class="cm br"></span>
    <div class="hd">
      <div>
        <h1>ใบจดผลงาน · ${esc(mo.mo_no)}</h1>
        <div class="meta">
          <div><b>สินค้า</b> <span class="pn">${esc(mo.product_sku ?? "")} ${esc(mo.product_name ?? "")}</span></div>
          <div><b>จำนวนสั่ง</b> ${Number(mo.qty || 0).toLocaleString("th-TH")} ชิ้น &nbsp;&nbsp; <b>กำหนดเสร็จ</b> ${thDate(mo.due_date)}</div>
          <div><b>หัวหน้า</b> ........................................ &nbsp;&nbsp; หน้า ${p.index} / ${p.total}</div>
        </div>
      </div>
      <div class="qr">${qrSvgs[i] ?? ""}<div>${esc(mo.mo_no)} · ${p.index}/${p.total}</div></div>
    </div>
    <table>${COLGROUP}${THEAD}<tbody>${rowsHtml(p.items)}</tbody></table>
    <div class="ft">
      <div class="how">วิธีเขียน: ตัวเลขชิดขวา เช่น 74 ชิ้น = <span class="dg"><i></i><i></i><i>7</i><i>4</i></span> · เวลา 24 ชม. (บ่ายโมง = 13:00) · ระบายวงกลม "เสร็จ" เมื่อจบขั้นนั้น<br>
        ใช้ปากกาน้ำเงิน/ดำ · เขียนผิดให้ขีดฆ่าแล้วใช้บรรทัดถัดไป · อย่าเขียนทับจุดดำมุมกระดาษและ QR</div>
      <div class="sg">ผู้ตรวจ .................................<br><span style="color:#64748b">พิมพ์ ${esc(printed)}</span></div>
    </div>
  </section>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(opts?.title ?? `ใบจดผลงาน ${mo.mo_no}`)}</title><style>${CSS}</style></head><body>${sheets}</body></html>`;
}
