/**
 * เรขาคณิตของแผนผังการทำงาน (ไม่มี React) — ใช้ร่วม 3 ที่:
 *   หน้าจอ components/flow-map · หน้าพิมพ์ /print/flow-map (SVG เป็นข้อความ) · เทสต์ (เส้นห้ามทับกล่อง/เลขห้ามซ้อน)
 * ตำแหน่งกล่อง/เส้นกำหนดใน lib/flow-map.ts (FLOW_VIEWS) · กล่องสูงหลายแถวได้ (FlowPos ตัวที่ 3) · เส้นรวมสาย (feed)
 */
import { FLOW_EDGES, FLOW_NODES, FLOW_EDGE_TYPES, FLOW_RECENT_DAYS, type FlowEdgeType, type FlowPos, type FlowView } from "@/lib/flow-map";

export const FM_W = 130;
export const FM_H = 44;
export const FM_ROW = 76;
export const FM_CX = [20, 185, 350, 515];
export const FM_BAND_LABELS = ["ซื้อ", "ผลิต", "จ่ายงาน", "ขาย"];
/** สีจุด "นับในกระแสเงินสด" (ผังการเงิน) */
export const FM_CASHFLOW_DOT = "#0d9488";

export type FmPt = [number, number];
export type FmSide = "l" | "r" | "t" | "b";
export type FmBox = { x: number; y: number; w: number; h: number };
/** feeds = เส้นสั้นจากกล่องอื่นที่มารวมสายกับเส้นนี้ (กดแล้วเลือกเส้นเดียวกัน) */
export type FmDrawn = { i: number; id: string; a: string; b: string; type: FlowEdgeType; pts: FmPt[]; d: string; badge: FmPt; feeds: { node: string; d: string; pts: FmPt[] }[] };

export const fmXY = (p: FlowPos): FmPt => [FM_CX[p[0]], p[1] === "s" ? 450 : 40 + p[1] * FM_ROW];
export const fmBox = (p: FlowPos): FmBox => { const [x, y] = fmXY(p); return { x, y, w: FM_W, h: FM_H + FM_ROW * ((p[2] ?? 1) - 1) }; };

export function fmAnchor(b: FmBox, s: FmSide, o: number): FmPt {
  return s === "l" ? [b.x, b.y + b.h / 2 + o] : s === "r" ? [b.x + b.w, b.y + b.h / 2 + o] : s === "t" ? [b.x + b.w / 2 + o, b.y] : [b.x + b.w / 2 + o, b.y + b.h];
}

/** เส้นหักมุมฉาก: ข้าง→ข้าง / บนล่าง→บนล่าง เลี้ยวที่แนว c (ไม่ส่ง = กึ่งกลาง) · ข้าง↔บนล่าง เลี้ยวมุมเดียว */
export function fmRoute(a: FmPt, b: FmPt, fs: FmSide, ts: FmSide, c?: number): FmPt[] {
  const h = (s: FmSide) => s === "l" || s === "r";
  let mid: FmPt[] = [];
  if (h(fs) && h(ts)) { if (a[1] !== b[1]) { const cx = c ?? (a[0] + b[0]) / 2; mid = [[cx, a[1]], [cx, b[1]]]; } }
  else if (!h(fs) && !h(ts)) { if (a[0] !== b[0]) { const cy = c ?? (a[1] + b[1]) / 2; mid = [[a[0], cy], [b[0], cy]]; } }
  else if (h(fs)) mid = [[b[0], a[1]]];
  else mid = [[a[0], b[1]]];
  return [a, ...mid, b];
}

const pathD = (pts: FmPt[]) => "M" + pts.map((p) => p.join(" ")).join(" L");

/**
 * เส้นรวมสาย: จากด้านข้างของกล่อง วิ่งตรงไปที่แนว c ของเส้นหลัก แล้วไต่ตามแนวนั้นจนชนช่วงแนวตั้งของเส้นหลัก
 * (ใช้กับเส้นหลักที่ออกข้าง → เลี้ยวที่แนว c เท่านั้น)
 */
