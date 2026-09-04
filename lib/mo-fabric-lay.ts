/**
 * "วางผ้าให้คุ้มที่สุด" ระดับใบสั่งผลิต (ของกลาง)
 *
 * เจ้าของสั่ง (2026-09-04): ผ้าที่คิดจากสูตรเดิม (พื้นที่ + เผื่อเสีย 15%) เหลือเยอะตอนตัดจริง
 * → ให้คิดจาก "จำนวนที่สั่งจริง" โดยจำลองวางชิ้นบนหน้าผ้า (ทุกบล็อกของผ้าตัวเดียวกันวางรวมกัน
 *   ชิ้นเล็กยัดลงช่องว่างของชิ้นใหญ่) และ **ไม่บวกเผื่อเสีย**
 *
 * ตัววางจริงคือ packFabric (lib/fabric-calc — ตัวเดียวกับเครื่องคิดเลขผ้า/ใบงานออกแบบ)
 * ไฟล์นี้แค่ห่อให้เข้ากับ "บรรทัดวัตถุดิบของใบสั่งผลิต":
 *   - รับบล็อก (กว้าง×ยาว×จำนวนชิ้นรวม + ห้ามหมุนไหม) ของผ้า 1 ตัว
 *   - คืนปริมาณรวมในหน่วยสั่งซื้อ (ผ้าม้วน = ซม. ÷ ตัวหาร[90=หลา] · ผ้าผืน = จำนวนผืน)
 *   - แบ่งปริมาณกลับให้แต่ละบล็อกตามสัดส่วนพื้นที่ (ให้ตาราง "รายละเอียด (บล็อก)" ยังมีตัวเลขต่อบรรทัด)
 *   - สร้างข้อความ "วิธีวาง" ให้ช่างอ่านรู้เรื่อง
 */
import { packFabric, type FabricPiece, type FabricResult } from "./fabric-calc";

/** ผังการวาง 1 กลุ่ม (ผ้าตัวเดียวกัน หน้ากว้างเดียวกัน) — เก็บลง mo_material_summary.lay_layout ไว้เปิดดูในใบสั่งผลิต */
export type LayLayout = {
  face_width_cm: number;
  sheet_length_cm: number | null;   // ผ้าผืน = ความยาวต่อผืน · null = ผ้าม้วน
  note: string;
  blocks: { key: string; label: string; width_cm: number; length_cm: number; total_pieces: number; no_rotate: boolean }[];
  result: FabricResult;
};

export type LayBlock = {
  key: string;
  label: string;
  width_cm: number;
  length_cm: number;
  total_pieces: number;     // ชิ้นต่อชุด × จำนวนที่สั่ง
  no_rotate?: boolean;      // ห้ามหมุนชิ้น (ผ้าลาย/ตามเกรน)
};

export type LayInput = {
  blocks: LayBlock[];
  face_width_cm: number;
  sheet_length_cm?: number | null;   // ผ้าผืน: ความยาวต่อผืน (ไม่ใส่ = ผ้าม้วน)
  divisor?: number | null;           // ตัวหารแปลง ซม. → หน่วยสั่งซื้อ (90 = หลา ตามกฎกลุ่มวัตถุดิบ)
  gap_cm?: number;                   // ระยะเว้นรอยตัด (ค่าเริ่มต้น 0 — เจ้าของสั่งไม่คิดสูญเสีย)
  unit?: string | null;              // หน่วยสั่งซื้อไว้พิมพ์ในข้อความ เช่น "หลา"
};

