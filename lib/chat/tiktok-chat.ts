/**
 * ห้องแชทรวม — ตัวต่อ TikTok Shop (server เท่านั้น) · Customer Service API 202309
 *   ⚠️ ใช้ได้เมื่อแอปได้สิทธิ์ seller.customer_service แล้วเท่านั้น (ยื่นขอใน Partner Center + แนบคลิปหน้าแชท ERP)
 *      ยังไม่ได้ → สถานะ "รอสิทธิ์แชท" ไม่เรียก API ให้เปลือง (เช็กจาก granted_scopes ของกุญแจร้าน)
 *   รับ: webhook NEW_MESSAGE (type 14 · app/api/tiktok-shop/webhook) สั่งดึงทันที + ตัวดึงทุกรอบ (กันพลาด)
 *   ดึง: รายการห้อง (ใหม่ → เก่า) เฉพาะห้องที่มีข้อความใหม่กว่าที่ดึงล่าสุด → ข้อความในห้อง (ใหม่ → เก่า หยุดเมื่อถึงที่ดึงแล้ว)
 *        ฝั่งร้าน (SHOP / CUSTOMER_SERVICE) = "out" · ข้อความระบบ/บอท/ซ่อน ไม่เก็บ · ครั้งแรกย้อนหลัง 3 วัน
 *   ส่ง: ข้อความ (≤2,000 ตัวอักษร) · รูป (ฝากก่อน) · การ์ดสินค้า (product_id จากรายการบนร้าน)
 *   อ่านแล้ว: messages/read
 * กุญแจร้าน: app/api/tiktok-shop/shared ttsTokenOrReason · เรียก API: lib/tiktok-shop ttsApi (เซ็นให้เอง)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { TTS_CS_SCOPE, ttsApi, ttsCsUploadImage, ttsErrorText } from "@/lib/tiktok-shop";
import { ttsTokenOrReason } from "@/app/api/tiktok-shop/shared";
import { isChatPermissionError, tiktokConvOf, tiktokMessageOf, toInbound, type TiktokConvRow } from "./shop-parse";
import { platformIdOf, r2ImageFile, storeRemoteImage } from "./shop-common";
import type { PullResult, ShopPuller } from "./shop-sync";
import type { ChatChannelAdapter } from "./registry";
import type { ChatInbound, ChatSendResult } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type Obj = Record<string, unknown>;

const BACKFILL_S = 3 * 86_400;
const MAX_CONVS_PER_RUN = 20;
const CS = "/customer_service/202309";

export const TTS_NO_CS_SCOPE = "แอป TikTok ยังไม่ได้สิทธิ์แชทลูกค้า (Customer Service) — ยื่นขอที่ Partner Center › App & Service › แอปของเรา › จัดการ API (แนบคลิปหน้าแชท ERP) แล้วเชื่อมต่อร้านใหม่";

async function shopFor(admin: Admin, brandId: string): Promise<{ ok: true; accessToken: string; cipher: string } | { ok: false; state: PullResult["state"]; reason: string }> {
  const pf = await platformIdOf(admin, "tiktok");
  if (!pf) return { ok: false, state: "error", reason: "ไม่พบแพลตฟอร์ม TikTok ในระบบ" };
  const t = await ttsTokenOrReason(admin, brandId, pf, null);
  if (!t.ok) return { ok: false, state: /หมดอายุ/.test(t.reason) ? "expired" : "error", reason: t.reason };
  const scopes = Array.isArray(t.meta.granted_scopes) ? t.meta.granted_scopes : [];
  if (scopes.length > 0 && !scopes.includes(TTS_CS_SCOPE)) return { ok: false, state: "no_permission", reason: TTS_NO_CS_SCOPE };
  const cipher = t.meta.shops?.[0]?.cipher;
  if (!cipher) return { ok: false, state: "error", reason: "ยังไม่รู้รหัสร้าน TikTok — กด ตรวจการเชื่อมต่อ ที่บัญชีแพลตฟอร์มก่อน" };
  return { ok: true, accessToken: t.accessToken, cipher };
}

const failState = (e: unknown): Pick<PullResult, "state" | "note"> => {
  const code = String((e as { code?: unknown })?.code ?? "");
  const msg = String((e as Error)?.message ?? "");
  if (isChatPermissionError("tiktok", code, msg)) return { state: "no_permission", note: TTS_NO_CS_SCOPE };
  return { state: "error", note: ttsErrorText(e) };
};

export const pullTiktokChats: ShopPuller = async (admin, shop, cursor, ctx) => {
  const keep = { events: [] as ChatInbound[], cursor };
  const s = await shopFor(admin, shop.brandId);
  if (!s.ok) return { ...keep, state: s.state, note: s.reason };
  const sinceS = Number(cursor.s) > 0 ? Number(cursor.s) : Math.floor(Date.now() / 1000) - BACKFILL_S;
  const q0 = { shop_cipher: s.cipher, locale: "th-TH" };

  const changed: TiktokConvRow[] = [];
  try {
    let token = "";
    for (let page = 0; page < 5 && changed.length < MAX_CONVS_PER_RUN; page++) {
      const d = await ttsApi("GET", `${CS}/conversations`, s.accessToken, { query: { ...q0, page_size: "20", ...(token ? { page_token: token } : {}) }, scope: TTS_CS_SCOPE });
      const rows = (Array.isArray(d.conversations) ? d.conversations : []).map((c) => tiktokConvOf(c as Obj)).filter((c): c is TiktokConvRow => !!c);
      let older = false;
      for (const c of rows) { if (c.lastS > sinceS) changed.push(c); else older = true; }
      token = String(d.next_page_token ?? "");
      if (older || !token) break;
    }
  } catch (e) { return { ...keep, ...failState(e) }; }
  if (changed.length === 0) return { ...keep, state: "ready", note: null };

  const events: ChatInbound[] = [];
  let doneS = sinceS;
  let allDone = true;
  for (const c of changed.slice(0, MAX_CONVS_PER_RUN).reverse()) {
    if (Date.now() > ctx.deadline - 4_000) { allDone = false; break; }
    try {
      let token = "";
      // ใหม่ → เก่า ทีละ 10 · หยุดเมื่อถึงข้อความที่ดึงแล้ว (สูงสุด 5 หน้า)
      for (let page = 0; page < 5; page++) {
        const d = await ttsApi("GET", `${CS}/conversations/${encodeURIComponent(c.id)}/messages`, s.accessToken, {
          query: { ...q0, page_size: "10", sort_order: "DESC", sort_field: "create_time", ...(token ? { page_token: token } : {}) }, scope: TTS_CS_SCOPE,
        });
        const msgs = (Array.isArray(d.messages) ? d.messages : []) as Obj[];
        let reached = false;
        for (const m of msgs) {
          if (Number(m.create_time) < sinceS - 60) { reached = true; continue; }
          const p = tiktokMessageOf(m, c.id);
          if (!p || p.skip) continue;
          const imageKey = p.remoteImage ? await storeRemoteImage("tiktok", p.remoteImage) : null;
          events.push(toInbound(p, shop.brandId, { imageKey, profile: { name: c.name, avatar: c.avatar } }));
        }
        token = String(d.next_page_token ?? "");
        if (reached || !token) break;
      }
    } catch (e) {
      if (events.length === 0) return { ...keep, ...failState(e) };
      allDone = false; break;
    }
    if (c.lastS > doneS) doneS = c.lastS;
  }
  return { events, cursor: { ...cursor, s: doneS }, state: "ready", note: allDone ? null : "ห้องเยอะ — ดึงต่อรอบหน้า" };
};

// ---------------------------------------------------------------- ส่ง / อ่านแล้ว

async function sendOne(s: { accessToken: string; cipher: string }, convId: string, type: string, content: Obj): Promise<string | null> {
  const d = await ttsApi("POST", `${CS}/conversations/${encodeURIComponent(convId)}/messages`, s.accessToken, {
    query: { shop_cipher: s.cipher }, body: { type, content: JSON.stringify(content) }, scope: TTS_CS_SCOPE,
  });
  return d.message_id != null ? String(d.message_id) : null;
}

const sendFail = (e: unknown): ChatSendResult => {
  const code = String((e as { code?: unknown })?.code ?? "");
  const map: Record<string, string> = {
    "45109001": "TikTok ไม่ให้ส่งในห้องนี้ตอนนี้ (เกินช่วงเวลาที่ตอบได้ หรือลูกค้ายังไม่ได้ทักมา)",
    "45101006": "TikTok ไม่รับข้อความนี้ (มีคำต้องห้าม) — แก้ข้อความแล้วลองใหม่",
    "45101004": "ส่งครบโควตาวันนี้ของ TikTok แล้ว (10,000 ข้อความ/วัน)",
  };
  return { ok: false, via: null, error: map[code] ?? failState(e).note ?? "ส่งไม่สำเร็จ" };
};

export const tiktokChatAdapter: ChatChannelAdapter = {
  supports: { image: true, product: true },
  async send(admin, conv, req) {
    const s = await shopFor(admin, conv.account_ref);
    if (!s.ok) return { ok: false, via: null, error: s.reason };
    let lastId: string | null = null;
    try {
      if (req.imageKey) {
        const f = await r2ImageFile(req.imageKey);
        if (!f) return { ok: false, via: null, error: "อ่านรูปที่แนบไม่ได้ กรุณาแนบใหม่" };
        const up = await ttsCsUploadImage(s.accessToken, s.cipher, f.bytes, f.name, f.type);
        lastId = await sendOne(s, conv.external_id, "IMAGE", { url: up.url, width: up.width, height: up.height });
      }
      if (req.product) {
        const pid = req.product.listing_id && /^\d+$/.test(req.product.listing_id) ? req.product.listing_id : null;
        if (pid) lastId = await sendOne(s, conv.external_id, "PRODUCT_CARD", { product_id: pid });
        else {
          const txt = [req.product.name, req.product.price != null ? `฿${req.product.price.toLocaleString("th-TH")}` : "", req.product.url ?? ""].filter(Boolean).join("\n");
          lastId = await sendOne(s, conv.external_id, "TEXT", { content: txt });
        }
      }
      if (req.text) lastId = await sendOne(s, conv.external_id, "TEXT", { content: req.text });
    } catch (e) { return sendFail(e); }
    return { ok: true, via: "api", error: null, externalId: lastId };
  },
  async markRead(admin, conv) {
    const s = await shopFor(admin, conv.account_ref);
    if (!s.ok) return;
    await ttsApi("POST", `${CS}/conversations/${encodeURIComponent(conv.external_id)}/messages/read`, s.accessToken, { query: { shop_cipher: s.cipher }, body: {}, scope: TTS_CS_SCOPE }).catch(() => {});
  },
};
