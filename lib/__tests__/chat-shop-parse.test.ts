/**
 * ห้องแชทรวม เฟส 2 — แปลงข้อความ Shopee / Lazada / TikTok (lib/chat/shop-parse)
 * ตัวอย่างข้อมูลจัดรูปตามคำตอบจริงของ API (ชื่อช่อง/หน่วยเวลา) — docs/chat-inbox.md หัวข้อเฟส 2
 */
import { describe, expect, it } from "vitest";
import {
  anyTsToMs, isChatPermissionError, lazadaMessageOf, lazadaSessionOf, nsGreater, parseJsonContent, shopeeConvOf, shopeeImageUrl,
  shopeeMessageOf, tiktokConvOf, tiktokMessageOf, toInbound, toIso,
} from "@/lib/chat/shop-parse";

const SHOP = "9944732";

describe("เวลา", () => {
  it("วินาที / มิลลิวินาที / นาโนวินาที", () => {
    expect(toIso(1764064800, "s")).toBe("2025-11-25T10:00:00.000Z");
    expect(toIso("1764064800000", "ms")).toBe("2025-11-25T10:00:00.000Z");
    expect(toIso("1764064800123456789", "ns")).toBe("2025-11-25T10:00:00.123Z");
    expect(toIso("abc", "s")).toBeNull();
    expect(toIso(12, "s")).toBeNull();
  });
  it("เวลาไม่รู้หน่วย → มิลลิวินาที (ดูจากจำนวนหลัก)", () => {
    expect(anyTsToMs(1764064800)).toBe(1764064800000);
    expect(anyTsToMs("1764064800123")).toBe(1764064800123);
    expect(anyTsToMs("1764064800123456")).toBe(1764064800123);
    expect(anyTsToMs("1764064800123456789")).toBe(1764064800123);
    expect(anyTsToMs("")).toBe(0);
    expect(anyTsToMs("12")).toBe(0);
  });
  it("เทียบนาโนวินาทีแบบข้อความ (เกิน Number)", () => {
    expect(nsGreater("1764064800123456790", "1764064800123456789")).toBe(true);
    expect(nsGreater("1764064800123456789", "1764064800123456789")).toBe(false);
    expect(nsGreater("999", "1000")).toBe(false);
  });
});

