/**
 * คิดผ้าก่อนซื้อ ← ใบงาน Design Dashboard (เจ้าของขอ 2026-11-18)
 *   แปลง "บรรทัดตีราคา" ของใบออกแบบ (design_sheet_cost_lines: กว้าง × ยาว × ชิ้น · วัสดุ · หน้าผ้า · แท็บ Parent · สี/แบบ)
 *   → ผ้าให้เลือกในโหมดผ้าเดียว (sheetFabrics) หรือ "สี" ของโหมดทั้งตระกูล (sheetColorGroups)
 *   วัสดุในใบยังไม่ผูกรหัสผ้า (ข้อมูลจริง 2026-11-18: 0/523 บรรทัดมีรหัส) → ใช้ชื่อวัสดุ ห่อวงเล็บ "(ชื่อ)" = ไม่ใช่รหัสจริง
 *   (ทั้งหน้าถือว่าขึ้นต้น "(" = ไม่มีรหัส → ไม่ใส่ skuRef ตะกร้า · จับคู่ผ้าด้วยชื่อแทน)
 * ใช้ที่: app/fabric-calc (buy-calc · family-calc) · เทสต์ lib/__tests__/fabric-buy.test.ts
 */
import type { BuyPiece, FamilyLine } from "./fabric-buy";

/** ช่องที่ใช้จากบรรทัดตีราคา (ดู app/api/design-sheets/[id]/cost-lines CostLine) */
export type SheetCostLine = {
  id?: string; item_name: string | null; item_sku_code?: string | null; parent_code?: string | null; variant?: string | null;
  width_cm: number | null; length_cm: number | null; pieces: number | null; face_width_cm: number | null; note?: string | null;
};

const num = (v: unknown) => Number(v) || 0;
export const isCutLine = (l: SheetCostLine) => num(l.width_cm) > 0 && num(l.length_cm) > 0 && num(l.pieces) > 0;
/** รหัสผ้าของบรรทัด: มีรหัสวัตถุดิบ = รหัสนั้น · ไม่มี = "(ชื่อวัสดุ)" */
export const sheetFabricKey = (l: SheetCostLine) => (l.item_sku_code?.trim() || `(${(l.item_name ?? "").trim() || "ไม่ระบุวัสดุ"})`);
export const sheetTabLabel = (l: SheetCostLine) => l.parent_code?.trim() || "ทั่วไป";
/** ชื่อวัสดุเปล่า ๆ จากรหัสผ้า "(ชื่อ)" — ไว้ค้นผ้าด้วยชื่อ */
export const nameFromKey = (key: string) => (key.startsWith("(") && key.endsWith(")") ? key.slice(1, -1) : null);

/** ชื่อชิ้น: หมายเหตุสั้น ๆ (ถ้ามี) ไม่งั้นขนาด · มี สี/แบบ = นำหน้า (ข้อมูลจริงใช้เป็นบทบาท เช่น ซับใน / ผ้าตัว ของวัสดุเดียวกัน) */
const pieceLabel = (l: SheetCostLine) => {
  const base = l.note?.trim() && l.note.trim().length <= 24 ? l.note.trim() : `${num(l.width_cm)}×${num(l.length_cm)}`;
  const v = l.variant?.trim();
  return v ? `${v} · ${base}` : base;
};

export type SheetSrcFabric = { sku: string; name: string; note: string; tab: string; variant: string | null; face: number; pieces: Omit<BuyPiece, "key">[] };

/**
 * โหมดผ้าเดียว: 1 ปุ่ม = แท็บ + วัสดุ (ชิ้นทุกบรรทัดของวัสดุนั้นในแท็บนั้น รวม สี/แบบ ที่ต่างกัน — ซื้อผ้าม้วนเดียวกัน)
 *   ผ้าที่มีหน้าผ้าขึ้นก่อน · ไม่มีหน้าผ้า (โฟม/กระดาษ/ค่าสกรีน) ไว้ท้าย + บอกในหมายเหตุ
 */
