/**
 * ใบตัดผ้า (พิมพ์) จากแผนตัดผ้า — 1 ผ้า = 1 ส่วน: สรุปตัดรวม · ผังการวาง (แบ่งท่อนละ ~250 ซม. ต่อแถบ) · รายการชิ้น · แบ่งต่อใบ · ช่องเซ็น
 * ใช้ที่: app/print/fabric-plan · ข้อมูลจาก lib/fabric-plan (planGroup)
 */
import type { PlanGroupResult } from "./fabric-plan";
import type { FabricResult } from "./fabric-calc";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const COLORS = ["#c7d2fe", "#a7f3d0", "#fde68a", "#fecaca", "#bae6fd", "#ddd6fe", "#fbcfe8", "#d9f99d"];
const SEG_CM = 250;
const MAX_SEGS = 6;

export type PrintMo = { mo_no: string; product_sku: string | null; product_name: string | null; qty: number };

/** ผังเป็น SVG แถบละ SEG_CM ซม. (ผ้าม้วน) หรือผืนละแถบ (ผ้าผืน) — ยาวเกิน MAX_SEGS แถบ = บอกว่าที่เหลือวางแบบเดียวกัน */
export function layoutSvg(res: FabricResult, face: number, sheetL: number | null): string {   // ใช้ซ้ำ: lib/fabric-buy-print
  const keys = [...new Set(res.rows.flatMap((r) => r.items.map((i) => i.key)))];
  const color = (k: string) => COLORS[Math.max(0, keys.indexOf(k)) % COLORS.length];
  type Seg = { label: string; from: number; len: number; items: { x: number; y: number; w: number; h: number; key: string; label: string }[] };
  const segs: Seg[] = [];
  if (sheetL) {
    const n = Math.min(res.sheetsDrawn ?? res.sheetsUsed ?? 1, MAX_SEGS);
    for (let s = 0; s < n; s++) segs.push({ label: `ผืนที่ ${s + 1}`, from: 0, len: sheetL, items: res.rows.filter((r) => (r.sheetIndex ?? 0) === s).flatMap((r) => r.items.map((i) => ({ ...i, y: i.y - r.y + (r.yInSheet ?? r.y) }))) });
  } else {
    const total = Math.max(1, res.usedLengthCm);
    const all = res.rows.flatMap((r) => r.items);
    for (let from = 0; from < total && segs.length < MAX_SEGS; from += SEG_CM) {
      const len = Math.min(SEG_CM, total - from);
      segs.push({ label: `${fmt(from)}–${fmt(from + len)} ซม.`, from, len, items: all.filter((i) => i.y < from + len && i.y + i.h > from).map((i) => ({ ...i, y: i.y - from })) });
    }
  }
  const W = 180;   // มม. บนกระดาษ (หน้ากว้างผ้า = แนวนอน)
  const strips = segs.map((s) => {
    const k = W / face, H = s.len * k;
    const items = s.items.map((i) => `<rect x="${(i.x * k).toFixed(2)}" y="${(i.y * k).toFixed(2)}" width="${(i.w * k).toFixed(2)}" height="${(i.h * k).toFixed(2)}" fill="${color(i.key)}" stroke="#334155" stroke-width="0.15"/>${i.w * k > 9 && i.h * k > 4 ? `<text x="${((i.x + i.w / 2) * k).toFixed(2)}" y="${((i.y + i.h / 2) * k + 1).toFixed(2)}" font-size="2.6" text-anchor="middle" fill="#0f172a">${esc(i.label)}</text>` : ""}`).join("");
    return `<div class="strip"><div class="sl">${esc(s.label)}</div><svg viewBox="0 0 ${W} ${H.toFixed(2)}" width="${W}mm" height="${H.toFixed(2)}mm"><rect x="0" y="0" width="${W}" height="${H.toFixed(2)}" fill="#fff" stroke="#94a3b8" stroke-width="0.3"/>${items}</svg></div>`;
  }).join("");
  const more = sheetL ? ((res.sheetsUsed ?? 0) > segs.length ? `<p class="sm">* แสดง ${segs.length} จาก ${res.sheetsUsed} ผืน (ผืนที่เหลือวางแบบเดียวกัน)</p>` : "")
    : (res.usedLengthCm > segs.length * SEG_CM ? `<p class="sm">* แสดง ${fmt(segs.length * SEG_CM)} ซม. แรก จาก ${fmt(res.usedLengthCm)} ซม. (ที่เหลือวางซ้ำแบบเดียวกัน)</p>` : "");
  return strips + more + (res.sampledFrom ? `<p class="sm">* ล็อตใหญ่: จำลอง ${fmt(res.sampledFrom.simulated)} จาก ${fmt(res.sampledFrom.total)} ชิ้น แล้วขยายผล</p>` : "");
}

