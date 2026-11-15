import { describe, expect, it } from "vitest";
import { isLineUserId, lineEventToInbound, pickLineChatEvents, type LineChatEvent } from "@/lib/chat/line";
import type { LineEvent } from "@/lib/line-intake";

const U = "U" + "a".repeat(32);
const base = { timestamp: Date.parse("2026-11-15T10:00:00.000Z"), replyToken: "rt1" };

describe("เลือก event แชท 1:1", () => {
  it("เอาเฉพาะผู้ใช้ 1:1 (ข้อความ / เพิ่มเพื่อน / บล็อก) — กลุ่มเป็นของระบบเดิม", () => {
    const events = [
      { ...base, type: "message", source: { type: "user", userId: U }, message: { id: "1", type: "text", text: "hi" } },
      { ...base, type: "message", source: { type: "group", groupId: "Cxxxxxxxxxx", userId: U }, message: { id: "2", type: "image" } },
      { ...base, type: "follow", source: { type: "user", userId: U } },
      { ...base, type: "postback", source: { type: "user", userId: U } },
      { ...base, type: "message", source: { type: "user", userId: "bad" }, message: { id: "3", type: "text", text: "x" } },
    ] as LineEvent[];
    expect(pickLineChatEvents(events).map((e) => e.type)).toEqual(["message", "follow"]);
  });
  it("รูปแบบ userId ของ LINE", () => {
    expect(isLineUserId(U)).toBe(true);
    expect(isLineUserId("U123")).toBe(false);
    expect(isLineUserId(null)).toBe(false);
  });
});

describe("แปลง event → ข้อความกลาง", () => {
  const msg = (message: LineChatEvent["message"], extra: Partial<LineChatEvent> = {}): LineChatEvent =>
    ({ ...base, type: "message", source: { type: "user", userId: U }, message, ...extra });

  it("ข้อความ + โทเคนตอบ/อ่านแล้ว", () => {
    const r = lineEventToInbound(msg({ id: "100", type: "text", text: "มีสีดำไหม", markAsReadToken: "mt" }), "lm_oa");
    expect(r).toMatchObject({
      channel: "line", accountRef: "lm_oa", externalConvId: U, kind: "message", externalMessageId: "100",
      text: "มีสีดำไหม", attachments: [], mediaId: null, replyToken: "rt1", readToken: "mt", sentAt: "2026-11-15T10:00:00.000Z",
    });
  });
  it("รูป = ให้เซิร์ฟเวอร์ไปดึง (mediaId)", () => {
    expect(lineEventToInbound(msg({ id: "101", type: "image" }), "k")).toMatchObject({ mediaId: "101", text: null, attachments: [] });
  });
  it("สติกเกอร์ / ไฟล์ / ตำแหน่ง", () => {
    expect(lineEventToInbound(msg({ id: "102", type: "sticker", packageId: "11537", stickerId: "52002734" }), "k")?.attachments)
      .toEqual([{ kind: "sticker", package_id: "11537", sticker_id: "52002734" }]);
    expect(lineEventToInbound(msg({ id: "103", type: "file", fileName: "สลิป.pdf" }), "k")?.attachments).toEqual([{ kind: "file", label: "สลิป.pdf" }]);
    expect(lineEventToInbound(msg({ id: "104", type: "location", address: "กรุงเทพ" }), "k")?.attachments).toEqual([{ kind: "location", label: "กรุงเทพ" }]);
  });
  it("ชนิดที่ไม่รู้จัก = ข้อความบอกให้ดูในแอป", () => {
    expect(lineEventToInbound(msg({ id: "105", type: "newtype" }), "k")?.text).toContain("แอป LINE OA");
  });
  it("id ข้อความผิดรูปแบบ / ไม่มี userId = ไม่ใช้", () => {
    expect(lineEventToInbound(msg({ id: "abc", type: "text", text: "x" }), "k")).toBeNull();
    expect(lineEventToInbound({ ...base, type: "message", source: { type: "user" }, message: { id: "1", type: "text" } } as LineChatEvent, "k")).toBeNull();
  });
  it("เพิ่มเพื่อน / บล็อก = ข้อความระบบ (กันซ้ำด้วย webhookEventId)", () => {
    const f = lineEventToInbound({ ...base, type: "follow", webhookEventId: "01HXYZ", source: { type: "user", userId: U } }, "k");
    expect(f).toMatchObject({ kind: "follow", externalMessageId: "ev:01HXYZ", replyToken: "rt1" });
    const u = lineEventToInbound({ ...base, type: "unfollow", webhookEventId: "01HABC", source: { type: "user", userId: U } }, "k");
    expect(u).toMatchObject({ kind: "unfollow", externalMessageId: "ev:01HABC", replyToken: null });
    expect(u?.text).toContain("บล็อก");
  });
});
