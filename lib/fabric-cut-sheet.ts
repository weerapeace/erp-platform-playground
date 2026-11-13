/**
 * ใบวิธีตัด (ของกลาง · สูตรล้วน + สร้าง HTML พิมพ์) — เจ้าของขอ 2026-11-13
 *   "ถ้าซ้ำกันให้พิมพ์แผ่นเดียว แล้วบอกว่า x เท่าไหร่ · มีเลขลำดับที่แบบตัด · ม้วนพิมพ์ตัดช่วง 90 ซม. ให้บอกว่าต่อ · มีตารางชิ้น · บอกว่าพิสูจน์แล้ว"
 *
 *   วิธีคิดแบบห้องตัดจริง: หา "แบบตัด" (marker) ที่วางชิ้นของ N ใบแล้วใช้ผ้าต่อใบน้อยที่สุด → วางซ้ำ M รอบ + แบบเศษท้าย (ใบที่เหลือ)
 *     ผ้าม้วน: ลอง N = 1…12 ใบ (แบบยาวไม่เกินโต๊ะตัด ~6 ม.) · ผ้าผืน: N = ใส่ได้มากสุดใน 1 ผืน
 *     ชิ้นต่อใบไม่เป็นเลขเต็ม (เช่นรวมหลายสีจำนวนไม่เท่ากัน) → แบบเดียว = วางทั้งงาน
 *   ตัววาง = packFabric (lib/fabric-calc) ตัวเดียวกับทุกที่ · ไม่บวกเผื่อเสียในแบบ (บอกแยก)
 *   เลขชิ้น = ลำดับในรายการชิ้น (ชิ้นแรก = 1) — ตัวแสดงผังบนจอ (FabricLayoutPreview prop numbers) ใช้เลขชุดเดียวกัน
 *
 * ใช้ที่: app/fabric-calc (ผ้าเดียว · ทั้งตระกูล) · components/design-sheet-detail/fabric-calc-modal · เทสต์ lib/__tests__/fabric-cut-sheet.test.ts
 */
import { packFabric, YARD_CM, type FabricItem, type FabricPiece, type FabricResult } from "./fabric-calc";

export type CutPiece = { key: string; label: string; width_cm: number; length_cm: number; per_unit: number; no_rotate?: boolean };
export type LegendRow = { no: number; key: string; label: string; w: number; h: number; per_unit: number; total: number; no_rotate: boolean };
export type CutMarker = { id: string; bags: number; repeats: number; length_cm: number; result: FabricResult };
export type CutPlan = {
  ok: boolean; error?: string;
  markers: CutMarker[];
  total_length_cm: number;      // ผ้าม้วน: ยาวรวมทุกแบบ × รอบ (ไม่รวมเผื่อเสีย)
  total_sheets?: number;        // ผ้าผืน: จำนวนผืนรวม
  whole: boolean;               // true = วางทั้งงานเป็นแบบเดียว (ชิ้นต่อใบไม่เป็นเลขเต็ม / ใบเดียว)
};
export type CutPlanInput = {
  pieces: CutPiece[]; qty: number; faceWidthCm: number; sheetLengthCm?: number | null;
  allowRotate?: boolean; gapCm?: number; maxBags?: number; maxMarkerCm?: number;
};

const isWhole = (n: number) => Math.abs(n - Math.round(n)) < 1e-6;

