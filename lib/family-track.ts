/**
 * ของกลาง — "ใบติดตามงานผลิต" แบบเขียนมือ ต่อรุ่น (สินค้าแม่) · เจ้าของเลือกแบบ A + D (2026-10-31)
 *
 *   A ตารางเส้นทางงาน — แถวละใบจ่ายงาน จัดกลุ่มตามสี: เตรียม-ตัด → จ่ายงาน (ช่าง/วันที่/จำนวน) → ค่าแรง → รับงาน (+ ช่องเสริม)
 *   D แยกตามสถานะ    — พิมพ์เฉพาะงานที่ต้องทำต่อ: รอเตรียม/ตัด · รอจ่ายงาน · อยู่ที่ช่าง · รับแล้วรอ QC/เข้าคลัง
 *
 * ตัวหนา = ข้อมูลที่ระบบรู้แล้ว · เส้นประ = ช่องให้เขียน (แล้วค่อยคีย์เข้าระบบ) · โหมด "ฟอร์มเปล่า" = เหลือแค่สี/เลขใบ/จำนวน
 * ขั้นงานใช้กติกาเดียวกับบอร์ด (app/master/work-board/mo-steps): เตรียม = ติ๊กวัตถุดิบครบ · ตัด = ติ๊กบล็อกครบ (needsCut)
 *   ไม่มีสูตร = ใช้ติ๊กระดับใบ · ขั้นที่แอดมินข้าม (lib/mo-skip) = ข้าม
 * ข้อมูลจาก /api/mo/family-print (track) · หน้าพิมพ์ /print/work-order/family?sheet=track · ไฟล์นี้ไม่ยิง DB (ทดสอบได้)
 */
import { needsCut } from "@/lib/cut-rules";
import { signoffHtml, type SignBox } from "@/lib/print-signoff";
import {
  buildFamilySheet, esc, img, moCodesHtml, num, thDate, TICK,
  type FamilyColumn, type FamilyInput, type FamilyMo, type FamilyPrintSettings, type FamilyWorkOrder, type MoCodes, type PrintColCfg,
} from "@/lib/family-print";

/* ─────────────── ตัวเลือก ─────────────── */
export type TrackExtras = { gb: boolean; rounds: boolean; late: boolean; qc: boolean; mat: boolean; pay: boolean; sign: boolean };
/** ช่องเสริมของแบบ A (ช่องที่มักลืม) — ค่าเริ่ม = ตามที่เจ้าของเห็นใน widget */
export const TRACK_EXTRAS: { key: keyof TrackExtras; label: string; on: boolean }[] = [
  { key: "gb", label: "ดี / เสีย", on: true },
  { key: "rounds", label: "รับหลายรอบ", on: false },
  { key: "late", label: "ค้างกี่วัน / กำหนดส่ง", on: true },
  { key: "qc", label: "QC / เข้าคลัง", on: false },
  { key: "mat", label: "เบิก / คืนวัตถุดิบ", on: false },
  { key: "pay", label: "จ่ายเงินค่าแรงแล้ว", on: false },
  { key: "sign", label: "ลายเซ็นช่าง", on: true },
];
export const TRACK_DEFAULT_EXTRAS = Object.fromEntries(TRACK_EXTRAS.map((e) => [e.key, e.on])) as TrackExtras;
/** อ่านค่าที่จำไว้แบบปลอดภัย — คีย์แปลก/ค่าเพี้ยน = ใช้ค่าเริ่ม */
export function normalizeTrackExtras(raw: unknown): TrackExtras {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(TRACK_EXTRAS.map((e) => [e.key, typeof o[e.key] === "boolean" ? o[e.key] : e.on])) as TrackExtras;
}
export type TrackOptions = {
  extras: TrackExtras;
  /** ฟอร์มเปล่า — ไม่พิมพ์ข้อมูลจากระบบ (เหลือสี/เลขใบ/จำนวน) */
  blank: boolean;
  printed: string;
  /** วันนี้ (YYYY-MM-DD เวลาไทย) — ไว้นับวันค้างที่ช่าง */
  today: string;
  /** บาร์โค้ดเลขใบ (ตั้งค่ากลางเดียวกับใบซื้อ-ตัด) + โค้ดที่สร้างไว้แล้วในเบราว์เซอร์ */
  barcode?: FamilyPrintSettings["barcode"];
  codes?: Record<string, MoCodes>;
  /** คอลัมน์แบบ A ที่ตั้งไว้ (ค่ากลาง family_print_settings.track_cols) — null = ค่าเริ่ม */
  cols?: PrintColCfg[] | null;
};
/** ความกว้างช่องเลขใบ (น้ำหนัก ≈ มม.) — บาร์โค้ดเส้นกว้าง ~6 ซม. · เส้น + QR ต้องวางข้างกันได้ ไม่งั้นแถวสูงเปลือง */
const moColW = (bc?: FamilyPrintSettings["barcode"]) => (bc === "both" ? 86 : bc === "line" ? 66 : bc === "qr" ? 36 : 28);

/* ─────────────── คอลัมน์แบบ A — ปรับได้จากแผงตั้งค่า (ลำดับ · ชื่อหัว · ความกว้าง · โชว์) ───────────────
 * ช่องเสริม (ดี/เสีย · ค้าง · QC · เบิก · จ่ายเงิน · ลงชื่อ) เปิด/ปิดที่ปุ่มบนแถบเครื่องมือเหมือนเดิม (จำต่อเครื่อง)
 * → แผงคุมแค่ลำดับ/ชื่อ/ความกว้างของช่องเสริม · ช่องหลักเปิด/ปิดในแผงได้เลย */
