/**
 * ตัววาดรูปเข็มขัดสำหรับใบงานเข็มขัด (เฟส 3)
 *
 * โหมด 1 (มีรูปจริง) — ซ้อนรูปจากตารางหลัก: ทรงปลายหาง(strapImg) + ลายรู(holeImg) + โลโก้(logo)
 *   วางทับในกรอบเดียวกัน (best-effort) — ถ้ารูปต้นทางกรอบไม่เท่ากันอาจเหลื่อมเล็กน้อย ปรับ BOX ด้านล่างได้
 * โหมด 2 (ไม่มีรูป) — วาดเป็น schematic เวกเตอร์จากตัวเลขสเปก (fallback)
 * คืน SVG เป็นสตริง (ใส่ในเทมเพลตพิมพ์ผ่าน {{{belt_svg}}})
 */

export type BeltTailShape = "duckbill" | "pointed" | "straight";

export type BeltDiagramParams = {
  holeCount?: number;
  holeSpacingIn?: number;
  toEndIn?: number;
  logoDistIn?: number | null;
  tailShape?: BeltTailShape;
  brandText?: string;
  leatherText?: string;
  // รูปจริงจากตารางหลัก (URL /api/r2-image) — มีอย่างน้อย 1 → ใช้โหมดซ้อนรูป
  strapImg?: string | null;      // belt_tails (ทรงปลายหาง = เข็มขัดทั้งเส้น)
  holeImg?: string | null;       // belt_hole (ลายรู)
  holeBackOnly?: boolean;        // ลายรูอยู่ "หลังอย่างเดียว" (เช่น พิมพ์บันได) → หน้าไม่โชว์
  frontLogoImg?: string | null;  // belt_logo (โลโก้ด้านหน้า)
  backLogoImg?: string | null;   // belt_logo (โลโก้ด้านหลัง)
  layout?: BeltLayout;           // เฟส 2: ปรับ ความสูง/ตำแหน่งเส้นระยะ (บันทึกค่าได้)
  placeholder?: boolean;         // หน้าตั้งค่า: วาดโครงจำลอง (ไม่มีรูปจริง) เพื่อพรีวิวตำแหน่ง/ความสูงจากสไลเดอร์
};

// กล่องวางรูป — สัดส่วน 0..1 เทียบกรอบเข็มขัดแต่ละด้าน (x,y=มุมบนซ้าย · w,h=กว้าง/สูง)
export type ImgBox = { x: number; y: number; w: number; h: number };
export type BeltImgPlace = { strap?: ImgBox; hole?: ImgBox; logo?: ImgBox };

// ตำแหน่ง+ความสูง ที่ปรับ+บันทึกได้ (พิกัดในระบบ viewBox 0..740)
export type BeltLayout = {
  boxH?: number;                                  // ความสูงเข็มขัด (compact)
  frontDim?: { x: number; y: number; w: number }; // วงเล็บ "ห่างโลโก้" (เหนือกรอบหน้า)
  backDim?: { x: number; y: number; w: number };  // วงเล็บ "ถึงปลายสาย" (ใต้กรอบหลัง)
  images?: { front?: BeltImgPlace; back?: BeltImgPlace };  // เทมเพลตวางรูป: ลากวาง ปลายหาง/รู/โลโก้ เอง
};

