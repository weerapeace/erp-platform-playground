/**
 * 🧵 ไฟล์ปัก — เขียนไฟล์ .PES (Brother) เวอร์ชัน 1 (#PES0001 + ส่วน PEC ที่เครื่องอ่าน)
 *
 *   แปลงทีละบรรทัดจาก pyembroidery (PesWriter.write_version_1 + PecWriter + PecGraphics + EmbThreadPec + EmbThread)
 *   https://github.com/EmbroidePy/pyembroidery — MIT License, Copyright (c) 2018 Tatarize
 *   (Permission is hereby granted, free of charge, to any person obtaining a copy of this software … to deal in the Software
 *    without restriction … The above copyright notice and this permission notice shall be included in all copies.)
 *
 *   หน่วย 0.1 มม. แกน y ชี้ลง (เหมือน pyembroidery) · ตัดด้ายใน PEC = กระโดดแบบ "trim" (ไม่มีคำสั่งตัดแยก)
 *   ใช้กับแผนจาก buildPlan (lib/embroidery) — สีด้ายเลือกจากชุดสี Brother 64 สีที่ใกล้ที่สุด
 */
import type { Cmd, EmbPlan } from "@/lib/embroidery";

type Thread = { r: number; g: number; b: number; name: string };
const T = (r: number, g: number, b: number, name: string): Thread => ({ r, g, b, name });
/** ชุดสี Brother (ลำดับ = รหัสสี 1-64 · ช่อง 0 ว่าง) */
export const PEC_THREADS: (Thread | null)[] = [null,
  T(14, 31, 124, "Prussian Blue"), T(10, 85, 163, "Blue"), T(0, 135, 119, "Teal Green"), T(75, 107, 175, "Cornflower Blue"), T(237, 23, 31, "Red"),
  T(209, 92, 0, "Reddish Brown"), T(145, 54, 151, "Magenta"), T(228, 154, 203, "Light Lilac"), T(145, 95, 172, "Lilac"), T(158, 214, 125, "Mint Green"),
  T(232, 169, 0, "Deep Gold"), T(254, 186, 53, "Orange"), T(255, 255, 0, "Yellow"), T(112, 188, 31, "Lime Green"), T(186, 152, 0, "Brass"),
  T(168, 168, 168, "Silver"), T(125, 111, 0, "Russet Brown"), T(255, 255, 179, "Cream Brown"), T(79, 85, 86, "Pewter"), T(0, 0, 0, "Black"),
  T(11, 61, 145, "Ultramarine"), T(119, 1, 118, "Royal Purple"), T(41, 49, 51, "Dark Gray"), T(42, 19, 1, "Dark Brown"), T(246, 74, 138, "Deep Rose"),
  T(178, 118, 36, "Light Brown"), T(252, 187, 197, "Salmon Pink"), T(254, 55, 15, "Vermilion"), T(240, 240, 240, "White"), T(106, 28, 138, "Violet"),
  T(168, 221, 196, "Seacrest"), T(37, 132, 187, "Sky Blue"), T(254, 179, 67, "Pumpkin"), T(255, 243, 107, "Cream Yellow"), T(208, 166, 96, "Khaki"),
  T(209, 84, 0, "Clay Brown"), T(102, 186, 73, "Leaf Green"), T(19, 74, 70, "Peacock Blue"), T(135, 135, 135, "Gray"), T(216, 204, 198, "Warm Gray"),
  T(67, 86, 7, "Dark Olive"), T(253, 217, 222, "Flesh Pink"), T(249, 147, 188, "Pink"), T(0, 56, 34, "Deep Green"), T(178, 175, 212, "Lavender"),
  T(104, 106, 176, "Wisteria Violet"), T(239, 227, 185, "Beige"), T(247, 56, 102, "Carmine"), T(181, 75, 100, "Amber Red"), T(19, 43, 26, "Olive Green"),
  T(199, 1, 86, "Dark Fuchsia"), T(254, 158, 50, "Tangerine"), T(168, 222, 235, "Light Blue"), T(0, 103, 62, "Emerald Green"), T(78, 41, 144, "Purple"),
  T(47, 126, 32, "Moss Green"), T(255, 204, 204, "Flesh Pink"), T(255, 217, 17, "Harvest Gold"), T(9, 91, 166, "Electric Blue"), T(240, 249, 112, "Lemon Yellow"),
  T(227, 243, 91, "Fresh Green"), T(255, 153, 0, "Orange"), T(255, 240, 141, "Cream Yellow"), T(255, 200, 200, "Applique"),
];