export type TrackColKey = "sku" | "mo" | "prep" | "dispatch" | "labor" | "recv" | "gb" | "late" | "qc" | "mat" | "pay" | "sign";
export const TRACK_EXTRA_COL: Partial<Record<string, keyof TrackExtras>> = { gb: "gb", late: "late", qc: "qc", mat: "mat", pay: "pay", sign: "sign" };
/** ค่าเริ่ม = หน้าตาเดิม (ความกว้างช่องเลขใบตามบาร์โค้ดที่เลือก) */
export function trackDefaultCols(bc?: FamilyPrintSettings["barcode"]): PrintColCfg[] {
  return [
    { key: "sku", label: "สี", width: 30, show: true },
    { key: "mo", label: "ใบสั่งผลิต", width: moColW(bc), show: true },
    { key: "prep", label: "เตรียม - ตัด", width: 25, show: true },
    { key: "dispatch", label: "จ่ายงาน", width: 38, show: true },
    { key: "labor", label: "ค่าแรง", width: 20, show: true },
    { key: "recv", label: "รับงาน", width: 32, show: true },
    { key: "gb", label: "ดี / เสีย", width: 18, show: true },
    { key: "late", label: "ค้าง / กำหนดส่ง", width: 22, show: true },
    { key: "qc", label: "QC / เข้าคลัง", width: 24, show: true },
    { key: "mat", label: "เบิก / คืนของ", width: 22, show: true },
    { key: "pay", label: "จ่ายเงินค่าแรง", width: 22, show: true },
    { key: "sign", label: "ลงชื่อช่าง", width: 24, show: true },
  ];
}
/** รวมค่าที่บันทึกกับค่าเริ่ม: เรียงตามที่บันทึก · คีย์แปลกทิ้ง · คอลัมน์ใหม่แทรกตรงตำแหน่งค่าเริ่มของมัน · ความกว้างว่าง = ค่าเริ่ม */
export function normalizeTrackCols(saved: PrintColCfg[] | null | undefined, bc?: FamilyPrintSettings["barcode"]): PrintColCfg[] {
  const defs = trackDefaultCols(bc);
  const map = new Map((saved ?? []).map((c) => [c.key, c]));
  const merged = defs.map((d) => {
    const s = map.get(d.key);
    return s ? { ...d, label: s.label, width: s.width > 0 ? Math.min(150, s.width) : d.width, show: s.show } : d;
  });
  const order = (saved ?? []).map((c) => c.key).filter((k, i, a) => defs.some((d) => d.key === k) && a.indexOf(k) === i);
  const out = order.map((k) => merged.find((c) => c.key === k)!);
  defs.forEach((d, di) => {
    if (order.includes(d.key)) return;
    let pos = di === 0 ? 0 : out.length;
    for (let j = di - 1; j >= 0; j--) { const at = out.findIndex((c) => c.key === defs[j].key); if (at >= 0) { pos = at + 1; break; } }
    out.splice(pos, 0, merged.find((c) => c.key === d.key)!);
  });
  return out;
}
const codesOf = (moNo: string, opt: TrackOptions) => (opt.blank ? "" : moCodesHtml(moNo, opt.codes, opt.barcode ?? "none"));

/* ─────────────── ตาราง ─────────────── */
export type StepState = "done" | "part" | "todo" | "skip";
export type TrackStep = { state: StepState; ready: number; total: number; at: string | null };
export type TrackMo = {
  mo: FamilyMo; col: FamilyColumn;
  prep: TrackStep; cut: TrackStep;
  /** วัตถุดิบที่ยังต้องซื้อ (รหัส) */
  buy_left: number;
  dispatched: number; remaining: number; received: number; outstanding: number;
  labor: number; due: string | null;
  wos: FamilyWorkOrder[];
  skip_dispatch: boolean; skip_receive: boolean;
  materials_issued: boolean; finished_received: boolean;
};
export type TrackIssue = { key: string; label: string; mos: string[] };
export type FamilyTrack = {
  key: string; title_code: string; title_name: string | null; image_url: string | null;
  groups: { col: FamilyColumn; mos: TrackMo[] }[];
  stats: { skus: number; mos: number; qty: number; labor: number; dispatched: number; received: number; outstanding: number; undispatched: number; finished: number };
  issues: TrackIssue[];
};

const EPS = 0.0001;
const LONG_DAYS = 30;
const shortNo = (moNo: string) => moNo.replace(/^MO-\d{4}-/, "");
const dayNo = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
/** วันค้างนับจากวันจ่าย (ไม่มีวันจ่าย = null) */
export const daysSince = (iso: string | null, today: string) => (iso ? Math.max(0, Math.round(dayNo(today) - dayNo(iso))) : null);
const lv = (ready: number, total: number): StepState => (ready >= total ? "done" : ready > 0 ? "part" : "todo");
const isReady = (s: TrackStep) => s.state === "done" || s.state === "skip";

