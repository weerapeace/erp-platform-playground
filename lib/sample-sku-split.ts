/**
 * ลงรูป SAMPLE แยกอัลบั้มตาม SKU ลูก (เจ้าของเลือกจาก widget 2026-11-17: ชื่อแบบ A "Product 005, 006…" + ข้อ 1-5)
 * - guessSku: เดา SKU จากชื่อไฟล์/โฟลเดอร์ — ใช้ตัวจับคู่รหัสเดิมของ "จัดรูปหลายโฟลเดอร์" (lib/product-image-routing matchName)
 *   + ชื่อสีของ SKU (เช่น "ชมพู") เป็นทางสำรอง · เดาไม่ได้ = "" (ไม่ระบุ SKU)
 * - splitGroups: รูป → กลุ่มอัลบั้ม (ตามลำดับ SKU ของรุ่น · ไม่ระบุ SKU = อัลบั้ม "ทั้งรุ่น" ท้ายสุด) + ชื่อ Product ### ต่อกัน
 * ตรรกะล้วน (เทสต์ lib/__tests__/sample-sku-split.test.ts)
 */
import { matchName, routeCodeIndex, type RouteParent } from "@/lib/product-image-routing";

export type SplitSku = { id: string; code: string; name: string };

/** ชื่อไฟล์ / path → รหัส SKU ที่น่าจะใช่ · "" = เดาไม่ได้ */
export function guessSku(path: string, parent: { id: string; code: string; name: string }, kids: readonly SplitSku[]): string {
  if (!kids.length) return "";
  const rp: RouteParent = { parentId: parent.id, code: parent.code, name: parent.name, gallery: 0, desc: 0, png: false, shopIds: [],
    skus: kids.map((k) => ({ id: k.id, code: k.code, label: k.name, gallery: 0 })) };
  const index = routeCodeIndex([rp]);
  const parts = path.split("/").filter(Boolean);
  const names = [parts[parts.length - 1]?.replace(/\.[a-z0-9]+$/i, "") ?? "", ...parts.slice(0, -1).reverse()];
  for (const n of names) {
    const m = matchName(n, [rp], index);
    const sku = m.target?.skuId ? kids.find((k) => k.id === m.target!.skuId) : null;
    if (sku) return sku.code;
  }
  // ชื่อสี (ยาวก่อน กัน "ดำ" ไปชน "ดำเทา")
  const low = path.toLowerCase();
  const byName = [...kids].filter((k) => k.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length).find((k) => low.includes(k.name.trim().toLowerCase()));
  return byName?.code ?? "";
}

/** เลขต่อจาก "Product 005" → "Product 006" (ไม่ใช่รูปแบบนี้ = ต่อท้าย " 2") */
export function bumpProductName(base: string, step: number): string {
  if (step === 0) return base;
  const m = /^(.*?)(\d+)\s*$/.exec(base);
  if (!m) return `${base} ${step + 1}`;
  return `${m[1]}${String(Number(m[2]) + step).padStart(m[2].length, "0")}`;
}

export type SplitGroup = { name: string; skuCode: string; indexes: number[] };

/** รูป (index) → กลุ่มอัลบั้มตาม SKU (ลำดับตาม SKU ของรุ่น · "" ทั้งรุ่น ท้ายสุด) · ชื่อเริ่มที่ baseName แล้วนับต่อ */
export function splitGroups(assign: readonly string[], kids: readonly SplitSku[], baseName: string): SplitGroup[] {
  const order = [...kids.map((k) => k.code), ""];
  const groups: SplitGroup[] = [];
  for (const code of order) {
    const idx = assign.flatMap((c, i) => (c === code ? [i] : []));
    if (idx.length) groups.push({ name: "", skuCode: code, indexes: idx });
  }
  // SKU ที่ไม่อยู่ในรุ่น (ไม่ควรเกิด) → รวมเข้าทั้งรุ่น
  const known = new Set(order);
  const stray = assign.flatMap((c, i) => (known.has(c) ? [] : [i]));
  if (stray.length) {
    const whole = groups.find((g) => g.skuCode === "");
    if (whole) whole.indexes.push(...stray); else groups.push({ name: "", skuCode: "", indexes: stray });
  }
  return groups.map((g, i) => ({ ...g, name: bumpProductName(baseName, i) }));
}

/**
 * ลากโฟลเดอร์ที่มีโฟลเดอร์ย่อย → แยกอัลบั้มตามโฟลเดอร์ (ข้อเสนอ 1 · 2026-11-17)
 * คืน { folders: ชื่อโฟลเดอร์สุดท้ายของแต่ละกลุ่ม (ตามลำดับที่เจอ), index: รูปที่ i อยู่กลุ่มไหน } · โฟลเดอร์เดียว/ไม่มีโฟลเดอร์ = null
 */
export function folderGroups(paths: readonly string[]): { folders: string[]; index: number[] } | null {
  const dirs = paths.map((p) => { const i = p.lastIndexOf("/"); return i > 0 ? p.slice(0, i) : ""; });
  const order: string[] = [];
  for (const d of dirs) if (!order.includes(d)) order.push(d);
  if (order.length < 2) return null;
  return { folders: order.map((d) => d.split("/").pop() || "—"), index: dirs.map((d) => order.indexOf(d)) };
}

/**
 * แบ่งตามเวลาถ่าย (ข้อเสนอ 3 · 2026-11-17): เรียงตามเวลา แล้วตัดกลุ่มเมื่อห่างกันเกิน gapMs (ค่าเริ่ม 2 นาที)
 * คืน index กลุ่มของแต่ละรูป (กลุ่ม 0 = ถ่ายก่อนสุด) · เวลาใช้ไม่ได้ (เท่ากันหมด/ไม่มี) หรือได้กลุ่มเดียว = null
 */
export function timeGroups(times: readonly number[], gapMs = 120_000): number[] | null {
  if (times.length < 2 || times.some((t) => !Number.isFinite(t) || t <= 0)) return null;
  const order = times.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (order[order.length - 1][0] === order[0][0]) return null;
  const out = new Array<number>(times.length);
  let g = 0;
  order.forEach(([t, i], k) => { if (k > 0 && t - order[k - 1][0] > gapMs) g++; out[i] = g; });
  return g > 0 ? out : null;
}