// ค่าเริ่มต้นการวางรูป (สัดส่วน 0..1) — strap เต็มกรอบ · รู=แถบซ้าย · โลโก้=ช่วงขวา
export const BELT_DEFAULT_PLACE: { front: BeltImgPlace; back: BeltImgPlace } = {
  front: { strap: { x: 0, y: 0, w: 1, h: 1 }, hole: { x: 0.04, y: 0.12, w: 0.42, h: 0.76 }, logo: { x: 0.62, y: 0.30, w: 0.30, h: 0.40 } },
  back:  { strap: { x: 0, y: 0, w: 1, h: 1 }, hole: { x: 0.04, y: 0.12, w: 0.86, h: 0.76 }, logo: { x: 0.58, y: 0.30, w: 0.30, h: 0.40 } },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ── โหมดซ้อนรูปจริง ──
// strap/hole เป็นกรอบเดียวกัน (925×167) → ซ้อนตรงพอดี · โลโก้เป็นรูปเล็กแยก (208×45) วางช่วงปลายขวา
const BX = 18, BW = 704;
export const BELT_DEFAULT_LAYOUT = {
  boxH: 104,                                       // ความสูง compact (เดิม ~130)
  frontDim: { x: BX + BW - 96, y: 12, w: 74 },     // วงเล็บ "ห่างโลโก้" (เหนือกรอบหน้า ใกล้ปลาย)
  backDim:  { x: BX + 120, y: 14, w: BW - 132 },   // วงเล็บ "ถึงปลายสาย" (ใต้กรอบหลัง)
};
// โครงเข็มขัดจำลอง (วาดเมื่อยังไม่มีรูปจริง) — เต็มกรอบเดียวกับรูป → เห็นตำแหน่งเส้น/ความสูงจากสไลเดอร์
function placeholderStrap(y: number, BH: number, label: string, mirror: boolean): string {
  const x0 = BX, x1 = BX + BW, b = y + BH, cy = y + BH / 2;
  const tail = Math.min(70, BH * 0.85);
  const path = `M${x0},${y} H${x1 - tail} L${x1 - 8},${y + 10} Q${x1},${cy} ${x1 - 8},${b - 10} L${x1 - tail},${b} H${x0} Z`;
  let holes = "";
  if (!mirror) for (let i = 0; i < 5; i++) holes += `<ellipse cx="${x0 + 40 + i * 46}" cy="${cy}" rx="8" ry="12" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>`;
  const tx = x1 - tail - 80;
  const txt = label
    ? (mirror
        ? `<g transform="translate(${tx},${cy + 5}) scale(-1,1)"><text font-size="15" font-weight="700" fill="#94a3b8" text-anchor="middle">${esc(label)}</text></g>`
        : `<text x="${tx}" y="${cy + 5}" font-size="15" font-weight="700" fill="#94a3b8" text-anchor="middle">${esc(label)}</text>`)
    : "";
  return `<path d="${path}" fill="#fff" stroke="#94a3b8" stroke-width="2"/>${holes}${txt}`;
}

function imageComposite(p: BeltDiagramParams): string {
  // ทุกรูป (ทรงปลายหาง/ลายรู/โลโก้) ทำบนกรอบเทมเพลตเดียวกัน → วางเต็มกรอบ ซ้อนตรงเป๊ะ
  const L = p.layout ?? {};
  const BH = L.boxH ?? BELT_DEFAULT_LAYOUT.boxH;
  const fd = L.frontDim ?? BELT_DEFAULT_LAYOUT.frontDim;
  const bd = L.backDim ?? BELT_DEFAULT_LAYOUT.backDim;
  const fY = 28, bY = fY + BH + 46;
  const brand   = (p.brandText ?? "").trim();
  const leather = (p.leatherText ?? "Genuine Leather").trim();
  const fp = L.images?.front ?? BELT_DEFAULT_PLACE.front;
  const bp = L.images?.back ?? BELT_DEFAULT_PLACE.back;
  // วางรูปตามกล่องที่บันทึก (สัดส่วน 0..1 ของกรอบด้านนั้น) · meet = ไม่ยืดรูป
  const placeImg = (href: string | null | undefined, top: number, b: ImgBox | undefined) => {
    if (!href) return "";
    const box = b ?? { x: 0, y: 0, w: 1, h: 1 };
    const x = BX + box.x * BW, y = top + box.y * BH, w = box.w * BW, h = box.h * BH;
    return `<image href="${esc(href)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
  };
  // ชั้นทรงเข็มขัด: มีรูป→วางตามกล่อง, ไม่มีรูป→วาดโครงจำลอง (สำหรับหน้าตั้งค่า/รูปขาด)
  const strap = (y: number, label: string, mirror: boolean, b: ImgBox | undefined) =>
    p.strapImg ? placeImg(p.strapImg, y, b) : placeholderStrap(y, BH, label, mirror);
  // เส้นบอกระยะแบบวงเล็บ — ก้านชี้ "เข้าหา" ตัวเข็มขัด · ป้ายอยู่ฝั่งตรงข้าม (ไกลเข็มขัด)
  // down=false → วงเล็บเหนือเข็มขัด ก้านชี้ลง ⊓ · down=true → ใต้เข็มขัด ก้านชี้ขึ้น ⊔
  const bracket = (x: number, w: number, y: number, label: string, down: boolean) => {
    const t = down ? -6 : 6;
    return `<path d="M${x},${y + t} V${y} H${x + w} V${y + t}" fill="none" stroke="#b91c1c" stroke-width="1.1"/>` +
      `<text x="${x + w / 2}" y="${down ? y + 14 : y - 5}" font-size="11" fill="#b91c1c" text-anchor="middle">${esc(label)}</text>`;
  };
  const logoDist = p.logoDistIn != null ? `ห่าง ${p.logoDistIn} นิ้ว` : "ห่าง 1 นิ้ว";
  const toEnd = `${p.toEndIn ?? 7} นิ้วถึงปลายสาย`;
  const fbY = fY - fd.y;          // เส้นวงเล็บหน้า (เหนือกรอบหน้า)
  const bbY = bY + BH + bd.y;     // เส้นวงเล็บหลัง (ใต้กรอบหลัง)
  // หน้า: ลายรูโชว์เฉพาะเจาะรูจริง (พิมพ์บันได back_only=หลังเท่านั้น)
  const front = `<text x="${BX}" y="20" font-size="13" font-weight="600" fill="#475569">ด้านหน้า</text>${strap(fY, brand, false, fp.strap)}${p.holeBackOnly ? "" : placeImg(p.holeImg, fY, fp.hole)}${placeImg(p.frontLogoImg, fY, fp.logo)}${bracket(fd.x, fd.w, fbY, logoDist, false)}`;
  const back  = `<text x="${BX}" y="${bY - 10}" font-size="13" font-weight="600" fill="#475569">ด้านหลัง</text>${strap(bY, leather, true, bp.strap)}${placeImg(p.holeImg, bY, bp.hole)}${placeImg(p.backLogoImg, bY, bp.logo)}${bracket(bd.x, bd.w, bbY, toEnd, true)}`;
  const topPad = Math.max(0, 16 - fbY);   // กันป้ายวงเล็บหน้าโดนตัดขอบบน (ตอนเลื่อนเส้นขึ้นสูง)
  const H = bbY + 22;                       // เผื่อป้ายวงเล็บหลังที่อยู่ใต้สุด
  return `<svg viewBox="0 ${-topPad} 740 ${H + topPad}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${front}${back}</svg>`;
}

// ── โหมดเวกเตอร์ (fallback เมื่อไม่มีรูป) ──
function strapPath(y: number, tail: BeltTailShape): string {
  const b = y + 70;
  if (tail === "straight") return `M40,${y} H705 V${b} H40 Z`;
  if (tail === "pointed")  return `M40,${y} H628 L705,${y + 35} L628,${b} H40 Z`;
  return `M40,${y} H612 L694,${y + 26} Q706,${y + 35} 694,${y + 44} L612,${b} H40 Z`;
}
function holes(count: number, cy: number, x0 = 70, step = 55): string {
  let s = "";
  for (let i = 0; i < count; i++) s += `<ellipse cx="${x0 + i * step}" cy="${cy}" rx="7" ry="11" fill="#fff" stroke="#475569" stroke-width="1.5"/>`;
  return s;
}
function vectorSvg(p: BeltDiagramParams): string {
  const holeCount = Math.max(0, Math.round(p.holeCount ?? 5));
  const spacing   = p.holeSpacingIn ?? 1;
  const toEnd     = p.toEndIn ?? 7;
  const tail      = p.tailShape ?? "duckbill";
  const brand     = (p.brandText ?? "").trim() || "BRAND";
  const leather   = (p.leatherText ?? "Genuine Leather").trim();
  const logoTxt   = p.logoDistIn != null ? `ห่าง ${p.logoDistIn} นิ้ว` : "ห่าง X นิ้ว";
  const midHoleX  = 70 + Math.floor(Math.max(0, holeCount - 1) / 2) * 55;
  const tailName  = tail === "duckbill" ? "ปากเป็ด" : tail === "pointed" ? "แหลม" : "ตรง";
  const front = `
    <text x="40" y="42" font-size="13" font-weight="600" fill="#475569">ด้านหน้า</text>
    <path d="${strapPath(55, tail)}" fill="none" stroke="#111827" stroke-width="2"/>
    ${holes(holeCount, 90)}
    <g transform="translate(530,95)"><text x="0" y="0" font-size="15" font-weight="700" fill="#111827" text-anchor="middle">${esc(brand)}</text></g>
    <path d="M620,48 V40 H690 V48" fill="none" stroke="#15803d" stroke-width="1.2"/>
    <text x="625" y="34" font-size="12" fill="#15803d">ห่าง ${spacing} นิ้ว</text>
    <path d="M468,48 V38 H566 V48" fill="none" stroke="#b45309" stroke-width="1.6"/>
    <text x="455" y="32" font-size="12.5" font-weight="600" fill="#92400e">${esc(logoTxt)}</text>
    <path d="M${midHoleX},108 V150 H694 V108" fill="none" stroke="#b91c1c" stroke-width="1.2"/>
    <text x="${(midHoleX + 694) / 2}" y="166" font-size="12" fill="#b91c1c" text-anchor="middle">${toEnd} นิ้วถึงปลายสาย</text>`;
  const back = `
    <text x="40" y="232" font-size="13" font-weight="600" fill="#475569">ด้านหลัง (ปลายหาง${tailName})</text>
    <path d="${strapPath(245, tail)}" fill="none" stroke="#111827" stroke-width="2"/>
    <g transform="translate(595,285) scale(-1,1)"><text x="0" y="0" font-size="15" font-weight="700" fill="#111827" text-anchor="middle">${esc(leather)}</text></g>`;
  return `<svg viewBox="0 0 740 330" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${front}${back}</svg>`;
}

export function buildBeltDiagramSvg(p: BeltDiagramParams = {}): string {
  const hasImg = !!(p.strapImg || p.holeImg || p.frontLogoImg || p.backLogoImg);
  // มีรูปจริง หรือ โหมดพรีวิวหน้าตั้งค่า (placeholder) → ใช้ตัวซ้อนรูป (อ่านค่า layout จากสไลเดอร์)
  return (hasImg || p.placeholder) ? imageComposite(p) : vectorSvg(p);
}