/** แปลงข้อมูล 1 รุ่น → ใบติดตามงาน (คอลัมน์/ลำดับสีเดียวกับใบซื้อ-ตัด) */
export function buildFamilyTrack(input: FamilyInput, today: string): FamilyTrack {
  const sheet = buildFamilySheet(input);
  const moByNo = new Map(input.mos.map((m) => [m.mo_no, m]));
  const sumByMo = new Map<string, { total: number; ready: number; buy: number }>();
  for (const l of input.buy) {
    const s = sumByMo.get(l.mo_no) ?? { total: 0, ready: 0, buy: 0 };
    s.total += 1; if (l.status === "ready") s.ready += 1; if (l.remaining > EPS) s.buy += 1;
    sumByMo.set(l.mo_no, s);
  }
  const cutByMo = new Map<string, { total: number; done: number }>();
  for (const l of input.cut) {
    if (!needsCut({ material_type: l.type, cut_block_code: l.block, cut_length: l.length, pieces: l.pieces })) continue;
    const c = cutByMo.get(l.mo_no) ?? { total: 0, done: 0 };
    c.total += 1; if (l.cut_done) c.done += 1;
    cutByMo.set(l.mo_no, c);
  }

  const groups = sheet.columns.map((col) => ({
    col,
    mos: col.mos.map(({ mo_no }): TrackMo => {
      const mo = moByNo.get(mo_no)!;
      const t = mo.track;
      const skipped = new Set(t?.skipped ?? []);
      const sm = sumByMo.get(mo_no), ct = cutByMo.get(mo_no);
      const hasBom = !!sm && sm.total > 0;
      // กติกาเดียวกับบอร์ด: มีสูตร = นับติ๊กรายบรรทัด · ไม่มีสูตร = ติ๊กระดับใบ · ข้าม = ข้าม
      const step = (key: "prep" | "cut", ready: number, total: number, flag: boolean, at: string | null): TrackStep => {
        if (skipped.has(key)) return { state: "skip", ready, total, at };
        if (hasBom) return { state: lv(ready, total), ready, total, at: lv(ready, total) === "done" ? at : null };
        return { state: flag ? "done" : "todo", ready: flag ? 1 : 0, total: 1, at: flag ? at : null };
      };
      const wos = t?.work_orders ?? [];
      const qty = Number(mo.qty) || 0;
      const dispatched = wos.reduce((n, w) => n + w.qty, 0);
      const received = wos.reduce((n, w) => n + w.received, 0);
      const dues = [mo.track?.internal_due, mo.due_date, ...wos.map((w) => w.due_date)].filter((d): d is string => !!d).sort();
      return {
        mo, col,
        prep: step("prep", sm?.ready ?? 0, sm?.total ?? 0, !!t?.prep_done, t?.prep_at ?? null),
        cut: step("cut", ct?.done ?? 0, ct?.total ?? 0, !!t?.cut_done, t?.cut_at ?? null),
        buy_left: sm?.buy ?? 0,
        dispatched, remaining: Math.max(0, qty - dispatched), received,
        outstanding: wos.filter((w) => w.status !== "done").reduce((n, w) => n + Math.max(0, w.qty - w.received), 0),
        labor: wos.reduce((n, w) => n + (w.labor_cost ?? 0), 0),
        due: dues[0] ?? null,
        wos,
        skip_dispatch: skipped.has("dispatch"), skip_receive: skipped.has("receive"),
        materials_issued: !!t?.materials_issued, finished_received: !!t?.finished_received,
      };
    }),
  }));
  const all = groups.flatMap((g) => g.mos);

  // ข้อมูลในระบบที่ควรเช็ก — โชว์ท้ายใบให้คนหน้างานเขียนเติม/แก้ (ไม่แก้ข้อมูลเอง)
  const issue = (key: string, label: string, pick: (m: TrackMo) => boolean): TrackIssue => ({ key, label, mos: all.filter(pick).map((m) => shortNo(m.mo.mo_no)) });
  const issues = [
    issue("no_dispatch_date", "ใบจ่ายงานไม่มีวันที่จ่าย", (m) => m.wos.some((w) => !w.dispatch_date)),
    issue("recv_before_dispatch", "วันที่รับงานมาก่อนวันที่จ่าย", (m) => m.wos.some((w) => !!w.dispatch_date && w.submissions.some((s) => !!s.date && s.date < w.dispatch_date!))),
    issue("dispatched_unprepped", "จ่ายงานแล้ว แต่ยังไม่ติ๊กเตรียม/ตัดครบ", (m) => m.dispatched > 0 && !(isReady(m.prep) && isReady(m.cut))),
    issue("no_labor", "จ่ายงานแล้วแต่ไม่มีค่าแรงในระบบ", (m) => m.wos.some((w) => !(Number(w.labor_cost) > 0) && !w.submissions.some((s) => s.wage > 0))),
    issue("long_outstanding", `ค้างที่ช่างเกิน ${LONG_DAYS} วัน`, (m) => m.wos.some((w) => w.status !== "done" && w.received < w.qty && (daysSince(w.dispatch_date, today) ?? 0) > LONG_DAYS)),
    issue("received_open", "รับครบแล้ว แต่ใบยังเปิด / ยังไม่เข้าคลัง", (m) => m.received >= (Number(m.mo.qty) || 0) - EPS && m.received > 0 && m.outstanding <= EPS && !m.finished_received && m.mo.status !== "done"),
  ].filter((i) => i.mos.length > 0);

  return {
    key: sheet.key, title_code: sheet.title_code, title_name: sheet.title_name, image_url: sheet.image_url,
    groups,
    stats: {
      skus: sheet.columns.length, mos: all.length, qty: all.reduce((n, m) => n + (Number(m.mo.qty) || 0), 0),
      labor: all.reduce((n, m) => n + m.labor, 0), dispatched: all.reduce((n, m) => n + m.dispatched, 0),
      received: all.reduce((n, m) => n + m.received, 0), outstanding: all.reduce((n, m) => n + m.outstanding, 0),
      undispatched: all.reduce((n, m) => n + (m.skip_dispatch ? 0 : m.remaining), 0),
      finished: all.filter((m) => m.finished_received).length,
    },
    issues,
  };
}

