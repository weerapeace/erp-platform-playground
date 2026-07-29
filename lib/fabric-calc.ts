/**
 * ของกลาง — คำนวณ "ใช้ผ้าเท่าไหร่" จากรายการชิ้นที่ต้องตัด
 *
 * แนวคิด: จำลองการวางชิ้นบนหน้าผ้าจริง (ไม่ใช่เอาพื้นที่รวมมาหาร ซึ่งมองข้ามเศษที่ตัดไม่ได้)
 *   วิธี = วางเป็น "แถว" ตามหน้ากว้างผ้า (shelf / strip packing แบบ First-Fit Decreasing Height)
 *   - เรียงชิ้นจากสูง→เตี้ย · วางต่อกันในแถวจนเต็มหน้ากว้าง แล้วขึ้นแถวใหม่
 *   - ความสูงแถว = ชิ้นที่สูงสุดในแถว · รวมทุกแถว = ความยาวผ้าที่ใช้
 *
 * รองรับผ้า 2 แบบ (ตามที่ใช้จริง):
 *   - roll  : ผ้าเป็นม้วน/ต่อเนื่อง → รู้แค่หน้ากว้าง → ตอบเป็นความยาว (ซม./หลา/เมตร)
 *   - sheet : ผ้าเป็นผืนตายตัว (กว้าง×ยาว) → ตอบเป็น "จำนวนผืน"
 *
 * หมายเหตุ: ผลลัพธ์เป็นการประมาณเชิงวิศวกรรม (วางแนวตรง ไม่หมุนเฉียง/ไม่ interlock)
 *            เหมาะกับการตีราคา — งานตัดจริงอาจดีกว่านี้เล็กน้อย
 */

export type FabricPiece = {
  key: string;
  label: string;
  width_cm: number;
  length_cm: number;
  qty: number;          // จำนวนชิ้นทั้งหมดที่ต้องตัด (จำนวนต่อใบ × จำนวนที่ผลิตแล้ว)
};

export type FabricInput = {
  pieces: FabricPiece[];
  faceWidthCm: number;        // หน้ากว้างผ้า
  sheetLengthCm?: number | null;  // ผ้าผืน: ความยาวต่อผืน (ไม่ใส่ = ผ้าม้วน/ต่อเนื่อง)
  allowRotate?: boolean;      // หมุนชิ้น 90° ได้ไหม (ผ้าไม่มีลายทิศทาง)
  wastePercent?: number;      // เผื่อเสีย %
  gapCm?: number;             // เว้นระยะระหว่างชิ้น (รอยตัด/ตะเข็บ)
};

export type FabricItem = { key: string; label: string; x: number; w: number; h: number; rotated: boolean };
export type FabricRow = {
  y: number; height: number; used: number; items: FabricItem[];
  sheetIndex?: number;   // ผ้าผืน: อยู่ผืนที่เท่าไร (0-based)
  yInSheet?: number;     // ผ้าผืน: ตำแหน่งแนวยาวภายในผืนนั้น
};

export type FabricResult = {
  ok: boolean;
  error?: string;
  totalPieces: number;
  usedLengthCm: number;       // ความยาวผ้าที่ใช้ (ก่อนเผื่อเสีย)
  lengthWithWasteCm: number;  // หลังเผื่อเสีย
  yards: number;              // แปลงเป็นหลา (1 หลา = 91.44 ซม.)
  meters: number;
  sheets?: number;            // เฉพาะผ้าผืน: ต้องสั่งกี่ผืน (เผื่อเสียแล้ว)
  sheetsUsed?: number;        // เฉพาะผ้าผืน: วางจริงกี่ผืน (ไว้วาดภาพ)
  rows: FabricRow[];          // ผังการวาง (ไว้ทำภาพ preview ในเฟสถัดไป)
  pieceAreaCm2: number;       // พื้นที่ชิ้นรวม
  fabricAreaCm2: number;      // พื้นที่ผ้าที่ใช้จริง
  utilizationPercent: number; // ใช้ผ้าคุ้มกี่ % (พื้นที่ชิ้น ÷ พื้นที่ผ้า)
  naiveYards: number;         // วิธีเดิม (พื้นที่ ÷ หน้ากว้าง) — ไว้เทียบให้เห็นส่วนต่าง
};

export const YARD_CM = 91.44;

