/**
 * 👁️ ลายนิ้วมือ "หน้าตารูป" (ของกลาง) — จับรูปเดียวกันที่เป็น "คนละไฟล์"
 *    (เซฟใหม่ / ย่อคนละขนาด / บีบอัดคนละแบบ / รูปปก SKU จาก Odoo) ซึ่งลายนิ้วมือไฟล์ (sha256) จับไม่ได้
 *
 * วิธีคิด — ต้องได้ค่าเดียวกันทั้งเบราว์เซอร์และเซิร์ฟเวอร์:
 *   1) ย่อรูปให้ด้านยาวสุด LOOK_SIZE px วางบนพื้นขาว (เบราว์เซอร์ = lookHashOfBlob · เซิร์ฟเวอร์ = lib/image-hash-server)
 *   2) รูปทรง: เฉลี่ยพิกเซลเป็นช่อง แล้วดูว่าช่องซ้าย/ขวา และบน/ล่าง ช่องไหนสว่างกว่า = 128 บิต (dHash แนวนอน + แนวตั้ง)
 *      → ใช้คัดคร่าว ๆ ในฐานข้อมูล (RPC find_look_alike_assets)
 *   3) สี: ภาพจิ๋ว 16×16 ช่อง (RGB) — เทียบ "ช่องที่ต่างกันมากสุด" ทั้งแบบหยาบ (8×8) และละเอียด (16×16)
 *      จำเป็นมาก: รูปสินค้าที่ถ่ายแบบเดียวกันแต่คนละสี (ด้ายหลอดคนละเบอร์ / ซิปคนละสี) รูปทรงตรงกันเป๊ะ
 *   รูปทรงห่างไม่เกิน LOOK_MAX_BITS และสีต่างไม่เกิน LOOK_MAX_COARSE / LOOK_MAX_FINE = "หน้าตาเหมือนกัน" (isLookAlike)
 *   4) ก่อนถามผู้ใช้: เทียบรายละเอียดกับรูปเดิมจริงอีกชั้น (detailGridOfBlob · ตัวหนังสือ/ตัวเลขบนรูป) — ไม่ผ่าน = ไม่ถาม
 * รูปเรียบ (ขาวล้วน/สีเดียว) = null — เทียบไม่ได้ ไม่งั้นรูปว่างทุกรูปจะ "เหมือนกัน"
 *
 * เกณฑ์วัดจากคลังจริง 2026-11-01 (10,555 รูป): รูปเดียวกันที่ทำเป็นคนละไฟล์ (ย่อ/บีบอัด/webp/png) จับได้ ~96%
 *   รูปซ้ำจริงในคลังสีต่าง ≤ 2.4 · ด้าย/ซิปคนละเฉดที่ใกล้สุดต่าง ≥ 4 (แบบหยาบ) และ ≥ 12 (แบบละเอียด) → ไม่จับผิดสี
 *
 * เก็บในคลัง: assets.phash (hex 32 ตัว) + assets.phash_color (hex 1536 ตัว)
 * ไฟล์นี้ไม่มี import → ใช้ได้ทั้งฝั่งเบราว์เซอร์ เซิร์ฟเวอร์ และสคริปต์ node
 *
 * ต่างจาก lib/image-similarity (รุ่นเบา 64 บิต + สีเฉลี่ย 4×4 · เทียบในเบราว์เซอร์ล้วน ใช้ในเครื่องมือลงรูปทีละมาก "เตือนให้ดูด้วยตา"):
 *   ตัวนี้ค้นทั้งคลังจากฐานข้อมูล และ "เสนอใช้รูปเดิม" ได้ → ต้องแม่นกว่า (ด้ายคนละเฉดที่สีเฉลี่ย 4×4 แยกไม่ออก แยกได้ที่นี่)
 */

/** ขนาดรูปย่อก่อนคิดลายนิ้วมือ (ด้านยาวสุด) */
export const LOOK_SIZE = 256;
/** รูปทรงห่างกันได้ไม่เกินกี่บิต (จาก 128) */
export const LOOK_MAX_BITS = 10;
/** สีช่องที่ต่างมากสุด (0–255) — ตาราง 8×8 */
export const LOOK_MAX_COARSE = 6;
/** สีช่องที่ต่างมากสุด (0–255) — ตาราง 16×16 */
export const LOOK_MAX_FINE = 10;

export type LookHash = { phash: string; color: string };