/** แบ่งงานตามสถานะ (แบบ D) — ใบเดียวอยู่ได้หลายกลุ่ม (เช่น จ่ายไปบางส่วน: ส่วนที่อยู่ที่ช่าง + ส่วนที่รอจ่าย) */
export function trackBuckets(t: FamilyTrack) {
  const all = t.groups.flatMap((g) => g.mos);
  return {
    pre: all.filter((m) => m.dispatched <= EPS && !m.skip_dispatch && !(isReady(m.prep) && isReady(m.cut))),
    toDispatch: all.filter((m) => m.remaining > EPS && !m.skip_dispatch && isReady(m.prep) && isReady(m.cut)),
    atWorker: all.flatMap((m) => m.wos.filter((w) => w.status !== "done" && w.received < w.qty - EPS).map((w) => ({ m, w }))),
    received: all.filter((m) => (m.received > EPS || m.skip_receive) && !m.finished_received),
    finished: all.filter((m) => m.finished_received),
  };
}

/* ─────────────── HTML ─────────────── */
const LN = `<span class="tr-ln"></span>`;
const LNW = `<span class="tr-ln tr-lnw"></span>`;
const B = (v: unknown) => `<b class="tr-sys">${esc(v)}</b>`;
const SM = (v: string) => `<div class="tr-sm">${v}</div>`;
const td = (html: string, cls = "", extra = "") => `<td${cls ? ` class="${cls}"` : ""}${extra}>${html}</td>`;
// ความกว้างเป็นสัดส่วนของหน้ากระดาษ — เปิดช่องเสริมครบทุกช่องก็ไม่ล้นขอบ (ตัวเลขใน list = น้ำหนัก ≈ มม.)
const cols = (list: [string, number][]) => {
  const sum = list.reduce((n, [, w]) => n + w, 0) || 1;
  return `<colgroup>${list.map(([, w]) => `<col style="width:${Math.round((w / sum) * 1000) / 10}%" />`).join("")}</colgroup><thead><tr>${list.map(([l]) => `<th>${esc(l)}</th>`).join("")}</tr></thead>`;
};
const blankRow = (n: number, h = "tr-blank") => `<tr class="${h}">${Array.from({ length: n }, () => `<td>${LN}</td>`).join("")}</tr>`;
const rate = (w: FamilyWorkOrder) => (Number(w.labor_cost) > 0 && w.qty > 0 ? Number(w.labor_cost) / w.qty : null);
const skuCell = (m: TrackMo, opt: TrackOptions, qty?: number) =>
  `${img(m.col.image_url, "tr-img")} ${B(m.col.sku)}${m.col.variant ? ` <span class="tr-sm">${esc(m.col.variant)}</span>` : ""}`
  + `<div class="tr-mo">${esc(m.mo.mo_no)} <span class="tr-sm">· ${num(qty ?? m.mo.qty)} ชิ้น</span></div>${codesOf(m.mo.mo_no, opt)}`;
function stepHtml(label: string, s: TrackStep, blank: boolean): string {
  if (blank || s.state === "todo") return `<div>${TICK}${label} ${LN}</div>`;
  if (s.state === "skip") return `<div class="tr-sm">${label} — ข้าม (แอดมิน)</div>`;
  if (s.state === "part") return `<div>${TICK}${label} ${B(`${s.ready}/${s.total}`)} ${LN}</div>`;
  return `<div class="tr-ok">✓ ${label}${s.at ? ` ${B(thDate(s.at))}` : ""}</div>`;
}

function headHtml(t: FamilyTrack, title: string, opt: TrackOptions): string {
  const s = t.stats;
  const facts = opt.blank ? "" : `<div><span class="label">ค่าแรงรวม:</span> ${num(s.labor)} บาท</div><div><span class="label">จ่ายแล้ว / รับแล้ว:</span> ${num(s.dispatched)} / ${num(s.received)} ชิ้น</div>`
    + `<div><span class="label">ค้างที่ช่าง:</span> ${num(s.outstanding)} · <span class="label">ยังไม่จ่าย:</span> ${num(s.undispatched)} ชิ้น</div>`;
  return `<div class="doc-head-inline"><div class="doc-title">${esc(title)}</div><div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div></div>
<section class="fp-hero">
  <div class="fp-photo">${img(t.image_url, "fp-heroimg")}</div>
  <div class="fp-model"><div class="muted">รุ่น (สินค้าแม่)</div><div class="product-code">${esc(t.title_code)}</div>${t.title_name ? `<div class="product-name">${esc(t.title_name)}</div>` : ""}</div>
  <div class="fp-qty"><div class="muted">รวมทั้งรุ่น</div><div class="qty-big">${num(s.qty)}</div><div>ชิ้น · ${s.skus} สี · ${s.mos} ใบ</div></div>
  <div class="fp-meta"><div><span class="label">พิมพ์:</span> ${esc(opt.printed || "-")}</div>${facts}
    <div class="tr-sm">${opt.blank ? "ฟอร์มเปล่า — เขียนทุกช่อง" : "<b>ตัวหนา</b> = ข้อมูลในระบบ"} · ${LN} = ช่องเขียน</div></div>
</section>`;
}