describe("Shopee", () => {
  it("แถวห้อง: เก็บรหัสเป็นข้อความ (64 บิต)", () => {
    const c = shopeeConvOf({ conversation_id: "2442096651766497650", to_id: 123456789, to_name: "nong_mai88", to_avatar: "abcdEF12_avatar", last_message_timestamp: "1764064800123456789", unread_count: 2 });
    expect(c).toEqual({ id: "2442096651766497650", buyerId: "123456789", name: "nong_mai88", avatar: "https://cf.shopee.co.th/file/abcdEF12_avatar", lastMs: 1764064800123, lastRaw: "1764064800123456789", unread: 2 });
    expect(shopeeConvOf({ conversation_id: "x", to_id: 1 })).toBeNull();
  });
  it("ข้อความลูกค้า / ร้านตอบเอง / ตอบอัตโนมัติ", () => {
    const conv = { id: "2442096651766497650", shopId: SHOP };
    const inMsg = shopeeMessageOf({ message_id: "111", message_type: "text", from_shop_id: 0, created_timestamp: 1764064800, content: { text: "ยังมีของไหมคะ" } }, conv);
    expect(inMsg).toMatchObject({ direction: "in", text: "ยังมีของไหมคะ", externalMessageId: "111", skip: false, channel: "shopee" });
    const outMsg = shopeeMessageOf({ message_id: "112", message_type: "text", from_shop_id: 9944732, created_timestamp: 1764064900, content: { text: "มีค่ะ" } }, conv);
    expect(outMsg?.direction).toBe("out");
    const auto = shopeeMessageOf({ message_id: "113", message_type: "text", from_shop_id: 9944732, status: "auto_reply", created_timestamp: 1764064900, content: { text: "สวัสดีค่ะ ร้านจะตอบกลับโดยเร็ว" } }, conv);
    expect(auto?.skip).toBe(true);
  });
  it("รูป / ออเดอร์ / สติกเกอร์ / ชนิดที่ไม่รู้จัก", () => {
    const conv = { id: "1", shopId: SHOP };
    const img = shopeeMessageOf({ message_id: "1", message_type: "image", created_timestamp: 1764064800, content: { url: "https://cf.shopee.co.th/file/xyz" } }, conv);
    expect(img?.remoteImage).toBe("https://cf.shopee.co.th/file/xyz");
    const ord = shopeeMessageOf({ message_id: "2", message_type: "order", created_timestamp: 1764064800, content: { order_sn: "251124ABCD", shop_id: 9944732 } }, conv);
    expect(ord?.attachments).toEqual([{ kind: "order", order_no: "251124ABCD" }]);
    const st = shopeeMessageOf({ message_id: "3", message_type: "sticker", created_timestamp: 1764064800, content: { sticker_id: "9", sticker_package_id: "1", url: "https://cf.shopee.co.th/file/st" } }, conv);
    expect(st?.attachments[0]).toMatchObject({ kind: "sticker", url: "https://cf.shopee.co.th/file/st" });
    const odd = shopeeMessageOf({ message_id: "4", message_type: "faq_liveagent", created_timestamp: 1764064800, content: {} }, conv);
    expect(odd?.text).toContain("เปิดดูในแอป Shopee");
    const fromItem = shopeeMessageOf({ message_id: "5", message_type: "text", created_timestamp: 1764064800, content: { text: "สนใจค่ะ" }, source_content: { order_sn: "251124XYZ" } }, conv);
    expect(fromItem?.attachments).toEqual([{ kind: "order", order_no: "251124XYZ" }]);
  });
  it("รหัสรูปเปล่า → ลิงก์ CDN · http → https · ค่าแปลก = null", () => {
    expect(shopeeImageUrl("th-11134201-7r98o-abc")).toBe("https://cf.shopee.co.th/file/th-11134201-7r98o-abc");
    expect(shopeeImageUrl("http://cf.shopee.co.th/file/a")).toBe("https://cf.shopee.co.th/file/a");
    expect(shopeeImageUrl("<script>")).toBeNull();
  });
});

describe("Lazada", () => {
  it("แถวห้อง + content เป็นข้อความ JSON + ฝั่งร้าน = from_account_type 2", () => {
    expect(lazadaSessionOf({ session_id: "100094063_2_1011822749_1_103", buyer_id: 1011822749, title: "Somchai", head_url: "https://img.lazcdn.com/a.jpg", last_message_time: 1764064800000, unread_count: 1 }))
      .toMatchObject({ id: "100094063_2_1011822749_1_103", name: "Somchai", lastMs: 1764064800000 });
    const m = lazadaMessageOf({ message_id: "m1", template_id: 1, from_account_type: 1, type: 1, content: "{\"txt\":\"ขอเปลี่ยนสีได้ไหม\"}", send_time: 1764064800000 }, "s1");
    expect(m).toMatchObject({ text: "ขอเปลี่ยนสีได้ไหม", direction: "in", skip: false });
    const seller = lazadaMessageOf({ message_id: "m2", template_id: 1, from_account_type: 2, type: 1, content: "{\"txt\":\"ได้ค่ะ\"}", send_time: 1764064900000 }, "s1");
    expect(seller?.direction).toBe("out");
    const sys = lazadaMessageOf({ message_id: "m3", template_id: 2, type: 2, content: "{}", send_time: 1764064900000 }, "s1");
    expect(sys?.skip).toBe(true);
    const ord = lazadaMessageOf({ message_id: "m4", template_id: 10007, from_account_type: 1, content: "{\"orderId\":\"8812345\",\"status\":\"Shipped\"}", send_time: 1764064900000 }, "s1");
    expect(ord?.attachments).toEqual([{ kind: "order", order_no: "8812345", status: "Shipped" }]);
  });
  it("content ที่ไม่ใช่ JSON ไม่ทำพัง", () => {
    expect(parseJsonContent("สวัสดี")).toEqual({ txt: "สวัสดี", content: "สวัสดี" });
  });
});

