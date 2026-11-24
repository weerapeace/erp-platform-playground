/**
 * 🧱 บล็อกพิมพ์ — อ่านไฟล์ .svg เป็นชิ้นเวกเตอร์ (เจ้าของขอ 2026-11-24: ลากไฟล์ SVG/AI เข้างาน + เข้าคลังสัญลักษณ์)
 *   parsePathData / shapeOps = สูตรล้วน (มีเทสต์) · readSvgFile = ใช้ DOM ของเบราว์เซอร์คิดตำแหน่ง/สไตล์จริง (transform, class, style)
 *   นำเข้าเฉพาะรูปที่ "เติมสี" (เหมือนไฟล์ .ai) · ข้ามเส้นขอบอย่างเดียว / พื้นขาว / ตัวหนังสือ / รูปภาพ / ของใน defs, clipPath, mask
 *   หน่วย: width ที่มี mm/cm/in/pt ใช้ตามนั้น · px หรือไม่มีหน่วย = ไฟล์จาก Illustrator นับ 1px = 1pt (72 ต่อนิ้ว) ที่อื่น 96 ต่อนิ้ว
 *   ผลลัพธ์รูปแบบเดียวกับไฟล์ .ai (piecesFromRaw) → ใช้หน้าเลือกชิ้น/ตั้งขนาดต่อได้เลย
 */
import { OP, PT_TO_MM, isWhiteFill, piecesFromRaw, type AiParseResult, type AiSkipped, type DrawOps, type FillRule } from "@/lib/block-print";

type Mat = [number, number, number, number, number, number];
const K = 0.5522847498;

/** โค้งวงรี (คำสั่ง A ของ SVG) → โค้งเบซิเยร์ (ตามสูตรมาตรฐาน SVG implementation notes) */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number): number[] {
  if (rx === 0 || ry === 0) return [OP.L, x2, y2];
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const sin = Math.sin(phi), cos = Math.cos(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const seg = dt / n, k = (4 / 3) * Math.tan(seg / 4);
  const out: number[] = [];
  const pt = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dpt = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  let t = t1;
  for (let i = 0; i < n; i++) {
    const a = pt(t), b = pt(t + seg), da = dpt(t), db = dpt(t + seg);
    out.push(OP.C, a[0] + k * da[0], a[1] + k * da[1], b[0] - k * db[0], b[1] - k * db[1], i === n - 1 ? x2 : b[0], i === n - 1 ? y2 : b[1]);
    t += seg;
  }
  return out;
}

/** แปลงข้อความ d ของ <path> → DrawOps (พิกัดตามไฟล์ · รองรับ M L H V C S Q T A Z ทั้งตัวเล็ก/ใหญ่) */
export function parsePathData(d: string): DrawOps {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: number[] = [];
  let i = 0, cmd = "", cx = 0, cy = 0, sx = 0, sy = 0;
  let lastC: [number, number] | null = null, lastQ: [number, number] | null = null;
  const isCmd = (t: string) => /^[A-Za-z]$/.test(t);
  const num = () => { const t = toks[i++]; const v = Number(t); if (!Number.isFinite(v)) throw new Error("bad path"); return v; };
  const flag = () => {
    // ธงของคำสั่ง A อาจติดกันเป็น "01" — แยกทีละหลัก
    const t = toks[i];
    if (t && /^[01]{2,}/.test(t)) { toks[i] = t.slice(1); return t[0] === "1"; }
    return num() !== 0;
  };
  while (i < toks.length) {
    if (isCmd(toks[i])) cmd = toks[i++];
    else if (!cmd) throw new Error("bad path");
    const rel = cmd === cmd.toLowerCase() && cmd.toLowerCase() !== "z";
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === "Z") { out.push(OP.Z); cx = sx; cy = sy; lastC = lastQ = null; continue; }
    if (C === "M") {
      cx = ox + num(); cy = oy + num(); sx = cx; sy = cy; out.push(OP.M, cx, cy);
      cmd = rel ? "l" : "L"; lastC = lastQ = null; continue;
    }
    if (C === "L") { cx = ox + num(); cy = oy + num(); out.push(OP.L, cx, cy); lastC = lastQ = null; continue; }
    if (C === "H") { cx = ox + num(); out.push(OP.L, cx, cy); lastC = lastQ = null; continue; }
    if (C === "V") { cy = oy + num(); out.push(OP.L, cx, cy); lastC = lastQ = null; continue; }
    if (C === "C" || C === "S") {
      let x1: number, y1: number;
      if (C === "C") { x1 = ox + num(); y1 = oy + num(); }
      else { x1 = lastC ? 2 * cx - lastC[0] : cx; y1 = lastC ? 2 * cy - lastC[1] : cy; }
      const x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num();
      out.push(OP.C, x1, y1, x2, y2, x, y);
      lastC = [x2, y2]; lastQ = null; cx = x; cy = y; continue;
    }
    if (C === "Q" || C === "T") {
      let qx: number, qy: number;
      if (C === "Q") { qx = ox + num(); qy = oy + num(); }
      else { qx = lastQ ? 2 * cx - lastQ[0] : cx; qy = lastQ ? 2 * cy - lastQ[1] : cy; }
      const x = ox + num(), y = oy + num();
      out.push(OP.Q, qx, qy, x, y);
      lastQ = [qx, qy]; lastC = null; cx = x; cy = y; continue;
    }
    if (C === "A") {
      const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag();
      const x = ox + num(), y = oy + num();
      out.push(...arcToCubics(cx, cy, rx, ry, (rot * Math.PI) / 180, large, sweep, x, y));
      cx = x; cy = y; lastC = lastQ = null; continue;
    }
    throw new Error("bad path");
  }
  return out;
}

