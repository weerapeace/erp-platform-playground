/**
 * 🔍 คำค้นของลูกค้าเว็บร้าน (ตาราง store_search_terms · นับรายวัน · ไม่เก็บว่าใครค้น)
 * จด: POST /api/public/storefront/search-log · อ่าน: GET /api/website/search-terms (ERP กลุ่ม 🔍 ข้อมูลร้าน)
 */
type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/** คำค้นที่เก็บ: ตัวเล็ก · ช่องว่างเดียว · 2–60 ตัว · ไม่ใช่อีเมล/เบอร์ (กันข้อมูลส่วนตัวหลุดเข้าสถิติ) */
export function cleanSearchTerm(v: unknown): string {
  const q = String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2 || /@/.test(q) || /\d{8,}/.test(q.replace(/[\s-]/g, ""))) return "";
  return q;
}

export interface SearchTermStat {
  q: string;
  hits: number;
  /** ผลลัพธ์ครั้งล่าสุด (0 = หาไม่เจอ) */
  lastResults: number;
  lastDay: string;
}

/** รวมคำค้นช่วง N วันล่าสุด — เรียงตามจำนวนครั้ง · notFound = เฉพาะที่ครั้งล่าสุดหาไม่เจอ */
export function aggregateTerms(rows: { q: string; day: string; hits: number; last_results: number }[], opts: { notFound?: boolean; limit?: number } = {}): SearchTermStat[] {
  const by = new Map<string, SearchTermStat>();
  for (const r of rows) {
    const cur = by.get(r.q);
    if (!cur) by.set(r.q, { q: r.q, hits: r.hits, lastResults: r.last_results, lastDay: r.day });
    else {
      cur.hits += r.hits;
      if (r.day > cur.lastDay) {
        cur.lastDay = r.day;
        cur.lastResults = r.last_results;
      }
    }
  }
  return [...by.values()]
    .filter((t) => !opts.notFound || t.lastResults === 0)
    .sort((a, b) => b.hits - a.hits || b.lastDay.localeCompare(a.lastDay))
    .slice(0, opts.limit ?? 50);
}

/**
 * 🔍 คำยอดนิยมของค้นหาเต็มจอ = คำที่ร้านตั้งก่อน แล้วต่อด้วยคำที่ลูกค้าค้นจริงบ่อย ๆ (≥ minHits ครั้งใน 30 วัน) และครั้งล่าสุดหาเจอ
 * ตัดซ้ำไม่สนตัวพิมพ์ · รวมสูงสุด max คำ · ไม่มีข้อมูลจริง = เฉพาะคำที่ร้านตั้ง (ไม่ใส่คำปลอม)
 */
export function mergePopularTerms(owner: string[], stats: SearchTermStat[], opts: { max?: number; minHits?: number } = {}): string[] {
  const max = opts.max ?? 10;
  const minHits = opts.minHits ?? 3;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (w: string) => {
    const k = w.trim().toLowerCase();
    if (!k || seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(w.trim());
  };
  owner.forEach(add);
  stats.filter((s) => s.lastResults > 0 && s.hits >= minHits).forEach((s) => add(s.q));
  return out;
}

export async function readSearchTerms(sb: Admin, shopId: string, days = 30, notFound = false): Promise<SearchTermStat[]> {
  const since = new Date(Date.now() - days * 864e5 + 7 * 3600e3).toISOString().slice(0, 10);
  const { data } = await sb.from("store_search_terms").select("q, day, hits, last_results").eq("shop_id", shopId).gte("day", since).limit(5000);
  return aggregateTerms((data ?? []) as { q: string; day: string; hits: number; last_results: number }[], { notFound, limit: 50 });
}