function feedPath(v: FlowView, main: FmPt[], [node, side, off]: [string, FmSide, number]): FmPt[] {
  const a = fmAnchor(fmBox(v.pos[node]), side, off);
  const cx = main[1]?.[0] ?? a[0];
  const ys = main.filter((p) => p[0] === cx).map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const join = Math.min(hi, Math.max(lo, a[1]));
  return join === a[1] ? [a, [cx, a[1]]] : [a, [cx, a[1]], [cx, join]];
}

/** เส้นทุกเส้นของผัง + จุดวางเลข (กลางช่วงที่ยาวที่สุด หรือ bf) */
export function layoutFlowView(v: FlowView): FmDrawn[] {
  return v.edges.map(([id, fs, fo, ts, to, o], i) => {
    const e = FLOW_EDGES[id];
    const a = o?.a ?? e.from, b = o?.b ?? e.to;
    const pts = fmRoute(fmAnchor(fmBox(v.pos[a]), fs, fo), fmAnchor(fmBox(v.pos[b]), ts, to), fs, ts, o?.c);
    let best = 0, bi = 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const len = Math.abs(pts[j + 1][0] - pts[j][0]) + Math.abs(pts[j + 1][1] - pts[j][1]);
      if (len > best) { best = len; bi = j; }
    }
    const f = o?.bf ?? 0.5, p0 = pts[bi], p1 = pts[bi + 1];
    const feeds = (o?.feed ?? []).map((fd) => { const fp = feedPath(v, pts, fd); return { node: fd[0], pts: fp, d: pathD(fp) }; });
    return { i, id, a, b, type: e.type, pts, d: pathD(pts), badge: [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f], feeds };
  });
}

/** กล่องนี้ต่อกับเส้นนี้ไหม (ต้น · ปลาย · หรือเส้นรวมสาย) */
export const fmTouches = (d: FmDrawn, id: string) => d.a === id || d.b === id || d.feeds.some((f) => f.node === id);

/** เส้นนี้แก้ภายใน FLOW_RECENT_DAYS วันไหม (ป้าย "เพิ่งแก้") — นับวันตามเวลาไทย */
export function isRecentEdge(id: string, now: Date = new Date()): boolean {
  const c = FLOW_EDGES[id]?.changed;
  if (!c) return false;
  const days = (now.getTime() - Date.parse(`${c.date}T00:00:00+07:00`)) / 86400000;
  return days >= 0 && days <= FLOW_RECENT_DAYS;
}

/** ปัญหาการวาด: เส้นทับกล่องที่ไม่ใช่ต้น/ปลาย · เลขซ้อนกัน · เลขชนกล่อง · หลุดขอบ · กล่องทับกัน (เทสต์ต้องได้ []) */
export function flowGeometryProblems(v: FlowView): string[] {
  const out: string[] = [];
  const rects = Object.entries(v.pos).map(([id, p]) => ({ id, ...fmBox(p) }));
  const drawn = layoutFlowView(v);
  const hits = (p: FmPt, q: FmPt, r: FmBox) => {
    const [x0, y0, x1, y1] = [r.x + 1, r.y + 1, r.x + r.w - 1, r.y + r.h - 1];
    if (p[0] === q[0]) { const lo = Math.min(p[1], q[1]), hi = Math.max(p[1], q[1]); return p[0] > x0 && p[0] < x1 && hi > y0 && lo < y1; }
    const lo = Math.min(p[0], q[0]), hi = Math.max(p[0], q[0]); return p[1] > y0 && p[1] < y1 && hi > x0 && lo < x1;
  };
  for (const d of drawn) {
    const lines: { pts: FmPt[]; own: string[] }[] = [{ pts: d.pts, own: [d.a, d.b] }, ...d.feeds.map((f) => ({ pts: f.pts, own: [f.node] }))];
    for (const ln of lines) {
      for (let j = 0; j < ln.pts.length - 1; j++) for (const r of rects) {
        if (!ln.own.includes(r.id) && hits(ln.pts[j], ln.pts[j + 1], r)) out.push(`${v.key}: เส้น ${d.i + 1} (${d.id}) ทับกล่อง ${r.id}`);
      }
      for (const p of ln.pts) if (p[0] < 0 || p[0] > 680 || p[1] < 0 || p[1] > v.height) out.push(`${v.key}: เส้น ${d.id} หลุดขอบ`);
    }
    for (const r of rects) {
      const [bx, by] = d.badge;
      if (bx > r.x - 8 && bx < r.x + r.w + 8 && by > r.y - 8 && by < r.y + r.h + 8) out.push(`${v.key}: เลข ${d.i + 1} (${d.id}) ชนกล่อง ${r.id}`);
    }
  }
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const [a, b] = [drawn[i].badge, drawn[j].badge];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 19) out.push(`${v.key}: เลข ${i + 1} (${drawn[i].id}) ซ้อนเลข ${j + 1} (${drawn[j].id})`);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [p, q] = [rects[i], rects[j]];
    if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) out.push(`${v.key}: กล่อง ${p.id} ทับ ${q.id}`);
  }
  for (const r of rects) if (r.y + r.h > v.height) out.push(`${v.key}: กล่อง ${r.id} หลุดขอบล่าง`);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG ของผังเป็นข้อความ (หน้าพิมพ์) — สีเดียวกับหน้าจอ */