/** วางชิ้นบนหน้าผ้า → คืนผังแถว + ความยาวที่ใช้ */
export function packFabric(input: FabricInput): FabricResult {
  const face = Number(input.faceWidthCm) || 0;
  const gap = Math.max(0, Number(input.gapCm) || 0);
  const waste = Math.max(0, Number(input.wastePercent) || 0);
  const rotate = !!input.allowRotate;

  // กระจายเป็นชิ้นเดี่ยว ๆ (qty ชิ้น) + ตัดชิ้นที่ข้อมูลไม่ครบออก
  const flat: { key: string; label: string; w: number; h: number }[] = [];
  for (const p of input.pieces) {
    const w = Number(p.width_cm) || 0, h = Number(p.length_cm) || 0, n = Math.max(0, Math.floor(Number(p.qty) || 0));
    if (w <= 0 || h <= 0 || n === 0) continue;
    for (let i = 0; i < n; i++) flat.push({ key: p.key, label: p.label, w, h });
  }
  const pieceAreaCm2 = flat.reduce((s, p) => s + p.w * p.h, 0);

  if (face <= 0) return emptyResult("ยังไม่รู้หน้ากว้างผ้า — ใส่หน้ากว้าง (ซม.) ก่อน", flat.length, pieceAreaCm2);
  if (flat.length === 0) return emptyResult("ไม่มีชิ้นที่ต้องตัด (ตรวจว่ากรอกกว้าง/ยาว/จำนวนชิ้นครบไหม)", 0, 0);

  // ชิ้นที่กว้างเกินหน้าผ้า → วางไม่ได้ (ลองหมุนก่อนถ้าอนุญาต)
  const oversize = flat.find((p) => Math.min(p.w, rotate ? p.h : p.w) > face);
  if (oversize) return emptyResult(`ชิ้น "${oversize.label}" (${oversize.w}×${oversize.h} ซม.) กว้างเกินหน้าผ้า ${face} ซม.`, flat.length, pieceAreaCm2);

  // จัดท่าแต่ละชิ้น: ให้ "ด้านที่กินหน้ากว้าง" สั้นกว่า (วางได้ต่อแถวเยอะขึ้น) เมื่อหมุนได้
  const oriented = flat.map((p) => {
    if (rotate && p.h <= face && p.h < p.w) return { ...p, w: p.h, h: p.w, rotated: true };
    return { ...p, rotated: false };
  });

  // FFDH: เรียงสูง→เตี้ย แล้ววางแถวแรกที่ยังมีที่ว่างพอ
  oriented.sort((a, b) => b.h - a.h || b.w - a.w);
  const rows: FabricRow[] = [];
  for (const p of oriented) {
    let placed = false;
    for (const row of rows) {
      const need = (row.items.length ? gap : 0) + p.w;
      if (row.used + need <= face) {
        row.items.push({ key: p.key, label: p.label, x: row.used + (row.items.length ? gap : 0), w: p.w, h: p.h, rotated: p.rotated });
        row.used += need;
        row.height = Math.max(row.height, p.h);
        placed = true; break;
      }
    }
    if (!placed) {
      const y = rows.reduce((s, r) => s + r.height + gap, 0);
      rows.push({ y, height: p.h, used: p.w, items: [{ key: p.key, label: p.label, x: 0, w: p.w, h: p.h, rotated: p.rotated }] });
    }
  }

  const usedLengthCm = rows.reduce((s, r) => s + r.height, 0) + Math.max(0, rows.length - 1) * gap;
  const lengthWithWasteCm = usedLengthCm * (1 + waste / 100);
  const fabricAreaCm2 = lengthWithWasteCm * face;

  const res: FabricResult = {
    ok: true,
    totalPieces: flat.length,
    usedLengthCm,
    lengthWithWasteCm,
    yards: lengthWithWasteCm / YARD_CM,
    meters: lengthWithWasteCm / 100,
    rows,
    pieceAreaCm2,
    fabricAreaCm2,
    utilizationPercent: fabricAreaCm2 > 0 ? (pieceAreaCm2 / fabricAreaCm2) * 100 : 0,
    naiveYards: face > 0 ? (pieceAreaCm2 * (1 + waste / 100)) / face / YARD_CM : 0,
  };

  // ผ้าผืน (ขนาดตายตัว): แปลงความยาวที่ใช้ → จำนวนผืน (วางใหม่ต่อผืน ไม่ต่อข้ามผืน)
  const sheetLen = Number(input.sheetLengthCm) || 0;
  if (sheetLen > 0) {
    let sheets = 1, cursor = 0;
    for (const r of rows) {
      const need = (cursor > 0 ? gap : 0) + r.height;
      if (cursor + need > sheetLen) { sheets++; cursor = 0; }   // ขึ้นผืนใหม่ (เริ่มจากขอบบน)
      r.sheetIndex = sheets - 1;
      r.yInSheet = cursor > 0 ? cursor + gap : 0;
      cursor = (r.yInSheet ?? 0) + r.height;
    }
    res.sheetsUsed = sheets;                                    // ผืนที่วางจริง (ก่อนเผื่อเสีย)
    res.sheets = Math.ceil(sheets * (1 + waste / 100));         // สั่งจริง (เผื่อเสียแล้ว)
  }
  return res;
}

function emptyResult(error: string, totalPieces: number, pieceAreaCm2: number): FabricResult {
  return { ok: false, error, totalPieces, usedLengthCm: 0, lengthWithWasteCm: 0, yards: 0, meters: 0, rows: [],
    pieceAreaCm2, fabricAreaCm2: 0, utilizationPercent: 0, naiveYards: 0 };
}

export const fmtCm = (v: number) => `${Math.round(v * 10) / 10} ซม.`;
export const fmtYard = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString("th-TH")} หลา`;
