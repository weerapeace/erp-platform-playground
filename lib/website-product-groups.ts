/**
 * 📦 กลุ่มสินค้าของร้าน (ตั้งครั้งเดียว ใช้ซ้ำได้ทุกโปรโมชัน) — กฎล้วน (ไม่แตะ DB · ทดสอบได้)
 *
 * 2 แบบ:
 *   manual  เลือกเอง — รหัสรุ่นที่หยิบใส่ (เช่น "ของขวัญปีใหม่")
 *   smart   อัตโนมัติ — ตามเงื่อนไข (หมวด · ช่วงราคา · มาใหม่ภายใน N วัน · รหัสขึ้นต้นด้วย) ทุกข้อที่ตั้งต้องตรง
 *           สินค้าเข้าใหม่ที่ตรงเงื่อนไข = เข้ากลุ่มเอง ไม่ต้องตามแก้
 * ตัวตัดสินว่าสินค้าอยู่ในกลุ่มไหม = groupMatches ใน lib/website-promotions (มิเรอร์เว็บร้าน → ตะกร้ากับออเดอร์คิดตรงกัน)
 * ตาราง store_product_groups · API /api/website/product-groups · หน้าจอ components/website-product-groups.tsx
 */
import type { GroupMatch, ProductGroup } from "@/lib/website-promotions";

export type ProductGroupRow = ProductGroup & { note: string; updatedAt: string | null };

const up = (s: string) => String(s ?? "").trim().toUpperCase();
const money = (n: number) => `฿${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** ตรวจ/ทำความสะอาดค่าจากหน้าจอ — ผิด = error ภาษาคน */
export function sanitizeGroup(raw: unknown): { ok: true; group: Omit<ProductGroupRow, "id" | "updatedAt"> } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "ตั้งชื่อกลุ่ม" };
  const mode: ProductGroup["mode"] = r.mode === "smart" ? "smart" : "manual";
  const list = (v: unknown, max: number, f: (s: string) => string) => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).map((x) => f(String(x).trim())).filter(Boolean))].slice(0, max);
  const codes = mode === "manual" ? list(r.codes, 500, up) : [];
  if (mode === "manual" && !codes.length) return { ok: false, error: "เลือกสินค้าเข้ากลุ่มอย่างน้อย 1 รุ่น" };

  const m = (r.match ?? {}) as Record<string, unknown>;
  const numOrNull = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v) * 100) / 100));
  const match: GroupMatch = {};
  if (mode === "smart") {
    const categories = list(m.categories, 30, (s) => s.slice(0, 60));
    const codePrefixes = list(m.codePrefixes, 10, (s) => up(s).slice(0, 20));
    const priceMin = numOrNull(m.priceMin);
    const priceMax = numOrNull(m.priceMax);
    const newDays = numOrNull(m.newDays);
    if (categories.length) match.categories = categories;
    if (codePrefixes.length) match.codePrefixes = codePrefixes;
    if (priceMin != null && priceMin > 0) match.priceMin = priceMin;
    if (priceMax != null && priceMax > 0) match.priceMax = priceMax;
    if (newDays != null && newDays > 0) {
      if (newDays > 365) return { ok: false, error: "มาใหม่ภายในได้ไม่เกิน 365 วัน" };
      match.newDays = Math.round(newDays);
    }
    if (match.priceMin != null && match.priceMax != null && match.priceMin > match.priceMax) return { ok: false, error: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" };
    if (!Object.keys(match).length) return { ok: false, error: "กลุ่มอัตโนมัติต้องตั้งเงื่อนไขอย่างน้อย 1 ข้อ (หมวด / ราคา / มาใหม่ / รหัสขึ้นต้น)" };
  }
  return { ok: true, group: { name, mode, codes, match, note: String(r.note ?? "").trim().slice(0, 200) } };
}

export function groupFromRow(r: Record<string, unknown>): ProductGroupRow {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    mode: r.mode === "smart" ? "smart" : "manual",
    codes: Array.isArray(r.codes) ? (r.codes as unknown[]).map((c) => String(c)) : [],
    match: (r.match && typeof r.match === "object" ? r.match : {}) as GroupMatch,
    note: String(r.note ?? ""),
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

/** สรุปกลุ่มเป็นภาษาคน เช่น "หมวด กระเป๋า · ราคา ฿800–1,500 · มาใหม่ 30 วัน" (labelOf = ชื่อหมวดจากรหัสหมวด) */
export function groupSummary(g: Pick<ProductGroup, "mode" | "codes" | "match">, labelOf: (cat: string) => string = (c) => c): string {
  if (g.mode !== "smart") return `เลือกเอง ${g.codes.length} รุ่น`;
  const m = g.match ?? {};
  const parts: string[] = [];
  if (m.categories?.length) parts.push(`หมวด ${m.categories.map(labelOf).join(" / ")}`);
  if (m.priceMin != null && m.priceMax != null) parts.push(`ราคา ${money(m.priceMin)}–${money(m.priceMax).slice(1)}`);
  else if (m.priceMin != null) parts.push(`ราคาตั้งแต่ ${money(m.priceMin)}`);
  else if (m.priceMax != null) parts.push(`ราคาไม่เกิน ${money(m.priceMax)}`);
  if (m.newDays) parts.push(`มาใหม่ ${m.newDays} วัน`);
  if (m.codePrefixes?.length) parts.push(`รหัสขึ้นต้น ${m.codePrefixes.join(" / ")}`);
  return parts.join(" · ") || "ยังไม่ตั้งเงื่อนไข";
}