export function sheetFabrics(lines: SheetCostLine[]): SheetSrcFabric[] {
  const m = new Map<string, SheetSrcFabric>();
  for (const l of lines) {
    if (!isCutLine(l)) continue;
    const tab = sheetTabLabel(l), sku = sheetFabricKey(l);
    const k = `${tab}|${sku}`;
    let f = m.get(k);
    if (!f) {
      f = { sku, name: (l.item_name ?? "").trim() || "ไม่ระบุวัสดุ", tab, variant: null, face: num(l.face_width_cm), note: "", pieces: [] };
      m.set(k, f);
    }
    if (!f.face && num(l.face_width_cm) > 0) f.face = num(l.face_width_cm);
    f.pieces.push({ label: pieceLabel(l), width_cm: num(l.width_cm), length_cm: num(l.length_cm), per_unit: num(l.pieces) });
  }
  return [...m.values()].sort((a, b) => Number(b.face > 0) - Number(a.face > 0))
    .map((f) => ({ ...f, note: [f.tab !== "ทั่วไป" ? `แท็บ ${f.tab}` : "", f.face ? `หน้า ${f.face} ซม.` : "ไม่มีหน้าผ้า (อาจไม่ใช่ผ้า)"].filter(Boolean).join(" · ") }));
}

export type SheetColorGroup = { code: string; color: string; lines: FamilyLine[]; face: Record<string, number> };

/**
 * โหมดทั้งตระกูล: 1 แถว = แท็บ (Parent) ในใบงาน — ผู้ใช้ใส่จำนวนผลิตต่อแถว แล้วรวมผ้าเดียวกันข้ามแถว (mergeFamilyFabrics)
 *   ไม่แยกแถวตาม สี/แบบ: ข้อมูลจริงใช้ช่องนี้เป็นบทบาทชิ้น (ซับใน/ผ้าตัว) ของใบเดียวกัน แยกแถวจะต้องกรอกจำนวนซ้ำ
 *   face = หน้าผ้าของแต่ละผ้าที่ใบงานใส่ไว้ (ไม่มี = ใช้ของรหัสผ้า/ให้ผู้ใช้กรอก)
 */
export function sheetColorGroups(lines: SheetCostLine[]): SheetColorGroup[] {
  const m = new Map<string, SheetColorGroup>();
  for (const l of lines) {
    if (!isCutLine(l)) continue;
    const code = sheetTabLabel(l);
    let g = m.get(code);
    if (!g) { g = { code, color: code, lines: [], face: {} }; m.set(code, g); }
    const sku = sheetFabricKey(l);
    g.lines.push({ component_sku: sku, component_name: (l.item_name ?? "").trim() || null, label: pieceLabel(l), width_cm: num(l.width_cm), length_cm: num(l.length_cm), per_unit: num(l.pieces) });
    if (num(l.face_width_cm) > 0 && !g.face[sku]) g.face[sku] = num(l.face_width_cm);
  }
  return [...m.values()];
}

/**
 * ชื่อชุดคำนวณที่ไม่ชนของเดิม: ชื่อนี้ยังไม่มี = ใช้ได้เลย · มีแล้ว = ต่อท้าย v2, v3 … (ตัวถัดจากเลขที่สูงสุด)
 *   "TOTE-01" + มี ["TOTE-01", "TOTE-01 v2"] → "TOTE-01 v3"
 */
export function nextVersionName(name: string, existing: string[]): string {
  const base = baseCalcName(name);
  const same = existing.filter((e) => baseCalcName(e) === base);
  if (!same.length) return name.trim();
  const max = same.reduce((mx, e) => Math.max(mx, versionOf(e)), 1);
  return `${base} v${max + 1}`;
}
/** ตัด " v2" ท้ายชื่อออก → ชื่อหลัก (ไว้จัดกลุ่มเวอร์ชัน) */
export const baseCalcName = (name: string) => name.trim().replace(/\s+v(\d+)$/i, "");
/** เลขเวอร์ชันจากท้ายชื่อ (ไม่มี = 1) */
export const versionOf = (name: string) => { const m = name.trim().match(/\s+v(\d+)$/i); return m ? Number(m[1]) : 1; };
