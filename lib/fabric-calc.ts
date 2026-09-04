/**
 * ของกลาง — คำนวณ "ใช้ผ้าเท่าไหร่" จากรายการชิ้นที่ต้องตัด
 *
 * แนวคิด: จำลองการวางชิ้นบนหน้าผ้าจริง (ไม่ใช่เอาพื้นที่รวมมาหาร ซึ่งมองข้ามเศษที่ตัดไม่ได้)
 *   วิธี = Skyline bottom-left (วางชิ้นที่ตำแหน่งต่ำสุดเท่าที่ลง — ใช้ช่องว่างใต้ชิ้นเตี้ยได้)
 *   + ลองหลาย "กลยุทธ์" (จัดท่าเริ่มต้น × ลำดับการวาง × เกณฑ์เลือกตำแหน่ง) แล้วเลือกอันที่ใช้ผ้าน้อยที่สุด
 *   วัดกับข้อมูลจริง: ประหยัดผ้าได้ ~2-6% เทียบกับกลยุทธ์เดียว (เร็ว ~50ms ที่ 2,000 ชิ้น)
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
  noRotate?: boolean;   // ชิ้นนี้ห้ามหมุน (ผ้าลาย/ตามเกรน) แม้ allowRotate จะเปิด
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
  sheetsUsed?: number;        // เฉพาะผ้าผืน: ใช้จริงกี่ผืน (ก่อนเผื่อเสีย)
  sheetsDrawn?: number;       // เฉพาะผ้าผืน: มีผังจริงให้วาดกี่ผืน (งานล็อตใหญ่จะน้อยกว่า sheetsUsed)
  sampledFrom?: { simulated: number; total: number };   // งานล็อตใหญ่: จำลองกี่ชิ้นจากทั้งหมดกี่ชิ้น
  rows: FabricRow[];          // ผังการวาง (ไว้ทำภาพ preview ในเฟสถัดไป)
  pieceAreaCm2: number;       // พื้นที่ชิ้นรวม
  fabricAreaCm2: number;      // พื้นที่ผ้าที่ใช้จริง (รวมเผื่อเสีย)
  utilizationPercent: number; // ใช้ผ้าคุ้มกี่ % เทียบผ้าที่สั่งจริง (= รวมเผื่อเสียแล้ว)
  packEfficiencyPercent: number;  // "วางได้คุ้มแค่ไหน" เฉพาะการวาง (ไม่รวมเผื่อเสีย) — ตัวชี้วัดคุณภาพ nesting
  strategy?: string;          // กลยุทธ์ที่ชนะ (ดีบัก/โชว์ให้รู้ว่าเลือกวิธีไหน)
  strategiesTried?: number;
  /** ทำไมเหลือเศษ — ชิ้นที่กินหน้าผ้าไม่ลงตัว (เรียงจากเสียพื้นที่มากสุด) */
  fitHints?: { label: string; w: number; perRow: number; leftoverCm: number; suggestFaceCm: number | null }[];
  naiveYards: number;         // วิธีเดิม (พื้นที่ ÷ หน้ากว้าง) — ไว้เทียบให้เห็นส่วนต่าง
};

export const YARD_CM = 91.44;