/** เลขชิ้นตามลำดับรายการ (ชิ้นแรก = 1) → { key: เลข } */
export function pieceNumbers(pieces: { key: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  pieces.forEach((p, i) => { if (out[p.key] == null) out[p.key] = i + 1; });
  return out;
}

export function pieceLegend(pieces: CutPiece[], qty: number): LegendRow[] {
  return pieces.filter((p) => p.width_cm > 0 && p.length_cm > 0 && p.per_unit > 0).map((p, i) => ({
    no: i + 1, key: p.key, label: p.label || `${p.width_cm}×${p.length_cm}`, w: p.width_cm, h: p.length_cm,
    per_unit: p.per_unit, total: Math.round(p.per_unit * qty), no_rotate: !!p.no_rotate,
  }));
}

const packBags = (i: CutPlanInput, pieces: CutPiece[], bags: number) => packFabric({
  pieces: pieces.map((p): FabricPiece => ({ key: p.key, label: p.label, width_cm: p.width_cm, length_cm: p.length_cm, qty: Math.round(p.per_unit * bags), noRotate: p.no_rotate })),
  faceWidthCm: i.faceWidthCm, sheetLengthCm: i.sheetLengthCm ?? null, allowRotate: i.allowRotate !== false, wastePercent: 0, gapCm: i.gapCm ?? 0,
});
const lenOf = (r: FabricResult) => r.rows.reduce((m, row) => Math.max(m, ...row.items.map((it) => it.y + it.h)), 0);

/** หาแบบตัดที่วางซ้ำได้ (ดูหัวไฟล์) */
export function planCutMarkers(i: CutPlanInput): CutPlan {
  const qty = Math.max(0, Math.floor(Number(i.qty) || 0));
  const pieces = i.pieces.filter((p) => p.width_cm > 0 && p.length_cm > 0 && p.per_unit > 0);
  const fail = (error: string): CutPlan => ({ ok: false, error, markers: [], total_length_cm: 0, whole: true });
  if (qty <= 0 || pieces.length === 0) return fail("ยังไม่มีชิ้นตัดหรือจำนวนผลิต");
  if (!(i.faceWidthCm > 0)) return fail("ยังไม่รู้หน้ากว้างผ้า");
  const sheet = Number(i.sheetLengthCm) > 0;
  const whole = (): CutPlan => {
    const r = packFabric({
      pieces: pieces.map((p) => ({ key: p.key, label: p.label, width_cm: p.width_cm, length_cm: p.length_cm, qty: Math.round(p.per_unit * qty), noRotate: p.no_rotate })),
      faceWidthCm: i.faceWidthCm, sheetLengthCm: i.sheetLengthCm ?? null, allowRotate: i.allowRotate !== false, wastePercent: 0, gapCm: i.gapCm ?? 0,
    });
    if (!r.ok) return fail(r.error ?? "วางไม่ได้");
    return { ok: true, markers: [{ id: "A", bags: qty, repeats: 1, length_cm: sheet ? 0 : r.usedLengthCm, result: r }], total_length_cm: sheet ? 0 : r.usedLengthCm, total_sheets: sheet ? r.sheetsUsed : undefined, whole: true };
  };
  if (qty === 1 || !pieces.every((p) => isWhole(p.per_unit))) return whole();

  if (sheet) {
    // ผ้าผืน: ใส่ได้กี่ใบใน 1 ผืน (ลองเพิ่มทีละใบจนเกิน 1 ผืน)
    let best = 0, bestRes: FabricResult | null = null;
    for (let m = 1; m <= Math.min(qty, 60); m++) {
      const r = packBags(i, pieces, m);
      if (!r.ok || (r.sheetsUsed ?? 99) > 1) break;
      best = m; bestRes = r;
    }
    if (!bestRes) return whole();   // 1 ใบใหญ่กว่า 1 ผืน → วางทั้งงาน
    const reps = Math.floor(qty / best), rest = qty % best;
    const markers: CutMarker[] = [{ id: "A", bags: best, repeats: reps, length_cm: 0, result: bestRes }];
    if (rest > 0) { const r = packBags(i, pieces, rest); if (r.ok) markers.push({ id: "B", bags: rest, repeats: 1, length_cm: 0, result: r }); }
    return { ok: true, markers, total_length_cm: 0, total_sheets: reps + (rest > 0 ? 1 : 0), whole: false };
  }

  // ผ้าม้วน: แบบ N ใบที่ใช้ผ้าต่อใบน้อยสุด (ยาวไม่เกินโต๊ะตัด)
  const maxBags = Math.max(1, Math.min(qty, i.maxBags ?? 12));
  const maxLen = i.maxMarkerCm ?? 600;
  let best: { m: number; r: FabricResult; len: number } | null = null;
  for (let m = 1; m <= maxBags; m++) {
    const r = packBags(i, pieces, m);
    if (!r.ok) return fail(r.error ?? "วางไม่ได้");
    const len = lenOf(r);
    if (m > 1 && len > maxLen) break;
    if (!best || len / m < best.len / best.m - 1e-6) best = { m, r, len };
  }
  if (!best) return whole();
  const reps = Math.floor(qty / best.m), rest = qty % best.m;
  const markers: CutMarker[] = [{ id: "A", bags: best.m, repeats: reps, length_cm: best.len, result: best.r }];
  if (rest > 0) { const r = packBags(i, pieces, rest); if (r.ok) markers.push({ id: "B", bags: rest, repeats: 1, length_cm: lenOf(r), result: r }); }
  const total = markers.reduce((s, m) => s + m.length_cm * m.repeats, 0);
  return { ok: true, markers, total_length_cm: total, whole: false };
}

// ── HTML พิมพ์ ──────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });
const COLORS = [["#c7d2fe", "#4f46e5"], ["#bbf7d0", "#16a34a"], ["#fed7aa", "#ea580c"], ["#fbcfe8", "#db2777"], ["#bae6fd", "#0284c7"], ["#fde68a", "#d97706"], ["#ddd6fe", "#7c3aed"], ["#a5f3fc", "#0891b2"]];
const SEG_CM = 90;   // ม้วนยาว → ตัดช่วงละ 90 ซม. ต่อหน้ากระดาษ (เจ้าของกำหนด)
const MAX_SEGS = 12; // แบบเดียวยาวมาก (วางทั้งงาน) → พิมพ์ไม่เกิน 12 ช่วง

/** ป้ายในกล่องชิ้น: เลข (วงกลม) + ชื่อ/ขนาด ย่อให้พอดี · ชิ้นสูงแคบเขียนแนวตั้ง · ไม่พอ = เลขอย่างเดียว (หน่วย = ซม. ของ viewBox) */
function pieceSvg(it: FabricItem, no: number | undefined, k: number, color: string[], dashedTop: boolean, dashedBottom: boolean): string {
  const [fill, stroke] = color;
  const sw = 0.35 / k;
  let s = `<rect x="${it.x.toFixed(2)}" y="${it.y.toFixed(2)}" width="${it.w.toFixed(2)}" height="${it.h.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  if (dashedTop) s += `<line x1="${it.x}" y1="${it.y}" x2="${it.x + it.w}" y2="${it.y}" stroke="#fff" stroke-width="${sw * 2}" /><line x1="${it.x}" y1="${it.y}" x2="${it.x + it.w}" y2="${it.y}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${2 / k} ${1.2 / k}"/>`;
  if (dashedBottom) s += `<line x1="${it.x}" y1="${it.y + it.h}" x2="${it.x + it.w}" y2="${it.y + it.h}" stroke="#fff" stroke-width="${sw * 2}" /><line x1="${it.x}" y1="${it.y + it.h}" x2="${it.x + it.w}" y2="${it.y + it.h}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${2 / k} ${1.2 / k}"/>`;
  const minMm = Math.min(it.w, it.h) * k;
  if (no != null && minMm >= 2.6) {
    const r = Math.min(2.2, minMm * 0.32) / k;
    const vert0 = it.h > it.w * 1.6;
    const cx = vert0 ? it.x + it.w / 2 : it.x + r + 0.6 / k, cy = it.y + r + 0.6 / k;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="${sw}"/><text x="${cx}" y="${cy}" font-size="${r * 1.25}" text-anchor="middle" dominant-baseline="central" font-weight="700" fill="#0f172a">${no}</text>`;
  }
  const label = `${esc(it.label)}${it.rotated ? " ↻" : ""}`;
  const vert = it.h > it.w * 1.6;
  const L = (vert ? it.h : it.w) * k, T = (vert ? it.w : it.h) * k;   // มม.
  const fsMm = Math.min(3, L / Math.max(1, it.label.length * 0.62 + 1), T * 0.4);
  if (fsMm >= 1.5) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2 + (vert ? 0 : Math.min(it.h * 0.12, 2.2 / k));
    s += `<text x="${cx}" y="${cy}" font-size="${fsMm / k}" text-anchor="middle" dominant-baseline="central" fill="#0f172a"${vert ? ` transform="rotate(-90 ${cx} ${cy})"` : ""}>${label}</text>`;
  }
  return s;
}