function issuesHtml(t: FamilyTrack, opt: TrackOptions): string {
  if (opt.blank || !t.issues.length) return "";
  const list = (mos: string[]) => (mos.length > 10 ? `${mos.slice(0, 10).join(", ")} +${mos.length - 10}` : mos.join(", "));
  return `<section class="tr-issues"><div class="tr-issues-title">ข้อมูลในระบบที่ควรเช็ก / เขียนเติม</div><ul>${t.issues.map((i) => `<li>${esc(i.label)} — ${i.mos.length} ใบ <span class="tr-sm">(${esc(list(i.mos))})</span></li>`).join("")}</ul></section>`;
}

/* ── แบบ A: ตารางเส้นทางงาน ── */
/** คอลัมน์ที่แสดงจริง ตามลำดับที่ตั้ง — ช่องเสริมดูจากปุ่มบนแถบ · ช่องหลักดูจาก show · ปิดหมด = กลับไปค่าเริ่ม (กันตารางว่าง) */
function routeCols(opt: TrackOptions): PrintColCfg[] {
  const visible = (list: PrintColCfg[]) => list.filter((c) => { const ex = TRACK_EXTRA_COL[c.key]; return ex ? opt.extras[ex] : c.show; });
  const out = visible(normalizeTrackCols(opt.cols, opt.barcode));
  return out.length ? out : visible(trackDefaultCols(opt.barcode));
}

type RouteLine = { w: FamilyWorkOrder | null; qty: number };
/** แถวของใบนี้: แถวละใบจ่ายงาน + แถวว่าง "ยังไม่จ่าย" ถ้ายังจ่ายไม่ครบ (ฟอร์มเปล่า = แถวว่างแถวเดียว) */
function routeLines(m: TrackMo, opt: TrackOptions): RouteLine[] {
  const lines: RouteLine[] = opt.blank ? [{ w: null, qty: m.mo.qty }]
    : [...m.wos.map((w) => ({ w, qty: w.qty })), ...(m.remaining > EPS && !m.skip_dispatch ? [{ w: null, qty: m.remaining }] : [])];
  return lines.length ? lines : [{ w: null, qty: 0 }];
}

/** skuHtml = ช่อง "สี" (คร่อมทุกแถวของสีนั้น) — ส่งมาเฉพาะใบแรกของสี
 *  สร้างช่องตามคีย์ แล้ววางตามลำดับคอลัมน์ที่ตั้ง (cols) · ช่องที่คร่อมหลายแถว (สี/เลขใบ/เตรียม-ตัด/เบิก) มีเฉพาะแถวแรก */
