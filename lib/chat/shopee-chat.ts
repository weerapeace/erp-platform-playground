/**
 * ห้องแชทรวม — ตัวต่อ Shopee (server เท่านั้น) · ใช้ API sellerchat ของแอป Seller In-house System
 *   ดึง: get_conversation_list (ห้องที่มีข้อความใหม่กว่าที่ดึงล่าสุด) → get_message ของห้องนั้น → ข้อความกลาง
 *        ข้อความที่ร้านตอบเองในแอป/Seller Centre/BigSeller ก็มา (ฝั่งร้าน = from_shop_id ตรงร้านเรา) → ห้องเป็น "ตอบแล้ว"
 *        ตอบอัตโนมัติของ Shopee (status auto_reply/offwork) ไม่เก็บ
 *        ครั้งแรกที่เปิดรับ: ย้อนหลัง 3 วัน (ไม่เด้งกระดิ่ง — ดู lib/chat/rules isFreshForNotify)
 *   ส่ง: ข้อความ · รูป (ฝากผ่าน sellerchat/upload_image ก่อน) · การ์ดสินค้า (item_id จากรายการบนร้าน — ไม่มี = ส่งชื่อ+ลิงก์เป็นข้อความ)
 *   อ่านแล้ว: read_conversation (ข้อความล่าสุดของลูกค้า)
 * กุญแจร้าน: app/api/shopee/shared shopeeTokenOrReason (ต่ออายุเองแบบกันชน) · เรียก API: lib/shopee shopeeFetch (เซ็นให้เอง)
 * account_ref ของห้อง = brand_id ของร้าน · meta.buyer_id = to_id ที่ต้องใช้ตอนส่ง
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { shopeeErrorText, shopeeFetch } from "@/lib/shopee";
import { shopeeTokenOrReason } from "@/app/api/shopee/shared";
import { isChatPermissionError, nsGreater, shopeeConvOf, shopeeMessageOf, toInbound, type ShopeeConvRow } from "./shop-parse";
import { platformIdOf, r2ImageFile, storeRemoteImage } from "./shop-common";
import type { PullResult, ShopPuller } from "./shop-sync";
import type { ChatChannelAdapter } from "./registry";
import type { ChatInbound, ChatSendResult } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type Obj = Record<string, unknown>;

const BACKFILL_MS = 3 * 86_400_000;
const MAX_CONVS_PER_RUN = 25;
const resp = (j: Obj): Obj => (j.response && typeof j.response === "object" ? (j.response as Obj) : {});

async function tokenFor(admin: Admin, brandId: string) {
  const pf = await platformIdOf(admin, "shopee");
  if (!pf) return { ok: false as const, reason: "ไม่พบแพลตฟอร์ม Shopee ในระบบ" };
  return shopeeTokenOrReason(admin, brandId, pf, null);
}

const failState = (e: unknown): Pick<PullResult, "state" | "note"> => {
  const code = String((e as { code?: unknown })?.code ?? "");
  const msg = String((e as Error)?.message ?? "");
  if (isChatPermissionError("shopee", code, msg)) return { state: "no_permission", note: `แอป Shopee ยังไม่มีสิทธิ์ใช้แชท (${msg})` };
  return { state: "error", note: shopeeErrorText(e) };
};

/** ดึงแชทใหม่ของร้าน 1 ร้าน (cursor.ns = เวลาข้อความล่าสุดที่ดึงแล้ว แบบนาโนวินาที) */
export const pullShopeeChats: ShopPuller = async (admin, shop, cursor, ctx) => {
  const keep = { events: [] as ChatInbound[], cursor };
  const t = await tokenFor(admin, shop.brandId);
  if (!t.ok) return { ...keep, state: /หมดอายุ/.test(t.reason) ? "expired" : "error", note: t.reason };
  const auth = { accessToken: t.accessToken, shopId: t.shopId };
  const sinceNs = typeof cursor.ns === "string" && /^\d+$/.test(cursor.ns) ? cursor.ns : `${Date.now() - BACKFILL_MS}000000`;

  // 1) ห้องที่มีข้อความใหม่กว่า sinceNs (เรียงใหม่ → เก่า · หยุดเมื่อเจอห้องที่เก่ากว่า)
  const changed: ShopeeConvRow[] = [];
  let next = "";
  try {
    for (let page = 0; page < 5 && changed.length < MAX_CONVS_PER_RUN; page++) {
      const q: Record<string, string | number> = { direction: "latest", type: "all", page_size: 20 };
      if (next) q.next_timestamp_nano = next;
      const r = resp(await shopeeFetch("/api/v2/sellerchat/get_conversation_list", { query: q, ...auth }));
      const rows = (Array.isArray(r.conversations) ? r.conversations : []).map((c) => shopeeConvOf(c as Obj)).filter((c): c is ShopeeConvRow => !!c);
      let older = false;
      for (const c of rows) { if (nsGreater(c.lastNs, sinceNs)) changed.push(c); else older = true; }
      const pr = (r.page_result ?? {}) as Obj;
      next = String(((pr.next_cursor ?? {}) as Obj).next_message_time_nano ?? "");
      if (older || pr.more !== true || !next) break;
    }
  } catch (e) { return { ...keep, ...failState(e) }; }
  if (changed.length === 0) return { ...keep, state: "ready", note: null };

  // 2) ข้อความของแต่ละห้อง (เก่า → ใหม่) · เวลาไม่พอ = ห้องที่เหลือรอบหน้า (cursor ขยับเท่าห้องที่ทำครบ)
  const todo = changed.slice(0, MAX_CONVS_PER_RUN).reverse();
  const events: ChatInbound[] = [];
  let doneNs = sinceNs;
  let allDone = true;
  for (const c of todo) {
    if (Date.now() > ctx.deadline - 4_000) { allDone = false; break; }
    let msgs: Obj[] = [];
    try {
      const r = resp(await shopeeFetch("/api/v2/sellerchat/get_message", { query: { conversation_id: c.id, page_size: 30 }, ...auth }));
      msgs = (Array.isArray(r.messages) ? r.messages : []) as Obj[];
    } catch (e) {
      if (events.length === 0) return { ...keep, ...failState(e) };
      allDone = false; break;
    }
    const sinceMs = Number(sinceNs.slice(0, -6) || 0);
    for (const m of msgs) {
      const p = shopeeMessageOf(m, { id: c.id, shopId: t.shopId });
      if (!p || p.skip || Date.parse(p.sentAt) < sinceMs - 60_000) continue;   // เก่ากว่าที่ดึงแล้ว (เผื่อ 1 นาที — ซ้ำได้ ระบบกันซ้ำด้วยรหัสข้อความ)
      const imageKey = p.remoteImage ? await storeRemoteImage("shopee", p.remoteImage) : null;
      events.push(toInbound(p, shop.brandId, { imageKey, profile: { name: c.name, avatar: c.avatar }, convMeta: { buyer_id: c.buyerId } }));
    }
    if (nsGreater(c.lastNs, doneNs)) doneNs = c.lastNs;
  }
  // ทำไม่ครบทุกห้อง: ห้องที่ข้ามมีเวลาใหม่กว่า doneNs อยู่แล้ว (ทำจากเก่า→ใหม่) → รอบหน้าดึงต่อได้ถูก
  return { events, cursor: { ...cursor, ns: doneNs }, state: "ready", note: allDone ? null : "ห้องเยอะ — ดึงต่อรอบหน้า" };
};