/** ปัดเศษแบบ Python (ครึ่งไปเลขคู่) */
const roundHalfEven = (v: number) => { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1; };
const hexRgb = (hex: string) => { const n = parseInt(hex.replace("#", ""), 16) || 0; return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };
function redMean(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const rm = roundHalfEven((r1 + r2) / 2), r = r1 - r2, g = g1 - g2, b = b1 - b2;
  return (((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * b * b) >> 8);
}
/** ช่องในชุดสีที่ใกล้สีนี้ที่สุด (เสมอกัน = ช่องหลังชนะ เหมือนต้นฉบับ) */
export function nearestPec(hex: string, values: (Thread | null)[] = PEC_THREADS): number | null {
  const c = hexRgb(hex);
  let best: number | null = null, bd = Infinity;
  values.forEach((t, i) => {
    if (!t) return;
    const d = redMean(c.r, c.g, c.b, t.r, t.g, t.b);
    if (d <= bd) { bd = d; best = i; }
  });
  return best;
}
/** build_unique_palette: สีไม่ซ้ำแต่ละสีจองช่องที่ใกล้สุดที่ยังว่าง แล้วแปลงรายการสีเป็นเลขช่อง */
function uniquePalette(threads: string[]): number[] {
  const palette = [...PEC_THREADS];
  const chart: (Thread | null)[] = palette.map(() => null);
  for (const hex of [...new Set(threads)]) {
    const i = nearestPec(hex, palette);
    if (i == null) break;
    palette[i] = null;
    const c = hexRgb(hex);
    chart[i] = { ...c, name: hex };
  }
  return threads.map((hex) => nearestPec(hex, chart) ?? 0);
}

class Bytes {
  buf: number[] = [];
  get pos() { return this.buf.length; }
  u8(v: number) { this.buf.push(v & 0xff); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  u24(v: number) { this.u8(v); this.u8(v >> 8); this.u8(v >> 16); }
  u32(v: number) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); }
  f32(v: number) { const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, v, true); for (let i = 0; i < 4; i++) this.u8(dv.getUint8(i)); }
  str(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  raw(a: number[]) { for (const v of a) this.u8(v); }
  set16(at: number, v: number) { this.buf[at] = v & 0xff; this.buf[at + 1] = (v >> 8) & 0xff; }
  set24(at: number, v: number) { this.buf[at] = v & 0xff; this.buf[at + 1] = (v >> 8) & 0xff; this.buf[at + 2] = (v >> 16) & 0xff; }
  set32(at: number, v: number) { this.set16(at, v & 0xffff); this.set16(at + 2, (v >>> 16) & 0xffff); }
}

// คำสั่งแบบ pyembroidery (หน่วย 0.1 มม. จำนวนเต็ม)
const STITCH = 0, JUMP = 1, TRIM = 2, COLOR_CHANGE = 5, END = 4;
type St = [number, number, number];

/** แผน → รายการฝีแบบ pyembroidery */
export function planStitches(cmds: Cmd[]): St[] {
  const out: St[] = [];
  for (const c of cmds) {
    const x = Math.round(c.x * 10), y = Math.round(c.y * 10);
    const k = c.t === "stitch" ? STITCH : c.t === "jump" ? JUMP : c.t === "trim" ? TRIM : c.t === "color" ? COLOR_CHANGE : END;
    out.push([x, y, k]);
  }
  if (!out.length || out[out.length - 1][2] !== END) out.push([out.at(-1)?.[0] ?? 0, out.at(-1)?.[1] ?? 0, END]);
  return out;
}
function bounds(s: St[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}
function* commandBlocks(s: St[]): Generator<St[]> {
  let lastPos = 0, last = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i][2];
    if (c === last || last === -1) { last = c; continue; }
    last = c;
    yield s.slice(lastPos, i);
    lastPos = i;
  }
  yield s.slice(lastPos);
}
function* stitchBlocks(s: St[]): Generator<St[]> {
  let cur: St[] = [];
  for (const p of s) {
    if (p[2] === STITCH) cur.push(p);
    else if (cur.length) { yield cur; cur = []; }
  }
  if (cur.length) yield cur;
}
function* colorBlocks(s: St[]): Generator<St[]> {
  let cur: St[] = [];
  for (const p of s) {
    if (p[2] === COLOR_CHANGE) { yield cur; cur = []; continue; }
    cur.push(p);
  }
  yield cur;
}

