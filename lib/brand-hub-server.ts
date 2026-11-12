/**
 * หน้าแบรนด์ (/brand-hub) ฝั่ง server — นับตัวเลขต่อแบรนด์จากแถวจริง (อ่านอย่างเดียว)
 * ใช้: GET /api/brand-hub (การ์ดทุกแบรนด์) · GET /api/brand-hub?brand_id= (หน้าจัดการแบรนด์)
 * กติกา/ชนิดข้อมูล = lib/brand-hub (pure + เทสต์) · การ์ดทุกแบรนด์ใช้ตัวนับเดียวกับหน้าเลือกแบรนด์ของหน้าร้าน (loadBrandSummaries)
 *
 * ความเร็ว: นับแบบ head (ไม่ดึงแถว) เป็นหลัก · ที่ต้องดึงแถว = เฉพาะคอลัมน์สั้น ๆ ของแบรนด์เดียว (ไม่แตะ raw)
 * ห้ามส่งกุญแจร้าน (api_key / token) ออกไปหน้าเว็บ — แปลงเป็น HubCredLite ก่อนเสมอ
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { SELLING_PLATFORMS } from "@/lib/selling-platforms";
import { REPORT_ONLY_SOURCES } from "@/lib/platform-order-status";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadBrandSummaries } from "@/lib/platform-shop-view-server";
import {
  HUB_CHANNELS, buildHubTodos, hubConnState,
  type HubBrandCard, type HubChannel, type HubCounts, type HubCredLite, type HubDetail,
} from "@/lib/brand-hub";

type Admin = ReturnType<typeof supabaseAdmin>;
type CredRow = { brand_id: string | null; platform_id: string; api_key: string | null; meta: Record<string, unknown> | null };

/** แถวกุญแจ → สรุปสั้น (ไม่มีกุญแจ) */
function credLite(r: CredRow): HubCredLite {
  const m = r.meta ?? {};
  const rx = Number(m.refresh_expires_at);
  return { has_key: !!r.api_key, stage: typeof m.stage === "string" ? m.stage : null, refresh_expires_at: Number.isFinite(rx) && rx > 0 ? rx : null };
}

/** platform_id ↔ code ของช่องทางบนหน้าแบรนด์ */
async function loadPlatforms(admin: Admin): Promise<{ id: string; code: string }[]> {
  const codes = [...new Set([...SELLING_PLATFORMS, ...HUB_CHANNELS.map((c) => c.code)])];
  const { data } = await admin.from("erp_platforms").select("id, code").in("code", codes);
  return (data ?? []) as { id: string; code: string }[];
}

/** การ์ดทุกแบรนด์ (หน้าเลือกแบรนด์) — ตัวเลขสินค้า/รายการบนร้านจากตัวนับกลาง + ช่องทางที่เชื่อมแล้ว */
export async function loadHubBrandCards(admin: Admin): Promise<HubBrandCard[]> {
  const [{ brands }, pfs, { data: creds }] = await Promise.all([
    loadBrandSummaries(admin, SELLING_PLATFORMS),
    loadPlatforms(admin),
    admin.from("platform_credentials").select("brand_id, platform_id, api_key, meta"),
  ]);
  const codeOf = new Map(pfs.map((p) => [p.id, p.code]));
  const connected = new Map<string, Set<string>>();
  for (const r of (creds ?? []) as CredRow[]) {
    const code = codeOf.get(r.platform_id);
    if (!r.brand_id || !code || !HUB_CHANNELS.some((c) => c.code === code)) continue;
    if (hubConnState(code, credLite(r), 0) !== "connected") continue;
    const s = connected.get(r.brand_id) ?? new Set<string>();
    s.add(code); connected.set(r.brand_id, s);
  }
  return brands.map((b) => ({
    id: b.id, name: b.name, logo_key: b.logo_key, color: b.color,
    parents: b.parents, listings: Object.values(b.listings).reduce((s, n) => s + n, 0),
    connected: HUB_CHANNELS.map((c) => c.code).filter((c) => connected.get(b.id)?.has(c)),
  }));
}

