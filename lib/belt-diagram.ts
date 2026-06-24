/**
 * ตัววาดรูปเข็มขัด (schematic) จากพารามิเตอร์ — ของกลาง สำหรับใบงานเข็มขัด (เฟส 3)
 *
 * คืน SVG เป็นสตริง (ใส่ในเทมเพลตพิมพ์ผ่าน {{{belt_svg}}}) — 2 มุม: ด้านหน้า + ด้านหลัง
 * แต่ละมุม = "เข็มขัดเดียว" ที่ซ้อนเลเยอร์: เส้นขอบสาย + รู + โลโก้/ลายปลายหาง + เส้นบอกระยะ
 * ลายปลายหาง: ถ้าส่ง URL รูป (frontTailImg/backTailImg) → วางรูปจริงทับที่ปลาย · ไม่มี → ใช้ข้อความ
 * เป็นแผนผัง (ไม่สเกลตามนิ้วจริง) แต่ใส่ตัวเลขจริงกำกับ
 */

export type BeltTailShape = "duckbill" | "pointed" | "straight";

export type BeltDiagramParams = {
  holeCount?: number;          // จำนวนรู (default 5)
  holeSpacingIn?: number;      // ระยะห่างรู เป็นนิ้ว (default 1)
  toEndIn?: number;            // ระยะรูสุดท้าย → ปลายสาย เป็นนิ้ว (default 7)
  logoDistIn?: number | null;  // ระยะโลโก้จากปลาย เป็นนิ้ว (null = ยังไม่ระบุ → โชว์ "X")
  tailShape?: BeltTailShape;   // ทรงปลายหาง (default duckbill = ปากเป็ด)
  brandText?: string;          // ข้อความโลโก้ด้านหน้า (ใช้เมื่อไม่มีรูปลาย)
  leatherText?: string;        // ข้อความด้านหลัง (default "Genuine Leather")
  frontTailImg?: string | null; // URL รูปลายปลายหางด้านหน้า (วางทับแทนข้อความ)
  backTailImg?: string | null;  // URL รูปลายปลายหางด้านหลัง
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// path ตัวสาย: ปลายซ้ายตรง, ปลายขวาเป็นทรงตามเลือก — สูง 70
function strapPath(y: number, tail: BeltTailShape): string {
  const b = y + 70;
  if (tail === "straight") return `M40,${y} H705 V${b} H40 Z`;
  if (tail === "pointed")  return `M40,${y} H628 L705,${y + 35} L628,${b} H40 Z`;
  return `M40,${y} H612 L694,${y + 26} Q706,${y + 35} 694,${y + 44} L612,${b} H40 Z`; // duckbill
}

function holes(count: number, cy: number, x0 = 70, step = 55): string {
  let s = "";
  for (let i = 0; i < count; i++) s += `<ellipse cx="${x0 + i * step}" cy="${cy}" rx="7" ry="11" fill="#fff" stroke="#475569" stroke-width="1.5"/>`;
  return s;
}

// ลายปลายหาง: รูปจริงถ้ามี (วางใกล้ปลายขวา) ไม่งั้นข้อความ
function tailMark(yCenter: number, img: string | null | undefined, text: string, mirror: boolean): string {
  if (img) return `<image href="${esc(img)}" x="535" y="${yCenter - 27}" width="150" height="54" preserveAspectRatio="xMidYMid meet"/>`;
  const t = `<text x="0" y="0" font-size="15" font-weight="700" fill="#111827" text-anchor="middle">${esc(text)}</text>`;
  return mirror ? `<g transform="translate(595,${yCenter + 5}) scale(-1,1)">${t}</g>` : `<g transform="translate(530,${yCenter + 5})">${t}</g>`;
}

export function buildBeltDiagramSvg(p: BeltDiagramParams = {}): string {
  const holeCount = Math.max(0, Math.round(p.holeCount ?? 5));
  const spacing   = p.holeSpacingIn ?? 1;
  const toEnd     = p.toEndIn ?? 7;
  const tail      = p.tailShape ?? "duckbill";
  const brand     = (p.brandText ?? "").trim() || "BRAND";
  const leather   = (p.leatherText ?? "Genuine Leather").trim();
  const logoTxt   = p.logoDistIn != null ? `ห่าง ${p.logoDistIn} นิ้ว` : "ห่าง X นิ้ว";
  const midHoleX  = 70 + Math.floor(Math.max(0, holeCount - 1) / 2) * 55;   // รูกลาง (อ้างเส้น "ถึงปลายสาย")
  const tailName  = tail === "duckbill" ? "ปากเป็ด" : tail === "pointed" ? "แหลม" : "ตรง";

  // ---- ด้านหน้า: เส้นขอบ + รู + ลายปลายหาง + เส้นบอกระยะ (ซ้อนเป็นเข็มขัดเดียว) ----
  const front = `
    <text x="40" y="42" font-size="13" font-weight="600" fill="#475569">ด้านหน้า</text>
    <path d="${strapPath(55, tail)}" fill="none" stroke="#111827" stroke-width="2"/>
    ${holes(holeCount, 90)}
    ${tailMark(90, p.frontTailImg, brand, false)}
    <path d="M620,48 V40 H690 V48" fill="none" stroke="#15803d" stroke-width="1.2"/>
    <text x="625" y="34" font-size="12" fill="#15803d">ห่าง ${spacing} นิ้ว</text>
    <path d="M468,48 V38 H566 V48" fill="none" stroke="#b45309" stroke-width="1.6"/>
    <text x="455" y="32" font-size="12.5" font-weight="600" fill="#92400e">${esc(logoTxt)} ◆ ฟิลด์ใหม่</text>
    <path d="M${midHoleX},108 V150 H694 V108" fill="none" stroke="#b91c1c" stroke-width="1.2"/>
    <text x="${(midHoleX + 694) / 2}" y="166" font-size="12" fill="#b91c1c" text-anchor="middle">${toEnd} นิ้วถึงปลายสาย</text>`;

  // ---- ด้านหลัง: เส้นขอบ + ลายปลายหาง(หลัง) + ระยะโลโก้ ----
  const back = `
    <text x="40" y="232" font-size="13" font-weight="600" fill="#475569">ด้านหลัง (ปลายหาง${tailName})</text>
    <path d="${strapPath(245, tail)}" fill="none" stroke="#111827" stroke-width="2"/>
    ${tailMark(280, p.backTailImg, leather, !p.backTailImg)}
    <path d="M620,238 V230 H690 V238" fill="none" stroke="#b45309" stroke-width="1.6"/>
    <text x="610" y="224" font-size="12" fill="#92400e">${esc(logoTxt)}</text>`;

  return `<svg viewBox="0 0 740 330" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${front}${back}</svg>`;
}