/** วางชิ้นบนหน้าผ้า → คืนผังแถว + ความยาวที่ใช้ */
export function packFabric(input: FabricInput): FabricResult {
  const face = Number(input.faceWidthCm) || 0;
  const gap = Math.max(0, Number(input.gapCm) || 0);
  const waste = Math.max(0, Number(input.wastePercent) || 0);
  const rotate = !!input.allowRotate;

  // งานล็อตใหญ่ (เช่นผลิต 1,000 ใบ = หมื่นกว่าชิ้น): ไม่ต้องจำลองทุกชิ้น
  // เพราะการวางจะซ้ำรูปแบบเดิม → จำลอง "ตัวอย่าง" แล้วขยายผลตามสัดส่วน (เร็ว + ผลใกล้เคียง)
  const MAX_SIM_PIECES = 2000;
  const wantTotal = input.pieces.reduce((s, p) => s + Math.max(0, Math.floor(Number(p.qty) || 0)), 0);
  const simRatio = wantTotal > MAX_SIM_PIECES ? MAX_SIM_PIECES / wantTotal : 1;

  // กระจายเป็นชิ้นเดี่ยว ๆ (qty ชิ้น) + ตัดชิ้นที่ข้อมูลไม่ครบออก
  const flat: Piece[] = [];
  let realArea = 0;
  for (const p of input.pieces) {
    const w = Number(p.width_cm) || 0, h = Number(p.length_cm) || 0, n = Math.max(0, Math.floor(Number(p.qty) || 0));
    if (w <= 0 || h <= 0 || n === 0) continue;
    realArea += w * h * n;
    const simN = simRatio < 1 ? Math.max(1, Math.round(n * simRatio)) : n;   // ย่อสัดส่วน (อย่างน้อยชนิดละ 1)
    for (let i = 0; i < simN; i++) flat.push({ key: p.key, label: p.label, w, h, noRotate: !!p.noRotate });
  }
  // สัดส่วนจริงที่ย่อได้ (หลังปัดเศษ) → ใช้ขยายผลกลับ
  const simArea = flat.reduce((s, p) => s + p.w * p.h, 0);
  const scaleUp = simArea > 0 ? realArea / simArea : 1;
  const sampled = simRatio < 1;
  const pieceAreaCm2 = realArea;

  if (face <= 0) return emptyResult("ยังไม่รู้หน้ากว้างผ้า — ใส่หน้ากว้าง (ซม.) ก่อน", flat.length, pieceAreaCm2);
  if (flat.length === 0) return emptyResult("ไม่มีชิ้นที่ต้องตัด (ตรวจว่ากรอกกว้าง/ยาว/จำนวนชิ้นครบไหม)", 0, 0);

  // ชิ้นที่กว้างเกินหน้าผ้า → วางไม่ได้ (ลองหมุนก่อนถ้าอนุญาต)
  const oversize = flat.find((p) => Math.min(p.w, rotate && !p.noRotate ? p.h : p.w) > face);
  if (oversize) return emptyResult(`ชิ้น "${oversize.label}" (${oversize.w}×${oversize.h} ซม.) กว้างเกินหน้าผ้า ${face} ซม.`, flat.length, pieceAreaCm2);

  const sheetLen = Number(input.sheetLengthCm) || 0;
  const limitH = sheetLen > 0 ? sheetLen : Infinity;   // ผ้าผืน = สูงจำกัดต่อผืน · ผ้าม้วน = ไม่จำกัด

  // ── ลองหลายกลยุทธ์แล้วเก็บอันที่ใช้ผ้าน้อยที่สุด ─────────────────────────────
  // (ถูกมาก: 24 กลยุทธ์ที่ 2,000 ชิ้น ≈ 50ms — วัดจริงแล้วประหยัดผ้า 2-6%)
  const orients: OrientMode[] = rotate ? ["as-is", "landscape", "portrait"] : ["as-is"];
  const sorts: SortMode[] = ["longest", "area", "height", "width"];
  const scores: ScoreMode[] = ["low-y", "low-top-waste"];

  let best: { sheets: FabricItem[][]; leftover: Piece[]; len: number; label: string } | null = null;
  let tried = 0;
  for (const orient of orients) {
    const oriented = flat.map((p) => orientPiece(p, orient));
    for (const sortKey of sorts) {
      const queue = [...oriented].sort(SORTERS[sortKey]);
      for (const score of scores) {
        tried++;
        const sheets: FabricItem[][] = [];
        let remaining: Piece[] = queue;
        let guard = 0;
        while (remaining.length > 0 && guard++ < 500) {
          const { placed, leftover } = packSkyline(remaining, face, limitH, rotate, gap, score);
          if (placed.length === 0) break;          // วางไม่ลงเลย (กันลูปค้าง)
          sheets.push(placed);
          remaining = leftover;
        }
        // ยาวรวม: ผ้าผืน = จำนวนผืน (ตัดสินหลัก) + ความยาวที่ใช้ในผืนสุดท้าย (ตัดสินเสมอ) · ผ้าม้วน = ขอบล่างสุด
        const bottomLast = (sheets[sheets.length - 1] ?? []).reduce((m, i) => Math.max(m, i.y + i.h), 0);
        const len = sheetLen > 0
          ? sheets.length * sheetLen + bottomLast * 1e-6
          : (sheets[0] ?? []).reduce((m, i) => Math.max(m, i.y + i.h), 0);
        if (remaining.length > 0 && best && best.leftover.length === 0) continue;   // มีของวางไม่ลง = แพ้ตัวที่วางครบ
        if (!best || (best.leftover.length > 0 && remaining.length === 0) || len < best.len - 1e-9) {
          best = { sheets, leftover: remaining, len, label: `${orient}/${sortKey}/${score}` };
        }
      }
    }
  }
  const sheetsPlaced: FabricItem[][] = best?.sheets ?? [];
  const remaining: Piece[] = best?.leftover ?? flat;

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

  // ความยาวที่ใช้: ผ้าม้วน = ขอบล่างสุด · ผ้าผืน = รวมทุกผืน
  // งานล็อตใหญ่ที่ย่อจำลอง → ขยายผลกลับตามสัดส่วนพื้นที่จริง (scaleUp)
  const bottomOf = (items: FabricItem[]) => items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  const simUsedLength = sheetLen > 0
    ? sheetsPlaced.reduce((s, items) => s + bottomOf(items), 0)
    : bottomOf(sheetsPlaced[0] ?? []);
  const usedLengthCm = simUsedLength * scaleUp;
  const lengthWithWasteCm = usedLengthCm * (1 + waste / 100);
  const fabricAreaCm2 = lengthWithWasteCm * face;

  // "วางได้คุ้มแค่ไหน" = พื้นที่ชิ้น ÷ ผ้าที่การวางกินจริง (ยังไม่รวมเผื่อเสีย) — ตัวชี้วัดคุณภาพการวางล้วน ๆ
  const packAreaCm2 = usedLengthCm * face;
  const res: FabricResult = {
    ok: true,
    totalPieces: wantTotal,          // จำนวนชิ้นจริงที่ต้องตัด (ไม่ใช่จำนวนที่จำลอง)
    usedLengthCm,
    lengthWithWasteCm,
    yards: lengthWithWasteCm / YARD_CM,
    meters: lengthWithWasteCm / 100,
    rows,
    pieceAreaCm2,
    fabricAreaCm2,
    utilizationPercent: fabricAreaCm2 > 0 ? (pieceAreaCm2 / fabricAreaCm2) * 100 : 0,
    packEfficiencyPercent: packAreaCm2 > 0 ? (pieceAreaCm2 / packAreaCm2) * 100 : 0,
    strategy: best?.label,
    strategiesTried: tried,
    fitHints: fitHintsOf(input.pieces, face, rotate, gap),
    naiveYards: face > 0 ? (pieceAreaCm2 * (1 + waste / 100)) / face / YARD_CM : 0,
  };

  // ผ้าผืน: จำนวนผืน (ขยายกลับถ้าย่อจำลอง) + เผื่อเสีย
  if (sheetLen > 0) {
    const realSheets = sheetsPlaced.length * scaleUp;
    res.sheetsUsed = Math.max(sheetsPlaced.length, Math.ceil(realSheets));
    res.sheets = Math.ceil(realSheets * (1 + waste / 100));
    res.sheetsDrawn = sheetsPlaced.length;                    // จำนวนผืนที่มีผังจริงให้วาด
  }
  if (sampled) res.sampledFrom = { simulated: flat.length, total: wantTotal };
  // ชิ้นที่วางไม่ลงเลย (ปกติเกิดเฉพาะชิ้นใหญ่เกินผ้า ซึ่งดักไว้ก่อนแล้ว)
  if (remaining.length > 0) { res.ok = false; res.error = `วางไม่ลง ${remaining.length} ชิ้น — ลองเพิ่มหน้ากว้าง/ความยาวผืน`; }
  return res;
}