/** หน้าจัดการแบรนด์ 1 แบรนด์ — ช่องทาง + ตัวเลขงานที่ต้องทำ (null = ไม่พบแบรนด์) */
export async function loadHubDetail(admin: Admin, brandId: string): Promise<HubDetail | null> {
  const { data: brand } = await admin.from("brands").select("id, name, logo_url, color").eq("id", brandId).maybeSingle();
  if (!brand) return null;
  const b = brand as { id: string; name: string | null; logo_url: string | null; color: string | null };

  const headCount = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const parentsBase = () => admin.from("parent_skus_v2").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("is_active", true);
  const reportOnly = REPORT_ONLY_SOURCES.map((s) => `source.neq.${s}`).join(",");

  const [pfs, { data: creds }, parentIds, listings, parents, centralSet, noCover, ordersToShip] = await Promise.all([
    loadPlatforms(admin),
    admin.from("platform_credentials").select("brand_id, platform_id, api_key, meta").eq("brand_id", brandId),
    fetchAllPages<{ id: string }>((from, to) => admin.from("parent_skus_v2").select("id").eq("brand_id", brandId).eq("is_active", true)
      .order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { id: string }[] | null; error: unknown }>, { strict: true }),
    // รายการบนร้านของแบรนด์ — คอลัมน์สั้น ๆ (รวมตัวที่ไม่อยู่บนร้านแล้ว เพื่อนับรอล้าง)
    fetchAllPages<{ platform_id: string; matched_parent_sku_id: string | null; match_ignored: boolean | null; status: string | null }>((from, to) =>
      admin.from("platform_catalog_listings").select("platform_id, matched_parent_sku_id, match_ignored, status").eq("brand_id", brandId)
        .order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { platform_id: string; matched_parent_sku_id: string | null; match_ignored: boolean | null; status: string | null }[] | null; error: unknown }>, { strict: true }),
    headCount(parentsBase()),
    headCount(parentsBase().not("platform_category_id", "is", null)),
    headCount(parentsBase().is("cover_image_r2_key", null)),
    // กฎเดียวกับ needsAction: new/confirmed/packed · ไม่นับออเดอร์จากเมล · ไม่นับที่ผู้ซื้อยังไม่จ่าย/ร้านพักไว้
    headCount(admin.from("platform_orders").select("id", { count: "exact", head: true }).eq("brand_id", brandId)
      .in("status", ["new", "confirmed", "packed"])
      .or(`source.is.null,${reportOnly}`)
      .or("platform_status.is.null,platform_status.not.in.(UNPAID,ON_HOLD)")),
  ]);

  const codeOf = new Map(pfs.map((p) => [p.id, p.code]));
  const perCode: Record<string, number> = {};
  const matched = new Set<string>();
  let unmatched = 0, gone = 0;
  for (const l of listings) {
    if (isGoneStatus(l.status)) { gone++; continue; }
    const code = codeOf.get(l.platform_id);
    if (code) perCode[code] = (perCode[code] ?? 0) + 1;
    if (l.matched_parent_sku_id) matched.add(l.matched_parent_sku_id);
    else if (!l.match_ignored) unmatched++;
  }
  const notListed = parentIds.filter((p) => !matched.has(p.id)).length;

  const credBy = new Map<string, HubCredLite>();
  for (const r of (creds ?? []) as CredRow[]) {
    const code = codeOf.get(r.platform_id);
    if (code) credBy.set(code, credLite(r));
  }
  const channels: HubChannel[] = HUB_CHANNELS.map((c) => ({
    code: c.code, label: c.label, selling: c.selling,
    listings: perCode[c.code] ?? 0,
    state: hubConnState(c.code, credBy.get(c.code), perCode[c.code] ?? 0),
  }));

  const counts: HubCounts = {
    orders_to_ship: ordersToShip, unmatched, not_listed: notListed, gone,
    no_cover: noCover, no_category: Math.max(0, parents - centralSet),
  };
  return {
    id: b.id, name: b.name ?? "—", logo_key: b.logo_url, color: b.color,
    parents, listings: Object.values(perCode).reduce((s, n) => s + n, 0), central_set: centralSet,
    connected: channels.filter((c) => c.state === "connected").map((c) => c.code),
    channels, counts, todos: buildHubTodos(b.id, counts),
  };
}

