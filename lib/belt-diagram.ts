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
  frontLogoImg?: string | null;  // belt_logo (โลโก้ด้านหน้า)
  backLogoImg?: string | null;   // belt_logo (โลโก้ด้านหลัง)
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ── โหมดซ้อนรูปจริง ──
// strap/hole เป็นกรอบเดียวกัน (925×167) → ซ้อนตรงพอดี · โลโก้เป็นรูปเล็กแยก (208×45) วางช่วงปลายขวา
const IMG_W = 925, IMG_H = 167;                               // ขนาดจริงของรูป strap/hole
const BX = 18, BW = 704, BH = Math.round((BW * IMG_H) / IMG_W); // กรอบเข็มขัด (รักษาอัตราส่วน → ไม่บิด) ≈ 127
const LOGO_FX = 0.60, LOGO_FY = 0.27, LOGO_FW = 0.26;          // ตำแหน่ง/ขนาดโลโก้ (สัดส่วนในกรอบ — ปรับได้ถ้าต้องจูน)
function imageComposite(p: BeltDiagramParams): string {
  const full = (href: string | null | undefined, y: number) =>
    href ? `<image href="${esc(href)}" x="${BX}" y="${y}" width="${BW}" height="${BH}" preserveAspectRatio="none"/>` : "";
  const logoAt = (href: string | null | undefined, boxY: number) => {
    if (!href) return "";
    const lw = Math.round(BW * LOGO_FW), lh = Math.round((lw * 45) / 208);
    const lx = Math.round(BX + BW * LOGO_FX), ly = Math.round(boxY + BH * LOGO_FY);
    return `<image href="${esc(href)}" x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMidYMid meet"/>`;
  };
  const fY = 26, bY = fY + BH + 34;
  const front = `<text x="${BX}" y="18" font-size="13" font-weight="600" fill="#475569">ด้านหน้า</text>${full(p.strapImg, fY)}${full(p.holeImg, fY)}${logoAt(p.frontLogoImg, fY)}`;
  const back  = `<text x="${BX}" y="${bY - 8}" font-size="13" font-weight="600" fill="#475569">ด้านหลัง</text>${full(p.strapImg, bY)}${logoAt(p.backLogoImg, bY)}`;
  const H = bY + BH + 8;
  return `<svg viewBox="0 0 740 ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${front}${back}</svg>`;
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
  return hasImg ? imageComposite(p) : vectorSvg(p);
}