/** วาดแบบตัด 1 แบบ — ม้วนยาว: แบ่งช่วงละ 90 ซม. มี "▼ ต่อ" / "▲ ต่อจาก" · ผืน: ผืนแรกของแบบ */
function markerSvg(m: CutMarker, face: number, sheetL: number | null, nums: Record<string, number>, colorOf: (k: string) => string[]): string {
  const W = 176;           // มม. ความกว้างบนกระดาษ = หน้าผ้า
  const k = W / face;      // มม. ต่อ ซม.
  const items = m.result.rows.flatMap((r) => (sheetL ? r.items.filter(() => (r.sheetIndex ?? 0) === 0).map((it) => ({ ...it, y: it.y - r.y + (r.yInSheet ?? r.y) })) : r.items));
  const total = sheetL ?? Math.max(1, lenOf(m.result));   // ผังที่วาดได้จริง (ล็อตใหญ่ = ส่วนที่จำลอง)
  const segs: { from: number; to: number }[] = [];
  for (let f = 0; f < total - 1e-6; f += SEG_CM) segs.push({ from: f, to: Math.min(total, f + SEG_CM) });
  const shown = segs.slice(0, MAX_SEGS);
  const more = segs.length > MAX_SEGS ? `<p class="sm">* แสดง ${MAX_SEGS} ช่วงแรก (${fmt(MAX_SEGS * SEG_CM, 0)} ซม.) จาก ${segs.length} ช่วง — ที่เหลือวางลักษณะเดียวกัน</p>` : "";
  return shown.map((sg, si) => {
    const len = sg.to - sg.from, H = len * k;
    const inSeg = items.filter((it) => it.y < sg.to - 1e-6 && it.y + it.h > sg.from + 1e-6);
    const clipId = `c${m.id}${si}`;
    const body = inSeg.map((it) => {
      const top = it.y < sg.from - 1e-6, bottom = it.y + it.h > sg.to + 1e-6;
      return pieceSvg({ ...it, y: it.y - sg.from }, nums[it.key], k, colorOf(it.key), top, bottom);
    }).join("");
    const ticks = Array.from({ length: Math.floor(len / 10) + 1 }, (_, t) => t * 10).map((y) => `<line x1="${-2.5 / k}" y1="${y}" x2="0" y2="${y}" stroke="#94a3b8" stroke-width="${0.2 / k}"/>${y % 30 === 0 ? `<text x="${-3 / k}" y="${y}" font-size="${2 / k}" text-anchor="end" dominant-baseline="central" fill="#64748b">${fmt(sg.from + y, 0)}</text>` : ""}`).join("");
    const head = si > 0 ? `<div class="cont">▲ ต่อจากช่วง ${si} (${fmt(sg.from, 0)} ซม.)</div>` : "";
    const tail = si < shown.length - 1 ? `<div class="cont">▼ ต่อหน้าถัดไป — ช่วง ${si + 2}</div>` : "";
    return `<div class="seg">${head}<div class="sl">${segs.length > 1 ? `ช่วง ${si + 1}/${segs.length} · ` : ""}${fmt(sg.from, 0)}–${fmt(sg.to, 0)} ซม.</div>
      <svg viewBox="${-8 / k} 0 ${face + 8 / k} ${len}" width="${W + 8}mm" height="${H.toFixed(1)}mm"><defs><clipPath id="${clipId}"><rect x="0" y="0" width="${face}" height="${len}"/></clipPath></defs>
      <rect x="0" y="0" width="${face}" height="${len}" fill="#f8fafc" stroke="#475569" stroke-width="${0.35 / k}"/>${ticks}<g clip-path="url(#${clipId})">${body}</g></svg>${tail}</div>`;
  }).join("") + more;
}