export type LayResult = {
  ok: boolean;
  error?: string;
  length_cm: number;          // ความยาวผ้าที่ใช้จริงรวม (ผ้าผืน = รวมทุกผืน)
  qty: number;                // ปริมาณต้องใช้ในหน่วยสั่งซื้อ
  sheets?: number;            // ผ้าผืน: กี่ผืน
  efficiency_pct: number;     // วางได้คุ้มกี่ % (พื้นที่ชิ้น ÷ ผ้าที่ใช้)
  total_pieces: number;
  note: string;               // สรุปสำหรับแถวรวมต่อวัตถุดิบ
  per_block: Record<string, { qty: number; share_pct: number; rotated_pct: number; note: string }>;
  layout?: FabricResult;      // ผังที่จำลอง (ไว้วาดภาพ)
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function layFabric(i: LayInput): LayResult {
  const face = Number(i.face_width_cm) || 0;
  const divisor = Number(i.divisor) || 90;
  const sheetLen = Number(i.sheet_length_cm) || 0;
  const blocks = i.blocks.filter((b) => b.width_cm > 0 && b.length_cm > 0 && b.total_pieces > 0);
  const totalArea = blocks.reduce((s, b) => s + b.width_cm * b.length_cm * b.total_pieces, 0);
  const totalPieces = blocks.reduce((s, b) => s + b.total_pieces, 0);

  const pieces: FabricPiece[] = blocks.map((b) => ({
    key: b.key, label: b.label, width_cm: b.width_cm, length_cm: b.length_cm,
    qty: Math.max(0, Math.floor(b.total_pieces)), noRotate: !!b.no_rotate,
  }));
  // อนุญาตหมุนโดยรวม ถ้ามีบล็อกไหนหมุนได้ (บล็อกที่ห้ามหมุนถูกล็อกเป็นรายชิ้นใน packFabric)
  const allowRotate = blocks.some((b) => !b.no_rotate);
  const r = packFabric({
    pieces, faceWidthCm: face, allowRotate, wastePercent: 0, gapCm: Math.max(0, Number(i.gap_cm) || 0),
    sheetLengthCm: sheetLen > 0 ? sheetLen : null,
  });

  if (!r.ok || totalArea <= 0) {
    return { ok: false, error: r.error || "ไม่มีชิ้นที่วางได้", length_cm: 0, qty: 0, efficiency_pct: 0, total_pieces: totalPieces, note: "", per_block: {} };
  }

  const isSheet = sheetLen > 0;
  const qty = isSheet ? (r.sheetsUsed ?? 0) : r4(r.usedLengthCm / divisor);
  const eff = r1(r.packEfficiencyPercent);

  // นับว่าบล็อกไหนถูกหมุนกี่ % (จากผังที่จำลอง)
  // เทียบจากขนาดจริงของชิ้นในผัง ไม่ใช่ธง rotated — เพราะ packFabric อาจ "จัดท่าเริ่มต้น" (portrait/landscape)
  // ให้ทั้งชุดก่อนวาง ซึ่งหมุนชิ้นแล้วแต่ธงยังเป็น false
  const dimOf = new Map(blocks.map((b) => [b.key, b] as const));
  const rotCount = new Map<string, { n: number; rot: number }>();
  for (const row of r.rows) for (const it of row.items) {
    const b = dimOf.get(it.key); if (!b) continue;
    const c = rotCount.get(it.key) ?? { n: 0, rot: 0 };
    c.n++;
    const turned = Math.abs(it.w - b.length_cm) < 1e-6 && Math.abs(it.h - b.width_cm) < 1e-6 && Math.abs(b.width_cm - b.length_cm) > 1e-6;
    if (turned) c.rot++;
    rotCount.set(it.key, c);
  }

  const per_block: LayResult["per_block"] = {};
  for (const b of blocks) {
    const share = (b.width_cm * b.length_cm * b.total_pieces) / totalArea;
    const c = rotCount.get(b.key);
    const rotPct = c && c.n > 0 ? r0((c.rot / c.n) * 100) : 0;
    // ชิ้นต่อแถวตามท่าที่ใช้จริงส่วนใหญ่ (ให้ช่างเห็นภาพ)
    const across = Math.max(1, Math.floor(face / (rotPct >= 50 ? b.length_cm : b.width_cm)));
    per_block[b.key] = {
      qty: r4(qty * share), share_pct: r1(share * 100), rotated_pct: rotPct,
      note: `${rotPct >= 50 ? "หมุนชิ้น" : "วางตรง"} · ~${across} ชิ้น/แถว · ${r1(share * 100)}% ของผ้ารวม`,
    };
  }

  const unitTxt = isSheet ? `${qty} ผืน` : `${r2(qty)} ${i.unit || ""}`.trim();
  const sampled = r.sampledFrom ? " · ประมาณจากตัวอย่าง" : "";
  const note = blocks.length > 1
    ? `วางรวม ${totalPieces} ชิ้น (${blocks.length} บล็อก) บนหน้าผ้า ${face} ซม. → ยาว ${r0(r.usedLengthCm)} ซม. = ${unitTxt} · คุ้ม ${eff}%${sampled}`
    : `วาง ${totalPieces} ชิ้น บนหน้าผ้า ${face} ซม. → ยาว ${r0(r.usedLengthCm)} ซม. = ${unitTxt} · คุ้ม ${eff}%${sampled}`;

  return {
    ok: true, length_cm: r4(r.usedLengthCm), qty, sheets: isSheet ? qty : undefined,
    efficiency_pct: eff, total_pieces: totalPieces, note, per_block, layout: r,
  };
}
