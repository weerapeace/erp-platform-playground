/**
 * ห้องแชทรวม — แปลงข้อความจาก Shopee / Lazada / TikTok เป็นข้อความกลาง (กติกาล้วน ไม่มี I/O · เทสต์ lib/__tests__/chat-shop-parse.test.ts)
 *   ชื่อช่อง/หน่วยเวลาจากคู่มือทางการ + SDK โอเพนซอร์สที่ใช้จริง (สรุปใน docs/chat-inbox.md หัวข้อ "เฟส 2")
 *   - Shopee: created_timestamp = วินาที · last_message_timestamp (รายการห้อง) = นาโนวินาที · ฝั่งร้าน = from_shop_id ตรงกับร้านเรา
 *   - Lazada: send_time = มิลลิวินาที · content เป็นข้อความ JSON · from_account_type 1 = ลูกค้า 2 = ร้าน
 *   - TikTok: create_time = วินาที · content เป็นข้อความ JSON · sender.role BUYER = ลูกค้า (SHOP/CUSTOMER_SERVICE/SYSTEM/ROBOT = ฝั่งร้าน)
 *   รูปจากลูกค้า: คืนลิงก์ (remoteImage) ให้ตัวต่อช่องทางดึงลง R2 เอง
 */
import type { ChatAttachment, ChatInbound, ShopChatChannel } from "./types";

type Obj = Record<string, unknown>;

/** ข้อความที่แปลงแล้ว (ก่อนดึงรูปลง R2) */
export type ParsedShopMessage = Omit<ChatInbound, "accountRef" | "replyToken" | "readToken" | "mediaId"> & {
  remoteImage: string | null;
  /** ข้อความที่ไม่ต้องเก็บ (ข้อความระบบ/ตอบอัตโนมัติของแพลตฟอร์ม/ถูกซ่อน) */
  skip: boolean;
};

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "bigint" ? String(v) : "").trim();
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const isHttps = (u: string) => /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 1500;

/** content ที่มาเป็นข้อความ JSON (Lazada / TikTok) → object */
export function parseJsonContent(v: unknown): Obj {
  if (v && typeof v === "object") return obj(v);
  if (typeof v !== "string" || !v.trim()) return {};
  try { return obj(JSON.parse(v)); } catch { return { txt: v, content: v }; }
}

/** เวลา → ISO (unit = หน่วยของตัวเลข) · ไม่ถูกต้อง = null */
export function toIso(v: unknown, unit: "s" | "ms" | "ns"): string | null {
  const s = str(v);
  if (!/^\d{1,22}$/.test(s)) return null;
  // นาโนวินาทีเกิน Number ได้ → ตัดเหลือมิลลิวินาทีด้วยข้อความ
  const ms = unit === "ns" ? Number(s.length > 6 ? s.slice(0, -6) : "0") : unit === "s" ? Number(s) * 1000 : Number(s);
  if (!Number.isFinite(ms) || ms < 946684800000) return null;   // ก่อนปี 2000 = ผิด
  return new Date(ms).toISOString();
}

/** Shopee บางทีให้แค่รหัสรูป (ไม่ใช่ลิงก์) → ลิงก์ CDN ไทย */
export function shopeeImageUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (isHttps(s)) return s;
  if (s.startsWith("http://")) return `https://${s.slice(7)}`;
  return /^[A-Za-z0-9_-]{8,120}$/.test(s) ? `https://cf.shopee.co.th/file/${s}` : null;
}

const media = (kind: "video" | "audio" | "file" | "location", label?: string | null): ChatAttachment => ({ kind, label: label ?? null });

// ---------------------------------------------------------------- Shopee

/** แถวห้องจาก get_conversation_list */
export type ShopeeConvRow = { id: string; buyerId: string; name: string | null; avatar: string | null; lastNs: string; unread: number };

export function shopeeConvOf(c: Obj): ShopeeConvRow | null {
  const id = str(c.conversation_id);
  const buyerId = str(c.to_id);
  if (!/^\d{1,22}$/.test(id) || !/^\d{1,22}$/.test(buyerId)) return null;
  const avatar = shopeeImageUrl(c.to_avatar);
  return { id, buyerId, name: str(c.to_name).slice(0, 120) || null, avatar, lastNs: str(c.last_message_timestamp) || "0", unread: Number(c.unread_count) || 0 };
}

/** เทียบเวลานาโนวินาทีแบบข้อความ (ยาวเกิน Number) */
export function nsGreater(a: string, b: string): boolean {
  const x = a.replace(/^0+/, ""), y = b.replace(/^0+/, "");
  return x.length !== y.length ? x.length > y.length : x > y;
}