export type CutStatus = { measured: boolean; text: string };
export type CutSheetInput = {
  title: string; date: string;
  fabric_name: string; product_label?: string | null;
  face_full_cm: number; usable_cm: number; sheet_length_cm?: number | null;
  qty: number; legend: LegendRow[]; plan: CutPlan;
  waste_pct?: number; unit_label?: string;   // หลา / เมตร / ผืน — สรุปความยาวรวมเผื่อเสีย
  status?: CutStatus | null;
};

/** 1 ผ้า = 1 ส่วน (ขึ้นหน้าใหม่) */
export function cutSheetSection(c: CutSheetInput): string {
  const sheetL = Number(c.sheet_length_cm) > 0 ? Number(c.sheet_length_cm) : null;
  const nums = Object.fromEntries(c.legend.map((l) => [l.key, l.no]));
  const keys = c.legend.map((l) => l.key);
  const colorOf = (k: string) => COLORS[Math.max(0, keys.indexOf(k)) % COLORS.length];
  const stamp = c.status?.measured
    ? `<div class="stamp ok">✓ พิสูจน์แล้ว<span>${esc(c.status.text)}</span></div>`
    : `<div class="stamp est">คาดการณ์<span>${esc(c.status?.text || "ยังไม่ได้วางจริง — ตัดแล้วกรอกผ้าที่ใช้จริงท้ายใบ")}</span></div>`;
  const legendRows = c.legend.map((l) => `<tr><td class="no"><b>${l.no}</b></td><td>${esc(l.label)}</td><td class="n">${fmt(l.w, 1)} × ${fmt(l.h, 1)}</td><td class="n">${fmt(l.per_unit, 2)}</td><td class="n">${fmt(l.total, 0)}</td><td>${l.no_rotate ? "ห้ามหมุน" : ""}</td></tr>`).join("");
  const waste = Number(c.waste_pct) || 0;
  const p = c.plan;
  let summary = "";
  if (p.ok) {
    if (sheetL) summary = `ผ้าผืน ${fmt(c.usable_cm, 1)} × ${fmt(sheetL, 1)} ซม. · ใช้ ${fmt(p.total_sheets ?? 0, 0)} ผืน${waste ? ` (+ เผื่อเสีย ${fmt(waste, 1)}% = ${fmt(Math.ceil((p.total_sheets ?? 0) * (1 + waste / 100)), 0)} ผืน)` : ""}`;
    else {
      const withWaste = p.total_length_cm * (1 + waste / 100);
      summary = `ยาวรวมตามแบบตัด ${fmt(p.total_length_cm / 100)} ม. (${fmt(p.total_length_cm / YARD_CM)} หลา)${waste ? ` + เผื่อเสีย ${fmt(waste, 1)}% = <b>${fmt(withWaste / YARD_CM)} หลา</b> (${fmt(withWaste / 100)} ม.)` : ""}`;
    }
  }
  const markers = p.ok ? p.markers.map((m) => `<div class="mk">
      <div class="mh"><b>แบบตัด ${m.id}</b> — ได้ ${fmt(m.bags, 0)} ใบ/รอบ · <span class="rep">× ${fmt(m.repeats, 0)} ${sheetL ? "ผืน" : "รอบ"}</span>${sheetL ? "" : ` · ยาวรอบละ ${fmt(m.length_cm, 1)} ซม.`}${m.result.sampledFrom ? ` <span class="sm">(ล็อตใหญ่: ผังนี้จำลองบางส่วนแล้วขยายผล)</span>` : ""}</div>
      ${markerSvg(m, c.usable_cm, sheetL, nums, colorOf)}</div>`).join("")
    : `<p class="warn">${esc(p.error ?? "ทำแบบตัดไม่ได้")}</p>`;
  return `<section class="pg">
    <header><div><div class="t">ใบวิธีตัด</div><div class="sub">${esc(c.fabric_name)}</div><div class="sm">${c.product_label ? `${esc(c.product_label)} · ` : ""}ผลิต ${fmt(c.qty, 0)} ใบ · หน้าผ้าเต็ม ${fmt(c.face_full_cm, 1)} / ใช้ได้ ${fmt(c.usable_cm, 1)} ซม.</div></div>
      <div class="meta">${stamp}<div class="sm">วันที่ ${esc(c.date)}</div></div></header>
    ${summary ? `<p class="sum">${summary}</p>` : ""}
    <table><thead><tr><th class="no">เลข</th><th>ชิ้น</th><th class="n">กว้าง × ยาว (ซม.)</th><th class="n">ต่อใบ</th><th class="n">รวม</th><th></th></tr></thead><tbody>${legendRows}</tbody></table>
    ${p.ok && p.whole && !sheetL && p.markers[0] && p.markers[0].length_cm > SEG_CM * 6 ? `<p class="sm">* วางทั้งงานเป็นแบบเดียว (ชิ้นต่อใบไม่เป็นเลขเต็ม) — ผังยาว พิมพ์ทุกช่วง</p>` : ""}
    ${markers}
    <div class="sign"><div>ผ้าที่ใช้จริง ............... ${esc(c.unit_label ?? "หลา")}<br><span>เศษเหลือ ...............</span></div><div>☐ วางตรงตามแบบ<br><span>☐ ต้องแก้ (เขียนหมายเหตุ) ...............</span></div><div>ผู้ตัด ...............<br><span>ผู้ตรวจ ...............</span></div></div>
  </section>`;
}

