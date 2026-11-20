/**
 * 📡 สถานะการดึงออเดอร์ — ฝั่งเซิร์ฟเวอร์ (จดผลรอบ · รวมข้อมูลหน้าสถานะ · ส่งกระดิ่งเตือน)
 * กติกาตัดสินสถานะ = lib/order-pull-health (pure) · หน้า /master/platform-orders/pull-status · API /api/platform-orders/pull-status
 * เก็บผลรอบใน ui_config `order_pull:<platform>:<brand>` แถวเดียวต่อร้าน (แบบเดียวกับ recordWorkerRun ของออฟฟิศทีม AI — ไม่มีตารางใหม่)
 * ไม่ throw — จด/เตือนไม่สำเร็จต้องไม่ทำให้รอบดึงออเดอร์ล้ม
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { workerRunKey, type WorkerRun } from "@/lib/ai-office";
import { ruleRecipients } from "@/lib/notify-recipients";
import {
  alertDue, pullAlerts, pullRunKey, shopPullHealth, PULL_RUN_PREFIX,
  type PullPlatform, type PullRun, type ShopPullHealth, type ShopPullInput,
} from "@/lib/order-pull-health";

export const PULL_ALERT_EVENT = "orders.pull_problem";
const ALERTS_KEY = "order_pull_alerts";
export const PULL_STATUS_PATH = "/master/platform-orders/pull-status";

/** จดผลรอบดึงของ 1 ร้าน (นับรอบล้มติดกัน) */
export async function recordShopPull(admin: SupabaseClient, platform: PullPlatform, brandId: string | null, r: { ok: boolean; created?: number; updated?: number; error?: string | null; manual?: boolean }): Promise<void> {
  try {
    const key = pullRunKey(platform, brandId);
    const { data } = await admin.from("ui_config").select("value").eq("key", key).maybeSingle();
    const prev = ((data as { value?: PullRun } | null)?.value ?? null) as PullRun | null;
    const at = new Date().toISOString();
    const value: PullRun = {
      at, ok: r.ok, created: r.created ?? 0, updated: r.updated ?? 0,
      ...(r.error ? { error: String(r.error).slice(0, 300) } : {}),
      ...(r.manual ? { manual: true } : {}),
      last_ok_at: r.ok ? at : prev?.last_ok_at ?? null,
      fails: r.ok ? 0 : (prev?.fails ?? 0) + 1,
    };
    const { error } = await admin.from("ui_config").upsert({ key, value, updated_at: at }, { onConflict: "key" });
    if (error) console.error("[order-pull] record", key, error.message);
  } catch (e) {
    console.error("[order-pull] record", platform, e instanceof Error ? e.message : e);
  }
}

const PLATFORM_LABEL: Record<PullPlatform, string> = { shopee: "Shopee", tiktok: "TikTok", lazada: "Lazada", line_shopping: "LINE SHOPPING", website: "เว็บไซต์" };

type Cred = { brand_id: string; platform_id: string; api_key: string | null; meta: Record<string, unknown> | null };
export type PullShopInput = ShopPullInput & { label: string; platform_id: string; brand_name: string | null; shop_name: string | null };

