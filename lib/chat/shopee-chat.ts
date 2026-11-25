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
import { isChatPermissionError, shopeeConvOf, shopeeMessageOf, toInbound, type ShopeeConvRow } from "./shop-parse";
import { platformIdOf, r2ImageFile, storeRemoteImage } from "./shop-common";
import type { PullResult, ShopPuller } from "./shop-sync";
import type { ChatChannelAdapter } from "./registry";
import type { ChatInbound, ChatSendResult } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type Obj = Record<string, unknown>;

const BACKFILL_MS = 3 * 86_400_000;
const MAX_CONVS_PER_RUN = 25;
/** ชนิดข้อความที่ shop-parse แปลงได้ดีแล้ว (นอกนี้ = จดชื่อช่องไว้ใน diag) */
const KNOWN_TYPES = new Set(["text", "image", "sticker", "video", "order", "item", "item_list", "voucher", "notification", "bundle_message"]);
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

/**
 * ดึงแชทใหม่ของร้าน 1 ร้าน (cursor.ms = เวลาข้อความล่าสุดที่ดึงแล้ว แบบมิลลิวินาที)
 * cursor.diag = ข้อมูลวินิจฉัยรอบล่าสุด (ชื่อช่องที่ Shopee ส่งมา · จำนวนห้อง · ค่าเวลาดิบของห้องแรก) — ไม่มีข้อมูลลูกค้า
 *   เพิ่ม 2026-11-25: เปิดรับครั้งแรกได้ 0 ห้องทั้งที่ร้านมีแชท → ต้องเห็นของจริงที่ Shopee ตอบมา
 */
