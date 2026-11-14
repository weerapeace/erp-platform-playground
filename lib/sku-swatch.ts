/**
 * 🎨 Swatch (แผงผ้า) — สูตรกลางที่ใช้ร่วมกันทั้งหน้าจอและ API (pure · ไม่มี "use client" เพราะ API import)
 *
 * - รหัสชิ้น = รหัสแผ่น + "-" + เลขชิ้น 2 หลัก (SW-0002-07) · เลขชิ้นนับจาก sku_swatches.next_chip_no (ออกแล้วไม่ใช้ซ้ำ)
 * - กรอบทุกอันเป็น % ของรูป (0–100) เหมือน ImageRegions
 * - ครอป/หมุนรูปที่มีชิ้นอยู่แล้ว → เลื่อนกรอบตามด้วย remapToCrop / rotateRect90
 * - แบ่งกรอบเป็นหลายชิ้นเท่า ๆ กัน (ทางสำรองเมื่อ AI ชี้ตำแหน่งไม่ตรง) = splitRect
 * - อ่านผล AI "อ่านจากรูป" ให้ปลอดภัย = normalizeAiChips
 */

export type PctRect = { x: number; y: number; w: number; h: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** รหัสชิ้นจากรหัสแผ่น + เลขชิ้น — 1 → "-01" · 120 → "-120" */
export function chipCode(boardCode: string, no: number): string {
  return `${boardCode}-${String(Math.max(1, Math.floor(no))).padStart(2, "0")}`;
}

/** รหัสแผ่นที่ผู้ใช้พิมพ์เอง: A-Z 0-9 - _ ยาว 2–20 · คืน null = ใช้ไม่ได้ */
export function cleanBoardCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "-");
  return /^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(s) ? s : null;
}

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** เรียงแบบอ่านหนังสือ: แถวบน → ล่าง แล้วซ้าย → ขวา (แถวเดียวกัน = จุดกลางสูงต่างกันไม่เกินครึ่งความสูงชิ้น) */
export function sortReadingOrder<T extends PctRect>(items: T[]): T[] {
  const list = [...items].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: T[][] = [];
  for (const it of list) {
    const cy = it.y + it.h / 2;
    const row = rows[rows.length - 1];
    if (row) {
      const ref = row.reduce((s, r) => s + r.y + r.h / 2, 0) / row.length;
      const tol = Math.max(1, (row.reduce((s, r) => s + r.h, 0) / row.length) / 2);
      if (Math.abs(cy - ref) <= tol) { row.push(it); continue; }
    }
    rows.push([it]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** ครอปรูปแล้ว: กรอบเดิม (% ของรูปเดิม) → % ของรูปที่ครอป · ชิ้นที่จุดกลางหลุดกรอบครอป = ถูกตัด (คืนใน dropped) */
export function remapToCrop<T extends PctRect>(items: T[], crop: PctRect): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  if (crop.w <= 0 || crop.h <= 0) return { kept: [], dropped: [...items] };
  for (const it of items) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    if (cx < crop.x || cx > crop.x + crop.w || cy < crop.y || cy > crop.y + crop.h) { dropped.push(it); continue; }
    const x1 = clamp(((it.x - crop.x) / crop.w) * 100, 0, 100);
    const y1 = clamp(((it.y - crop.y) / crop.h) * 100, 0, 100);
    const x2 = clamp(((it.x + it.w - crop.x) / crop.w) * 100, 0, 100);
    const y2 = clamp(((it.y + it.h - crop.y) / crop.h) * 100, 0, 100);
    kept.push({ ...it, x: r2(x1), y: r2(y1), w: r2(Math.max(0.5, x2 - x1)), h: r2(Math.max(0.5, y2 - y1)) });
  }
  return { kept, dropped };
}

/** หมุนรูป 90° — ตามเข็ม (cw) / ทวนเข็ม (ccw) · กรอบหมุนตามรูป */
export function rotateRect90<T extends PctRect>(it: T, dir: "cw" | "ccw" = "cw"): T {
  return dir === "cw"
    ? { ...it, x: r2(100 - it.y - it.h), y: r2(it.x), w: it.h, h: it.w }
    : { ...it, x: r2(it.y), y: r2(100 - it.x - it.w), w: it.h, h: it.w };
}

/** แบ่งกรอบเป็น cols × rows ชิ้นเท่า ๆ กัน (gapPct = ช่องว่างระหว่างชิ้นเป็น % ของขนาดช่อง) · เรียงแบบอ่านหนังสือ */
export function splitRect(rect: PctRect, cols: number, rows: number, gapPct = 12): PctRect[] {
  const c = clamp(Math.floor(cols) || 1, 1, 200), rw = clamp(Math.floor(rows) || 1, 1, 50);
  const cw = rect.w / c, ch = rect.h / rw;
  const gx = (cw * clamp(gapPct, 0, 60)) / 100, gy = (ch * clamp(gapPct, 0, 60)) / 100;
  const out: PctRect[] = [];
  for (let j = 0; j < rw; j++) {
    for (let i = 0; i < c; i++) {
      out.push({ x: r2(rect.x + i * cw + gx / 2), y: r2(rect.y + j * ch + gy / 2), w: r2(Math.max(0.5, cw - gx)), h: r2(Math.max(0.5, ch - gy)) });
    }
  }
  return out;
}

/** สีเฉลี่ยแบบตัดค่าสุดโต่ง (เงา/แสงสะท้อน) จากพิกเซล RGBA → "#rrggbb" · ไม่มีพิกเซล = null */
export function averageHex(rgba: ArrayLike<number>, trim = 0.15): string | null {
  const px: { r: number; g: number; b: number; l: number }[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    px.push({ r, g, b, l: 0.299 * r + 0.587 * g + 0.114 * b });
  }
  if (!px.length) return null;
  px.sort((a, b) => a.l - b.l);
  const cut = Math.floor(px.length * clamp(trim, 0, 0.45));
  const mid = px.slice(cut, px.length - cut);
  const use = mid.length ? mid : px;
  const avg = (k: "r" | "g" | "b") => Math.round(use.reduce((s, p) => s + p[k], 0) / use.length);
  return `#${[avg("r"), avg("g"), avg("b")].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** ความทับซ้อนของ 2 กรอบ (0–1) — ใช้ตัดกรอบซ้ำที่ AI ส่งมา */
export function overlapRatio(a: PctRect, b: PctRect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small > 0 ? inter / small : 0;
}

// ───────────────────────────── อ่านจากรูป (AI) ─────────────────────────────

export type AiChip = PctRect & { name: string | null; label: string | null; unsure: boolean };
export type AiSwatchRead = { header: string | null; chips: AiChip[] };

export const SWATCH_READ_SYSTEM = [
  "You look at ONE photo of a fabric / leather / thread / trim swatch card (a sample board with many small colour chips).",
  "Find every individual colour chip (each separate sample piece). Ignore logos, text blocks, rulers, hands, and the table background.",
  "For each chip return its bounding box as PERCENT of the whole image: x = left edge, y = top edge, w = width, h = height (0-100, 2 decimals).",
  "Also return: label = the number/code printed on or right next to that chip exactly as printed (\"\" if none);",
  "name = a short Thai colour name (เช่น กรมท่า, แดงเลือดหมู, ครีม, เทาเข้ม);",
  "unsure = true when the chip edge is hard to see, the chip touches a similar colour, or you are not sure it is a separate chip.",
  "header = brand / series / title text printed on the card (\"\" if none).",
  "List chips in reading order: top row first, left to right. Do not invent chips. Max 200 chips.",
  "Reply JSON only: {\"header\": string, \"chips\": [{\"x\": number, \"y\": number, \"w\": number, \"h\": number, \"label\": string, \"name\": string, \"unsure\": boolean}]}",
].join("\n");
export const SWATCH_READ_ASK = "อ่านแผงตัวอย่างในรูปนี้ แล้วตอบ JSON ตามโครงที่กำหนด";

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** แปลงคำตอบ AI → ชิ้นที่ใช้ได้: รองรับกรอบแบบ % (x,y,w,h) และแบบ box [x1,y1,x2,y2] (สเกล 0–1 / 0–100 / 0–1000) · ตัดกรอบเล็ก/ล้น/ซ้ำ */
export function normalizeAiChips(raw: unknown): AiSwatchRead {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.chips) ? obj.chips : Array.isArray(raw) ? raw : [];
  const rects: (AiChip & { scale?: number })[] = [];
  let maxVal = 0;
  const parsed = list.slice(0, 300).map((c) => {
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    let x = Number(o.x), y = Number(o.y), w = Number(o.w ?? o.width), h = Number(o.h ?? o.height);
    if (Array.isArray(o.box) && o.box.length === 4) {
      const [x1, y1, x2, y2] = o.box.map(Number);
      x = Math.min(x1, x2); y = Math.min(y1, y2); w = Math.abs(x2 - x1); h = Math.abs(y2 - y1);
    }
    if (![x, y, w, h].every(Number.isFinite)) return null;
    maxVal = Math.max(maxVal, x + w, y + h);
    return { x, y, w, h, name: str(o.name, 40), label: str(o.label, 30), unsure: o.unsure === true || o.confidence === "low" };
  }).filter((v): v is AiChip => !!v);
  // สเกล: ทุกค่า ≤ 1.5 = สัดส่วน 0–1 · > 100 = 0–1000 · อื่น ๆ = %
  const k = maxVal <= 1.5 ? 100 : maxVal > 101 ? 0.1 : 1;
  for (const c of parsed) {
    let x = c.x * k, y = c.y * k, w = c.w * k, h = c.h * k;
    x = clamp(x, 0, 100); y = clamp(y, 0, 100);
    w = Math.min(w, 100 - x); h = Math.min(h, 100 - y);
    if (w < 0.4 || h < 0.4) continue;                 // เล็กเกิน = น่าจะเป็นจุด/ตัวอักษร
    if (w > 90 && h > 90) continue;                   // ทั้งรูป = ไม่ใช่ชิ้น
    const rect = { ...c, x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
    if (rects.some((r) => overlapRatio(r, rect) > 0.6)) continue;   // ซ้ำกับชิ้นที่มีแล้ว
    rects.push(rect);
  }
  return { header: str(obj.header, 120), chips: sortReadingOrder(rects).slice(0, 200) };
}