const CSS = `@page{size:A4;margin:9mm}
  body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;color:#0f172a;margin:0;font-size:11px}
  .pg{page-break-after:always}.pg:last-child{page-break-after:auto}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #0f172a;padding-bottom:4px;margin-bottom:6px;gap:8px}
  .t{font-size:18px;font-weight:700}.sub{font-size:13px;font-weight:600}.meta{text-align:right}.sm{font-size:9.5px;color:#64748b}
  .stamp{display:inline-block;border:2px solid;border-radius:6px;padding:3px 10px;font-size:15px;font-weight:700;text-align:center}.stamp span{display:block;font-size:9px;font-weight:400}
  .stamp.ok{color:#166534;border-color:#16a34a;background:#f0fdf4}.stamp.est{color:#9a3412;border-color:#f97316;background:#fff7ed}
  .sum{margin:4px 0 6px;font-size:11.5px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #cbd5e1;padding:2px 4px;text-align:left}th{background:#f1f5f9;font-size:9.5px}.n{text-align:right}.no{width:28px;text-align:center}
  .mk{margin-bottom:6px}.mh{font-size:12px;margin:6px 0 2px}.rep{font-size:14px;font-weight:700;color:#4338ca}
  .seg{break-inside:avoid;margin-bottom:4px}.sl{font-size:9px;color:#64748b}.cont{font-size:11px;font-weight:700;color:#c2410c;margin:2px 0}
  .warn{background:#fffbeb;border:1px solid #fcd34d;border-radius:4px;padding:4px 8px;color:#92400e}
  .sign{display:flex;justify-content:space-between;gap:12px;margin-top:10px;break-inside:avoid}.sign span{font-size:9.5px;color:#64748b}`;

/** ใบวิธีตัดหลายผ้าในไฟล์เดียว (1 ผ้า = เริ่มหน้าใหม่) */
export function renderCutSheetHtml(title: string, sections: CutSheetInput[]): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${sections.map(cutSheetSection).join("") || "<p>ไม่มีผ้าให้พิมพ์</p>"}</body></html>`;
}