// ── กลยุทธ์การวาง (ลองทุกแบบแล้วเลือกที่ประหยัดผ้าที่สุด) ─────────────────
type Piece = { key: string; label: string; w: number; h: number; noRotate?: boolean };
type OrientMode = "as-is" | "landscape" | "portrait";
type SortMode = "longest" | "area" | "height" | "width";
type ScoreMode = "low-y" | "low-top-waste";

/** จัดท่าเริ่มต้นของชิ้น (หมุนได้เท่านั้น): นอน = ด้านยาวขวางหน้าผ้า · ตั้ง = ด้านยาวไปตามความยาวผ้า */
const orientPiece = (p: Piece, mode: OrientMode): Piece =>
  p.noRotate ? { ...p }
    : mode === "landscape" ? { ...p, w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }
    : mode === "portrait" ? { ...p, w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) }
      : { ...p };

const SORTERS: Record<SortMode, (a: Piece, b: Piece) => number> = {
  longest: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  area:    (a, b) => b.w * b.h - a.w * a.h,
  height:  (a, b) => b.h - a.h || b.w - a.w,
  width:   (a, b) => b.w - a.w || b.h - a.h,
};

// ── Skyline Bottom-Left ────────────────────────────────────────────────
// เก็บ "เส้นขอบบนของกองที่วางแล้ว" (skyline) แล้ววางชิ้นถัดไปที่ตำแหน่งต่ำที่สุดเท่าที่ลง
// ดีกว่าวางเป็นแถว (shelf) ตรงที่ใช้ช่องว่าง "ใต้ชิ้นเตี้ย" ได้ → เศษผ้าน้อยลงมาก
type SkyNode = { x: number; w: number; y: number };

