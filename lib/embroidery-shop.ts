/**
 * 🧵 ไฟล์ปัก — ไฟล์ที่ร้านตีบล็อกให้ (.DST / .PES): ตรวจชนิด · อ่านฝีเข็ม → แผนสำหรับภาพตัวอย่าง (StitchPreview ตัวเดิม)
 *   เก็บในแถว embroidery_designs.shop_file_b64 (base64 · ≤ 1.5 MB) · ใช้ได้ทั้งเบราว์เซอร์และ API (ตรวจไฟล์ก่อนบันทึก)
 */
import { readDst, type Cmd, type EmbPlan } from "@/lib/embroidery";
import { readPes } from "@/lib/embroidery-pes";

export type ShopKind = "dst" | "pes";
export const SHOP_ACCEPT = ".dst,.pes,.DST,.PES";
export const SHOP_MAX_BYTES = 1_500_000;
/** สีที่ใช้แทนเมื่อไฟล์ไม่มีสี (.DST ไม่เก็บสี) */
const FALLBACK = ["#1f2a44", "#c0392b", "#d4a017", "#2e7d32", "#6a1b9a", "#ef6c00", "#00838f", "#5d4037"];

export function shopKind(bytes: Uint8Array): ShopKind | null {
  if (bytes.length >= 64 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "#PES") return "pes";
  if (bytes.length > 515 && String.fromCharCode(bytes[0], bytes[1], bytes[2]) === "LA:") return "dst";
  return null;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** คำสั่งที่อ่านจากไฟล์ → แผน (ย้ายให้จุดกึ่งกลางงาน = 0,0 · นับฝี/กระโดด/เปลี่ยนสี) */
export function planFromCmds(cmds: Cmd[], colors: string[]): EmbPlan {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cmds) if (c.t === "stitch") { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  if (!Number.isFinite(x0)) { x0 = y0 = x1 = y1 = 0; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const moved = cmds.map((c) => ({ ...c, x: c.x - cx, y: c.y - cy }));
  let stitches = 0, jumps = 0, changes = 0;
  const per: number[] = [0];
  for (const c of moved) {
    if (c.t === "stitch") { stitches++; per[per.length - 1]++; }
    else if (c.t === "jump") jumps++;
    else if (c.t === "color") { changes++; per.push(0); }
  }
  const blocks = per.map((n, i) => ({ color: colors[i] ?? FALLBACK[i % FALLBACK.length], thread: "", stitches: n, pieces: 0 }));
  return {
    cmds: moved, colors: blocks, pieces: [], stitches, jumps, trims: 0, colorChanges: changes,
    width: Math.round((x1 - x0) * 100) / 100, height: Math.round((y1 - y0) * 100) / 100,
    minutes: Math.round((stitches / 700 + changes * 0.5) * 10) / 10,
  };
}

/** อ่านไฟล์ร้าน → แผน · colorsHint = สีของงาน (ใช้กับ .DST ที่ไม่มีสี) */
export function readShopFile(bytes: Uint8Array, colorsHint: string[] = []): { kind: ShopKind; plan: EmbPlan; label: string } {
  const kind = shopKind(bytes);
  if (kind === "pes") { const r = readPes(bytes); return { kind, plan: planFromCmds(r.cmds, r.colors), label: r.label }; }
  if (kind === "dst") { const r = readDst(bytes); return { kind, plan: planFromCmds(r.cmds, colorsHint), label: r.label }; }
  throw new Error("ไฟล์นี้ไม่ใช่ .DST หรือ .PES");
}