// ───── PEC graphics (ไอคอน 48×38 จุด) ─────
const BLANK: number[] = (() => {
  const g = new Array(6 * 38).fill(0);
  const row = (y: number, v: number[]) => v.forEach((b, i) => { g[y * 6 + i] = b; });
  row(1, [0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f]); row(2, [0x08, 0, 0, 0, 0, 0x10]); row(3, [0x04, 0, 0, 0, 0, 0x20]);
  for (let y = 4; y <= 33; y++) row(y, [0x02, 0, 0, 0, 0, 0x40]);
  row(34, [0x04, 0, 0, 0, 0, 0x20]); row(35, [0x08, 0, 0, 0, 0, 0x10]); row(36, [0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f]);
  return g;
})();
function drawScaled(ext: [number, number, number, number], pts: St[], g: number[], stride: number, buffer = 5) {
  const [left, top, right, bottom] = ext;
  const dw = right - left || 1, dh = bottom - top || 1;
  const gw = stride * 8, gh = g.length / stride;
  const scale = Math.min((gw - buffer) / dw, (gh - buffer) / dh);
  const tx = -((right + left) / 2) * scale + gw / 2, ty = -((bottom + top) / 2) * scale + gh / 2;
  for (const p of pts) {
    const x = Math.floor(p[0] * scale + tx), y = Math.floor(p[1] * scale + ty);
    const i = y * stride + Math.trunc(x / 8);
    if (i >= 0 && i < g.length && x >= 0) g[i] |= 1 << (x % 8);
  }
}

// ───── PEC ─────
function writeValue(o: Bytes, value: number, long = false, flag = 0) {
  if (!long && -64 < value && value < 63) o.u8(value & 0x7f);
  else { let v = value & 0x0fff; v |= 0x8000; v |= flag << 8; o.u8((v >> 8) & 0xff); o.u8(v & 0xff); }
}
function pecEncode(o: Bytes, s: St[]) {
  let colorTwo = true, jumping = true, init = true, xx = 0, yy = 0;
  for (const [x, y, data] of s) {
    const dx = roundHalfEven(x - xx), dy = roundHalfEven(y - yy);
    xx += dx; yy += dy;
    if (data === STITCH) {
      if (jumping) { if (dx !== 0 && dy !== 0) { writeValue(o, 0); writeValue(o, 0); } jumping = false; }
      writeValue(o, dx); writeValue(o, dy);
    } else if (data === JUMP) {
      jumping = true;
      const flag = init ? 0x10 : 0x20;   // JUMP_CODE / TRIM_CODE
      writeValue(o, dx, true, flag); writeValue(o, dy, true, flag);
    } else if (data === COLOR_CHANGE) {
      if (jumping) { writeValue(o, 0); writeValue(o, 0); jumping = false; }
      o.raw([0xfe, 0xb0, colorTwo ? 0x02 : 0x01]);
      colorTwo = !colorTwo;
    } else if (data === END) { o.u8(0xff); break; }
    init = false;
  }
}
function writePec(o: Bytes, s: St[], threads: string[], name: string) {
  const ext = bounds(s);
  // header
  o.str(`LA:${name.slice(0, 8).padEnd(16, " ")}\r`);
  o.raw([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0xff, 0x00]);
  o.u8(48 / 8); o.u8(38);
  const idx = uniquePalette(threads);
  const n = idx.length;
  if (n !== 0) {
    o.raw(new Array(12).fill(0x20));
    if (n - 1 >= 255) throw new Error("สีเยอะเกิน 255 ครั้ง");
    o.raw([n - 1, ...idx]);
  } else o.raw([0x20, 0x20, 0x20, 0x20, 0x64, 0x20, 0x00, 0x20, 0x00, 0x20, 0x20, 0x20, 0xff]);
  for (let i = n; i < 463; i++) o.u8(0x20);
  // stitch block
  const start = o.pos;
  o.raw([0x00, 0x00]); o.u24(0); o.raw([0x31, 0xff, 0xf0]);
  o.u16(roundHalfEven(ext[2] - ext[0])); o.u16(roundHalfEven(ext[3] - ext[1]));
  o.u16(0x1e0); o.u16(0x1b0);
  pecEncode(o, s);
  o.set24(start + 2, o.pos - start);
  // graphics
  const all = [...BLANK];
  for (const blk of stitchBlocks(s)) drawScaled(ext, blk, all, 6, 4);
  o.raw(all);
  for (const blk of colorBlocks(s)) {
    const g = [...BLANK];
    drawScaled(ext, blk.filter((p) => p[2] === STITCH), g, 6);
    o.raw(g);
  }
}