/** ช่วงความต่างที่ถือว่า "เท่ากัน" — กันพื้นขาวที่บีบอัดต่างกันนิดเดียวทำให้บิตสลับไปมา */
const TIE = 1;
/** สว่างสุด−มืดสุดของช่องน้อยกว่านี้ = รูปเรียบ เทียบไม่ได้ */
const FLAT_RANGE = 8;
const COLOR_GRID = 16;

const span = (c: number, n: number, size: number): [number, number] => {
  const a = Math.floor((c * size) / n);
  return [a, Math.max(a + 1, Math.floor(((c + 1) * size) / n))];
};

/** เฉลี่ยค่าเป็นช่อง gx × gy (เรียงซ้าย→ขวา บน→ล่าง) */
function cellMeans(v: Float32Array, w: number, h: number, gx: number, gy: number): number[] {
  const out: number[] = [];
  for (let cy = 0; cy < gy; cy++) {
    const [y0, y1] = span(cy, gy, h);
    for (let cx = 0; cx < gx; cx++) {
      const [x0, x1] = span(cx, gx, w);
      let s = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += v[y * w + x];
      out.push(s / ((y1 - y0) * (x1 - x0)));
    }
  }
  return out;
}

const toHex = (bits: boolean[]): string => {
  let s = "";
  for (let i = 0; i < bits.length; i += 4) s += ((+bits[i] << 3) | (+bits[i + 1] << 2) | (+bits[i + 2] << 1) | +bits[i + 3]).toString(16);
  return s;
};

