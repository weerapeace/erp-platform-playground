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

export type FabricItem = { key: string; label: string; x: number; y: number; w: number; h: number; rotated: boolean };
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
  // เรียงชิ้นใหญ่ก่อน (ด้านยาวสุด) — วางของใหญ่ลงก่อนแล้วเอาชิ้นเล็กแทรกซอก
  const queue = [...flat].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);

  const sheetLen = Number(input.sheetLengthCm) || 0;
  const limitH = sheetLen > 0 ? sheetLen : Infinity;   // ผ้าผืน = สูงจำกัดต่อผืน · ผ้าม้วน = ไม่จำกัด

  // วางทีละ "ผืน" (ผ้าม้วน = ผืนเดียวยาวไม่จำกัด)
  const sheetsPlaced: FabricItem[][] = [];
  let remaining = queue;
  let guard = 0;
  while (remaining.length > 0 && guard++ < 500) {
    const { placed, leftover } = packSkyline(remaining, face, limitH, rotate, gap);
    if (placed.length === 0) break;            // วางไม่ลงเลย (กันลูปค้าง)
    sheetsPlaced.push(placed);
    remaining = leftover;
  }

  // แปลงผลเป็น "แถว" ตามระดับ y (ให้ตัววาดภาพ/โครงเดิมใช้ได้เหมือนเดิม)
  const rows: FabricRow[] = [];
  sheetsPlaced.forEach((items, si) => {
    const byY = new Map<number, FabricItem[]>();
    for (const it of items) {
      const k = Math.round(it.y * 100) / 100;
      if (!byY.has(k)) byY.set(k, []);
      byY.get(k)!.push(it);
    }
    for (const [y, list] of [...byY.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push({
        y: sheetLen > 0 ? y : y,
        height: Math.max(...list.map((i) => i.h)),
        used: Math.max(...list.map((i) => i.x + i.w)),
        items: list.map((i) => ({ ...i })),
        ...(sheetLen > 0 ? { sheetIndex: si, yInSheet: y } : {}),
      });
    }
  });

  // ความยาวที่ใช้: ผ้าม้วน = ขอบล่างสุด · ผ้าผืน = (จำนวนผืน × ความยาวผืน) เพื่อคิดต้นทุนรวม
  const bottomOf = (items: FabricItem[]) => items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  const usedLengthCm = sheetLen > 0
    ? sheetsPlaced.reduce((s, items) => s + bottomOf(items), 0)
    : bottomOf(sheetsPlaced[0] ?? []);
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

  // ผ้าผืน: จำนวนผืนที่วางจริง (จาก loop ด้านบน) + เผื่อเสีย
  if (sheetLen > 0) {
    res.sheetsUsed = sheetsPlaced.length;
    res.sheets = Math.ceil(sheetsPlaced.length * (1 + waste / 100));
  }
  // ชิ้นที่วางไม่ลงเลย (ไม่ควรเกิดถ้าไม่ oversize) — แจ้งไว้กันเงียบ
  if (remaining.length > 0) { res.ok = false; res.error = `วางไม่ลง ${remaining.length} ชิ้น — ลองเพิ่มหน้ากว้าง/ความยาวผืน`; }
  return res;
}

// ── Skyline Bottom-Left ────────────────────────────────────────────────
// เก็บ "เส้นขอบบนของกองที่วางแล้ว" (skyline) แล้ววางชิ้นถัดไปที่ตำแหน่งต่ำที่สุดเท่าที่ลง
// ดีกว่าวางเป็นแถว (shelf) ตรงที่ใช้ช่องว่าง "ใต้ชิ้นเตี้ย" ได้ → เศษผ้าน้อยลงมาก
type SkyNode = { x: number; w: number; y: number };

function packSkyline(
  pieces: { key: string; label: string; w: number; h: number }[],
  face: number, limitH: number, rotate: boolean, gap: number,
): { placed: FabricItem[]; leftover: typeof pieces } {
  let sky: SkyNode[] = [{ x: 0, w: face, y: 0 }];
  const placed: FabricItem[] = [];
  const leftover: typeof pieces = [];

  // หา y ต่ำสุดที่วางชิ้นกว้าง w ได้ โดยเริ่มที่ node i
  const fit = (i: number, w: number): number | null => {
    if (sky[i].x + w > face + 1e-9) return null;
    let y = sky[i].y, rest = w, j = i;
    while (rest > 1e-9 && j < sky.length) {
      y = Math.max(y, sky[j].y);
      rest -= sky[j].w; j++;
    }
    return rest > 1e-9 ? null : y;
  };

  const addSkyline = (x: number, w: number, top: number) => {
    const next: SkyNode[] = [];
    for (const nd of sky) {
      const l = nd.x, r = nd.x + nd.w;
      if (r <= x + 1e-9 || l >= x + w - 1e-9) { next.push(nd); continue; }   // ไม่ทับ
      if (l < x) next.push({ x: l, w: x - l, y: nd.y });                     // ส่วนซ้ายที่เหลือ
      if (r > x + w) next.push({ x: x + w, w: r - (x + w), y: nd.y });       // ส่วนขวาที่เหลือ
    }
    next.push({ x, w, y: top });
    next.sort((a, b) => a.x - b.x);
    // รวม node ที่ระดับเดียวกัน
    sky = next.reduce<SkyNode[]>((acc, nd) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.y - nd.y) < 1e-9 && Math.abs(last.x + last.w - nd.x) < 1e-9) last.w += nd.w;
      else acc.push({ ...nd });
      return acc;
    }, []);
  };

  for (const p of pieces) {
    let best: { x: number; y: number; w: number; h: number; rot: boolean } | null = null;
    for (let i = 0; i < sky.length; i++) {
      // ลองทั้ง 2 ท่า (ถ้าอนุญาตหมุน) — เผื่อ gap ไว้ในขนาดที่จอง
      const tries: [number, number, boolean][] = rotate
        ? [[p.w, p.h, false], [p.h, p.w, true]]
        : [[p.w, p.h, false]];
      for (const [w, h, rot] of tries) {
        const y = fit(i, w + gap);
        if (y == null || y + h > limitH + 1e-9) continue;
        // เลือกตำแหน่งที่ "ต่ำสุด" ก่อน แล้วค่อยชิดซ้ายสุด
        if (!best || y < best.y - 1e-9 || (Math.abs(y - best.y) < 1e-9 && sky[i].x < best.x)) {
          best = { x: sky[i].x, y, w, h, rot };
        }
      }
    }
    if (!best) { leftover.push(p); continue; }
    placed.push({ key: p.key, label: p.label, x: best.x, y: best.y, w: best.w, h: best.h, rotated: best.rot });
    addSkyline(best.x, Math.min(best.w + gap, face - best.x), best.y + best.h + gap);
  }
  return { placed, leftover };
}

function emptyResult(error: string, totalPieces: number, pieceAreaCm2: number): FabricResult {
  return { ok: false, error, totalPieces, usedLengthCm: 0, lengthWithWasteCm: 0, yards: 0, meters: 0, rows: [],
    pieceAreaCm2, fabricAreaCm2: 0, utilizationPercent: 0, naiveYards: 0 };
}

export const fmtCm = (v: number) => `${Math.round(v * 10) / 10} ซม.`;
export const fmtYard = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString("th-TH")} หลา`;
