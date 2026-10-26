/**
 * ความคล้ายของ "ชื่อ" แบบเทียบคู่ตัวอักษร (bigram) — ของกลาง · pure
 *
 * ตัดช่องว่าง/เครื่องหมาย + วรรณยุกต์ไทย แล้วเทียบคู่ตัวอักษร (ใช้ได้กับไทย/จีนที่ไม่มีเว้นวรรค)
 * ตัดวรรณยุกต์เพราะสะกดต่างกันบ่อย เช่น "ไนลอน" (AI แปล) กับ "ไนล่อน" (ชื่อใน PO)
 * ใช้: จับคู่ชื่อสินค้าในใบสั่งซื้อ (order-capture) · เดาคู่สินค้าบนร้าน ↔ สินค้าในระบบ (platform-match-suggest)
 */

export type Bigrams = Map<string, number>;

export function bigramCounts(s: string): Bigrams {
  const t = s.toLowerCase().replace(/[็-๎]/g, "").replace(/[\s\[\]().,#*×x\-_/:;'"【】]+/g, "");
  const m: Bigrams = new Map();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
  return m;
}

/** เหมือน nameSimilarity แต่รับคู่ตัวอักษรที่คำนวณไว้แล้ว — ใช้ตอนเทียบทีละมาก ๆ (ไม่ต้องคำนวณซ้ำทุกคู่) */
export function bigramSimilarity(A: Bigrams, B: Bigrams): number {
  let sa = 0, sb = 0, inter = 0;
  A.forEach((v) => { sa += v; });
  B.forEach((v) => { sb += v; });
  if (!sa || !sb) return 0;
  A.forEach((v, g) => { inter += Math.min(v, B.get(g) ?? 0); });
  const dice = (2 * inter) / (sa + sb);
  const short = Math.min(sa, sb);
  return short >= 6 ? Math.max(dice, 0.85 * (inter / short)) : dice;
}

/**
 * ความใกล้เคียงของชื่อ 0..1 — เอาค่ามากกว่าระหว่าง
 *   Dice (ทั้งสองชื่อคล้ายกันทั้งก้อน) กับ overlap (ชื่อสั้นอยู่ในข้อความยาว — เช่น ชื่อ+ตัวเลือก+คำแปล)
 * overlap ใช้เฉพาะเมื่อชื่อที่สั้นกว่ายาวพอ (≥ 6 คู่ตัวอักษร) กันคำสั้น ๆ อย่าง "เทป" ไปตรงกับทุกอย่าง
 */
export function nameSimilarity(a: string, b: string): number {
  return bigramSimilarity(bigramCounts(a), bigramCounts(b));
}