/** คิดลายนิ้วมือจากพิกเซล (RGB หรือ RGBA ที่วางบนพื้นขาวแล้ว · ย่อเหลือด้านยาว LOOK_SIZE แล้ว) */
export function lookHashFromPixels(px: ArrayLike<number>, width: number, height: number, channels: number): LookHash | null {
  const n = width * height;
  if (!n || channels < 3) return null;
  const gray = new Float32Array(n), r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    r[i] = px[p]; g[i] = px[p + 1]; b[i] = px[p + 2];
    gray[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
  }
  const gh = cellMeans(gray, width, height, 9, 8);
  if (Math.max(...gh) - Math.min(...gh) < FLAT_RANGE) return null;
  const gv = cellMeans(gray, width, height, 8, 9);
  const bits: boolean[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(gh[y * 9 + x] - gh[y * 9 + x + 1] > TIE);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(gv[y * 8 + x] - gv[(y + 1) * 8 + x] > TIE);
  const [cr, cg, cb] = [r, g, b].map((ch) => cellMeans(ch, width, height, COLOR_GRID, COLOR_GRID));
  let color = "";
  for (let i = 0; i < COLOR_GRID * COLOR_GRID; i++) for (const ch of [cr, cg, cb]) color += Math.round(ch[i]).toString(16).padStart(2, "0");
  return { phash: toHex(bits), color };
}

/** รูปทรงห่างกันกี่บิต (ยิ่งน้อยยิ่งเหมือน · 0 = เหมือนกันทุกช่อง) */
export function lookBitsApart(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

const bytesOf = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
};

/** สีต่างกันเท่าไร — ช่องที่ต่างมากสุด (0–255) แบบหยาบ 8×8 และละเอียด 16×16 · ข้อมูลผิดรูป = ต่างสุด */
export function lookColorGap(a: string, b: string): { coarse: number; fine: number } {
  const G = COLOR_GRID;
  if (a.length !== G * G * 6 || b.length !== a.length) return { coarse: 255, fine: 255 };
  const A = bytesOf(a), B = bytesOf(b);
  let fine = 0, coarse = 0;
  for (let i = 0; i < A.length; i++) fine = Math.max(fine, Math.abs(A[i] - B[i]));
  for (let y = 0; y < G; y += 2) for (let x = 0; x < G; x += 2) for (let c = 0; c < 3; c++) {
    const at = (yy: number, xx: number, arr: number[]) => arr[(yy * G + xx) * 3 + c];
    const avg = (arr: number[]) => (at(y, x, arr) + at(y, x + 1, arr) + at(y + 1, x, arr) + at(y + 1, x + 1, arr)) / 4;
    coarse = Math.max(coarse, Math.abs(avg(A) - avg(B)));
  }
  return { coarse, fine };
}

export function isLookAlike(a: LookHash, b: LookHash): boolean {
  if (lookBitsApart(a.phash, b.phash) > LOOK_MAX_BITS) return false;
  const gap = lookColorGap(a.color, b.color);
  return gap.coarse <= LOOK_MAX_COARSE && gap.fine <= LOOK_MAX_FINE;
}

/** (เบราว์เซอร์) วาดรูปลงพื้นขาวตามขนาดที่ขอ → พิกเซล RGBA + ขนาดรูปจริง */
async function pixelsOnWhite(blob: Blob, sizeOf: (w: number, h: number) => [number, number]) {
  const bmp = await createImageBitmap(blob);
  try {
    const [w, h] = sizeOf(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h, srcWidth: bmp.width, srcHeight: bmp.height };
  } finally {
    bmp.close();
  }
}

/** (เบราว์เซอร์) คิดลายนิ้วมือของไฟล์รูป + ขนาดรูป — อ่านไม่ได้/รูปเรียบ = null */
export async function lookHashOfBlob(blob: Blob): Promise<(LookHash & { width: number; height: number }) | null> {
  try {
    const px = await pixelsOnWhite(blob, (bw, bh) => {
      const s = Math.min(1, LOOK_SIZE / Math.max(bw, bh));
      return [Math.max(1, Math.round(bw * s)), Math.max(1, Math.round(bh * s))];
    });
    const look = px && lookHashFromPixels(px.data, px.w, px.h, 4);
    return look && px ? { ...look, width: px.srcWidth, height: px.srcHeight } : null;
  } catch {
    return null;
  }
}

/* ───────── ขั้นสุดท้าย: เทียบรายละเอียดกับรูปเดิมจริง (ตอนเปิดป๊อปเท่านั้น · ไม่เก็บในคลัง) ─────────
 * รูปทรง+สีจับ "แม่แบบรูปเดียวกัน" ได้ แต่มองไม่เห็นตัวหนังสือเล็ก ๆ — เช่นรูปห่วงคนละขนาดที่ใช้รูปเดียวกัน ต่างกันแค่ตัวเลข "31 มม." / "15 มม."
 * → ย่อทั้งสองรูปเหลือ 240px แล้วเทียบตารางเทา 48×48 ช่อง หาช่องที่ต่างมากสุด
 * วัดในเบราว์เซอร์ (2026-11-01 · รูปใหม่ = ย่อ 2000 jpeg 0.85 แบบที่อัปจริง · รูปเดิม = proxy ?w=960&q=90):
 *   รูปเดียวกันคนละไฟล์ 2–10 · ผิวหนังลายละเอียด ~14 · ห่วงคนละขนาด (ต่างแค่ตัวเลข) 18–59 · ด้ายคนละเบอร์ 45–71
 *   ขอบใกล้กัน จึงแบ่ง 3 ระดับ: ≤ DETAIL_SURE = เหมือนชัด (ตั้งต้น "ใช้รูปเดิม")
 *   ≤ DETAIL_MAX = ก้ำกึ่ง (ถาม แต่ตั้งต้น "อัปใหม่" + เตือนให้ตรวจ) · เกิน = ไม่ถาม */
export const DETAIL_GRID = 48;
export const DETAIL_SURE = 10;
export const DETAIL_MAX = 15;
const DETAIL_CELL = 5;

/** (เบราว์เซอร์) ตารางเทา 48×48 ของรูป — อ่านไม่ได้ = null */
export async function detailGridOfBlob(blob: Blob): Promise<Float32Array | null> {
  try {
    const S = DETAIL_GRID * DETAIL_CELL;
    const px = await pixelsOnWhite(blob, () => [S, S]);
    if (!px) return null;
    const out = new Float32Array(DETAIL_GRID * DETAIL_GRID);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = (y * S + x) * 4;
      out[Math.floor(y / DETAIL_CELL) * DETAIL_GRID + Math.floor(x / DETAIL_CELL)] += 0.299 * px.data[p] + 0.587 * px.data[p + 1] + 0.114 * px.data[p + 2];
    }
    for (let i = 0; i < out.length; i++) out[i] /= DETAIL_CELL * DETAIL_CELL;
    return out;
  } catch {
    return null;
  }
}

/** ช่องที่ต่างกันมากสุด (0–255) — เกิน DETAIL_MAX = รายละเอียดต่างกัน (คนละรูป) */
export function detailGap(a: Float32Array, b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}
