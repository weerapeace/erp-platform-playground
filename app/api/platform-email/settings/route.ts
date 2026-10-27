/**
 * ⚙️ ตั้งค่าดึงออเดอร์จากเมลแพลตฟอร์ม — /api/platform-email/settings
 * GET   (platform_orders.manage) → ค่าตั้ง (ไม่ส่งกุญแจจริง) + สถานะการเชื่อมต่อ + ตัวเลขสรุปกล่องเมล + รายชื่อแบรนด์
 * PATCH (platform_orders.manage) { enabled?, interval_min?, backfill_days?, search_query?, shops? }
 * POST  (admin.users)            { action: "rotate_key" }  → สร้างกุญแจใหม่ (สคริปต์เดิมใช้ไม่ได้ทันที)
 *                                { action: "script" }      → สคริปต์ Gmail พร้อมกุญแจ (ยังไม่มีกุญแจ = สร้างให้)
 * ทุกการเปลี่ยน → audit_logs (entity_type = platform_email_settings)
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { absoluteUrl } from "@/lib/app-url";
import { buildAppsScript } from "@/lib/platform-email/apps-script";
import { DEFAULT_SEARCH_QUERY, loadEmailSettings, type ShopRule } from "@/lib/platform-email/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const INTERVALS = [5, 10, 15, 30, 60];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const endpoint = () => absoluteUrl("/api/platform-email/inbound") as string;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const admin = supabaseAdmin();
  const s = await loadEmailSettings(admin);
  const inbox = async (status: string) =>
    (await admin.from("platform_email_inbox").select("id", { count: "exact", head: true }).eq("status", status)).count ?? 0;
  const [done, ignored, unreadable, attention, pending, emailOrders, brands, canAdmin] = await Promise.all([
    inbox("done"), inbox("ignored"), inbox("unreadable"), inbox("attention"),
    admin.from("platform_order_items").select("id", { count: "exact", head: true }).is("matched_sku_id", null).eq("raw->>source", "email").then((r) => r.count ?? 0),
    admin.from("platform_orders").select("id", { count: "exact", head: true }).eq("source", "email").then((r) => r.count ?? 0),
    admin.from("brands").select("id, name").order("name").then((r) => (r.data ?? []) as { id: string; name: string }[]),
    apiCan(request, "admin.users"),
  ]);
  return NextResponse.json({
    settings: {
      enabled: s.enabled !== false,
      interval_min: Number(s.interval_min ?? 15),
      backfill_days: Number(s.backfill_days ?? 60),
      search_query: (s.search_query as string | null) ?? null,
      default_query: DEFAULT_SEARCH_QUERY,
      shops: s.shops,
      has_key: !!s.inbound_key_enc,
      key_last4: (s.key_last4 as string | null) ?? null,
      last_ping_at: (s.last_ping_at as string | null) ?? null,
      last_received_at: (s.last_received_at as string | null) ?? null,
      updated_at: (s.updated_at as string | null) ?? null,
    },
    endpoint: endpoint(),
    counts: { done, ignored, unreadable, attention, pending_items: pending, email_orders: emailOrders },
    brands,
    can_admin: canAdmin,
    error: null,
  });
}

function cleanShops(v: unknown): ShopRule[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, 30).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const platform = ["shopee", "lazada"].includes(String(o.platform)) ? String(o.platform) : null;
    const brand = typeof o.brand_id === "string" && UUID.test(o.brand_id) ? o.brand_id : null;
    return { platform, match: String(o.match ?? "").trim().slice(0, 100), brand_id: brand };
  }).filter((r) => r.match);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.interval_min != null) {
    const n = Number(body.interval_min);
    if (!INTERVALS.includes(n)) return NextResponse.json({ error: "ความถี่ต้องเป็น 5, 10, 15, 30 หรือ 60 นาที" }, { status: 400 });
    patch.interval_min = n;
  }
  if (body.backfill_days != null) {
    const n = Math.round(Number(body.backfill_days));
    if (!(n >= 1 && n <= 365)) return NextResponse.json({ error: "ดึงย้อนหลังได้ 1–365 วัน" }, { status: 400 });
    patch.backfill_days = n;
  }
  if ("search_query" in body) {
    const q = String(body.search_query ?? "").trim();
    if (q.length > 300) return NextResponse.json({ error: "คำค้นยาวเกินไป" }, { status: 400 });
    patch.search_query = q || null;
  }
  if ("shops" in body) {
    const shops = cleanShops(body.shops);
    if (!shops) return NextResponse.json({ error: "รายการร้านไม่ถูกต้อง" }, { status: 400 });
    patch.shops = shops;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const before = await loadEmailSettings(admin);
  const { error } = await admin.from("platform_email_settings").update({ ...patch, updated_by: actor.id, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const changes = Object.fromEntries(Object.keys(patch).map((k) => [k, { from: before[k] ?? null, to: patch[k] }]));
  await writeAudit(admin, { action: "update", entityType: "platform_email_settings", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { changes } });
  return NextResponse.json({ ok: true, error: null });
}

async function newKey(admin: ReturnType<typeof supabaseAdmin>, actorId: string | null): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  const enc = await encryptSecret(key);
  const { error } = await admin.from("platform_email_settings")
    .update({ inbound_key_enc: enc, key_last4: key.slice(-4), updated_by: actorId, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error("บันทึกกุญแจไม่สำเร็จ");
  return key;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  let body: { action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    if (body.action === "rotate_key") {
      const key = await newKey(admin, actor.id);
      await writeAudit(admin, { action: "rotate_key", entityType: "platform_email_settings", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { key_last4: key.slice(-4) } });
      return NextResponse.json({ ok: true, key_last4: key.slice(-4), error: null });
    }
    if (body.action === "script") {
      const s = await loadEmailSettings(admin);
      let key = "";
      if (s.inbound_key_enc) key = await decryptSecret(String(s.inbound_key_enc));
      if (!key) key = await newKey(admin, actor.id);
      const script = buildAppsScript({
        endpoint: endpoint(), key,
        searchQuery: (s.search_query as string | null) || DEFAULT_SEARCH_QUERY,
        intervalMin: Number(s.interval_min ?? 15), backfillDays: Number(s.backfill_days ?? 60),
        generatedAt: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false }),
      });
      await writeAudit(admin, { action: "view_secret", entityType: "platform_email_settings", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { what: "apps_script", key_last4: key.slice(-4) } });
      return NextResponse.json({ ok: true, script, key_last4: key.slice(-4), error: null });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ทำไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
