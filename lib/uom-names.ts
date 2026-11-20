/**
 * หน่วยนับ 2 ภาษา (ของกลาง) — ใช้กับตาราง uoms ที่มี name (ชื่อหลักไว้จับคู่) + name_th + name_en + aliases
 *   uomLabel      = ข้อความที่โชว์ "หลา · Yard"
 *   uomNames      = ทุกชื่อของหน่วย (ไว้ค้น/เทียบ) ตัวพิมพ์เล็ก ไม่มีจุดท้าย
 *   findUomClash  = ชื่อที่กำลังพิมพ์ ชนหน่วยไหนแล้วบ้าง (กันสร้างซ้ำ)
 *   findDupGroups = กลุ่มหน่วยที่ซ้ำกัน (ชื่อไทยหรืออังกฤษตรงกัน / ชื่ออื่นชนกัน) → ป๊อปรวมหน่วย
 * ดู docs/uom-bilingual.md
 */
export type UomRow = {
  id: string;
  name: string;
  name_th?: string | null;
  name_en?: string | null;
  aliases?: string | null;
  display_name?: string | null;
  active?: boolean | null;
  usage?: number;
};

/** ทำชื่อให้เทียบกันได้: ตัวเล็ก · ตัดช่องว่าง · ตัดจุดท้าย (pcs. = pcs) · ² = 2 */
export function normUom(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/²/g, "2").replace(/\.+$/, "").replace(/\s+/g, " ");
}

export function splitAliases(s: string | null | undefined): string[] {
  return (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

export function uomLabel(u: Pick<UomRow, "name" | "name_th" | "name_en" | "display_name">): string {
  const th = (u.name_th ?? "").trim(), en = (u.name_en ?? "").trim();
  if (th && en && th.toLowerCase() !== en.toLowerCase()) return `${th} · ${en}`;
  return th || en || (u.display_name ?? "").trim() || u.name;
}

export function uomNames(u: UomRow): string[] {
  return [...new Set([u.name, u.name_th, u.name_en, ...splitAliases(u.aliases)].map(normUom).filter(Boolean))];
}

/** ชื่อที่พิมพ์ (หลายช่อง) ชนหน่วยอื่นที่ยังใช้อยู่ไหม — selfId = แถวที่กำลังแก้ (ไม่นับตัวเอง) */
export function findUomClash(typed: (string | null | undefined)[], all: UomRow[], selfId?: string | null): UomRow[] {
  const keys = new Set(typed.flatMap((t) => [t, ...splitAliases(t)]).map(normUom).filter(Boolean));
  if (keys.size === 0) return [];
  return all.filter((u) => u.id !== selfId && u.active !== false && uomNames(u).some((n) => keys.has(n)));
}

/** กลุ่มหน่วยซ้ำ (เฉพาะที่ยังใช้อยู่) — เรียงตัวที่ใช้มากสุดขึ้นก่อน (= ตัวหลักที่แนะนำ) */
export function findDupGroups(all: UomRow[]): UomRow[][] {
  const live = all.filter((u) => u.active !== false);
  const parent = new Map<string, string>(live.map((u) => [u.id, u.id]));
  const find = (x: string): string => { while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  const owner = new Map<string, string>();
  for (const u of live) for (const n of uomNames(u)) {
    const o = owner.get(n);
    if (o) parent.set(find(u.id), find(o)); else owner.set(n, u.id);
  }
  const groups = new Map<string, UomRow[]>();
  for (const u of live) { const r = find(u.id); groups.set(r, [...(groups.get(r) ?? []), u]); }
  return [...groups.values()].filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0) || a.name.localeCompare(b.name, "th")));
}
