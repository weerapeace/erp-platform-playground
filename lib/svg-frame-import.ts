/**
 * 🖼 แปลงไฟล์ SVG ที่อัป → ทรงกรอบ (FrameShape) / 🎨 ลายของร้าน (ShopPattern) — ทำในเบราว์เซอร์ (ต้องมี document)
 *
 * - เก็บเฉพาะรูปทรง: path / rect / circle / ellipse / polygon / polyline (แปลงเป็นเส้นทาง d)
 * - ตำแหน่งจริงของแต่ละชิ้น (รวม transform ของกลุ่ม) → matrix(…) · กรอบของทรง = ขอบเขตรวมของทุกชิ้น
 * - ทิ้งทุกอย่างอื่น (สคริปต์ ลิงก์ รูปฝัง ตัวอักษร) — ผลลัพธ์ผ่าน normalizeFrameShape / normalizeShopPattern อีกชั้น
 * - ลายของร้าน: อ่านสีพื้น/สีเส้น/ความหนาที่เบราว์เซอร์คำนวณจริง (รวมคลาสใน <style> · สีที่กลุ่มส่งต่อ · ไล่สี = สีแรก)
 * ⚠️ ห้าม import จาก API route (ใช้ DOM)
 */
import {
  normalizeFrameShape,
  normalizeShopPattern,
  shopPatternColors,
  FRAME_SHAPE_LIMITS,
  SHOP_PATTERN_LIMITS,
  type FrameShape,
  type FrameShapePart,
  type ShopPattern,
  type ShopPatternPart,
} from "@/lib/website-frames";

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

