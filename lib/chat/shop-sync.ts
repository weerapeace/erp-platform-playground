/**
 * ห้องแชทรวม — ดึงแชทจากร้านค้าออนไลน์ (Shopee / Lazada / TikTok) เข้าห้องแชท (server เท่านั้น)
 *   ร้านเหล่านี้ส่งแชทมาหาเราเองไม่ได้ (Lazada ต้องใบรับรองพิเศษ · Shopee ต้องสมัคร push แยก) → ระบบไปดึงเอง
 *   - ตอนหน้า /chat เปิดอยู่: หน้าเว็บขอ POST /api/chat/sync ทุก ~30 วิ (กันถี่: ร้านเดียวกันดึงห่างกันอย่างน้อย 25 วิ ไม่ว่ากี่คนเปิด)
 *   - ไม่มีใครเปิด: ตัวตั้งเวลา /api/cron/chat-sync ทุก 3 นาที (ให้กระดิ่งเด้งได้)
 *   - ร้านต้องติ๊ก "รับแชท" ในตั้งค่าห้องแชทก่อน (ChatSettings.shops) · ร้านต้องเชื่อมต่อที่หน้าบัญชีแพลตฟอร์มแล้ว
 *   จำว่าดึงถึงไหนแล้ว + สถานะล่าสุดของแต่ละร้าน: ui_config `chat_sync:<ช่องทาง>:<brand_id>` (ไม่ต้องมีตารางใหม่)
 *   ข้อความที่ร้านตอบเองนอก ERP ก็ดึงมาด้วย (direction "out") → ห้องเป็น "ตอบแล้ว"
 * ตัวดึงของแต่ละช่องทาง: lib/chat/{shopee,lazada,tiktok}-chat.ts · บันทึกผ่าน lib/chat/store ingestInbound ที่เดียว
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { isFreshForNotify, parseShopChatKey, shopChatKey } from "./rules";
import { loadChatSettings } from "./settings";
import { ingestInbound } from "./store";
import { SHOP_CHAT_CHANNELS, type ChatInbound, type ShopChatChannel, type ShopChatState, type ShopChatStatus } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

export type ShopRef = { channel: ShopChatChannel; brandId: string };

/** สิ่งที่จำไว้ต่อร้าน (ui_config) */
export type PullState = {
  /** ตำแหน่งที่ดึงถึง (แต่ละช่องทางใช้ของตัวเอง เช่น เวลาข้อความล่าสุด) */
  cursor?: Record<string, unknown>;
  last_run_at?: string;
  last_ok_at?: string | null;
  state?: ShopChatState;
  note?: string | null;
};

/** ผลการดึง 1 รอบของ 1 ร้าน */
export type PullResult = { events: ChatInbound[]; cursor: Record<string, unknown>; state: ShopChatState; note: string | null };

/** ตัวดึงของช่องทาง — ห้ามโยน error (คืน state "error" + note ภาษาคนแทน) */
export type ShopPuller = (admin: Admin, shop: ShopRef, cursor: Record<string, unknown>, ctx: { deadline: number; /** ผู้ตั้งค่ากด "ดึงตอนนี้" (ไม่ใช่รอบอัตโนมัติ) */ force: boolean }) => Promise<PullResult>;

export const SYNC_STATE_PREFIX = "chat_sync:";
export const syncStateKey = (s: ShopRef) => `${SYNC_STATE_PREFIX}${shopChatKey(s.channel, s.brandId)}`;

/** ดึงห่างกันอย่างน้อยเท่านี้ต่อร้าน (หน้าเว็บ) · ตัวตั้งเวลาใช้ค่าเดียวกัน */
export const MIN_PULL_GAP_MS = 25_000;

async function loadState(admin: Admin, s: ShopRef): Promise<PullState> {
  const { data } = await admin.from("ui_config").select("value").eq("key", syncStateKey(s)).maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return v && typeof v === "object" ? (v as PullState) : {};
}