/** รูปทรงพื้นฐาน → DrawOps (พิกัดตามไฟล์) */
export function shapeOps(tag: string, a: (n: string) => number, points?: string): DrawOps | null {
  if (tag === "rect") {
    const x = a("x"), y = a("y"), w = a("width"), h = a("height");
    if (!(w > 0 && h > 0)) return null;
    let rx = a("rx"), ry = a("ry");
    if (!rx && ry) rx = ry; if (!ry && rx) ry = rx;
    rx = Math.min(rx || 0, w / 2); ry = Math.min(ry || 0, h / 2);
    if (!rx || !ry) return [OP.M, x, y, OP.L, x + w, y, OP.L, x + w, y + h, OP.L, x, y + h, OP.Z];
    const kx = rx * K, ky = ry * K;
    return [
      OP.M, x + rx, y, OP.L, x + w - rx, y, OP.C, x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry,
      OP.L, x + w, y + h - ry, OP.C, x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h,
      OP.L, x + rx, y + h, OP.C, x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry,
      OP.L, x, y + ry, OP.C, x, y + ry - ky, x + rx - kx, y, x + rx, y, OP.Z,
    ];
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = a("cx"), cy = a("cy"), rx = tag === "circle" ? a("r") : a("rx"), ry = tag === "circle" ? a("r") : a("ry");
    if (!(rx > 0 && ry > 0)) return null;
    const ox = rx * K, oy = ry * K;
    return [
      OP.M, cx - rx, cy, OP.C, cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry,
      OP.C, cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy, OP.C, cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry,
      OP.C, cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy, OP.Z,
    ];
  }
  if ((tag === "polygon" || tag === "polyline") && points) {
    const n = (points.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    if (n.length < 6) return null;
    const out: number[] = [OP.M, n[0], n[1]];
    for (let k = 2; k + 1 < n.length; k += 2) out.push(OP.L, n[k], n[k + 1]);
    out.push(OP.Z);   // polyline ที่เติมสี = ปิดเส้นเองเหมือนเบราว์เซอร์
    return out;
  }
  return null;
}

/** หน่วยของไฟล์ → มม. ต่อ 1 หน่วยใน viewBox */
export function svgUnitScale(widthAttr: string | null, vbW: number, illustrator: boolean): number {
  const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(widthAttr ?? "");
  const pxMm = illustrator ? PT_TO_MM : 25.4 / 96;
  if (!m || !vbW) return pxMm;
  const v = Number(m[1]);
  const unit = (m[2] ?? "px").toLowerCase();
  const mm = unit === "mm" ? v : unit === "cm" ? v * 10 : unit === "in" ? v * 25.4 : unit === "pt" ? v * PT_TO_MM : unit === "pc" ? v * 12 * PT_TO_MM : v * pxMm;
  return mm / vbW;
}

const SKIP_PARENTS = "defs, clipPath, mask, pattern, symbol, marker, metadata";

/** อ่านไฟล์ .svg (ในเบราว์เซอร์) → ชิ้นแบบเดียวกับไฟล์ .ai */
export async function readSvgFile(file: File): Promise<AiParseResult & { pages: number }> {
  if (file.size > 30 * 1024 * 1024) throw new Error("ไฟล์ SVG ใหญ่เกิน 30MB");
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) throw new Error("อ่านไฟล์ SVG ไม่ได้ — ไฟล์อาจเสีย");
  const illustrator = /Adobe Illustrator/i.test(text.slice(0, 2000));
  const vb = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  let [vx, vy, vw, vh] = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, NaN, NaN];
  const wAttr = root.getAttribute("width"), hAttr = root.getAttribute("height");
  if (!Number.isFinite(vw)) { vw = parseFloat(wAttr ?? "") || 0; vh = parseFloat(hAttr ?? "") || 0; vx = 0; vy = 0; }
  const s = svgUnitScale(wAttr, vw, illustrator);

  // ใส่ลงหน้าเว็บแบบซ่อน → ให้เบราว์เซอร์คิด transform / สไตล์จาก class ให้
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";   // ห้ามใช้ visibility:hidden — ลูกทุกตัวจะถูกนับว่าซ่อน
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  svg.removeAttribute("width"); svg.removeAttribute("height");
  if (vw && vh) { svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`); svg.setAttribute("width", String(vw)); svg.setAttribute("height", String(vh)); }
  svg.setAttribute("preserveAspectRatio", "none");
  host.appendChild(svg);
  document.body.appendChild(host);
  const skipped: AiSkipped = { strokes: 0, texts: 0, images: 0, whites: 0 };
  const raw: { d: DrawOps; fill: FillRule }[] = [];
  try {
    const rootM = svg.getScreenCTM()?.inverse();
    skipped.texts = svg.querySelectorAll("text").length;
    skipped.images = svg.querySelectorAll("image").length;
    svg.querySelectorAll("path, rect, circle, ellipse, polygon, polyline").forEach((node) => {
      const el = node as SVGGraphicsElement;
      if (el.closest(SKIP_PARENTS)) return;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return;
      const fill = st.fill;
      if (!fill || fill === "none" || Number(st.fillOpacity) === 0) { if (st.stroke && st.stroke !== "none") skipped.strokes++; return; }
      const rgb = fill.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
      if (/^rgb/.test(fill) && isWhiteFill(rgb.slice(0, 3))) { skipped.whites++; return; }
      const tag = el.tagName.toLowerCase();
      let d: DrawOps | null;
      try {
        d = tag === "path" ? parsePathData(el.getAttribute("d") ?? "")
          : shapeOps(tag, (n) => parseFloat(el.getAttribute(n) ?? "") || 0, el.getAttribute("points") ?? undefined);
      } catch { d = null; }
      if (!d || !d.length) return;
      const sm = el.getScreenCTM();
      const m = sm && rootM ? rootM.multiply(sm) : null;
      const mat: Mat = m ? [m.a, m.b, m.c, m.d, m.e, m.f] : [1, 0, 0, 1, 0, 0];
      // แปลงจุด: ตามไฟล์ → พิกัด viewBox → มม. · Q แปลงเป็น C ตอนรวม (mapOps ใน piecesFromRaw ใช้ opsBox)
      const outOps: number[] = [];
      for (let i = 0; i < d.length;) {
        const op = d[i++];
        const n = op === OP.M || op === OP.L ? 2 : op === OP.C ? 6 : op === OP.Q ? 4 : 0;
        outOps.push(op);
        for (let k = 0; k < n; k += 2) {
          const x = d[i + k], y = d[i + k + 1];
          outOps.push(((mat[0] * x + mat[2] * y + mat[4]) - (m ? 0 : vx)) * s, ((mat[1] * x + mat[3] * y + mat[5]) - (m ? 0 : vy)) * s);
        }
        i += n;
      }
      raw.push({ d: outOps, fill: st.fillRule === "evenodd" ? "evenodd" : "nonzero" });
    });
  } finally {
    host.remove();
  }
  const res = piecesFromRaw(raw.map((r) => ({ ...r, d: normalizeQ(r.d) })), vw * s, vh * s, skipped);
  return { ...res, pages: 1 };
}

/** โค้ง 2 จุด (Q) → โค้งปกติ ก่อนส่งเข้า piecesFromRaw */
function normalizeQ(d: DrawOps): DrawOps {
  const out: number[] = [];
  let cx = 0, cy = 0;
  for (let i = 0; i < d.length;) {
    const op = d[i++];
    if (op === OP.Z) { out.push(op); continue; }
    if (op === OP.Q) {
      const [qx, qy, x, y] = d.slice(i, i + 4); i += 4;
      out.push(OP.C, cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
      cx = x; cy = y; continue;
    }
    const n = op === OP.C ? 6 : 2;
    const a = d.slice(i, i + n); i += n;
    out.push(op, ...a);
    cx = a[n - 2]; cy = a[n - 1];
  }
  return out;
}