// ---------------------------------------------------------------- ส่ง / อ่านแล้ว

const sendErr = (e: unknown): ChatSendResult => ({ ok: false, via: null, error: shopeeErrorText(e) });

/** to_id / item_id เป็นเลข 64 บิต → ประกอบ JSON เอง (ใส่ตัวเลขดิบ ไม่ผ่าน Number) — ค่าตรวจแล้วว่าเป็นตัวเลขล้วน */
async function sendOne(auth: { accessToken: string; shopId: string }, toId: string, message_type: string, content: Obj, rawIds: Record<string, string> = {}): Promise<string | null> {
  const contentJson = Object.keys(rawIds).length
    ? `{${Object.entries(rawIds).map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(",")}}`
    : JSON.stringify(content);
  const rawBody = `{"to_id":${toId},"message_type":${JSON.stringify(message_type)},"content":${contentJson}}`;
  const r = resp(await shopeeFetch("/api/v2/sellerchat/send_message", { rawBody, ...auth }));
  return r.message_id != null ? String(r.message_id) : null;
}

export const shopeeChatAdapter: ChatChannelAdapter = {
  supports: { image: true, product: true },
  async send(admin, conv, req) {
    const toId = String((conv.meta ?? {}).buyer_id ?? "");
    if (!/^\d+$/.test(toId)) return { ok: false, via: null, error: "ไม่รู้รหัสลูกค้าของห้องนี้ — รอให้ลูกค้าทักมาอีกครั้งแล้วลองใหม่" };
    const t = await tokenFor(admin, conv.account_ref);
    if (!t.ok) return { ok: false, via: null, error: t.reason };
    const auth = { accessToken: t.accessToken, shopId: t.shopId };
    let lastId: string | null = null;
    try {
      if (req.imageKey) {
        const f = await r2ImageFile(req.imageKey);
        if (!f) return { ok: false, via: null, error: "อ่านรูปที่แนบไม่ได้ กรุณาแนบใหม่" };
        if (f.bytes.byteLength > 2 * 1024 * 1024) return { ok: false, via: null, error: "Shopee รับรูปในแชทไม่เกิน 2MB — ย่อรูปแล้วลองใหม่" };
        const fd = new FormData();
        fd.set("file", new Blob([f.bytes as BlobPart], { type: f.type }), f.name);
        const up = resp(await shopeeFetch("/api/v2/sellerchat/upload_image", { form: fd, ...auth }));
        const url = String(up.url ?? "");
        if (!url) return { ok: false, via: null, error: "ฝากรูปขึ้น Shopee ไม่สำเร็จ" };
        lastId = await sendOne(auth, toId, "image", { image_url: url });
      }
      if (req.product) {
        const itemId = req.product.listing_id && /^\d+$/.test(req.product.listing_id) ? req.product.listing_id : null;
        if (itemId) lastId = await sendOne(auth, toId, "item", {}, { item_id: itemId });
        else {
          // สินค้านี้ยังไม่อยู่บนร้าน Shopee ของแบรนด์นี้ → ส่งชื่อ (+ลิงก์ถ้ามี) เป็นข้อความแทน
          const txt = [req.product.name, req.product.price != null ? `฿${req.product.price.toLocaleString("th-TH")}` : "", req.product.url ?? ""].filter(Boolean).join("\n");
          lastId = await sendOne(auth, toId, "text", { text: txt });
        }
      }
      if (req.text) lastId = await sendOne(auth, toId, "text", { text: req.text });
    } catch (e) { return sendErr(e); }
    return { ok: true, via: "api", error: null, externalId: lastId };
  },
  async markRead(admin, conv) {
    const lastIn = String((conv.meta ?? {}).last_in_message_id ?? "");
    if (!/^\d+$/.test(lastIn)) return;
    const t = await tokenFor(admin, conv.account_ref);
    if (!t.ok) return;
    if (!/^\d+$/.test(conv.external_id)) return;
    await shopeeFetch("/api/v2/sellerchat/read_conversation", {
      rawBody: `{"conversation_id":${conv.external_id},"last_read_message_id":${JSON.stringify(lastIn)}}`, accessToken: t.accessToken, shopId: t.shopId,
    }).catch(() => {});
  },
};