export const pullShopeeChats: ShopPuller = async (admin, shop, cursor, ctx) => {
  const t = await tokenFor(admin, shop.brandId);
  if (!t.ok) return { events: [], cursor, state: /หมดอายุ/.test(t.reason) ? "expired" : "error", note: t.reason };
  const auth = { accessToken: t.accessToken, shopId: t.shopId };
  const sinceMs = Number(cursor.ms) > 0 ? Number(cursor.ms) : Date.now() - BACKFILL_MS;

  // 1) ห้องที่มีข้อความใหม่กว่า sinceMs (เรียงใหม่ → เก่า · หยุดเมื่อเจอห้องที่เก่ากว่า)
  const changed: ShopeeConvRow[] = [];
  const diag: Record<string, unknown> = { at: new Date().toISOString(), pages: 0, raw: 0, parsed: 0 };
  let next = "";
  // ⚠️ เจอจริง 2026-11-25: direction "latest" ไม่ใส่ตัวชี้ = Shopee เริ่มจากห้องเก่าสุด (หน้าแรกเป็นห้องปี 2024)
  //    → ใช้ direction "older" + ตัวชี้ = เวลาตอนนี้ (นาโนวินาที) = ไล่จากห้องใหม่สุดถอยหลัง
  //    ห้องที่ปักหมุด (pinned) อาจอยู่บนสุดทั้งที่เก่า → ไม่ใช้ตัดสินว่า "ถึงห้องเก่าแล้ว"
  try {
    const seen = new Set<string>();
    for (let page = 0; page < 5 && changed.length < MAX_CONVS_PER_RUN; page++) {
      const q: Record<string, string | number> = { direction: "older", type: "all", page_size: 20, next_timestamp_nano: next || `${Date.now()}000000` };
      const r = resp(await shopeeFetch("/api/v2/sellerchat/get_conversation_list", { query: q, ...auth }));
      const rawList = Array.isArray(r.conversations) ? r.conversations as Obj[] : [];
      const rows = rawList.map((c) => shopeeConvOf(c)).filter((c): c is ShopeeConvRow => !!c);
      if (page === 0) {
        diag.direction = "older";
        diag.resp_keys = Object.keys(r).slice(0, 20);
        diag.conv_keys = rawList[0] ? Object.keys(rawList[0]).slice(0, 40) : [];
        diag.first_ts_raw = rawList[0] ? String(rawList[0].last_message_timestamp ?? "") : null;
        // ลำดับเวลาของหน้าแรก (ไม่มีข้อมูลลูกค้า) — ไว้ยืนยันว่าเรียงใหม่→เก่าจริง
        diag.order = rows.map((c, i) => `${rawList[i]?.pinned === true ? "P" : ""}${c.lastMs ? new Date(c.lastMs).toISOString().slice(0, 16) : "?"}`).slice(0, 20);
      }
      diag.pages = page + 1; diag.raw = Number(diag.raw) + rawList.length; diag.parsed = Number(diag.parsed) + rows.length;
      let newerOnPage = 0;
      for (const [i, c] of rows.entries()) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        if (c.lastMs > sinceMs) { changed.push(c); if (rawList[i]?.pinned !== true) newerOnPage++; }
      }
      const newest = rows.reduce((m, c) => Math.max(m, c.lastMs), 0);
      if (!diag.newest || newest > Date.parse(String(diag.newest))) diag.newest = newest ? new Date(newest).toISOString() : null;
      const pr = (r.page_result ?? {}) as Obj;
      next = String(((pr.next_cursor ?? {}) as Obj).next_message_time_nano ?? "");
      // หน้านี้ไม่มีห้องใหม่ (ไม่นับห้องปักหมุด) = ถอยมาถึงห้องที่ดึงแล้ว → หยุด
      if (newerOnPage === 0 || pr.more !== true || !next) break;
    }
    changed.sort((a, b) => b.lastMs - a.lastMs);
  } catch (e) { return { events: [], cursor: { ...cursor, diag: { ...diag, error: String((e as Error)?.message ?? e).slice(0, 200) } }, ...failState(e) }; }
  if (changed.length === 0) {
    // ไม่มีห้องใหม่ — บอกเหตุผลที่ตรวจได้ (ร้านไม่มีแชทเลย / อ่านห้องไม่ออก / ทุกห้องเก่ากว่าที่ดึงแล้ว)
    const note = Number(diag.raw) === 0 ? "Shopee ตอบว่าร้านยังไม่มีห้องแชท"
      : Number(diag.parsed) === 0 ? `อ่านห้องแชทจาก Shopee ไม่ออก (${diag.raw} ห้อง) — แจ้งผู้ดูแลระบบ`
        : null;
    return { events: [], cursor: { ...cursor, diag }, state: note && Number(diag.raw) > 0 ? "error" : "ready", note };
  }

  // 2) ข้อความของแต่ละห้อง (เก่า → ใหม่) · เวลาไม่พอ = ห้องที่เหลือรอบหน้า (cursor ขยับเท่าห้องที่ทำครบ)
  const keep = { events: [] as ChatInbound[], cursor: { ...cursor, diag } };
  // เก่าสุด 25 ห้องก่อน (changed เรียงใหม่→เก่า) — ตัวชี้ขยับถึงห้องที่ทำแล้วเท่านั้น ห้องที่ใหม่กว่าได้รอบหน้า (ไม่ตกหล่น)
  // เดิมเอาใหม่สุด 25 ห้อง แล้วตัวชี้ข้ามห้องที่เก่ากว่าไปเลย (เจอ 2026-11-25: ดึงครั้งแรกตกหล่น ~15 ห้อง)
  const todo = changed.slice(-MAX_CONVS_PER_RUN).reverse();
  const events: ChatInbound[] = [];
  let doneMs = sinceMs;
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
    if (msgs.length === 0 && !diag.msg_keys) diag.msg_resp_empty = true;
    if (msgs[0] && !diag.msg_keys) { diag.msg_keys = Object.keys(msgs[0]).slice(0, 40); diag.msg_ts_raw = String(msgs[0].created_timestamp ?? ""); }
    for (const m of msgs) {
      // ชนิดข้อความที่ยังไม่รู้จักดี → จดชื่อช่องของ content ไว้ (ไม่เก็บเนื้อหา) เพื่อทำให้แสดงผลดีขึ้นรอบหน้า
      const mt = String(m.message_type ?? "");
      if (!KNOWN_TYPES.has(mt)) {
        const kt = (diag.content_keys ?? {}) as Record<string, string[]>;
        if (!kt[mt] && Object.keys(kt).length < 10) { kt[mt] = Object.keys((m.content ?? {}) as Obj).slice(0, 20); diag.content_keys = kt; }
      }
      const p = shopeeMessageOf(m, { id: c.id, shopId: t.shopId });
      if (!p || p.skip || Date.parse(p.sentAt) < sinceMs - 60_000) continue;   // เก่ากว่าที่ดึงแล้ว (เผื่อ 1 นาที — ซ้ำได้ ระบบกันซ้ำด้วยรหัสข้อความ)
      const imageKey = p.remoteImage ? await storeRemoteImage("shopee", p.remoteImage) : null;
      events.push(toInbound(p, shop.brandId, { imageKey, profile: { name: c.name, avatar: c.avatar }, convMeta: { buyer_id: c.buyerId } }));
    }
    if (c.lastMs > doneMs) doneMs = c.lastMs;
  }
  diag.events = events.length;
  // ทำไม่ครบทุกห้อง: ห้องที่ข้ามมีเวลาใหม่กว่า doneMs อยู่แล้ว (ทำจากเก่า→ใหม่) → รอบหน้าดึงต่อได้ถูก
  return { events, cursor: { ...cursor, ms: doneMs, diag }, state: "ready", note: allDone ? null : "ห้องเยอะ — ดึงต่อรอบหน้า" };
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