describe("TikTok", () => {
  it("แถวห้อง: ชื่อ/รูปจากผู้ร่วมห้องที่เป็น BUYER", () => {
    const c = tiktokConvOf({ id: "7494931612349", unread_count: 3, can_send_message: true, participants: [{ role: "SHOP", nickname: "Louis" }, { role: "BUYER", nickname: "joy_shop", avatar: "https://p16.tiktokcdn.com/a.jpg" }], latest_message: { create_time: 1764064800 } });
    expect(c).toMatchObject({ id: "7494931612349", name: "joy_shop", avatar: "https://p16.tiktokcdn.com/a.jpg", lastS: 1764064800, unread: 3 });
  });
  it("ข้อความ: ลูกค้า / ร้าน / ระบบ / ซ่อน", () => {
    const b = tiktokMessageOf({ id: "a1", type: "TEXT", content: "{\"content\":\"ส่งวันไหนคะ\"}", create_time: 1764064800, is_visible: true, sender: { role: "BUYER" } }, "c1");
    expect(b).toMatchObject({ text: "ส่งวันไหนคะ", direction: "in", skip: false });
    expect(tiktokMessageOf({ id: "a2", type: "TEXT", content: "{\"content\":\"พรุ่งนี้ค่ะ\"}", create_time: 1764064900, sender: { role: "CUSTOMER_SERVICE" } }, "c1")?.direction).toBe("out");
    expect(tiktokMessageOf({ id: "a3", type: "NOTIFICATION", content: "{\"content\":\"x\"}", create_time: 1764064900, sender: { role: "SYSTEM" } }, "c1")?.skip).toBe(true);
    expect(tiktokMessageOf({ id: "a4", type: "TEXT", content: "{\"content\":\"y\"}", create_time: 1764064900, is_visible: false, sender: { role: "BUYER" } }, "c1")?.skip).toBe(true);
    const img = tiktokMessageOf({ id: "a5", type: "IMAGE", content: "{\"url\":\"https://p16.tiktokcdn.com/i.jpg\",\"width\":\"800\",\"height\":\"600\"}", create_time: 1764064900, sender: { role: "BUYER" } }, "c1");
    expect(img?.remoteImage).toBe("https://p16.tiktokcdn.com/i.jpg");
  });
});

describe("ประกอบเป็นข้อความกลาง", () => {
  it("รูปที่เก็บลง R2 ได้ = แนบรูป · ไม่ได้ = ข้อความบอกให้เปิดในแอป · ข้อความลูกค้าจำรหัสไว้ทำ 'อ่านแล้ว'", () => {
    const p = shopeeMessageOf({ message_id: "9", message_type: "image", created_timestamp: 1764064800, content: { url: "https://cf.shopee.co.th/file/z" } }, { id: "1", shopId: SHOP })!;
    const ok = toInbound(p, "brand-1", { imageKey: "chat/shopee/2026-11/x.jpg", convMeta: { buyer_id: "5" } });
    expect(ok.attachments[0]).toEqual({ kind: "image", key: "chat/shopee/2026-11/x.jpg" });
    expect(ok.convMeta).toEqual({ buyer_id: "5", last_in_message_id: "9" });
    expect(toInbound(p, "brand-1").text).toContain("ดึงรูปไม่สำเร็จ");
  });
});

describe("ข้อผิดพลาดแบบไม่มีสิทธิ์แชท", () => {
  it("แยกจากกุญแจหมดอายุ", () => {
    expect(isChatPermissionError("lazada", "InsufficientPermission", "App does not have permission to access this api")).toBe(true);
    expect(isChatPermissionError("tiktok", "105005", "app has not been granted any access scope")).toBe(true);
    expect(isChatPermissionError("tiktok", "105002", "access token expired")).toBe(false);
    expect(isChatPermissionError("shopee", "error_auth", "Invalid access_token")).toBe(false);
  });
});
