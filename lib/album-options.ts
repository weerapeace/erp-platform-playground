// ============================================================
// album-options — ตรรกะล้วนของตัวเลือกอัลบั้มกลาง (components/album-picker)
//
// ทำไมมี: อัลบั้มในคลังไฟล์มีหลายร้อย (หน้า SAMPLE Images สร้างอัลบั้มย่อย "Product NNN" / "Version N" ซ้อนในอัลบั้มของวัน)
//   ชื่อ "Version 1" ซ้ำกันหลายสิบอันเพราะอยู่คนละแม่ → ต้องโชว์ "เส้นทางแม่" ให้แยกออก + จัดกลุ่ม + ย่อรายการยาว
// กติกาย่อ (เจ้าของสั่ง 2026-11-19): รายการอัลบั้มที่ไหนเกิน ALBUM_COLLAPSE_AT ตัว → โชว์เท่านั้นแล้วมีปุ่ม "ดูอีก N"
// เทสต์: lib/__tests__/album-options.test.ts
// ============================================================

/** รูปอัลบั้มขั้นต่ำที่ตัวเลือกต้องใช้ (ตรงกับ AssetCollection ของ /api/assets/collections) */
export type AlbumLike = { id: string; name: string; count?: number; parent_id?: string | null; group?: string | null };

export type AlbumOption = {
  value: string;
  label: string;
  /** เส้นทางแม่ เช่น "SAMPLE Good Goods 13 พ.ย. 2569 › Product 012" · ชั้นบนสุด = "" */
  sub: string;
  searchText: string;
  /** null = อัลบั้มปกติ · อื่น ๆ = ชื่อกลุ่ม เช่น "SAMPLE · Good Goods" */
  group: string | null;
  depth: number;
  parent: string | null;
  count: number;
  /** จำนวนอัลบั้มลูกชั้นถัดไป */
  children: number;
};

/** เกินเท่านี้ = ย่อ (โชว์เท่านี้ + ปุ่ม "ดูอีก N") */
export const ALBUM_COLLAPSE_AT = 6;
export const PATH_SEP = " › ";

/**
 * อัลบั้มทั้งหมด → ตัวเลือกเรียงแบบต้นไม้ (อัลบั้มปกติก่อน ตามลำดับเดิม → กลุ่ม SAMPLE ทีละกลุ่ม แม่แล้วตามด้วยลูก)
 * แม่หาย/วนซ้ำ = ถือเป็นชั้นบนสุด (กันค้าง)
 */
export function buildAlbumOptions(albums: readonly AlbumLike[]): AlbumOption[] {
  const byId = new Map(albums.map((a) => [a.id, a]));
  const parentOf = (a: AlbumLike): string | null => (a.parent_id && a.parent_id !== a.id && byId.has(a.parent_id) ? a.parent_id : null);
  const kids = new Map<string | null, AlbumLike[]>();
  for (const a of albums) {
    const p = parentOf(a);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(a);
  }
  const out: AlbumOption[] = [];
  const seen = new Set<string>();
  const walk = (a: AlbumLike, path: string[], group: string | null) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    const ch = kids.get(a.id) ?? [];
    const sub = path.join(PATH_SEP);
    out.push({
      value: a.id, label: a.name, sub, searchText: `${sub} ${a.name}`.trim(),
      group, depth: path.length, parent: parentOf(a), count: a.count ?? 0, children: ch.length,
    });
    for (const c of ch) walk(c, [...path, a.name], group);
  };
  const tops = kids.get(null) ?? [];
  for (const a of tops) if (!a.group) walk(a, [], null);
  const groups: string[] = [];
  for (const a of tops) if (a.group && !groups.includes(a.group)) groups.push(a.group);
  for (const g of groups) for (const a of tops) if (a.group === g) walk(a, [], g);
  // ตกหล่น (วนซ้ำกันเอง) → ต่อท้ายเป็นชั้นบนสุด
  for (const a of albums) if (!seen.has(a.id)) walk(a, [], a.group ?? null);
  return out;
}

/** ชื่อเต็มพร้อมเส้นทาง เช่น "SAMPLE … › Product 012 › Version 2" */
export const albumFullName = (o: Pick<AlbumOption, "label" | "sub">): string => (o.sub ? `${o.sub}${PATH_SEP}${o.label}` : o.label);

/** รายการยาว → โชว์ limit ตัวแรก (ซ่อนแค่ 1 ตัว = โชว์หมดเลย ไม่ทำปุ่ม "ดูอีก 1") */
export function collapseList<T>(items: readonly T[], open: boolean, limit = ALBUM_COLLAPSE_AT): { shown: T[]; hidden: number } {
  if (open || items.length <= limit + 1) return { shown: [...items], hidden: 0 };
  return { shown: items.slice(0, limit), hidden: items.length - limit };
}

/** ไอดีบรรพบุรุษทั้งหมดของอัลบั้ม (ไว้กางต้นไม้ให้เห็นอัลบั้มที่เลือกอยู่) */
export function ancestorIds(options: readonly AlbumOption[], id: string | null | undefined): string[] {
  const byId = new Map(options.map((o) => [o.value, o]));
  const out: string[] = [];
  let cur = id ? byId.get(id)?.parent ?? null : null;
  while (cur && !out.includes(cur)) { out.push(cur); cur = byId.get(cur)?.parent ?? null; }
  return out;
}