const ms = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** ร้านทั้งหมดที่ควรโชว์ + ทางดึง + ผลรอบล่าสุด (ไม่นับออเดอร์ — เบาพอเรียกทุกรอบ 15 นาที) */
export async function loadPullInputs(admin: SupabaseClient): Promise<{ shops: PullShopInput[]; email: { enabled: boolean; last_at: string | null } }> {
  const [pf, creds, accts, brands, runs, email] = await Promise.all([
    admin.from("erp_platforms").select("id, code"),
    admin.from("platform_credentials").select("brand_id, platform_id, api_key, meta"),
    admin.from("platform_accounts").select("brand_id, platform_id, label, is_active"),
    admin.from("brands").select("id, name"),
    admin.from("ui_config").select("key, value").like("key", `${PULL_RUN_PREFIX}%`),
    admin.from("platform_email_settings").select("enabled, last_received_at, shops").eq("id", 1).maybeSingle(),
  ]);
  const idOf = new Map(((pf.data ?? []) as { id: string; code: string }[]).map((p) => [p.code, p.id]));
  const brandName = new Map(((brands.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const runOf = new Map(((runs.data ?? []) as { key: string; value: PullRun }[]).map((r) => [r.key, r.value]));
  const em = (email.data ?? null) as { enabled?: boolean; last_received_at?: string | null; shops?: { platform: string; brand_id: string }[] } | null;
  const emailRules = new Set((em?.shops ?? []).map((s) => `${s.platform}:${s.brand_id}`));

  const shops: PullShopInput[] = [];
  for (const platform of ["shopee", "lazada", "tiktok", "line_shopping"] as const) {
    const platformId = idOf.get(platform);
    if (!platformId) continue;
    const cs = ((creds.data ?? []) as Cred[]).filter((c) => c.platform_id === platformId);
    const as = ((accts.data ?? []) as { brand_id: string; platform_id: string; label: string | null; is_active: boolean }[]).filter((a) => a.platform_id === platformId);
    const brandIds = [...new Set([...cs.map((c) => c.brand_id), ...as.filter((a) => a.is_active).map((a) => a.brand_id)])];
    for (const brandId of brandIds) {
      const c = cs.find((x) => x.brand_id === brandId);
      const meta = (c?.meta ?? {}) as Record<string, unknown>;
      const connected = platform === "line_shopping" ? !!c?.api_key : meta.stage === "connected";
      const mode: ShopPullInput["mode"] = connected ? "api" : emailRules.has(`${platform}:${brandId}`) ? "email" : "none";
      // วันที่ต้องต่อร้านใหม่: Lazada = refresh token (ไม่ยืดอายุ) · Shopee = อายุการอนุญาต (refresh ยืดเองทุกวัน) · TikTok = refresh token
      const tokenExp = !connected ? null
        : platform === "lazada" ? ms(meta.refresh_expires_at)
        : platform === "shopee" ? ms(meta.auth_expires_at)
        : platform === "tiktok" ? ms(meta.refresh_expires_at)
        : null;
      const shopName = String(meta.shop_name ?? meta.seller_name ?? meta.short_code ?? as.find((a) => a.brand_id === brandId)?.label ?? "") || null;
      shops.push({
        platform, brand_id: brandId, platform_id: platformId, mode, run: runOf.get(pullRunKey(platform, brandId)) ?? null,
        token_expires_at: tokenExp, email_last_at: em?.last_received_at ?? null,
        brand_name: brandName.get(brandId) ?? null, shop_name: shopName,
        label: `${PLATFORM_LABEL[platform]} · ${brandName.get(brandId) ?? "ไม่ระบุแบรนด์"}`,
      });
    }
  }
  const webId = idOf.get("website");
  if (webId) shops.push({ platform: "website", brand_id: null, platform_id: webId, mode: "direct", run: runOf.get(pullRunKey("website", null)) ?? null, token_expires_at: null, brand_name: null, shop_name: "ทุกร้านเว็บไซต์", label: "เว็บไซต์ (ทุกร้าน)" });
  return { shops, email: { enabled: em?.enabled !== false, last_at: em?.last_received_at ?? null } };
}

export type PullBoardShop = PullShopInput & ShopPullHealth & { last_order_at: string | null; last_insert_at: string | null; orders_7d: number; orders_total: number };
export type PullBoard = {
  now: string; shops: PullBoardShop[]; email: { enabled: boolean; last_at: string | null };
  round: { last_at: string | null; ok: boolean | null; summary: string | null; next_at: string | null };
};

/** ข้อมูลหน้าสถานะ: ทางดึง + สถานะ + ออเดอร์ล่าสุด/7 วัน ต่อร้าน */
export async function loadPullBoard(admin: SupabaseClient, now = Date.now()): Promise<PullBoard> {
  const [{ shops, email }, round] = await Promise.all([
    loadPullInputs(admin),
    admin.from("ui_config").select("value").eq("key", workerRunKey("tiktok-orders")).maybeSingle(),
  ]);
  const since7 = new Date(now - 7 * 86_400_000).toISOString();
  const rows = await Promise.all(shops.map(async (s) => {
    const base = () => {
      let q = admin.from("platform_orders").select("ordered_at, created_at", { count: "exact" }).eq("platform_id", s.platform_id);
      if (s.brand_id) q = q.eq("brand_id", s.brand_id);
      return q;
    };
    const base7 = () => {
      let q = admin.from("platform_orders").select("id", { count: "exact", head: true }).eq("platform_id", s.platform_id).gte("created_at", since7);
      if (s.brand_id) q = q.eq("brand_id", s.brand_id);
      if (s.platform === "website") q = q.eq("source", "webshop");
      return q;
    };
    const lastQ = s.platform === "website" ? base().eq("source", "webshop") : base();
    const [last, ins, c7] = await Promise.all([
      lastQ.not("ordered_at", "is", null).order("ordered_at", { ascending: false }).limit(1),
      (s.platform === "website" ? base().eq("source", "webshop") : base()).order("created_at", { ascending: false }).limit(1),
      base7(),
    ]);
    const l = ((last.data ?? []) as { ordered_at: string | null }[])[0];
    const i = ((ins.data ?? []) as { created_at: string }[])[0];
    return { ...s, ...shopPullHealth(s, now), last_order_at: l?.ordered_at ?? null, last_insert_at: i?.created_at ?? null, orders_7d: c7.count ?? 0, orders_total: last.count ?? 0 };
  }));
  const run = ((round.data as { value?: WorkerRun } | null)?.value ?? null) as WorkerRun | null;
  const next = run?.at ? new Date(Math.ceil((Date.parse(run.at) + 60_000) / 900_000) * 900_000).toISOString() : null;
  return { now: new Date(now).toISOString(), shops: rows, email, round: { last_at: run?.at ?? null, ok: run?.ok ?? null, summary: run?.summary ?? null, next_at: next } };
}

/**
 * ตัวดึงออเดอร์ทุก 15 นาทียังทำงานไหม — เรียกจากตัวตั้งเวลาอีกระบบ (/api/cron/lazada-token · Vercel cron 07:30)
 * เงียบเกิน 60 นาที = เด้งกระดิ่ง (ตัวดึงเตือนตัวเองไม่ได้ถ้ามันหยุด)
 */
export async function checkPullerAlive(admin: SupabaseClient, now = Date.now()): Promise<boolean> {
  try {
    const { data } = await admin.from("ui_config").select("value").eq("key", workerRunKey("tiktok-orders")).maybeSingle();
    const at = ((data as { value?: WorkerRun } | null)?.value?.at) ?? null;
    const t = at ? Date.parse(at) : NaN;
    if (Number.isFinite(t) && now - t <= 60 * 60_000) return true;
    const mins = Number.isFinite(t) ? Math.round((now - t) / 60_000) : null;
    await sendAlerts(admin, [{ key: "puller:dead", title: "ตัวดึงออเดอร์อัตโนมัติหยุดทำงาน", body: mins == null ? "ยังไม่เคยมีรอบดึงที่บันทึกไว้ — แจ้งทีมพัฒนาตรวจตัวตั้งเวลา tiktok-orders-every-15min ใน Supabase" : `รอบล่าสุด ${mins} นาทีก่อน (ปกติทุก 15 นาที) — ออเดอร์ทุกร้านหยุดเข้า แจ้งทีมพัฒนาตรวจตัวตั้งเวลาใน Supabase` }], now);
    return false;
  } catch (e) {
    console.error("[order-pull] alive", e instanceof Error ? e.message : e);
    return true;
  }
}

/** เด้งกระดิ่งเรื่องที่ร้านมีปัญหา (เรื่องเดิมวันละครั้ง) · คืนจำนวนเรื่องที่ส่ง */
export async function sendPullAlerts(admin: SupabaseClient, shops: PullShopInput[], now = Date.now()): Promise<number> {
  return sendAlerts(admin, pullAlerts(shops, now), now);
}

async function sendAlerts(admin: SupabaseClient, alerts: { key: string; title: string; body: string }[], now: number): Promise<number> {
  try {
    if (!alerts.length) return 0;
    const { data } = await admin.from("ui_config").select("value").eq("key", ALERTS_KEY).maybeSingle();
    const sent = { ...(((data as { value?: Record<string, string> } | null)?.value) ?? {}) };
    const due = alerts.filter((a) => alertDue(sent[a.key], now));
    if (!due.length) return 0;
    const { ids } = await ruleRecipients(admin, PULL_ALERT_EVENT);   // ปิดกฎ = ids ว่าง → ไม่ส่ง
    if (!ids.length) return 0;
    let n = 0;
    for (const a of due) {
      const { error } = await admin.rpc("erp_notify", {
        p_user_ids: ids, p_event_type: PULL_ALERT_EVENT, p_title: a.title, p_body: a.body,
        p_link_url: PULL_STATUS_PATH, p_entity_type: "order_pull", p_entity_id: null, p_priority: "high",
      });
      if (error) { console.error("[order-pull] erp_notify", error.message); continue; }
      sent[a.key] = new Date(now).toISOString(); n++;
    }
    if (n) await admin.from("ui_config").upsert({ key: ALERTS_KEY, value: sent, updated_at: new Date(now).toISOString() }, { onConflict: "key" });
    return n;
  } catch (e) {
    console.error("[order-pull] alerts", e instanceof Error ? e.message : e);
    return 0;
  }
}
