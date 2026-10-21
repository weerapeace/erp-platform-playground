/**
 * 🖼 แปลงไฟล์ SVG ที่อัป → ทรงกรอบ (FrameShape) — ทำในเบราว์เซอร์ (ต้องมี document)
 *
 * - เก็บเฉพาะรูปทรง: path / rect / circle / ellipse / polygon / polyline (แปลงเป็นเส้นทาง d)
 * - ตำแหน่งจริงของแต่ละชิ้น (รวม transform ของกลุ่ม) → matrix(…) · กรอบของทรง = ขอบเขตรวมของทุกชิ้น
 * - ทิ้งทุกอย่างอื่น (สคริปต์ ลิงก์ รูปฝัง ตัวอักษร สไตล์) — ผลลัพธ์ผ่าน normalizeFrameShape อีกชั้น
 * ⚠️ ห้าม import จาก API route (ใช้ DOM)
 */
import { normalizeFrameShape, FRAME_SHAPE_LIMITS, type FrameShape, type FrameShapePart } from "@/lib/website-frames";

const SHAPE_TAGS = ["path", "rect", "circle", "ellipse", "polygon", "polyline"];
const SKIP_IN = "defs, clipPath, mask, pattern, symbol, marker, linearGradient, radialGradient, filter";
const n = (el: Element, a: string) => parseFloat(el.getAttribute(a) ?? "0") || 0;
const r4 = (v: number) => Math.round(v * 1000) / 1000;

/** รูปทรงพื้นฐาน → เส้นทาง d */
function toPathD(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "path") return el.getAttribute("d");
  if (tag === "rect") {
    const x = n(el, "x"), y = n(el, "y"), w = n(el, "width"), h = n(el, "height");
    if (w <= 0 || h <= 0) return null;
    let rx = n(el, "rx"), ry = n(el, "ry");
    if (!rx && ry) rx = ry;
    if (!ry && rx) ry = rx;
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = n(el, "cx"), cy = n(el, "cy");
    const rx = tag === "circle" ? n(el, "r") : n(el, "rx");
    const ry = tag === "circle" ? n(el, "r") : n(el, "ry");
    if (rx <= 0 || ry <= 0) return null;
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  }
  if (tag === "polygon" || tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
    if (pts.length < 6 || pts.some((v) => !Number.isFinite(v))) return null;
    let d = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
    return d + "Z";
  }
  return null;
}

export interface SvgImportResult {
  shape: FrameShape | null;
  /** เหตุผลที่ใช้ไม่ได้ / คำเตือน (ภาษาคน) */
  error?: string;
  warning?: string;
}

/** ข้อความ SVG → ทรงกรอบ */
export function svgTextToFrameShape(text: string): SvgImportResult {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch {
    return { shape: null, error: "อ่านไฟล์ SVG ไม่ได้" };
  }
  const src = doc.documentElement;
  if (!src || src.tagName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return { shape: null, error: "ไฟล์นี้ไม่ใช่ SVG ที่อ่านได้" };

  // วางลงหน้าจอชั่วคราว (มองไม่เห็น) เพื่อให้เบราว์เซอร์คำนวณตำแหน่ง/ขนาดจริง
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:400px;height:400px;overflow:hidden;visibility:hidden;pointer-events:none";
  const svg = document.importNode(src, true) as unknown as SVGSVGElement;
  // ทิ้งของที่ไม่ใช่รูปทรงก่อนวาง (สคริปต์/ลิงก์/รูปฝัง) — กันโหลดอะไรออกไปตอนคำนวณ
  svg.querySelectorAll("script, foreignObject, image, use, a, style, iframe").forEach((x) => x.remove());
  for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) for (const at of Array.from(el.attributes)) if (/^on/i.test(at.name) || /href$/i.test(at.name)) el.removeAttribute(at.name);
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const rootM = svg.getScreenCTM();
    if (!rootM) return { shape: null, error: "อ่านขนาดของ SVG ไม่ได้" };
    const inv = rootM.inverse();
    const parts: FrameShapePart[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasText = false;
    let chars = 0;
    for (const el of Array.from(svg.querySelectorAll(SHAPE_TAGS.join(",")))) {
      if (el.closest(SKIP_IN)) continue;
      const g = el as SVGGraphicsElement;
      const d = toPathD(el);
      if (!d) continue;
      chars += d.length;
      if (parts.length >= FRAME_SHAPE_LIMITS.parts || chars > FRAME_SHAPE_LIMITS.chars)
        return { shape: null, error: "ไฟล์ซับซ้อนเกินไป — ลองรวมรูปทรงเป็นชิ้นเดียวก่อนส่งออก (Illustrator: Pathfinder → Unite · Canva: ส่งออกแบบรูปทรงเดียว)" };
      const ctm = g.getScreenCTM();
      const m = ctm ? inv.multiply(ctm) : new DOMMatrix();
      const ident = Math.abs(m.a - 1) < 1e-6 && Math.abs(m.d - 1) < 1e-6 && Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6 && Math.abs(m.e) < 1e-6 && Math.abs(m.f) < 1e-6;
      const part: FrameShapePart = { d };
      if (!ident) part.t = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(r4).join(" ")})`;
      if ((el.getAttribute("fill-rule") ?? getComputedStyle(el).fillRule) === "evenodd") part.rule = "evenodd";
      parts.push(part);
      // ขอบเขตจริงของชิ้นนี้ (หลังแปลงตำแหน่ง)
      try {
        const bb = g.getBBox();
        for (const [x, y] of [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]) {
          const p = new DOMPoint(x, y).matrixTransform(m);
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      } catch {
        /* ชิ้นที่วัดไม่ได้ ไม่นับขอบเขต */
      }
    }
    hasText = svg.querySelector("text") !== null;
    if (!parts.length)
      return { shape: null, error: hasText ? "ในไฟล์มีแต่ตัวอักษร — แปลงตัวอักษรเป็นเส้นก่อน (Create Outlines) แล้วส่งออกใหม่" : "ไม่พบรูปทรงในไฟล์ (ต้องเป็นรูปทรงทึบ ไม่ใช่รูปภาพที่ฝังไว้)" };
    if (!(maxX > minX && maxY > minY)) return { shape: null, error: "รูปทรงในไฟล์ไม่มีขนาด" };
    const shape = normalizeFrameShape({ vb: [minX, minY, maxX - minX, maxY - minY], parts });
    if (!shape) return { shape: null, error: "รูปทรงในไฟล์ใช้ไม่ได้" };
    return { shape, warning: hasText ? "ตัวอักษรในไฟล์ถูกข้าม — แปลงเป็นเส้นก่อนถ้าอยากให้เป็นส่วนของทรง" : undefined };
  } finally {
    host.remove();
  }
}