function packSkyline(
  pieces: Piece[],
  face: number, limitH: number, rotate: boolean, gap: number, score: ScoreMode = "low-y",
): { placed: FabricItem[]; leftover: Piece[] } {
  let sky: SkyNode[] = [{ x: 0, w: face, y: 0 }];
  const placed: FabricItem[] = [];
  const leftover: typeof pieces = [];

  // หา y ต่ำสุดที่วางชิ้นกว้าง w ได้ โดยเริ่มที่ node i + วัด "เศษที่ถูกปิดตายใต้ชิ้น" (waste)
  const fit = (i: number, w: number): { y: number; waste: number } | null => {
    if (sky[i].x + w > face + 1e-9) return null;
    let y = sky[i].y, rest = w, j = i;
    while (rest > 1e-9 && j < sky.length) {
      y = Math.max(y, sky[j].y);
      rest -= sky[j].w; j++;
    }
    if (rest > 1e-9) return null;
    let waste = 0; rest = w; j = i;
    while (rest > 1e-9 && j < sky.length) {
      const seg = Math.min(sky[j].w, rest);
      waste += (y - sky[j].y) * seg;   // ช่องว่างใต้ชิ้นที่จะถูกปิด = เศษที่ใช้ต่อไม่ได้
      rest -= seg; j++;
    }
    return { y, waste };
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
    let best: { x: number; y: number; w: number; h: number; rot: boolean; top: number; waste: number } | null = null;
    for (let i = 0; i < sky.length; i++) {
      // ลองทั้ง 2 ท่า (ถ้าอนุญาตหมุน)
      const tries: [number, number, boolean][] = rotate && !p.noRotate
        ? [[p.w, p.h, false], [p.h, p.w, true]]
        : [[p.w, p.h, false]];
      for (const [w, h, rot] of tries) {
        // เผื่อรอยตัด (gap) เฉพาะเมื่อยังมีที่เหลือทางขวา — ชิ้นที่ชิดริมผ้าพอดีไม่ต้องกัน gap
        // (ของเดิมกัน gap เสมอ → ชิ้นที่กว้างพอดีริมผ้าวางไม่ลง เสียผ้าฟรี ~4%)
        const room = face - sky[i].x;
        const need = w + gap <= room + 1e-9 ? w + gap : w;
        const r = fit(i, need);
        if (!r || r.y + h > limitH + 1e-9) continue;
        const cand = { x: sky[i].x, y: r.y, w, h, rot, top: r.y + h, waste: r.waste };
        const better = !best ? true
          : score === "low-y"
            ? (cand.y < best.y - 1e-9 || (Math.abs(cand.y - best.y) < 1e-9 && cand.x < best.x))
            : (cand.top < best.top - 1e-9
              || (Math.abs(cand.top - best.top) < 1e-9 && cand.waste < best.waste - 1e-9)
              || (Math.abs(cand.top - best.top) < 1e-9 && Math.abs(cand.waste - best.waste) < 1e-9 && cand.x < best.x));
        if (better) best = cand;
      }
    }
    if (!best) { leftover.push(p); continue; }
    placed.push({ key: p.key, label: p.label, x: best.x, y: best.y, w: best.w, h: best.h, rotated: best.rot });
    addSkyline(best.x, Math.min(best.w + gap, face - best.x), best.y + best.h + gap);
  }
  return { placed, leftover };
}