function routeRows(m: TrackMo, opt: TrackOptions, skuHtml: string | null, cols: PrintColCfg[]): string {
  const e = opt.extras, bl = opt.blank;
  const lines = routeLines(m, opt);
  const span = lines.length > 1 ? ` rowspan="${lines.length}"` : "";
  return lines.map((ln, i) => {
    const w = ln.w, cell: Partial<Record<TrackColKey, string>> = {};
    const cells = { push: (k: TrackColKey, html: string) => { cell[k] = html; } };
    if (i === 0) {
      if (skuHtml) cells.push("sku", skuHtml);
      // เลขใบเต็ม + บาร์โค้ด · "ของยังขาด" เตือนเฉพาะก่อนจ่ายงาน (จ่าย/รับไปแล้ว ของถูกเบิกใช้ไปแล้ว ไม่ต้องรก)
      cells.push("mo", td(`<div class="tr-mo">${esc(m.mo.mo_no)}</div>${SM(`${num(m.mo.qty)} ชิ้น`)}${!bl && m.buy_left && m.dispatched <= EPS ? SM(`<span class="tr-warn">ของยังขาด ${m.buy_left} รายการ</span>`) : ""}${codesOf(m.mo.mo_no, opt)}`, "", span));
      cells.push("prep", td(stepHtml("เตรียม", m.prep, bl) + stepHtml("ตัด", m.cut, bl), "", span));
    }
    // จ่ายงาน
    cells.push("dispatch", td(w
      ? `<div>${B(w.who)}${w.is_craftsman && w.dept ? ` <span class="tr-sm">(${esc(w.dept)})</span>` : ""}</div>`
        + `<div>${w.dispatch_date ? B(thDate(w.dispatch_date)) : `วันที่ ${LN} <span class="tr-warn tr-sm">ไม่มีในระบบ</span>`} · ${B(num(w.qty))} ชิ้น</div>${SM(esc(w.wo_no))}`
      : `<div>${bl ? "" : `<span class="tr-sm">ยังไม่จ่าย ${num(ln.qty)} ชิ้น</span><br>`}ช่าง ${LNW}</div><div>วันที่ ${LN} จำนวน ${LN}</div>`));
    // ค่าแรง
    const r = w ? rate(w) : null;
    cells.push("labor", td(r != null ? `<div>${B(num(r))}/ชิ้น</div><div>รวม ${B(num(Number(w!.labor_cost)))}</div>`
      : `<div>${LN}/ชิ้น</div><div>รวม ${LN}</div>${w ? SM(`<span class="tr-warn">ไม่มีในระบบ</span>`) : ""}`));
    // รับงาน — รอบที่ส่งแล้ว + ช่องเขียนถ้ายังค้าง
    const left = w ? Math.max(0, w.qty - w.received) : ln.qty;
    const got = w ? w.submissions.map((s) => `<div>${s.date ? B(thDate(s.date)) : "-"} · ${B(num(s.qty))}${s.wage > 0 ? ` <span class="tr-sm">${num(s.wage)} บ.</span>` : ""}</div>`).join("") : "";
    const done = w && left <= EPS ? `<div class="tr-ok">✓ ครบ</div>` : "";
    const write = !w || left > EPS ? `${w && w.received > 0 ? SM(`ค้าง ${num(left)}`) : ""}<div>วันที่ ${LN}</div><div>รับ ${LN}</div>` : "";
    cells.push("recv", td(got + done + write + (e.rounds ? SM(`รอบต่อไป ${LN} · ${LN}`) : "")));
    cells.push("gb", td(`<div>ดี ${LN}</div><div>เสีย ${LN}</div>`));
    {
      const d = w && w.status !== "done" && left > EPS ? daysSince(w.dispatch_date, opt.today) : null;
      const due = w?.due_date ?? m.due;
      const overdue = !bl && due && left > EPS && due < opt.today;
      cells.push("late", td(`${!bl && d != null ? `<div class="${d > LONG_DAYS ? "tr-bad" : "tr-warn"}">ค้าง ${d} วัน</div>` : ""}<div>กำหนด ${!bl && due ? `<b class="${overdue ? "tr-bad" : "tr-sys"}">${esc(thDate(due))}</b>` : LN}</div>`));
    }
    {
      const q = w?.qc;
      const qcTxt = !bl && q && q.good + q.defect + q.repairing > 0 ? `<div>QC ผ่าน ${B(num(q.good))}${q.defect + q.repairing ? ` เสีย ${B(num(q.defect + q.repairing))}` : ""}</div>` : `<div>${TICK}QC ${LN}</div>`;
      cells.push("qc", td(qcTxt + (!bl && m.finished_received ? `<div class="tr-ok">✓ เข้าคลัง</div>` : `<div>${TICK}คลัง ${LN}</div>`)));
    }
    if (i === 0) cells.push("mat", td(`${!bl && m.materials_issued ? `<div class="tr-ok">✓ เบิกแล้ว</div>` : `<div>${TICK}เบิก ${LN}</div>`}<div>คืน ${LN}</div>`, "", span));
    cells.push("pay", td(`<div>${TICK}${LN}</div><div>งวด ${LN}</div>`));
    cells.push("sign", td(`<div class="tr-signspace"></div>${LNW}`));
    // วางตามลำดับคอลัมน์ที่ตั้ง (เฉพาะที่แสดง) — ช่องที่คร่อมจากแถวบนไม่มีในแถวนี้ ตารางเลื่อนช่องให้เอง
    return `<tr>${cols.map((c) => cell[c.key as TrackColKey] ?? "").join("")}</tr>`;
  }).join("");
}

export function trackRouteBodyHtml(t: FamilyTrack, opt: TrackOptions): string {
  const c = routeCols(opt);
  let body = "";
  for (const g of t.groups) {
    // ไม่มีแถวหัวสีแล้ว — รูป (ใหญ่ขึ้น) + รหัส + สี อยู่ช่องแรก คร่อมทุกแถวของสีนั้น
    const q = g.mos.reduce((n, m) => n + (Number(m.mo.qty) || 0), 0);
    const rows = g.mos.reduce((n, m) => n + routeLines(m, opt).length, 0);
    const sku = td(`<div class="tr-skuimg">${img(g.col.image_url, "tr-bigimg")}</div><div class="tr-sys">${esc(g.col.sku)}</div>`
      + `${g.col.variant ? `<div class="tr-sm">${esc(g.col.variant)}</div>` : ""}${g.mos.length > 1 ? SM(`${g.mos.length} ใบ · ${num(q)} ชิ้น`) : ""}`, "tr-skucell", rows > 1 ? ` rowspan="${rows}"` : "");
    g.mos.forEach((m, i) => { body += routeRows(m, opt, i === 0 ? sku : null, c); });
  }
  const s = t.stats;
  // แถวรวม: ช่องแรกที่แสดง = "รวม N ชิ้น" · ช่องจ่ายงาน/ค่าแรง/รับงาน มียอดของมัน (ตามลำดับคอลัมน์ที่ตั้ง)
  const tot: Partial<Record<string, string>> = {
    dispatch: opt.blank ? "" : `จ่าย ${num(s.dispatched)}`,
    labor: opt.blank ? LN : num(s.labor),
    recv: opt.blank ? "" : `รับ ${num(s.received)} · ค้าง ${num(s.outstanding)}`,
  };
  body += `<tr class="tr-gh">${c.map((col, i) => `<td>${i === 0 ? `รวม ${num(s.qty)} ชิ้น${tot[col.key] ? ` · ${tot[col.key]}` : ""}` : tot[col.key] ?? ""}</td>`).join("")}</tr>`;
  const sign: SignBox[] = [
    { title: "ผู้บันทึก", lines: [{ kind: "sign" }, { kind: "date" }] },
    { title: "หัวหน้าผลิต", lines: [{ kind: "sign" }, { kind: "date" }] },
  ];
  return `<table class="doc-table tr-table">${cols(c.map((x) => [x.label, x.width]))}<tbody>${body}</tbody></table>${issuesHtml(t, opt)}${signoffHtml(sign, { cols: 2 })}`;
}