// ───── PES v1 ─────
function pesString16(o: Bytes, s: string) { o.u16(s.length); o.str(s); }
export function buildPes(plan: EmbPlan, label: string): Uint8Array {
  const s = planStitches(plan.cmds);
  const threads = plan.colors.map((c) => c.color);
  if (!threads.length) threads.push("#000000");
  const o = new Bytes();
  o.str("#PES0001");
  const [l0, t0, r0, b0] = bounds(s);
  const cx = (r0 + l0) / 2, cy = (b0 + t0) / 2;
  const left = l0 - cx, top = t0 - cy, right = r0 - cx, bottom = b0 - cy;
  const pecAt = o.pos; o.u32(0);
  const hasStitches = s.some((p) => p[2] === STITCH);
  // header v1
  o.u16(0x01); o.u16(0x01); o.u16(hasStitches ? 1 : 0);
  if (!hasStitches) { o.u16(0); o.u16(0); }
  else {
    o.u16(0xffff); o.u16(0x0000);
    // CEmbOne + sewseg header
    pesString16(o, "CEmbOne");
    const width = right - left, height = bottom - top;
    for (let i = 0; i < 8; i++) o.u16(0);
    let tx = 350, ty = 100 + height;
    tx += 1300 / 2; ty += 1800 / 2; tx += -width / 2; ty += -height / 2;
    o.f32(1); o.f32(0); o.f32(0); o.f32(1); o.f32(tx); o.f32(ty);
    o.u16(1); o.u16(0); o.u16(0); o.u16(Math.trunc(width)); o.u16(Math.trunc(height));
    o.raw([0, 0, 0, 0, 0, 0, 0, 0]);
    const sectionsAt = o.pos; o.u16(0);
    o.u16(0xffff); o.u16(0x0000);
    // CSewSeg
    pesString16(o, "CSewSeg");
    const adjX = left + cx, adjY = bottom + cy;
    let ci = 0;
    let colorCode = nearestPec(threads[ci++] ?? "#000000") ?? 20;
    let sx = 0, sy = 0, section = 0, prevCode = -1, flag = -1;
    const colorlog: [number, number][] = [];
    for (const blk of commandBlocks(s)) {
      const cmd = blk[0][2];
      let seg: [number, number][] = [], f = 0;
      if (cmd === JUMP) { const lp = blk[blk.length - 1]; seg = [[sx - adjX, sy - adjY], [lp[0] - adjX, lp[1] - adjY]]; f = 1; }
      else if (cmd === COLOR_CHANGE) { colorCode = nearestPec(threads[ci++] ?? threads[threads.length - 1]) ?? colorCode; continue; }
      else if (cmd === STITCH) { for (const p of blk) { sx = p[0]; sy = p[1]; seg.push([sx - adjX, sy - adjY]); } f = 0; }
      else continue;
      if (flag !== -1) o.u16(0x8003);
      flag = f;
      if (prevCode !== colorCode) { colorlog.push([section, colorCode]); prevCode = colorCode; }
      o.u16(f); o.u16(colorCode); o.u16(seg.length);
      for (const [x, y] of seg) { o.u16(Math.trunc(x)); o.u16(Math.trunc(y)); }
      section++;
    }
    o.u16(colorlog.length);
    for (const [a, b] of colorlog) { o.u16(a); o.u16(b); }
    o.set16(sectionsAt, section);
    o.u16(0); o.u16(0);
  }
  o.set32(pecAt, o.pos);
  writePec(o, s, threads, label.replace(/[^\x20-\x7e]/g, "").trim() || "Untitled");
  return new Uint8Array(o.buf);
}

/** อ่านส่วน PEC ของไฟล์ .PES กลับเป็นจำนวนฝี/เปลี่ยนสี — ใช้ตรวจไฟล์ที่สร้าง/เทสต์ */
export function readPesSummary(bytes: Uint8Array): { pecAt: number; colors: number; stitches: number; jumps: number; changes: number; end: boolean; label: string } {
  const pecAt = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
  const label = new TextDecoder("latin1").decode(bytes.slice(pecAt + 3, pecAt + 19)).trim();
  const colors = bytes[pecAt + 48] + 1;
  let i = pecAt + 512 + 16;
  let stitches = 0, jumps = 0, changes = 0, end = false;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0xff) { end = true; break; }
    if (b === 0xfe && bytes[i + 1] === 0xb0) { changes++; i += 3; continue; }
    const readOne = () => { const v = bytes[i]; if (v & 0x80) { const fl = v & 0x70; i += 2; return fl; } i += 1; return -1; };
    const fx = readOne(), fy = readOne();
    if (fx > 0 || fy > 0) jumps++; else stitches++;
  }
  return { pecAt, colors, stitches, jumps, changes, end, label };
}

/** ชื่อไฟล์ .pes (อังกฤษล้วน) */
export const pesFileName = (dstName: string) => dstName.replace(/\.dst$/i, ".pes");
