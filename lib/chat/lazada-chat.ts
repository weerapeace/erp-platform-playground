/**
 * ห้องแชทรวม — ตัวต่อ Lazada (server เท่านั้น) · IM API
 *   ⚠️ กติกา Lazada (คู่มือ IM Open API): **ห้ามดึง /im/session/list หรือ /im/message/list เป็นรอบ ๆ** — แอปที่ดึงถี่จะถูกถอนสิทธิ์แชท
 *      ข้อความใหม่ต้องรับทาง push แต่ push ต้องใช้โดเมนใบรับรองแบบ OV/EV (เว็บเราบน Vercel เป็นแบบ DV) → ยังรับอัตโนมัติไม่ได้
 *      → ตัวนี้ "ไม่ดึงเองในรอบอัตโนมัติ" · ดึงเฉพาะตอนผู้ตั้งค่ากด "ดึงตอนนี้ / ทดสอบสิทธิ์" (ห่างกันอย่างน้อย 15 นาที)
 *   แอปต้องเป็นหมวด In-house IM Chat (แอปสินค้า/ออเดอร์เดิมเป็นคนละหมวด) — ไม่มีสิทธิ์ = สถานะ "รอสิทธิ์แชท"
 *   ส่ง: ข้อความ (template 1) · การ์ดสินค้า (template 10006 · item_id จากรายการบนร้าน — ไม่มี = ชื่อ+ลิงก์เป็นข้อความ) · ยังไม่ส่งรูป (Lazada ไม่มีที่ฝากรูปแชท)
 *   อ่านแล้ว: /im/session/read
 * กุญแจร้าน: app/api/lazada/shared lazTokenOrReason · เรียก API: lib/lazada lazApiGet / lazApiPost
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { lazApiGet, lazApiPost, lazErrorText } from "@/lib/lazada";
import { lazTokenOrReason } from "@/app/api/lazada/shared";
import { isChatPermissionError, lazadaMessageOf, lazadaSessionOf, toInbound, type LazadaSessionRow } from "./shop-parse";
import { platformIdOf, storeRemoteImage } from "./shop-common";
import type { PullResult, ShopPuller } from "./shop-sync";
import type { ChatChannelAdapter } from "./registry";
import type { ChatInbound } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type Obj = Record<string, unknown>;

const MANUAL_GAP_MS = 15 * 60_000;
const BACKFILL_MS = 3 * 86_400_000;

export const LAZ_NO_IM = "แอป Lazada ยังไม่มีสิทธิ์แชท — สมัครแอปหมวด In-house IM Chat ที่ open.lazada.com (แอปสินค้า/ออเดอร์เดิมใช้แชทไม่ได้) · ดูเช็กลิสต์ B ใน docs/chat-inbox.md";
export const LAZ_NO_AUTO = "Lazada ไม่อนุญาตให้ระบบดึงแชทเองเป็นรอบ ๆ — แชทใหม่จะเข้าอัตโนมัติเมื่อมีช่องรับ push (ต้องใช้ใบรับรองโดเมนแบบ OV/EV) · ตอนนี้กด \"ดึงตอนนี้\" ในตั้งค่าห้องแชทได้ (ทุก 15 นาที)";

async function tokenFor(admin: Admin, brandId: string) {
  const pf = await platformIdOf(admin, "lazada");
  if (!pf) return { ok: false as const, reason: "ไม่พบแพลตฟอร์ม Lazada ในระบบ" };
  return lazTokenOrReason(admin, brandId, pf, null);
}

const failState = (e: unknown): Pick<PullResult, "state" | "note"> => {
  const code = String((e as { code?: unknown })?.code ?? "");
  const msg = String((e as Error)?.message ?? "");
  if (isChatPermissionError("lazada", code, msg)) return { state: "no_permission", note: LAZ_NO_IM };
  return { state: "error", note: lazErrorText(e) };
};

const data = (j: Obj): Obj => (j.data && typeof j.data === "object" ? (j.data as Obj) : {});

export const pullLazadaChats: ShopPuller = async (admin, shop, cursor, ctx) => {
  const keep = { events: [] as ChatInbound[], cursor };
  const lastManual = Number(cursor.manual_at) || 0;
  // รอบอัตโนมัติ = ไม่เรียก Lazada (กติกา) · สถานะคงตามผลการกดครั้งล่าสุด
  if (!ctx.force || Date.now() - lastManual < MANUAL_GAP_MS) {
    const prev = cursor.state === "no_permission" ? "no_permission" : "ready";
    return { ...keep, state: prev, note: prev === "no_permission" ? LAZ_NO_IM : ctx.force ? "เพิ่งดึงไปไม่ถึง 15 นาที — ลองใหม่ทีหลัง (กติกา Lazada)" : LAZ_NO_AUTO };
  }
  const t = await tokenFor(admin, shop.brandId);
  if (!t.ok) return { ...keep, state: /หมดอายุ/.test(t.reason) ? "expired" : "error", note: t.reason };
  const sinceMs = Number(cursor.ms) > 0 ? Number(cursor.ms) : Date.now() - BACKFILL_MS;
  const mark = { ...cursor, manual_at: Date.now() };

  const sessions: LazadaSessionRow[] = [];
  try {
    let start = String(Date.now());
    let lastId = "";
    for (let page = 0; page < 3; page++) {
      const d = data(await lazApiGet(t.gateway, "/im/session/list", t.accessToken, { start_time: start, page_size: "20", ...(lastId ? { last_session_id: lastId } : {}) }));
      const rows = (Array.isArray(d.session_list) ? d.session_list : []).map((s) => lazadaSessionOf(s as Obj)).filter((s): s is LazadaSessionRow => !!s);
      let older = false;
      for (const s of rows) { if (s.lastMs > sinceMs) sessions.push(s); else older = true; }
      if (older || d.has_more !== true) break;
      start = String(d.next_start_time ?? ""); lastId = String(d.last_session_id ?? "");
      if (!start) break;
    }
  } catch (e) { const f = failState(e); return { events: [], cursor: { ...mark, state: f.state }, ...f }; }

  const events: ChatInbound[] = [];
  let doneMs = sinceMs;
  for (const s of sessions.slice(0, 20).reverse()) {
    if (Date.now() > ctx.deadline - 4_000) break;
    try {
      const d = data(await lazApiGet(t.gateway, "/im/message/list", t.accessToken, { session_id: s.id, start_time: String(Date.now()), page_size: "20" }));
      for (const m of (Array.isArray(d.message_list) ? d.message_list : []) as Obj[]) {
        const p = lazadaMessageOf(m, s.id);
        if (!p || p.skip || Date.parse(p.sentAt) < sinceMs - 60_000) continue;
        const imageKey = p.remoteImage ? await storeRemoteImage("lazada", p.remoteImage) : null;
        events.push(toInbound(p, shop.brandId, { imageKey, profile: { name: s.name, avatar: s.avatar }, convMeta: { buyer_id: s.buyerId } }));
      }
    } catch { break; }
    if (s.lastMs > doneMs) doneMs = s.lastMs;
  }
  return { events, cursor: { ...mark, ms: doneMs, state: "ready" }, state: "ready", note: `ดึงล่าสุดเมื่อกดดึงเอง · ${LAZ_NO_AUTO}` };
};

export const lazadaChatAdapter: ChatChannelAdapter = {
  supports: { image: false, product: true },
  async send(admin, conv, req) {
    const t = await tokenFor(admin, conv.account_ref);
    if (!t.ok) return { ok: false, via: null, error: t.reason };
    let lastId: string | null = null;
    const send = async (biz: Record<string, string>) => {
      const d = data(await lazApiPost(t.gateway, "/im/message/send", t.accessToken, { session_id: conv.external_id, ...biz }));
      lastId = d.message_id != null ? String(d.message_id) : lastId;
    };
    try {
      if (req.product) {
        const itemId = req.product.listing_id && /^\d+$/.test(req.product.listing_id) ? req.product.listing_id : null;
        if (itemId) await send({ template_id: "10006", item_id: itemId });
        else await send({ template_id: "1", txt: [req.product.name, req.product.price != null ? `฿${req.product.price.toLocaleString("th-TH")}` : "", req.product.url ?? ""].filter(Boolean).join("\n") });
      }
      if (req.text) await send({ template_id: "1", txt: req.text });
    } catch (e) {
      const f = failState(e);
      return { ok: false, via: null, error: f.note ?? "ส่งไม่สำเร็จ" };
    }
    return { ok: true, via: "api", error: null, externalId: lastId };
  },
  async markRead(admin, conv) {
    const lastIn = String((conv.meta ?? {}).last_in_message_id ?? "");
    if (!lastIn) return;
    const t = await tokenFor(admin, conv.account_ref);
    if (!t.ok) return;
    await lazApiPost(t.gateway, "/im/session/read", t.accessToken, { session_id: conv.external_id, last_read_message_id: lastIn }).catch(() => {});
  },
};