export function shopeeMessageOf(m: Obj, conv: { id: string; shopId: string }): ParsedShopMessage | null {
  const id = str(m.message_id);
  const sentAt = toIso(m.created_timestamp, "s");
  if (!id || !sentAt) return null;
  const type = str(m.message_type);
  const c = obj(m.content);
  const fromShop = str(m.from_shop_id) === conv.shopId && conv.shopId !== "";
  const status = str(m.status);
  let text: string | null = null;
  let remoteImage: string | null = null;
  const attachments: ChatAttachment[] = [];
  switch (type) {
    case "text": text = str(c.text) || null; break;
    case "image": remoteImage = shopeeImageUrl(c.url) ?? shopeeImageUrl(c.thumb_url); if (!remoteImage) text = "[รูปภาพ]"; break;
    case "sticker": attachments.push({ kind: "sticker", sticker_id: str(c.sticker_id) || null, package_id: str(c.sticker_package_id) || null, url: shopeeImageUrl(c.url) ?? shopeeImageUrl(c.thumb_url) }); break;
    case "video": attachments.push(media("video")); break;
    case "order": { const sn = str(c.order_sn); if (sn) attachments.push({ kind: "order", order_no: sn }); else text = "[ออเดอร์]"; break; }
    case "item": text = `[สินค้าจากร้าน] รหัสบน Shopee ${str(c.item_id)}`; break;
    case "item_list": {
      const names = (Array.isArray(c.chat_product_infos) ? c.chat_product_infos : []).map((p) => str(obj(p).name)).filter(Boolean);
      text = names.length ? `[สินค้า] ${names.slice(0, 3).join(", ")}` : "[สินค้า]"; break;
    }
    case "voucher": text = "[คูปองส่วนลด]"; break;
    case "notification": text = str(c.notification_for_receiver) || str(c.notification_for_sender) || "[แจ้งเตือนจาก Shopee]"; break;
    default: text = str(c.text) || `[ข้อความชนิด ${type || "ไม่ทราบ"} — เปิดดูในแอป Shopee]`;
  }
  // ลูกค้ากดมาจากหน้าสินค้า/ออเดอร์ → แนบเลขออเดอร์ไว้ด้วย
  const srcOrder = str(obj(m.source_content).order_sn);
  if (srcOrder && !attachments.some((a) => a.kind === "order")) attachments.push({ kind: "order", order_no: srcOrder });
  const auto = fromShop && /auto_?reply|offwork/i.test(status);
  return {
    channel: "shopee", externalConvId: conv.id, kind: "message", externalMessageId: id,
    text: text?.slice(0, 5000) ?? null, attachments, sentAt, direction: fromShop ? "out" : "in",
    remoteImage, skip: auto || type === "bundle_message",
  };
}

// ---------------------------------------------------------------- Lazada

export type LazadaSessionRow = { id: string; buyerId: string; name: string | null; avatar: string | null; lastMs: number; unread: number; lastMessageId: string | null };

export function lazadaSessionOf(s: Obj): LazadaSessionRow | null {
  const id = str(s.session_id);
  if (!id || id.length > 120) return null;
  const head = str(s.head_url);
  return {
    id, buyerId: str(s.buyer_id), name: str(s.title).slice(0, 120) || null,
    avatar: isHttps(head) ? head : null, lastMs: Number(s.last_message_time) || 0, unread: Number(s.unread_count) || 0,
    lastMessageId: str(s.last_message_id) || null,
  };
}

export function lazadaMessageOf(m: Obj, sessionId: string): ParsedShopMessage | null {
  const id = str(m.message_id);
  const sentAt = toIso(m.send_time, "ms");
  if (!id || !sentAt) return null;
  const tpl = Number(m.template_id);
  const c = parseJsonContent(m.content);
  let text: string | null = null;
  let remoteImage: string | null = null;
  const attachments: ChatAttachment[] = [];
  switch (tpl) {
    case 1: text = str(c.txt) || null; break;
    case 3: { const u = str(c.imgUrl); remoteImage = isHttps(u) ? u : null; if (!remoteImage) text = "[รูปภาพ]"; break; }
    case 4: { const u = str(c.imgUrl) || str(c.smallImgUrl); attachments.push({ kind: "sticker", url: isHttps(u) ? u : null }); break; }
    case 6: attachments.push(media("video")); break;
    case 10006: text = `[สินค้า] ${str(c.title) || str(c.itemId)}`.trim(); break;
    case 10007: { const no = str(c.orderId); if (no) attachments.push({ kind: "order", order_no: no, status: str(c.status) || null }); else text = "[ออเดอร์]"; break; }
    case 10008: text = "[คูปองส่วนลด]"; break;
    default: text = str(c.txt) || `[ข้อความชนิด ${tpl || "ไม่ทราบ"} — เปิดดูในแอป Lazada]`;
  }
  const fromShop = Number(m.from_account_type) === 2;
  const system = Number(m.type) === 2 || tpl === 2 || tpl === 10015;
  return {
    channel: "lazada", externalConvId: sessionId, kind: "message", externalMessageId: id,
    text: text?.slice(0, 5000) ?? null, attachments, sentAt, direction: fromShop ? "out" : "in",
    remoteImage, skip: system || m.auto_reply === true || Number(m.status) === 1,
  };
}

// ---------------------------------------------------------------- TikTok

export type TiktokConvRow = { id: string; name: string | null; avatar: string | null; lastS: number; unread: number; canSend: boolean };

