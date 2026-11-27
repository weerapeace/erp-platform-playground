// ตัดชิ้นเวกเตอร์ (SVG) จากแผ่นเต็ม — ฝั่งเบราว์เซอร์ (ต้องวัดตำแหน่งจริงใน DOM)
//   prepareSheet = วัดกรอบของทุกรูปทรงในแผ่นครั้งเดียว (เส้นที่หมุน/ย้ายตำแหน่งก็วัดถูก)
//   cropPiece    = ตัดเฉพาะชิ้น: viewBox = กรอบชิ้น + ขอบ · ลบรูปทรงที่ไม่แตะกรอบ (ไฟล์เล็ก ไม่แบกทั้งแผ่น) · ลบแผ่นขาวรองพื้น
// ใช้โดย components/vector-splitter (เก็บ SVG คู่ PNG — เปลี่ยนสีทีหลังได้ · lib/svg-recolor)
import type { Box } from "@/lib/vector-split";
import { normColor, sanitizeSvg } from "@/lib/svg-recolor";

/** แผ่นเวกเตอร์เต็ม + ความสัมพันธ์กับพิกัดของตัวแยกชิ้น (หน่วยไฟล์ · box.x ↔ vx + x*kx) */
export type SheetSvg = { svg: string; vx: number; vy: number; kx: number; ky: number; width: number; height: number };
export type PreparedSheet = { tagged: string; rects: { x: number; y: number; w: number; h: number; bgWhite: boolean }[]; sheet: SheetSvg };

const SHAPES = "path,rect,circle,ellipse,line,polyline,polygon,use,image,text";
const SKIP_PARENTS = "defs,clipPath,mask,pattern,symbol,marker,linearGradient,radialGradient,filter";

export function prepareSheet(sheet: SheetSvg): PreparedSheet {
  const doc = new DOMParser().parseFromString(sanitizeSvg(sheet.svg), "image/svg+xml");
  const root = doc.documentElement as unknown as SVGSVGElement;
  if (root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) throw new Error("อ่านไฟล์เวกเตอร์ไม่ได้");
  const els = Array.from(root.querySelectorAll(SHAPES)).filter((el) => !el.parentElement?.closest(SKIP_PARENTS));
  els.forEach((el, i) => el.setAttribute("data-vi", String(i)));
  // วางในหน้าแบบมองไม่เห็นเพื่อวัด (1 หน่วยไฟล์ = 1px)
  const vbW = sheet.width * sheet.kx, vbH = sheet.height * sheet.ky;
  const live = document.importNode(root, true) as unknown as SVGSVGElement;
  live.setAttribute("viewBox", `${sheet.vx} ${sheet.vy} ${vbW} ${vbH}`);
  live.setAttribute("width", String(vbW)); live.setAttribute("height", String(vbH));
  live.setAttribute("preserveAspectRatio", "none");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  host.appendChild(live);
  document.body.appendChild(host);
  try {
    const r0 = live.getBoundingClientRect();
    const sx = r0.width / vbW || 1, sy = r0.height / vbH || 1;
    const sheetArea = vbW * vbH;
    const rects = Array.from(live.querySelectorAll("[data-vi]")).map((el) => {
      const r = el.getBoundingClientRect();
      const x = (r.left - r0.left) / sx + sheet.vx, y = (r.top - r0.top) / sy + sheet.vy, w = r.width / sx, h = r.height / sy;
      // แผ่นขาวรองพื้น = รูปทรงสีขาวที่คลุมเกือบทั้งแผ่น
      const fill = normColor(el.getAttribute("fill") ?? (el as SVGElement).style?.fill ?? "");
      const bgWhite = !!fill && isNearWhite(fill) && w * h >= sheetArea * 0.6;
      return { x, y, w, h, bgWhite };
    });
    return { tagged: new XMLSerializer().serializeToString(root), rects, sheet };
  } finally { host.remove(); }
}

function isNearWhite(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) >= 242 && ((n >> 8) & 255) >= 242 && (n & 255) >= 242;
}

/** SVG ของชิ้นเดียว · box = หน่วยตัวแยกชิ้น · padUnits = ขอบใส (หน่วยเดียวกับ box) · outW/H = ขนาดที่ตั้ง (px เท่า PNG) */
export function cropPiece(p: PreparedSheet, box: Box, padUnits: number, outW: number, outH: number, removeWhite: boolean): string {
  const { sheet } = p;
  const x = sheet.vx + (box.x - padUnits) * sheet.kx, y = sheet.vy + (box.y - padUnits) * sheet.ky;
  const w = (box.w + padUnits * 2) * sheet.kx, h = (box.h + padUnits * 2) * sheet.ky;
  const doc = new DOMParser().parseFromString(p.tagged, "image/svg+xml");
  const root = doc.documentElement;
  for (const el of Array.from(root.querySelectorAll("[data-vi]"))) {
    const r = p.rects[Number(el.getAttribute("data-vi"))];
    const hit = r && r.x < x + w && r.x + r.w > x && r.y < y + h && r.y + r.h > y;
    if (!hit || (removeWhite && r.bgWhite)) el.remove();
    else el.removeAttribute("data-vi");
  }
  root.setAttribute("viewBox", `${round(x)} ${round(y)} ${round(w)} ${round(h)}`);
  root.setAttribute("width", String(Math.round(outW)));
  root.setAttribute("height", String(Math.round(outH)));
  root.removeAttribute("preserveAspectRatio");
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(root);
}
const round = (n: number) => Math.round(n * 1000) / 1000;

/** มีรูปถ่าย/พิกเซลฝังอยู่ไหม (ส่วนนั้นเปลี่ยนสีไม่ได้) */
export const hasRaster = (svg: string) => /<image[\s>]/i.test(svg);