/* ── แบบ D: แยกตามสถานะ ── */
function section(title: string, dot: string, count: string, head: [string, number][], rows: string, blankRows: number): string {
  return `<section class="tr-section"><div class="section-title"><span class="tr-dot ${dot}">●</span> ${title} <span class="tr-sm">${count}</span></div>`
    + `<table class="doc-table tr-table">${cols(head)}<tbody>${rows}${Array.from({ length: blankRows }, () => blankRow(head.length)).join("")}</tbody></table></section>`;
}

export function trackStatusBodyHtml(t: FamilyTrack, opt: TrackOptions): string {
  const b = trackBuckets(t), bl = opt.blank;
  const extra = bl ? 3 : 1;   // บรรทัดว่างท้ายแต่ละกลุ่ม
  const firstW = Math.max(44, moColW(opt));   // ช่องสี/ใบ กว้างพอวางบาร์โค้ด
  const parts: string[] = [];

  const h1: [string, number][] = [["สี / ใบ", firstW], ["ของ", 30], ["เตรียม", 44], ["ตัด", 44], ["หมายเหตุ", 70], ["ลงชื่อ", 30]];
  parts.push(section("รอของ / เตรียม / ตัด", "tr-gray", bl ? "" : `${b.pre.length} ใบ`, h1, bl ? "" : b.pre.map((m) => `<tr>${td(skuCell(m, opt))}${td(m.buy_left ? `<span class="tr-warn">ยังขาด ${B(m.buy_left)} รายการ</span>` : `<span class="tr-ok">ครบ</span>`)}${td(stepHtml("เตรียม", m.prep, false) + SM(`วันที่ ${LN}`))}${td(stepHtml("ตัด", m.cut, false) + SM(`วันที่ ${LN}`))}${td(LNW)}${td(LN)}</tr>`).join(""), extra));

  const h2: [string, number][] = [["สี / ใบ", firstW], ["รอจ่าย", 18], ["จ่ายให้ (ช่าง / โต๊ะ)", 50], ["วันที่จ่าย", 26], ["จำนวน", 20], ["เรต / ชิ้น", 22], ["กำหนดส่ง", 26], ["ลงชื่อช่างรับงาน", 40]];
  parts.push(section("รอจ่ายงาน", "tr-blue", bl ? "" : `${b.toDispatch.length} ใบ · ${num(b.toDispatch.reduce((n, m) => n + m.remaining, 0))} ชิ้น`, h2,
    bl ? "" : b.toDispatch.map((m) => `<tr>${td(skuCell(m, opt))}${td(B(num(m.remaining)))}${td(LNW)}${td(LN)}${td(LN)}${td(LN)}${td(m.due ? B(thDate(m.due)) : LN)}${td(LNW)}</tr>`).join(""), extra));

  const h3: [string, number][] = [["สี / ใบ", firstW], ["ช่าง / โต๊ะ", 36], ["จ่ายเมื่อ", 20], ["ค้าง", 16], ["กำหนด", 20], ["ค้างรับ", 16], ["วันที่รับ", 22], ["รับ", 16], ["ดี / เสีย", 24], ["ค่าแรง", 24], ["ลงชื่อ", 28]];
  parts.push(section("อยู่ที่ช่าง — รอรับงาน", "tr-red", bl ? "" : `${b.atWorker.length} ใบจ่ายงาน · ${num(b.atWorker.reduce((n, x) => n + x.w.qty - x.w.received, 0))} ชิ้น`, h3,
    bl ? "" : b.atWorker.map(({ m, w }) => {
      const d = daysSince(w.dispatch_date, opt.today), due = w.due_date ?? m.due, r = rate(w);
      return `<tr>${td(skuCell(m, opt, w.qty) + SM(esc(w.wo_no)))}${td(B(w.who))}${td(w.dispatch_date ? B(thDate(w.dispatch_date)) : `${LN}${SM('<span class="tr-warn">ไม่มีวันที่</span>')}`)}`
        + `${td(d != null ? `<b class="${d > LONG_DAYS ? "tr-bad" : "tr-warn"}">${d} วัน</b>` : "-")}${td(due ? `<b class="${due < opt.today ? "tr-bad" : "tr-sys"}">${esc(thDate(due))}</b>` : LN)}`
        + `${td(B(num(w.qty - w.received)))}${td(LN)}${td(LN)}${td(`ดี ${LN}<br>เสีย ${LN}`)}${td(r != null ? `${B(num(r))}/ชิ้น` : `${LN}/ชิ้น`)}${td(LN)}</tr>`;
    }).join(""), extra));

  const h4: [string, number][] = [["สี / ใบ", firstW], ["ช่าง / โต๊ะ", 32], ["รับเมื่อ", 24], ["รับแล้ว", 16], ["เข้า QC แล้ว", 20], ["QC ผ่าน", 20], ["เสีย / ซ่อม", 22], ["เข้าคลังวันที่", 26], ["ที่เก็บ / ชั้น", 24], ["ลงชื่อ", 28]];
  parts.push(section("รับแล้ว — รอ QC / เข้าคลัง", "tr-amber", bl ? "" : `${b.received.length} ใบ · ${num(b.received.reduce((n, m) => n + m.received, 0))} ชิ้น`, h4,
    bl ? "" : b.received.map((m) => {
      const dates = [...new Set(m.wos.flatMap((w) => w.submissions.map((s) => s.date)).filter((d): d is string => !!d))].sort();
      const who = [...new Set(m.wos.map((w) => w.who))].join(", ");
      const pulled = m.wos.reduce((n, w) => n + w.qc_pulled, 0);
      const q = m.wos.reduce((a, w) => ({ good: a.good + w.qc.good, bad: a.bad + w.qc.defect + w.qc.repairing }), { good: 0, bad: 0 });
      return `<tr>${td(skuCell(m, opt))}${td(who ? B(who) : "-")}${td(dates.length ? B(dates.map((d) => thDate(d)).join(", ")) : m.skip_receive ? '<span class="tr-sm">ข้ามขั้นรับคืน</span>' : "-")}${td(B(num(m.received)))}`
        + `${td(pulled ? B(num(pulled)) : LN)}${td(q.good ? B(num(q.good)) : LN)}${td(q.bad ? B(num(q.bad)) : LN)}${td(LN)}${td(LN)}${td(LN)}</tr>`;
    }).join(""), extra));

  if (!bl && b.finished.length) parts.push(`<div class="tr-sm">เข้าคลังแล้ว ${b.finished.length} ใบ (ไม่แสดง)</div>`);
  parts.push(issuesHtml(t, opt));
  parts.push(signoffHtml([
    { title: "ผู้จ่ายงาน", lines: [{ kind: "sign" }, { kind: "date" }] },
    { title: "ผู้รับงาน / QC", lines: [{ kind: "sign" }, { kind: "date" }] },
    { title: "หัวหน้าผลิต", lines: [{ kind: "sign" }, { kind: "date" }] },
  ], { cols: 3 }));
  return parts.join("\n");
}

