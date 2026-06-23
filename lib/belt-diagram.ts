/**
 * ตัววาดรูปเข็มขัด (schematic) จากพารามิเตอร์ — ของกลาง สำหรับใบงานเข็มขัด (เฟส 3)
 *
 * คืน SVG เป็นสตริง (ใส่ในเทมเพลตพิมพ์ผ่าน {{{belt_svg}}}) — วาด 3 มุมซ้อน: หน้า / รายละเอียดรู / หลัง
 * เป็นแผนผัง (ไม่สเกลตามนิ้วจริง) แต่ใส่ตัวเลขจริงกำกับ (จำนวนรู, ระยะห่างรู, ถึงปลายสาย, ห่างโลโก้)
 * สีตายตัวสำหรับงานพิมพ์ (ขาวดำ + เส้นบอกระยะสี)
 */

export type BeltTailShape = "duckbill" | "pointed" | "straight";

export type BeltDiagramParams = {
  holeCount?: number;          // จำนวนรู (default 5)
  holeSpacingIn?: number;      // ระยะห่างรู เป็นนิ้ว (default 1)
  toEndIn?: number;            // ระยะรูสุดท้าย → ปลายสาย เป็นนิ้ว (default 7)
  logoDistIn?: number | null;  // ระยะโลโก้จากปลาย เป็นนิ้ว (null = ยังไม่ระบุ → โชว์ "X")
  tailShape?: BeltTailShape;   // ทรงปลายหาง (default duckbill = ปากเป็ด)
  brandText?: string;          // ข้อความโลโก้ด้านหน้า (แบรนด์)
  leatherText?: string;        // ข้อความด้านหลัง (default "Genuine Leather")
};

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

// path ตัวสาย: ปลายซ้ายตรง, ปลายขวาเป็นทรงตามเลือก (ปากเป็ด/แหลม/ตรง) — สูง 70
function strapPath(y: number, tail: BeltTailShape): string {
  const b = y + 70;
  if (tail === "straight") return `M40,${y} H705 V${b} H40 Z`;
  if (tail === "pointed")  return `M40,${y} H628 L705,${y + 35} L628,${b} H40 Z`;
  return `M40,${y} H612 L694,${y + 26} Q706,${y + 35} 694,${y + 44} L612,${b} H40 Z`; // duckbill
}

// รูไข่ (วงรีแนวตั้ง) เรียงจากซ้าย
function holes(count: number, cy: number, x0 = 70, step = 55): string {
  let s = "";
  for (let i = 0; i < count; i++) s += `<ellipse cx="${x0 + i * step}" cy="${cy}" rx="7" ry="11" fill="#fff" stroke="#475569" stroke-width="1.5"/>`;
  return s;
}

export function buildBeltDiagramSvg(p: BeltDiagramParams = {}): string {
  const holeCount = Math.max(0, Math.round(p.holeCount ?? 5));
  const spacing   = p.holeSpacingIn ?? 1;
  const toEnd     = p.toEndIn ?? 7;
  const tail      = p.tailShape ?? "duckbill";
  const brand     = (p.brandText ?? "").trim() || "BRAND";
  const leather   = (p.leatherText ?? "Genuine Leather").trim();
  const logoTxt   = p.logoDistIn != null ? `ห่าง ${p.logoDistIn} นิ้ว` : "ห่าง X นิ้ว";

  const midHoleX = 70 + Math.floor(Math.max(0, holeCount - 1) / 2) * 55;   // รูกลาง (อ้างเส้น "ถึงปลายสาย")

  // ---- มุม 1: ด้านหน้า ----
  const front = `
    <text x="40" y="42" font-size="13" font-weight="600" fill="#475569">ด้านหน้า</text>
    <path d="${strapPath(55, tail)}" fill="none" stroke="#111827" stroke-width="2"/>
    ${holes(holeCount, 90)}
    <text x="470" y="95" font-size="15" font-weight="700" fill="#111827">${esc(brand)}</text>
    <path d="M620,48 V40 H690 V48" fill="none" stroke="#15803d" stroke-width="1.2"/>
    <text x="625" y="34" font-size="12" fill="#15803d">ห่าง ${spacing} นิ้ว</text>
    <path d="M468,48 V38 H566 V48" fill="none" stroke="#b45309" stroke-width="1.6"/>
    <text x="455" y="32" font-size="12.5" font-weight="600" fill="#92400e">${esc(logoTxt)} ◆ ฟิลด์ใหม่</text>
    <path d="M${midHoleX},108 V150 H694 V108" fill="none" stroke="#b91c1c" stroke-width="1.2"/>
    <text x="${(midHoleX + 694) / 2}" y="166" font-size="12" fill="#b91c1c" text-anchor="middle">${toEnd} นิ้วถึงปลายสาย</text>`;

  // ---- มุม 2: รายละเอียดรู (เจาะรูไข่) ----
  const holesView = `
    <text x="40" y="222" font-size="13" font-weight="600" fill="#475569">เจาะรูไข่ ${holeCount} รู (ห่าง ${spacing} นิ้ว)</text>
    ${holes(holeCount, 250)}
    <path d="M${midHoleX},268 V292 H694 V268" fill="none" stroke="#b91c1c" stroke-width="1.2"/>
    <text x="${(midHoleX + 694) / 2}" y="308" font-size="12" fill="#b91c1c" text-anchor="middle">${toEnd} นิ้วถึงปลายสาย</text>`;

  // ---- มุม 3: ด้านหลัง (Genuine Leather กลับด้าน) ----
  const back = `
    <text x="40" y="342" font-size="13" font-weight="600" fill="#475569">ด้านหลัง (ปลายหาง${tail === "duckbill" ? "ปากเป็ด" : tail === "pointed" ? "แหลม" : "ตรง"})</text>
    <path d="${strapPath(355, tail)}" fill="none" stroke="#111827" stroke-width="2"/>
    <g transform="translate(595,390) scale(-1,1)"><text x="0" y="0" font-size="15" font-weight="700" fill="#111827" text-anchor="middle">${esc(leather)}</text></g>
    <path d="M620,348 V340 H690 V348" fill="none" stroke="#b45309" stroke-width="1.6"/>
    <text x="610" y="334" font-size="12" fill="#92400e">${esc(logoTxt)}</text>`;

  return `<svg viewBox="0 0 740 430" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${front}${holesView}${back}</svg>`;
}
