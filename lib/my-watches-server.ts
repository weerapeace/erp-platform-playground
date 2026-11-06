/**
 * ⭐ การเตือนของฉัน — ฝั่งเซิร์ฟเวอร์ (GET /api/my-watches)
 * ใช้ตัวคำนวณเดียวกับรายงาน/ป๊อปของทีม (buildReport) ดึง "ทุกใบที่ค้าง" ครั้งเดียว (จำ 60 วิ ใช้ร่วมทุกคน)
 * แล้วกรองตามเงื่อนไขของแต่ละคน (lib/my-watches watchMatches) — ไม่ประกอบรายงานแยกต่อคน
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { buildReport } from "@/lib/email-report/sources";
import type { PopupSourceItem } from "@/lib/email-report/render";
import { MY_WATCHES_KEY, parseMyWatches, watchLabel, watchMatches, watchSource, type MyWatch } from "@/lib/my-watches";

type Admin = ReturnType<typeof supabaseAdmin>;

export type WatchFact = { id: string; brand_id: string | null; urgent: boolean; stale: number; waitingCount: number };
export type WatchBrand = { id: string; name: string; count: number };
export type WatchItem = Pick<PopupSourceItem, "id" | "title" | "code" | "path" | "imageUrl" | "flag" | "brand" | "status">;
export type WatchResult = { id: string; source: string; label: string; count: number; items: WatchItem[] };
export type MyWatchesPayload = {
  /** แหล่งที่คนนี้มีสิทธิ์ — ข้อมูลย่อให้หน้าตั้งค่านับ "ตอนนี้ตรงกี่ใบ" ได้ทันที */
  sources: Record<string, { brands: WatchBrand[]; facts: WatchFact[] }>;
  watches: WatchResult[];
  /** ใบที่ตรงอย่างน้อย 1 การเตือน (ไม่นับซ้ำ) — ตัวเลขบนตัว Pet */
  unique: number;
};

const TTL = 60_000;
const ITEMS_PER_WATCH = 15;
let designCache: { at: number; items: PopupSourceItem[] } | null = null;

async function designItems(admin: Admin): Promise<PopupSourceItem[]> {
  if (designCache && Date.now() - designCache.at < TTL) return designCache.items;
  const built = await buildReport(admin, { source_key: "design_sheets_pending", filters: {}, options: {} });
  const items = built.popup?.items ?? [];
  designCache = { at: Date.now(), items };
  return items;
}

const factOf = (it: PopupSourceItem): WatchFact => ({
  id: it.id, brand_id: it.brand_id ?? null, urgent: it.urgent, stale: it.stale ?? 0, waitingCount: it.waiting.length,
});

export async function loadMyWatches(admin: Admin, userId: string, can: (perm: string) => Promise<boolean>): Promise<MyWatchesPayload> {
  const [{ data: prefRow }, canDesign] = await Promise.all([
    admin.from("user_ui_prefs").select("value").eq("user_id", userId).eq("key", MY_WATCHES_KEY).maybeSingle(),
    can(watchSource("design_pending")!.permission),
  ]);
  const pref = parseMyWatches((prefRow as { value?: unknown } | null)?.value);
  const out: MyWatchesPayload = { sources: {}, watches: [], unique: 0 };
  if (!canDesign) return out;

  const items = await designItems(admin);
  const brandMap = new Map<string, WatchBrand>();
  for (const it of items) {
    if (!it.brand_id) continue;
    const b = brandMap.get(it.brand_id) ?? { id: it.brand_id, name: it.brand ?? "—", count: 0 };
    b.count += 1;
    brandMap.set(it.brand_id, b);
  }
  const brands = [...brandMap.values()].sort((a, b) => b.count - a.count);
  out.sources.design_pending = { brands, facts: items.map(factOf) };

  const nameOf = (id: string) => brandMap.get(id)?.name;
  const matched = new Set<string>();
  for (const w of pref.list as MyWatch[]) {
    if (!w.on || w.source !== "design_pending") continue;
    const hit = items.filter((it) => watchMatches(w, factOf(it)));
    for (const it of hit) matched.add(it.id);
    out.watches.push({
      id: w.id, source: w.source, label: watchLabel(w, nameOf), count: hit.length,
      items: hit.slice(0, ITEMS_PER_WATCH).map((it) => ({ id: it.id, title: it.title, code: it.code, path: it.path, imageUrl: it.imageUrl, flag: it.flag, brand: it.brand, status: it.status })),
    });
  }
  out.unique = matched.size;
  return out;
}