export function renderFabricPlanHtml(groups: PlanGroupResult[], mos: Record<string, PrintMo>, opts: { title: string; date: string }): string {
  const sections = groups.filter((g) => g.ok).map((g) => {
    const res = g.combined.layout;
    const blocks = new Map<string, number>();
    for (const r of res?.rows ?? []) for (const i of r.items) blocks.set(i.label, (blocks.get(i.label) ?? 0) + 1);
    const pieceRows = [...blocks.entries()].sort((a, b) => b[1] - a[1]).map(([lb, n]) => `<tr><td>${esc(lb)} ซม.</td><td class="n">${fmt(n)}</td></tr>`).join("");
    const moRows = g.per_mo.map((m) => { const mo = mos[m.mo_no]; return `<tr><td><b>${esc(mo?.product_sku ?? m.mo_no)}</b><div class="sm">${esc(m.mo_no)}${mo ? ` · ${fmt(mo.qty)} ใบ` : ""}</div></td><td class="n">${fmt(m.pieces)}</td><td class="n">${fmt(m.alloc)}</td><td class="w"></td></tr>`; }).join("");
    return `<section class="pg">
      <header><div><div class="t">ใบตัดผ้า</div><div class="sub">${esc(g.name ?? g.sku)} <span class="sm">(${esc(g.sku)})</span></div></div>
        <div class="meta"><div>วันที่ ${esc(opts.date)}</div><div>หน้ากว้าง <b>${fmt(g.face_width_cm)}</b> ซม.${g.sheet_length_cm ? ` · ผืนยาว ${fmt(g.sheet_length_cm)}` : ""}</div></div></header>
      <div class="kpi"><div><span>ต้องใช้ (${g.best === "combined" ? (g.mos.length > 1 ? "ตัดรวม" : "ใบเดียว") : "ตัดแยกดีกว่า"})</span><b>${fmt(g.need)} ${esc(g.uom ?? "")}</b></div><div><span>ยาวรวม</span><b>${fmt(g.combined.length_cm)} ซม.</b></div><div><span>ใช้ผ้า</span><b>${fmt(g.combined.efficiency_pct)}%</b></div><div><span>ชิ้นทั้งหมด</span><b>${fmt(g.pieces)}</b></div>${g.saved > 0 ? `<div><span>ประหยัดกว่าตัดแยก</span><b>${fmt(g.saved)} ${esc(g.uom ?? "")}</b></div>` : ""}</div>
      ${g.best === "separate" ? `<p class="warn">ผ้านี้วางรวมแล้วยาวกว่าตัดทีละใบ (${fmt(g.combined.qty)} vs ${fmt(g.separate)}) → แนะนำตัดแยก ใช้ผังในใบสั่งผลิตแต่ละใบ · ผังด้านล่างเป็นแบบวางรวม (ไว้เทียบ)</p>` : ""}
      <div class="cols"><div class="lay">${res ? layoutSvg(res, g.face_width_cm, g.sheet_length_cm) : ""}</div>
        <div class="side">
          <table><thead><tr><th>ขนาดชิ้น (กว้าง×ยาว)</th><th class="n">ชิ้น</th></tr></thead><tbody>${pieceRows}</tbody></table>
          <table><thead><tr><th>ใบสั่งผลิต</th><th class="n">ชิ้น</th><th class="n">ผ้า</th><th class="w">ตัดแล้ว</th></tr></thead><tbody>${moRows}</tbody></table>
        </div></div>
      <div class="sign"><div>ผู้ตัด ........................................<br><span>วันที่ ............/............/............</span></div><div>ผ้าที่ใช้จริง ................ ${esc(g.uom ?? "")}<br><span>เศษเหลือ ......................</span></div><div>ผู้ตรวจ ........................................</div></div>
    </section>`;
  }).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
    @page{size:A4;margin:10mm}
    body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;color:#0f172a;margin:0;font-size:11px}
    .pg{page-break-after:always}.pg:last-child{page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #0f172a;padding-bottom:4px;margin-bottom:6px}
    .t{font-size:18px;font-weight:700}.sub{font-size:13px;font-weight:600}.meta{text-align:right}.sm{font-size:9.5px;color:#64748b}
    .kpi{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.kpi div{border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px}.kpi span{display:block;font-size:9px;color:#64748b}.kpi b{font-size:13px}
    .cols{display:flex;gap:8px;align-items:flex-start}.lay{flex:none;width:182mm}.side{flex:1;min-width:0}
    .strip{margin-bottom:4px;break-inside:avoid}.sl{font-size:9px;color:#64748b}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #cbd5e1;padding:2px 4px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:9.5px}.n{text-align:right}.w{width:40px}
    .sign{display:flex;justify-content:space-between;gap:12px;margin-top:10px}.sign span{font-size:9.5px;color:#64748b}.warn{background:#fffbeb;border:1px solid #fcd34d;border-radius:4px;padding:4px 8px;color:#92400e}
    @media print{.cols{display:block}.lay{width:auto}}
  </style></head><body>${sections || "<p>ไม่มีผ้าที่วางได้</p>"}</body></html>`;
}