async function saveState(admin: Admin, s: ShopRef, st: PullState): Promise<void> {
  await admin.from("ui_config").upsert({ key: syncStateKey(s), value: st, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** ตัวดึงของแต่ละช่องทาง (โหลดเมื่อใช้ — ไฟล์ช่องทางอื่นไม่ถูกโหลดถ้าไม่มีร้านเปิด) */
async function pullerFor(channel: ShopChatChannel): Promise<ShopPuller> {
  switch (channel) {
    case "shopee": return (await import("./shopee-chat")).pullShopeeChats;
    case "lazada": return (await import("./lazada-chat")).pullLazadaChats;
    case "tiktok": return (await import("./tiktok-chat")).pullTiktokChats;
  }
}

/** ร้านที่ติ๊ก "รับแชท" ไว้ */
export async function enabledShops(admin: Admin): Promise<ShopRef[]> {
  const s = await loadChatSettings(admin);
  return Object.entries(s.shops).filter(([, v]) => v.enabled)
    .map(([k]) => parseShopChatKey(k)).filter((x): x is ShopRef => !!x);
}

export type SyncSummary = { shops: number; pulled: number; saved: number; skipped: number; errors: string[] };

/**
 * ดึงแชททุกร้านที่เปิดรับ 1 รอบ · budgetMs = เวลาสูงสุด (เหลือไม่พอ = ร้านที่เหลือรอบหน้า)
 * force = ไม่สนช่วงห่าง (ปุ่ม "ดึงตอนนี้" ของผู้ตั้งค่า)
 */
export async function runShopChatSync(admin: Admin, opts: { budgetMs: number; force?: boolean; only?: ShopRef[] }): Promise<SyncSummary> {
  const deadline = Date.now() + opts.budgetMs;
  const shops = opts.only ?? await enabledShops(admin);
  const out: SyncSummary = { shops: shops.length, pulled: 0, saved: 0, skipped: 0, errors: [] };
  for (const shop of shops) {
    if (Date.now() > deadline - 3_000) { out.skipped++; continue; }
    const st = await loadState(admin, shop);
    const last = Date.parse(st.last_run_at ?? "");
    if (!opts.force && Number.isFinite(last) && Date.now() - last < MIN_PULL_GAP_MS) { out.skipped++; continue; }
    // จองรอบก่อนดึง (คำขอที่มาพร้อมกันจะเห็นว่าเพิ่งดึง แล้วข้าม)
    await saveState(admin, shop, { ...st, last_run_at: new Date().toISOString() });

    let r: PullResult;
    try { r = await (await pullerFor(shop.channel))(admin, shop, st.cursor ?? {}, { deadline, force: opts.force === true }); }
    catch (e) { r = { events: [], cursor: st.cursor ?? {}, state: "error", note: e instanceof Error ? e.message : "ดึงแชทไม่สำเร็จ" }; }

    let savedAll = true;
    for (const ev of r.events.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))) {   // เก่า → ใหม่ (สถานะห้องถูก)
      out.pulled++;
      const res = await ingestInbound(admin, ev, { brandId: shop.brandId, notify: isFreshForNotify(ev.sentAt) })
        .catch((e) => { console.error("[chat/shop-sync] ingest", shop.channel, e instanceof Error ? e.message : e); savedAll = false; return null; });
      if (res?.inserted) out.saved++;
    }
    if (r.state !== "ready" && r.state !== "manual_only" && r.note) out.errors.push(`${shop.channel}: ${r.note}`);
    // บันทึกไม่ครบ = ไม่ขยับตำแหน่ง (รอบหน้าดึงซ้ำ · ข้อความที่บันทึกแล้วไม่ซ้ำเพราะรหัสข้อความ)
    await saveState(admin, shop, {
      cursor: savedAll ? r.cursor : (st.cursor ?? {}),
      last_run_at: new Date().toISOString(),
      // manual_only (Lazada รอบอัตโนมัติ) ไม่ได้ดึงจริง → ไม่นับเป็น "ดึงสำเร็จล่าสุด"
      last_ok_at: r.state === "ready" ? new Date().toISOString() : (st.last_ok_at ?? null),
      state: r.state, note: r.note,
    });
  }
  return out;
}

// ---------------------------------------------------------------- สถานะร้าน (หน้าตั้งค่า + ป้ายในหน้าแชท)

const PF_CODE: Record<ShopChatChannel, string> = { shopee: "shopee", lazada: "lazada", tiktok: "tiktok" };

/** ร้านที่เชื่อมต่อแพลตฟอร์มไว้ทั้งหมด + เปิดรับแชทไหม + ดึงล่าสุดเป็นยังไง */
export async function listShopChatStatus(admin: Admin): Promise<ShopChatStatus[]> {
  const settings = await loadChatSettings(admin);
  const { data: pfs } = await admin.from("erp_platforms").select("id, code").in("code", Object.values(PF_CODE));
  const chOf = new Map<string, ShopChatChannel>();
  for (const p of (pfs ?? []) as { id: string; code: string }[]) {
    const ch = SHOP_CHAT_CHANNELS.find((c) => PF_CODE[c] === p.code);
    if (ch) chOf.set(p.id, ch);
  }
  if (chOf.size === 0) return [];
  // platform_credentials ไม่มี FK ไป brands (มีแค่ไป erp_platforms) → อ่านชื่อแบรนด์แยก
  const { data: creds } = await admin.from("platform_credentials").select("brand_id, platform_id, api_key, meta").in("platform_id", [...chOf.keys()]);
  const rows = ((creds ?? []) as unknown as { brand_id: string; platform_id: string; api_key: string | null; meta: Record<string, unknown> | null }[])
    .filter((r) => r.brand_id && chOf.has(r.platform_id));
  const brandIds = [...new Set(rows.map((r) => r.brand_id))];
  const { data: bs } = brandIds.length ? await admin.from("brands").select("id, name").in("id", brandIds) : { data: [] };
  const brandName = new Map(((bs ?? []) as { id: string; name: string | null }[]).map((b) => [b.id, b.name]));
  const keys = rows.map((r) => `${SYNC_STATE_PREFIX}${shopChatKey(chOf.get(r.platform_id)!, r.brand_id)}`);
  const { data: sts } = keys.length ? await admin.from("ui_config").select("key, value").in("key", keys) : { data: [] };
  const stOf = new Map(((sts ?? []) as { key: string; value: PullState }[]).map((r) => [r.key, r.value ?? {}]));

  const out: ShopChatStatus[] = [];
  for (const r of rows) {
    const channel = chOf.get(r.platform_id)!;
    const key = shopChatKey(channel, r.brand_id);
    const meta = r.meta ?? {};
    const connected = !!r.api_key && meta.stage === "connected";
    const rexp = Number(meta.refresh_expires_at ?? 0);
    const expired = connected && rexp > 0 && rexp < Date.now();
    const enabled = settings.shops[key]?.enabled === true;
    const st = stOf.get(`${SYNC_STATE_PREFIX}${key}`) ?? {};
    const state: ShopChatState = !connected ? "not_connected" : expired ? "expired" : !enabled ? "off" : (st.state ?? "ready");
    const note = !connected ? "ร้านยังไม่ได้เชื่อมต่อ — เชื่อมที่หน้า จัดการร้าน/บัญชีแพลตฟอร์ม"
      : expired ? "สิทธิ์ของร้านหมดอายุ — กดเชื่อมต่อใหม่ที่หน้า จัดการร้าน/บัญชีแพลตฟอร์ม"
        : !enabled ? null : (st.note ?? null);
    out.push({
      key, channel, brand_id: r.brand_id, brand_name: brandName.get(r.brand_id) ?? null,
      shop_name: (typeof meta.shop_name === "string" && meta.shop_name) || (typeof meta.seller_name === "string" && meta.seller_name) || null,
      enabled, state, note, last_ok_at: st.last_ok_at ?? null,
    });
  }
  return out.sort((a, b) => SHOP_CHAT_CHANNELS.indexOf(a.channel) - SHOP_CHAT_CHANNELS.indexOf(b.channel) || (a.brand_name ?? "").localeCompare(b.brand_name ?? ""));
}