export function tiktokConvOf(c: Obj): TiktokConvRow | null {
  const id = str(c.id);
  if (!id || id.length > 120) return null;
  const buyer = (Array.isArray(c.participants) ? c.participants : []).map(obj).find((p) => str(p.role) === "BUYER") ?? {};
  const avatar = str(buyer.avatar);
  const latest = obj(c.latest_message);
  return {
    id, name: str(buyer.nickname).slice(0, 120) || null, avatar: isHttps(avatar) ? avatar : null,
    lastS: Number(latest.create_time) || Number(c.create_time) || 0, unread: Number(c.unread_count) || 0,
    canSend: c.can_send_message !== false,
  };
}

const TIKTOK_SHOP_ROLES = new Set(["SHOP", "CUSTOMER_SERVICE", "SYSTEM", "ROBOT"]);

export function tiktokMessageOf(m: Obj, convId: string): ParsedShopMessage | null {
  const id = str(m.id) || str(m.message_id);
  const sentAt = toIso(m.create_time, "s");
  if (!id || !sentAt) return null;
  const type = str(m.type);
  const c = parseJsonContent(m.content);
  const role = str(obj(m.sender).role);
  let text: string | null = null;
  let remoteImage: string | null = null;
  const attachments: ChatAttachment[] = [];
  switch (type) {
    case "TEXT": text = str(c.content) || null; break;
    case "IMAGE": { const u = str(c.url); remoteImage = isHttps(u) ? u : null; if (!remoteImage) text = "[รูปภาพ]"; break; }
    case "EMOTICONS": { const u = str(c.url) || str(c.image_url); attachments.push({ kind: "sticker", url: isHttps(u) ? u : null }); break; }
    case "VIDEO": attachments.push(media("video")); break;
    case "PRODUCT_CARD": text = `[สินค้า] รหัสบน TikTok ${str(c.product_id)}`; break;
    case "ORDER_CARD": case "RETURN_REFUND_CARD": {
      const no = str(c.order_id);
      if (no) attachments.push({ kind: "order", order_no: no, status: type === "RETURN_REFUND_CARD" ? "ขอคืนสินค้า/คืนเงิน" : null }); else text = "[ออเดอร์]";
      break;
    }
    case "COUPON_CARD": text = "[คูปองส่วนลด]"; break;
    default: text = str(c.content) || null;
  }
  const system = role === "SYSTEM" || role === "ROBOT" || ["NOTIFICATION", "ALLOCATED_SERVICE", "BUYER_ENTER_FROM_TRANSFER", "BUYER_ENTER_FROM_PRODUCT", "BUYER_ENTER_FROM_ORDER", "OTHER"].includes(type);
  return {
    channel: "tiktok", externalConvId: convId, kind: "message", externalMessageId: id,
    text: text?.slice(0, 5000) ?? null, attachments, sentAt, direction: TIKTOK_SHOP_ROLES.has(role) ? "out" : "in",
    remoteImage, skip: system || m.is_visible === false || (!text && attachments.length === 0 && !remoteImage),
  };
}

/** ข้อความแปลงแล้ว → ChatInbound (หลังดึงรูปลง R2) */
export function toInbound(p: ParsedShopMessage, accountRef: string, extra: { imageKey?: string | null; profile?: ChatInbound["profile"]; convMeta?: Record<string, unknown> } = {}): ChatInbound {
  const attachments = [...p.attachments];
  let text = p.text;
  if (p.remoteImage) {
    if (extra.imageKey) attachments.unshift({ kind: "image", key: extra.imageKey });
    else text = text ?? "[รูปภาพ — ดึงรูปไม่สำเร็จ เปิดดูในแอปของร้าน]";
  }
  return {
    channel: p.channel, accountRef, externalConvId: p.externalConvId, kind: "message", externalMessageId: p.externalMessageId,
    text, attachments, sentAt: p.sentAt, direction: p.direction, profile: extra.profile ?? null,
    // ข้อความล่าสุดของลูกค้า — ใช้บอกแพลตฟอร์มว่า "อ่านแล้ว" ตอนพนักงานเปิดห้อง
    convMeta: p.direction === "in" ? { ...(extra.convMeta ?? {}), last_in_message_id: p.externalMessageId } : extra.convMeta,
  };
}

/** ข้อผิดพลาดแบบ "แอป/ร้านยังไม่มีสิทธิ์แชท" ไหม (ไม่ใช่เน็ตหลุด/กุญแจหมด) */
export function isChatPermissionError(channel: ShopChatChannel, code: string, message: string): boolean {
  const both = `${code} ${message}`;
  if (channel === "lazada") return /InsufficientPermission|permission|not.?authori[sz]ed|AppWhiteIpLimit/i.test(both);
  if (channel === "tiktok") return /scope|permission denied|no permission|not.?authori[sz]ed|105005/i.test(both);
  return /error_permission|no.?permission|not.?authori[sz]ed|permission.?denied|api.?access/i.test(both);
}