export type TrackSheetKind = "route" | "status";
export const TRACK_SHEET_TITLE: Record<TrackSheetKind, string> = { route: "ใบติดตามงานผลิต", status: "ใบงานตามสถานะ" };

/** ชุดข้อมูลต่อแผ่น (เทมเพลตเดียวกับใบซื้อ-ตัด: head_html + body_html) */
export function familyTrackHtmlData(t: FamilyTrack, kind: TrackSheetKind, opt: TrackOptions): Record<string, unknown> {
  return {
    head_html: headHtml(t, TRACK_SHEET_TITLE[kind], opt),
    body_html: kind === "route" ? trackRouteBodyHtml(t, opt) : trackStatusBodyHtml(t, opt),
  };
}

/** CSS เพิ่มของใบติดตามงาน — ต่อท้าย buildFamilyTemplate(…, styleCss) */
export const TRACK_CSS = `
.tr-table td { vertical-align: top; line-height: 1.45; }
.tr-table td > div + div { margin-top: 0.6mm; }
.tr-ln { display: inline-block; min-width: 11mm; height: 3.6mm; border-bottom: 0.2mm dotted #475569; vertical-align: -0.8mm; }
.tr-lnw { min-width: min(24mm, 100%); }
.tr-sys { font-weight: 800; }
.tr-sm { font-size: 8px; color: #475569; font-weight: 400; }
.tr-ok { color: #15803d; font-weight: 700; }
.tr-warn { color: #b45309; }
.tr-bad { color: #b91c1c; font-weight: 800; }
.tr-gh td { background: #f1f5f9; font-weight: 700; vertical-align: middle; }
.tr-img { width: 7mm; height: 7mm; object-fit: contain; vertical-align: middle; background: #fff; }
.tr-img.fp-noimg { width: 6mm; height: 6mm; }
.tr-skucell { text-align: center; vertical-align: middle !important; }
.tr-bigimg { display: block; width: 16mm; height: 16mm; object-fit: contain; margin: 0 auto 0.8mm; background: #fff; }
.tr-bigimg.fp-noimg { width: 14mm; height: 14mm; }
.tr-mo { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 800; }
.tr-table .fp-codes { flex-wrap: nowrap; }
.tr-blank td { height: 9mm; }
.tr-signspace { height: 5mm; }
.tr-section { margin-bottom: 2mm; break-inside: auto; }
.tr-dot { font-size: 11px; }
.tr-gray { color: #94a3b8; } .tr-blue { color: #2563eb; } .tr-red { color: #dc2626; } .tr-amber { color: #d97706; }
.tr-issues { border: 0.25mm solid #f59e0b; background: #fffbeb; border-radius: 0.6mm; padding: 1.5mm 2mm; margin: 2.5mm 0; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.tr-issues-title { font-weight: 800; color: #92400e; margin-bottom: 0.6mm; }
.tr-issues ul { margin: 0; padding-left: 4mm; }
@media print { .tr-blank td { height: 8mm; } }
`;