/** CSS ในไฟล์: ตัดการโหลดของจากที่อื่น (@import / url(…) ที่ไม่ใช่ #ชิ้นในไฟล์) */
const cleanCss = (css: string) => css.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none").replace(/expression\s*\(/gi, "(");

interface MountedSvg {
  svg: SVGSVGElement;
  /** ของที่ทิ้งไป (ไว้บอกผู้ใช้) */
  dropped: { images: number; texts: number; uses: number };
  done: () => void;
}

/**
 * อ่านไฟล์ → ทำความสะอาด → วางลงหน้าจอชั่วคราว (มองไม่เห็น) เพื่อให้เบราว์เซอร์คำนวณตำแหน่ง/ขนาด/สีจริง
 *   ทิ้ง: สคริปต์ · รูปฝัง · ลิงก์ (เก็บรูปทรงข้างใน) · ตัวจับเหตุการณ์ on… · การโหลดของจากที่อื่น
 *   keepStyle = เก็บ <style> ในไฟล์ (ลายของร้านต้องใช้สี เช่น Illustrator เก็บสีเป็นคลาส .cls-1) · วางใน shadow DOM — สไตล์ในไฟล์ไม่รั่วไปทั้งหน้า
 */
function mountSvg(text: string, keepStyle: boolean): MountedSvg | { error: string } {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch {
    return { error: "อ่านไฟล์ SVG ไม่ได้" };
  }
  const src = doc.documentElement;
  if (!src || src.tagName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return { error: "ไฟล์นี้ไม่ใช่ SVG ที่อ่านได้" };

  // ทำความสะอาดในเอกสารที่อ่านไฟล์ (ยังไม่อยู่บนหน้า = ไม่โหลด/ไม่รันอะไร) ก่อนคัดลอกเข้าหน้า
  //   ⚠️ ห้ามสลับลำดับ: คัดลอกเข้าหน้าก่อน = รูปฝังเริ่มโหลดทันที และ onerror ของรูปที่ถอดออกแล้วยังทำงาน (เจอในเทสต์ 10-24)
  const dropped = { images: src.querySelectorAll("image, foreignObject").length, texts: src.querySelectorAll("text").length, uses: src.querySelectorAll("use").length };
  src.querySelectorAll("a").forEach((a) => a.replaceWith(...Array.from(a.childNodes)));
  src.querySelectorAll(`script, foreignObject, image, use, iframe, audio, video, animate, animateMotion, animateTransform, set${keepStyle ? "" : ", style"}`).forEach((x) => x.remove());
  for (const el of [src, ...Array.from(src.querySelectorAll("*"))])
    for (const at of Array.from(el.attributes)) {
      const nm = at.name.toLowerCase();
      // ไล่สีที่อ้างไล่สีอื่นในไฟล์ (href="#…") เก็บไว้ — นอกนั้น href/ลิงก์ทิ้งหมด
      const gradRef = keepStyle && /gradient$/i.test(el.tagName) && at.value.trim().startsWith("#");
      if (/^on/.test(nm) || (/href$/.test(nm) && !gradRef) || /url\(\s*['"]?(?!#)/i.test(at.value)) el.removeAttribute(at.name);
    }
  if (keepStyle) src.querySelectorAll("style").forEach((s) => (s.textContent = cleanCss(s.textContent ?? "")));
  const svg = document.importNode(src, true) as unknown as SVGSVGElement;

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:400px;height:400px;overflow:hidden;opacity:0;pointer-events:none";
  (host.attachShadow ? host.attachShadow({ mode: "open" }) : host).appendChild(svg);
  document.body.appendChild(host);
  return { svg, dropped, done: () => host.remove() };
}

/** ข้อความ SVG → ทรงกรอบ */
export function svgTextToFrameShape(text: string): SvgImportResult {
  const mounted = mountSvg(text, false);
  if ("error" in mounted) return { shape: null, error: mounted.error };
  const { svg } = mounted;
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
      const { m, t } = partMatrix(g, inv);
      const part: FrameShapePart = { d };
      if (t) part.t = t;
      if ((el.getAttribute("fill-rule") ?? getComputedStyle(el).fillRule) === "evenodd") part.rule = "evenodd";
      parts.push(part);
      const bb = addBounds([minX, minY, maxX, maxY], g, m, 0);
      [minX, minY, maxX, maxY] = bb;
    }
    hasText = svg.querySelector("text") !== null;
    if (!parts.length)
      return { shape: null, error: hasText ? "ในไฟล์มีแต่ตัวอักษร — แปลงตัวอักษรเป็นเส้นก่อน (Create Outlines) แล้วส่งออกใหม่" : "ไม่พบรูปทรงในไฟล์ (ต้องเป็นรูปทรงทึบ ไม่ใช่รูปภาพที่ฝังไว้)" };
    if (!(maxX > minX && maxY > minY)) return { shape: null, error: "รูปทรงในไฟล์ไม่มีขนาด" };
    const shape = normalizeFrameShape({ vb: [minX, minY, maxX - minX, maxY - minY], parts });
    if (!shape) return { shape: null, error: "รูปทรงในไฟล์ใช้ไม่ได้" };
    return { shape, warning: hasText ? "ตัวอักษรในไฟล์ถูกข้าม — แปลงเป็นเส้นก่อนถ้าอยากให้เป็นส่วนของทรง" : undefined };
  } finally {
    mounted.done();
  }
}

/** ตำแหน่งจริงของชิ้น (รวม transform ของกลุ่ม) เทียบกับทั้งไฟล์ → matrix(…) · ไม่ขยับ = ไม่มี t */
function partMatrix(g: SVGGraphicsElement, inv: DOMMatrix): { m: DOMMatrix; t?: string } {
  const ctm = g.getScreenCTM();
  const m = ctm ? inv.multiply(ctm) : new DOMMatrix();
  const ident = Math.abs(m.a - 1) < 1e-6 && Math.abs(m.d - 1) < 1e-6 && Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6 && Math.abs(m.e) < 1e-6 && Math.abs(m.f) < 1e-6;
  return { m, t: ident ? undefined : `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(r4).join(" ")})` };
}

/** ขยายขอบเขตรวม [minX, minY, maxX, maxY] ด้วยขอบเขตจริงของชิ้นนี้ (หลังแปลงตำแหน่ง · pad = ครึ่งความหนาเส้น) */
function addBounds(b: [number, number, number, number], g: SVGGraphicsElement, m: DOMMatrix, pad: number): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = b;
  try {
    const bb = g.getBBox();
    const x0 = bb.x - pad, y0 = bb.y - pad, x1 = bb.x + bb.width + pad, y1 = bb.y + bb.height + pad;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const p = new DOMPoint(x, y).matrixTransform(m);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  } catch {
    /* ชิ้นที่วัดไม่ได้ ไม่นับขอบเขต */
  }
  return [minX, minY, maxX, maxY];
}

/* ───────── 🎨 ลายของร้าน: SVG → ลายที่เปลี่ยนสีได้ (เก็บสีพื้น/สีเส้น/ความหนาเดิมของทุกชิ้น) ───────── */

export interface SvgPatternResult {
  pattern: ShopPattern | null;
  /** ใช้ไม่ได้เพราะ… (ภาษาคน) */
  error?: string;
  /** ใช้ได้ แต่มีของที่ถูกข้าม/เปลี่ยน (ภาษาคน) */
  warnings: string[];
}

const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");

/** สีที่เบราว์เซอร์คำนวณแล้ว → #rrggbb (+ ความทึบของสี) · โปร่งใส/ไม่มี = null */
function cssColorHex(v: string): { hex: string; a: number } | null {
  const s = v.trim().toLowerCase();
  if (!s || s === "none" || s === "transparent") return null;
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return a <= 0 ? null : { hex: `#${toHex(+m[1])}${toHex(+m[2])}${toHex(+m[3])}`, a: Math.min(1, a) };
  }
  if (/^#[0-9a-f]{6}$/.test(s)) return { hex: s, a: 1 };
  return null;
}

/** สีพื้น/สีเส้นที่เป็นไล่สี url(#id) → สีแรกของไล่สี (ตามลิงก์ไล่สีที่อ้างต่อกันได้) */
function gradientFirstStop(svg: SVGSVGElement, value: string): { hex: string; a: number } | null {
  const id = value.match(/url\(\s*['"]?#([^'")\s]+)/)?.[1];
  // ไม่ใช่ไล่สีในไฟล์ → ใช้สีสำรองที่เขียนต่อท้าย (ถ้ามี)
  const fallback = () => cssColorHex(value.replace(/url\([^)]*\)/, "").trim());
  let el = id ? svg.querySelector(`#${CSS.escape(id)}`) : null;
  for (let hop = 0; el && hop < 5; hop++) {
    const stop = el.querySelector("stop");
    if (stop) return cssColorHex(getComputedStyle(stop).stopColor) ?? fallback();
    const ref = (el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "").trim();
    el = ref.startsWith("#") ? svg.querySelector(`#${CSS.escape(ref.slice(1))}`) : null;
  }
  return fallback();
}

/** ข้อความ SVG → ลายของร้าน (name = ชื่อไฟล์ ไว้โชว์ในรายการ) */
export function svgTextToShopPattern(text: string, name = ""): SvgPatternResult {
  const mounted = mountSvg(text, true);
  if ("error" in mounted) return { pattern: null, error: mounted.error, warnings: [] };
  const { svg, dropped } = mounted;
  try {
    const rootM = svg.getScreenCTM();
    if (!rootM) return { pattern: null, error: "อ่านขนาดของ SVG ไม่ได้", warnings: [] };
    const inv = rootM.inverse();
    const parts: ShopPatternPart[] = [];
    let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    let chars = 0;
    let usedGrad = false;
    const paint = (v: string) => {
      if (/url\(/i.test(v)) {
        usedGrad = true;
        return gradientFirstStop(svg, v);
      }
      return cssColorHex(v);
    };
    for (const el of Array.from(svg.querySelectorAll(SHAPE_TAGS.join(",")))) {
      if (el.closest(SKIP_IN)) continue;
      const g = el as SVGGraphicsElement;
      // ซ่อนอยู่ (ตัวเองหรือกลุ่มที่ครอบ) = ไม่เอา · ความทึบของกลุ่มคูณต่อกัน
      let hidden = false;
      let op = 1;
      for (let a: Element | null = el; a; a = a === svg ? null : a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === "none") hidden = true;
        const v = parseFloat(cs.opacity);
        if (Number.isFinite(v)) op *= v;
      }
      const cs = getComputedStyle(el);
      if (hidden || cs.visibility === "hidden" || op <= 0) continue;
      const d = toPathD(el);
      if (!d) continue;
      const fill = paint(cs.fill);
      const fo = parseFloat(cs.fillOpacity);
      const sw = parseFloat(cs.strokeWidth);
      const stroke = sw > 0 ? paint(cs.stroke) : null;
      const so = parseFloat(cs.strokeOpacity);
      const fa = fill ? fill.a * (Number.isFinite(fo) ? fo : 1) : 0;
      const sa = stroke ? stroke.a * (Number.isFinite(so) ? so : 1) : 0;
      if (fa <= 0 && sa <= 0) continue;
      chars += d.length;
      if (parts.length >= SHOP_PATTERN_LIMITS.parts || chars > SHOP_PATTERN_LIMITS.chars)
        return { pattern: null, error: "ไฟล์ซับซ้อนเกินไป (ชิ้นส่วนเยอะมาก) — ลองรวมรูปทรงก่อนส่งออก (Illustrator: Pathfinder → Unite / Object → Compound Path) หรือลดจุดของเส้น", warnings: [] };
      const { m, t } = partMatrix(g, inv);
      const part: ShopPatternPart = { d };
      if (t) part.t = t;
      if (cs.fillRule === "evenodd") part.rule = "evenodd";
      if (fa > 0 && fill) part.f = fill.hex;
      if (sa > 0 && stroke) {
        part.s = stroke.hex;
        part.w = r4(sw);
        if (cs.strokeLinecap === "round" || cs.strokeLinecap === "square") part.lc = cs.strokeLinecap;
        if (cs.strokeLinejoin === "round" || cs.strokeLinejoin === "bevel") part.lj = cs.strokeLinejoin;
      }
      const o = op * (part.f ? fa : sa);
      if (o < 0.995) part.o = Math.round(o * 1000) / 1000;
      parts.push(part);
      b = addBounds(b, g, m, part.s ? sw / 2 : 0);
    }
    if (!parts.length) {
      const why = dropped.texts
        ? "ในไฟล์มีแต่ตัวหนังสือ — แปลงตัวหนังสือเป็นเส้นก่อน (Illustrator: Create Outlines · Figma: Outline stroke / Flatten) แล้วส่งออกใหม่"
        : dropped.images
          ? "ในไฟล์มีแต่รูปภาพที่ฝังไว้ ไม่มีรูปทรง — วางเป็นรูปธรรมดาแทน (เปลี่ยนสีไม่ได้)"
          : "ไม่พบรูปทรงที่มีสีในไฟล์";
      return { pattern: null, error: why, warnings: [] };
    }
    const [minX, minY, maxX, maxY] = b;
    if (!(maxX > minX && maxY > minY)) return { pattern: null, error: "รูปทรงในไฟล์ไม่มีขนาด", warnings: [] };
    const pattern = normalizeShopPattern({ name, vb: [minX, minY, maxX - minX, maxY - minY], parts });
    if (!pattern) return { pattern: null, error: "รูปทรงในไฟล์ใช้ไม่ได้", warnings: [] };
    const warnings: string[] = [];
    if (dropped.images) warnings.push(`ตัดรูปภาพที่ฝังอยู่ออก ${dropped.images} รูป (ลายที่เปลี่ยนสีได้ต้องเป็นรูปทรงล้วน)`);
    if (dropped.texts) warnings.push(`ข้ามตัวหนังสือ ${dropped.texts} จุด — แปลงตัวหนังสือเป็นเส้นก่อนส่งออก ถ้าอยากให้อยู่ในลาย`);
    if (dropped.uses) warnings.push(`ข้ามชิ้นที่ก๊อปมาจากชิ้นอื่น (symbol / use) ${dropped.uses} ชิ้น — ส่งออกใหม่แบบไม่ใช้ symbol ถ้าชิ้นหายไป`);
    if (usedGrad) warnings.push("สีไล่ในไฟล์ถูกเปลี่ยนเป็นสีเดียว (สีแรกของการไล่สี)");
    const nColors = shopPatternColors(pattern).length;
    if (nColors > SHOP_PATTERN_LIMITS.colors) warnings.push(`ไฟล์มี ${nColors} สี — โหมด "แยกตามสีในไฟล์" เปลี่ยนได้ ${SHOP_PATTERN_LIMITS.colors} สีแรก`);
    return { pattern, warnings };
  } finally {
    mounted.done();
  }
}

const MAX_SVG_BYTES = 1024 * 1024;

/** ไฟล์ SVG ในคลังไฟล์ (r2 key) → ลายของร้าน (name = ชื่อไฟล์ ไว้โชว์ในรายการ) */
export async function loadShopPattern(key: string, name: string): Promise<SvgPatternResult> {
  try {
    const r = await fetch(`/api/r2-image?key=${encodeURIComponent(key)}`);
    if (!r.ok) return { pattern: null, error: "โหลดไฟล์ SVG ไม่ได้", warnings: [] };
    const text = await r.text();
    if (text.length > MAX_SVG_BYTES) return { pattern: null, error: "ไฟล์ SVG ใหญ่เกิน 1 MB — ลองลดจุดของเส้น/รวมรูปทรงก่อนส่งออก", warnings: [] };
    return svgTextToShopPattern(text, name.replace(/\.svg$/i, ""));
  } catch {
    return { pattern: null, error: "โหลดไฟล์ SVG ไม่ได้", warnings: [] };
  }
}
