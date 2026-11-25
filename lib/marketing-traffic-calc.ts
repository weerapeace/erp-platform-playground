/**
 * สูตรแท็บ "คนเข้าร้าน" ของหน้าภาพรวมการตลาด — pure + เทสต์ lib/__tests__/marketing-traffic-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 4 · แบบ A + ข้อ 1 เก็บยอดเข้าชม · 2 คนดูเยอะขายน้อย/ขายดีคนดูน้อย · 3 เตือนดาวตก · 4 เตือนคนดูพุ่ง)
 * ข้อมูล = ยอดสะสมต่อสินค้า ณ สิ้นวัน (marketing_item_stats) → ยอดวัน D = สะสม(D) − สะสม(D−1) · ไม่มีวันก่อน = ไม่รู้ (ไม่เดา)
 * Shopee get_item_extra_info: views / likes / sale / rating_star / comment_count (เปิดเอกสาร 2026-11-25)
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export type ItemSnap = { item_id: string; brand_id: string | null; date: string; views: number; likes: number; sales: number; rating: number | null; comments: number };
export type ItemDay = { item_id: string; date: string; views: number; likes: number; comments: number };

const DAY_MS = 86_400_000;
const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** ยอดรายวันจากยอดสะสม — ต้องมีวันก่อนหน้าติดกัน · ค่าติดลบ (Shopee รีเซ็ต/ลบรีวิว) = 0 */
export function dailyDeltas(snaps: readonly ItemSnap[]): ItemDay[] {
  const by = new Map<string, ItemSnap>();
  for (const s of snaps) by.set(`${s.item_id}|${s.date}`, s);
  const out: ItemDay[] = [];
  for (const s of snaps) {
    const p = by.get(`${s.item_id}|${prevDay(s.date)}`);
    if (!p) continue;
    out.push({ item_id: s.item_id, date: s.date, views: Math.max(0, s.views - p.views), likes: Math.max(0, s.likes - p.likes), comments: Math.max(0, s.comments - p.comments) });
  }
  return out;
}

export type TrafficFlag = "many_views_low_sales" | "selling_low_views";
export type TrafficRow = { item_id: string; views: number; likes: number; newReviews: number; units: number; conv: number | null; rating: number | null; flag: TrafficFlag | null };

/**
 * ติดป้ายสินค้า (ต้องมีสินค้าที่มีคนดูอย่างน้อย 8 ตัวถึงจะเทียบได้):
 *   คนดูเยอะแต่ขายน้อย = คนดูติด 25% บนสุด และอัตราซื้อต่ำกว่าครึ่งของค่ากลาง → แก้รูป/ราคา/รายละเอียด
 *   ขายดีแต่คนดูน้อย = ขายติด 25% บนสุด แต่คนดูต่ำกว่าค่ากลาง → ควรลงโฆษณาเพิ่ม
 */
export function flagItems(rows: readonly Omit<TrafficRow, "flag" | "conv">[]): TrafficRow[] {
  const withConv = rows.map((r) => ({ ...r, conv: r.views > 0 ? r.units / r.views : null }));
  const viewed = withConv.filter((r) => r.views > 0);
  if (viewed.length < 8) return withConv.map((r) => ({ ...r, flag: null }));
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
  const v75 = q(viewed.map((r) => r.views), 0.75), vMed = q(viewed.map((r) => r.views), 0.5);
  const u75 = q(viewed.map((r) => r.units), 0.75);
  const cMed = q(viewed.map((r) => r.conv as number), 0.5);
  return withConv.map((r) => {
    let flag: TrafficFlag | null = null;
    if (r.views >= v75 && r.views >= 30 && r.conv != null && r.conv < cMed / 2) flag = "many_views_low_sales";
    else if (r.units >= u75 && r.units >= 3 && r.views < vMed) flag = "selling_low_views";
    return { ...r, flag };
  });
}

/** ดาวตก: ดาวเมื่อวานต่ำกว่าวันก่อน ≥ 0.05 หรือ ต่ำกว่า 4.5 (เฉพาะที่มีรีวิว ≥ 5) */
export function ratingDrops(today: readonly ItemSnap[], before: readonly ItemSnap[], opts: { minReviews?: number; floor?: number; drop?: number } = {}): { item_id: string; rating: number; prev: number | null; comments: number; reason: "dropped" | "low" }[] {
  const minReviews = opts.minReviews ?? 5, floor = opts.floor ?? 4.5, drop = opts.drop ?? 0.05;
  const prev = new Map(before.map((s) => [s.item_id, s]));
  const out: { item_id: string; rating: number; prev: number | null; comments: number; reason: "dropped" | "low" }[] = [];
  for (const s of today) {
    if (s.rating == null || s.comments < minReviews) continue;
    const p = prev.get(s.item_id)?.rating ?? null;
    if (p != null && p - s.rating >= drop) out.push({ item_id: s.item_id, rating: s.rating, prev: p, comments: s.comments, reason: "dropped" });
    else if (s.rating < floor) out.push({ item_id: s.item_id, rating: s.rating, prev: p, comments: s.comments, reason: "low" });
  }
  return out.sort((a, b) => (a.reason === b.reason ? a.rating - b.rating : a.reason === "dropped" ? -1 : 1));
}

/** คนดูพุ่ง: วันล่าสุด ≥ 3 เท่าของค่าเฉลี่ยวันก่อนหน้า (ต้องมีอย่างน้อย 3 วันก่อนหน้า) และ ≥ 50 คน */
export function viewSpikes(days: readonly ItemDay[], lastDate: string, opts: { factor?: number; min?: number } = {}): { item_id: string; views: number; avg: number }[] {
  const factor = opts.factor ?? 3, min = opts.min ?? 50;
  const by = new Map<string, ItemDay[]>();
  for (const d of days) { const a = by.get(d.item_id) ?? []; a.push(d); by.set(d.item_id, a); }
  const out: { item_id: string; views: number; avg: number }[] = [];
  for (const [id, list] of by) {
    const last = list.find((d) => d.date === lastDate);
    const prior = list.filter((d) => d.date < lastDate);
    if (!last || prior.length < 3) continue;
    const avg = prior.reduce((s, d) => s + d.views, 0) / prior.length;
    if (last.views >= min && last.views >= avg * factor) out.push({ item_id: id, views: last.views, avg });
  }
  return out.sort((a, b) => b.views - a.views);
}
