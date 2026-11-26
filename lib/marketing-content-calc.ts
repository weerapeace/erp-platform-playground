/**
 * สูตรแท็บ "รีวิว" + "คอนเทนต์" ของหน้าภาพรวมการตลาด — pure + เทสต์ lib/__tests__/marketing-content-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 · แบบ A + ข้อ 1 รีวิว · 2 โพสต์ FB/IG · 3 แอฟฟิลิเอต · 5 คู่แข่ง · 6 วิดีโอ Shopee)
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export type ReviewLite = { item_id: string | null; rating: number | null; reply: string | null; images: unknown; created_at_shop: string | null; hidden?: boolean };

/** สรุปรีวิว: จำนวน · ดาวเฉลี่ย · แจกแจง 1-5 · ตอบแล้วกี่ % · 1-3 ดาวที่ยังไม่ตอบ · มีรูป */
export function reviewSummary(rows: readonly ReviewLite[]) {
  const dist = [0, 0, 0, 0, 0];
  let sum = 0, rated = 0, replied = 0, lowOpen = 0, withPhotos = 0;
  for (const r of rows) {
    if (r.rating && r.rating >= 1 && r.rating <= 5) { dist[r.rating - 1]++; sum += r.rating; rated++; }
    if (r.reply) replied++;
    else if (r.rating != null && r.rating <= 3) lowOpen++;
    if (Array.isArray(r.images) && r.images.length) withPhotos++;
  }
  return { count: rows.length, avg: rated ? sum / rated : null, dist, replyRate: rows.length ? replied / rows.length : 0, lowOpen, withPhotos };
}

/** รีวิวต่อสินค้า (ดาวต่ำสุดขึ้นก่อนเมื่อจำนวนพอ) */
export function reviewsByItem(rows: readonly ReviewLite[]): { item_id: string; count: number; avg: number | null; low: number; lowOpen: number; last: string | null }[] {
  const m = new Map<string, ReviewLite[]>();
  for (const r of rows) { if (!r.item_id) continue; const a = m.get(r.item_id) ?? []; a.push(r); m.set(r.item_id, a); }
  return [...m.entries()].map(([item_id, rs]) => {
    const s = reviewSummary(rs);
    return { item_id, count: rs.length, avg: s.avg, low: rs.filter((r) => r.rating != null && r.rating <= 3).length, lowOpen: s.lowOpen, last: rs.reduce<string | null>((m2, r) => (r.created_at_shop && (!m2 || r.created_at_shop > m2) ? r.created_at_shop : m2), null) };
  }).sort((a, b) => b.lowOpen - a.lowOpen || b.low - a.low || b.count - a.count);
}

export type PostLite = { platform: string; likes: number; comments: number; shares: number; views: number | null; posted_at: string | null };
export const engagementOf = (p: Pick<PostLite, "likes" | "comments" | "shares">) => (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
/** สรุปโพสต์แยกช่องทาง */
export function postSummary(rows: readonly PostLite[]): { platform: string; posts: number; engagement: number; avg: number; likes: number; comments: number; shares: number }[] {
  const m = new Map<string, { platform: string; posts: number; engagement: number; avg: number; likes: number; comments: number; shares: number }>();
  for (const p of rows) {
    const g = m.get(p.platform) ?? { platform: p.platform, posts: 0, engagement: 0, avg: 0, likes: 0, comments: 0, shares: 0 };
    g.posts++; g.likes += p.likes || 0; g.comments += p.comments || 0; g.shares += p.shares || 0; g.engagement += engagementOf(p);
    m.set(p.platform, g);
  }
  return [...m.values()].map((g) => ({ ...g, avg: g.posts ? g.engagement / g.posts : 0 })).sort((a, b) => b.engagement - a.engagement);
}

/**
 * แอฟฟิลิเอตต่อสินค้า — ออเดอร์ที่มีค่าคอมแอฟฟิลิเอต (Shopee escrow บรรทัด ams) · ค่าคอมปันส่วนตามมูลค่าบรรทัด
 * items: { order_id, product, value } · amsByOrder: ค่าคอมต่อออเดอร์ (บาท บวก)
 */
export function affiliateByProduct(items: readonly { order_id: string; product: string; value: number }[], amsByOrder: Map<string, number>): { product: string; orders: number; sales: number; commission: number; rate: number | null }[] {
  const orderValue = new Map<string, number>();
  for (const it of items) if (amsByOrder.has(it.order_id)) orderValue.set(it.order_id, (orderValue.get(it.order_id) ?? 0) + it.value);
  const m = new Map<string, { product: string; orders: Set<string>; sales: number; commission: number }>();
  for (const it of items) {
    const ams = amsByOrder.get(it.order_id); if (ams == null) continue;
    const ov = orderValue.get(it.order_id) ?? 0;
    const g = m.get(it.product) ?? { product: it.product, orders: new Set<string>(), sales: 0, commission: 0 };
    g.orders.add(it.order_id); g.sales += it.value; g.commission += ov > 0 ? ams * (it.value / ov) : 0;
    m.set(it.product, g);
  }
  return [...m.values()].map((g) => ({ product: g.product, orders: g.orders.size, sales: g.sales, commission: g.commission, rate: g.sales > 0 ? g.commission / g.sales : null })).sort((a, b) => b.sales - a.sales);
}

export type CompetitorHistory = { at: string; price: number | null; rating: number | null; sold: number | null };
/** ต่อประวัติคู่แข่งเมื่อราคา/ดาว/ยอดขายเปลี่ยน (เก็บ 50 ครั้งล่าสุด) */
export function appendHistory(history: unknown, prev: { price: number | null; rating: number | null; sold: number | null }, next: { price: number | null; rating: number | null; sold: number | null }, at: string): CompetitorHistory[] {
  const h = Array.isArray(history) ? (history as CompetitorHistory[]) : [];
  const same = prev.price === next.price && prev.rating === next.rating && prev.sold === next.sold;
  return same ? h : [...h, { at, ...next }].slice(-50);
}
/** ราคาเราเทียบคู่แข่ง: บวก = เราแพงกว่า */
export const priceGap = (ours: number | null, theirs: number | null): number | null => (ours != null && theirs != null && theirs > 0 ? (ours - theirs) / theirs : null);