export function flowViewSvg(v: FlowView, now: Date = new Date()): string {
  const drawn = layoutFlowView(v);
  const gray = (id: string) => (v.gray ? v.gray.includes(id) : !(v.own ?? []).includes(id));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 ${v.height}" width="100%" style="display:block">`
    + `<defs><marker id="fmp-arrow-${v.key}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  if (v.bands) {
    FM_BAND_LABELS.forEach((h, i) => {
      s += `<rect x="${FM_CX[i] - 8}" y="28" width="${FM_W + 16}" height="388" rx="12" fill="#f1f5f9"/>`
        + `<text x="${FM_CX[i] + FM_W / 2}" y="16" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="#334155">${h}</text>`;
    });
    s += `<rect x="10" y="424" width="650" height="84" rx="12" fill="none" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="4 4"/>`
      + `<text x="22" y="438" dominant-baseline="central" font-size="11" fill="#64748b">คลังสินค้า (สต็อก)</text>`;
  }
  v.heads?.forEach((h, i) => {
    s += `<rect x="${FM_CX[i] - 8}" y="28" width="${FM_W + 16}" height="${v.height - 34}" rx="12" fill="#f8fafc"/>`
      + `<text x="${FM_CX[i] + FM_W / 2}" y="16" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="#334155">${esc(h)}</text>`;
  });
  for (const d of drawn) {
    const t = FLOW_EDGE_TYPES[d.type], w = d.type === "missing" ? 2 : 1.5;
    for (const f of d.feeds) s += `<path d="${f.d}" fill="none" stroke="${t.color}" stroke-width="${w}" stroke-dasharray="${t.dash}" stroke-linecap="round"/>`;
    s += `<path d="${d.d}" fill="none" stroke="${t.color}" stroke-width="${w}" stroke-dasharray="${t.dash}" stroke-linecap="round" marker-end="url(#fmp-arrow-${v.key})"/>`;
  }
  for (const [id, p] of Object.entries(v.pos)) {
    const b = fmBox(p), n = FLOW_NODES[id], g = gray(id), cy = b.y + b.h / 2;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${g ? "#f8fafc" : "#eef2ff"}" stroke="${g ? "#cbd5e1" : "#a5b4fc"}" stroke-width="0.75"/>`
      + `<text x="${b.x + FM_W / 2}" y="${cy - 6}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="${g ? "#334155" : "#312e81"}">${esc(n.label)}</text>`
      + `<text x="${b.x + FM_W / 2}" y="${cy + 10}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="${g ? "#64748b" : "#6366f1"}">${esc(n.sub)}</text>`;
    if (v.finance && n.cashflow) s += `<circle cx="${b.x + 9}" cy="${b.y + 9}" r="3.5" fill="${FM_CASHFLOW_DOT}"/>`;
  }
  for (const d of drawn) {
    const t = FLOW_EDGE_TYPES[d.type];
    s += `<circle cx="${d.badge[0]}" cy="${d.badge[1]}" r="9" fill="#fff" stroke="${t.color}" stroke-width="1.5"/>`
      + `<text x="${d.badge[0]}" y="${d.badge[1]}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="${t.color}">${d.i + 1}</text>`;
    if (isRecentEdge(d.id, now)) s += `<circle cx="${d.badge[0] + 7}" cy="${d.badge[1] - 7}" r="3.5" fill="#7c3aed" stroke="#fff" stroke-width="1"/>`;
  }
  return s + `</svg>`;
}