/**
 * "ทำไมเหลือเศษ" — ชิ้นที่กินหน้าผ้าไม่ลงตัว: วางได้กี่ชิ้น/แถว และเหลือแถบกว้างเท่าไหร่
 * (ตอบคำถามที่เจอบ่อย: nesting ไม่ได้แย่ แต่ขนาดชิ้น × หน้ากว้างผ้า มันไม่ลงตัวเอง)
 */
function fitHintsOf(pieces: FabricPiece[], face: number, rotate: boolean, gap: number) {
  const out: NonNullable<FabricResult["fitHints"]> = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    const w0 = Number(p.width_cm) || 0, h0 = Number(p.length_cm) || 0, n = Math.max(0, Math.floor(Number(p.qty) || 0));
    if (w0 <= 0 || h0 <= 0 || n === 0) continue;
    // ด้านที่กินหน้ากว้าง: เลือกท่าที่วางได้ต่อแถวเยอะกว่า (ถ้าหมุนได้)
    const cand = rotate && !p.noRotate ? [w0, h0] : [w0];
    let bestW = w0, bestPerRow = 0;
    for (const w of cand) {
      if (w > face) continue;
      const perRow = Math.max(1, Math.floor((face + gap) / (w + gap)));
      if (perRow > bestPerRow) { bestPerRow = perRow; bestW = w; }
    }
    if (bestPerRow === 0) continue;
    const leftover = face - (bestPerRow * bestW + (bestPerRow - 1) * gap);
    if (leftover < Math.min(10, face * 0.08)) continue;              // เหลือน้อยแล้ว = ถือว่าลงตัว
    const key = `${bestW}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // ถ้าหน้าผ้ากว้างขึ้นอีกนิดจะวางได้เพิ่ม 1 ชิ้น → แนะนำหน้ากว้างนั้น
    const suggest = (bestPerRow + 1) * bestW + bestPerRow * gap;
    out.push({
      label: `${w0}×${h0} ซม.`, w: bestW, perRow: bestPerRow,
      leftoverCm: Math.round(leftover * 10) / 10,
      suggestFaceCm: suggest <= face * 1.6 ? Math.ceil(suggest) : null,   // แนะนำเฉพาะที่ไม่เพ้อฝัน
    });
  }
  return out.sort((a, b) => b.leftoverCm - a.leftoverCm).slice(0, 3);
}

function emptyResult(error: string, totalPieces: number, pieceAreaCm2: number): FabricResult {
  return { ok: false, error, totalPieces, usedLengthCm: 0, lengthWithWasteCm: 0, yards: 0, meters: 0, rows: [],
    pieceAreaCm2, fabricAreaCm2: 0, utilizationPercent: 0, packEfficiencyPercent: 0, naiveYards: 0 };
}

export const fmtCm = (v: number) => `${Math.round(v * 10) / 10} ซม.`;
export const fmtYard = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString("th-TH")} หลา`;
