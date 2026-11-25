/**
 * ห้องแชทรวม — แบบข้อมูลกลาง (ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์ · ไม่มีโค้ดที่รันจริง)
 * ทุกช่องทาง (LINE / Lazada / Shopee / TikTok / Facebook / IG) แปลงข้อมูลมาเป็นแบบนี้ก่อนบันทึก
 * คู่มือ: docs/chat-inbox.md
 */

export const CHAT_CHANNELS = ["line", "lazada", "shopee", "tiktok", "facebook", "instagram"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/** สิ่งที่แนบมากับข้อความ — รูปเก็บเป็นกุญแจ R2 (ไม่เก็บลิงก์ของแพลตฟอร์มที่หมดอายุ) */
export type ChatAttachment =
  | { kind: "image"; key: string }
  | { kind: "product"; code: string; name: string; sku_id?: string | null; parent_id?: string | null; image_key?: string | null; price?: number | null; url?: string | null; /** รหัสสินค้าบนร้านของช่องทางนั้น (Shopee item_id …) */ listing_id?: string | null }
  | { kind: "sticker"; package_id?: string | null; sticker_id?: string | null; url?: string | null }
  /** ออเดอร์ที่ลูกค้า/ร้านแนบในแชท (Shopee / Lazada / TikTok) — order_no = เลขออเดอร์บนแพลตฟอร์ม */
  | { kind: "order"; order_no: string; status?: string | null }
  | { kind: "video" | "audio" | "file" | "location"; label?: string | null };

export type ChatDirection = "in" | "out";
export type ChatSenderType = "customer" | "staff" | "system";
export type ChatSendStatus = "received" | "sending" | "sent" | "failed";
export type ChatStatus = "open" | "done";

/** ห้องแชท (แบบที่ส่งไปหน้าเว็บ — ไม่มีโทเคนลับ) */
export type ChatConversation = {
  id: string;
  channel: ChatChannel;
  brand_id: string | null;
  brand_name?: string | null;
  account_ref: string;
  external_id: string;
  customer_name: string | null;
  customer_avatar: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  status: ChatStatus;
  last_message_at: string | null;
  last_preview: string | null;
  last_direction: ChatDirection | null;
  waiting_since: string | null;
  unread_count: number;
  reply_until: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  direction: ChatDirection;
  sender_type: ChatSenderType;
  text: string | null;
  attachments: ChatAttachment[];
  external_message_id: string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  sent_at: string;
  send_status: ChatSendStatus;
  send_error: string | null;
  send_via: string | null;
};

/** ข้อความเข้าที่แปลงจาก webhook/การดึงแล้ว (ก่อนบันทึก) */
export type ChatInbound = {
  channel: ChatChannel;
  accountRef: string;
  externalConvId: string;
  kind: "message" | "follow" | "unfollow";
  externalMessageId: string;
  text: string | null;
  attachments: ChatAttachment[];
  sentAt: string;
  /** รหัสสื่อที่ต้องไปดึงจากแพลตฟอร์ม (เช่น รูปจาก LINE) — ตัวต่อช่องทางดึงลง R2 แล้วแทนเป็น attachment */
  mediaId?: string | null;
  /** (LINE) โทเคนตอบฟรี / โทเคนทำเครื่องหมายอ่านแล้ว */
  replyToken?: string | null;
  readToken?: string | null;
  /**
   * (ร้านค้าออนไลน์ที่ดึงเอง) ข้อความที่ร้านตอบเองในแอป/Seller Centre/BigSeller = "out" — บันทึกให้เห็นในห้อง + นับว่าตอบแล้ว
   * ไม่ใส่ = ข้อความจากลูกค้า
   */
  direction?: "in" | "out";
  /** ชื่อ/รูปลูกค้าที่ได้มาพร้อมรายการห้อง (ไม่ต้องถามแพลตฟอร์มเพิ่ม) */
  profile?: { name: string | null; avatar: string | null } | null;
  /** ค่าประจำห้องที่ตัวต่อช่องทางต้องใช้ตอนส่ง (เช่น Shopee buyer id) — รวมเข้า meta ของห้อง */
  convMeta?: Record<string, unknown>;
};

/** สิ่งที่พนักงานสั่งส่ง */
export type ChatSendRequest = {
  text?: string | null;
  imageKey?: string | null;
  product?: Extract<ChatAttachment, { kind: "product" }> | null;
};

/** ผลการส่ง — error = ข้อความภาษาคน */
export type ChatSendResult = { ok: boolean; via: "reply" | "push" | "api" | null; error: string | null; externalId?: string | null };

/** ข้อความสำเร็จรูป (brand_id = null → ใช้ทุกแบรนด์) */
export type ChatQuickReply = { id: string; label: string; body: string; brand_id: string | null };

/** ค่าตั้งห้องแชท (ui_config key chat_settings) */
export type ChatSettings = {
  /** บอท LINE ตัวไหนรับแชทลูกค้าเข้าห้องแชท + เป็นของแบรนด์ไหน (key = คีย์บอทใน line_config) */
  line_bots: Record<string, { enabled: boolean; brand_id: string | null }>;
  quick_replies: ChatQuickReply[];
  /**
   * ร้านค้าออนไลน์ที่รับแชทเข้าห้อง (key = "<ช่องทาง>:<brand_id>" เช่น "shopee:bd33…") — ร้านต้องเชื่อมต่อที่หน้าบัญชีแพลตฟอร์มก่อน
   * ไม่มีในนี้ = ยังไม่รับ (ต้องติ๊กเอง — เปิดแล้วระบบเริ่มดึงแชท + แจ้งเตือน)
   */
  shops: Record<string, { enabled: boolean }>;
  /** แจ้งเตือนกระดิ่งแยกช่องทาง — false = ไม่เด้งกระดิ่ง (ห้องยังเข้าตามปกติ) · ไม่มีค่า = แจ้ง */
  notify: Partial<Record<ChatChannel, boolean>>;
};

/** ช่องทางร้านค้าออนไลน์ที่ระบบดึงแชทเอง (เรียงตามที่โชว์) */
export const SHOP_CHAT_CHANNELS = ["shopee", "lazada", "tiktok"] as const;
export type ShopChatChannel = (typeof SHOP_CHAT_CHANNELS)[number];
export const isShopChatChannel = (v: unknown): v is ShopChatChannel => typeof v === "string" && (SHOP_CHAT_CHANNELS as readonly string[]).includes(v);

/** สถานะการรับแชทของร้าน 1 ร้าน (หน้าตั้งค่า + ป้ายในหน้าแชท) */
/** manual_only = ต่อได้แต่ระบบดึงเองไม่ได้ ต้องกดดึงเอง (Lazada — กติกาห้ามดึงเป็นรอบ) */
export type ShopChatState = "ready" | "manual_only" | "off" | "no_permission" | "not_connected" | "expired" | "error";
export type ShopChatStatus = {
  key: string; channel: ShopChatChannel; brand_id: string; brand_name: string | null; shop_name: string | null;
  enabled: boolean; state: ShopChatState; note: string | null; last_ok_at: string | null;
};
