import { describe, expect, it } from "vitest";
import {
  CHAT_CHANNEL_INFO, LINE_REPLY_TOKEN_MS, chatPreview, chatTextError, cleanChatSettings, inboundPatch, isUnanswered,
  lineCanReplyFree, lineFreeSecondsLeft, lineStickerUrl, outboundPatch, parseChatFilter, quickRepliesFor, renderQuickReply,
  replyUntilFor, replyWindowState, waitingText, type ConvState,
} from "@/lib/chat/rules";

const T0 = Date.parse("2026-11-15T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("LINE ตอบฟรี (โทเคนตอบกลับ 1 นาที)", () => {
  it("ได้โทเคนมาไม่เกิน 50 วิ = ตอบฟรี", () => {
    expect(lineCanReplyFree(iso(T0), true, T0 + 10_000)).toBe(true);
    expect(lineFreeSecondsLeft(iso(T0), true, T0 + 10_000)).toBe(40);
  });
  it("เกิน 50 วิ / ไม่มีโทเคน = push (นับโควตา)", () => {
    expect(lineCanReplyFree(iso(T0), true, T0 + LINE_REPLY_TOKEN_MS)).toBe(false);
    expect(lineCanReplyFree(iso(T0), false, T0 + 1000)).toBe(false);
    expect(lineCanReplyFree(null, true, T0)).toBe(false);
    expect(lineFreeSecondsLeft(iso(T0), true, T0 + 120_000)).toBe(0);
  });
  it("เวลาในอนาคต (นาฬิกาเพี้ยน) ไม่นับว่าใช้ได้", () => {
    expect(lineCanReplyFree(iso(T0 + 5000), true, T0)).toBe(false);
  });
});

describe("ช่วงเวลาตอบ", () => {
  it("LINE ไม่จำกัด · Facebook 24 ชม. · TikTok 7 วัน", () => {
    expect(replyUntilFor("line", iso(T0))).toBeNull();
    expect(replyUntilFor("facebook", iso(T0))).toBe(iso(T0 + 24 * 3600_000));
    expect(replyUntilFor("tiktok", iso(T0))).toBe(iso(T0 + 7 * 24 * 3600_000));
  });
  it("สถานะป้ายเตือน", () => {
    expect(replyWindowState(null, T0).state).toBe("none");
    expect(replyWindowState(iso(T0 + 5 * 3600_000), T0).state).toBe("open");
    expect(replyWindowState(iso(T0 + 30 * 60_000), T0)).toEqual({ state: "closing", minutesLeft: 30 });
    expect(replyWindowState(iso(T0 - 1), T0).state).toBe("closed");
  });
});

describe("ข้อความ", () => {
  it("ข้อความย่อ: ข้อความก่อน แล้วค่อยชนิดไฟล์แนบ", () => {
    expect(chatPreview("  สวัสดี\nครับ  ")).toBe("สวัสดี ครับ");
    expect(chatPreview(null, [{ kind: "image", key: "chat/x.jpg" }])).toBe("[รูปภาพ]");
    expect(chatPreview("", [{ kind: "product", code: "A1", name: "กระเป๋า" }])).toBe("[สินค้า] กระเป๋า");
    expect(chatPreview(null, [])).toBe("");
    expect(chatPreview("x".repeat(200)).length).toBe(80);
  });
  it("ความยาวเกินตามช่องทาง", () => {
    expect(chatTextError("tiktok", "ก".repeat(2000))).toBeNull();
    expect(chatTextError("tiktok", "ก".repeat(2001))).toContain("2,000");
    expect(chatTextError("line", "a".repeat(5000))).toBeNull();
    expect(CHAT_CHANNEL_INFO.instagram.maxText).toBe(1000);
  });
  it("สติกเกอร์ LINE = ลิงก์ CDN เฉพาะรหัสตัวเลข", () => {
    expect(lineStickerUrl("52002734")).toContain("/sticker/52002734/");
    expect(lineStickerUrl("../x")).toBeNull();
    expect(lineStickerUrl(null)).toBeNull();
  });
});

describe("สถานะห้องเมื่อมีข้อความเข้า/ออก", () => {
  const answered: ConvState = { status: "open", last_message_at: iso(T0), last_direction: "out", waiting_since: null, unread_count: 0 };

  it("ห้องใหม่ = รอ + แจ้งเตือน", () => {
    const r = inboundPatch(null, iso(T0), "สวัสดี", "line");
    expect(r.notify).toBe(true);
    expect(r.patch).toMatchObject({ status: "open", waiting_since: iso(T0), unread_count: 1, last_direction: "in", last_preview: "สวัสดี" });
  });
  it("ลูกค้าส่งรัว ๆ แจ้งครั้งเดียว และนับเวลารอจากข้อความแรก", () => {
    const first = inboundPatch(answered, iso(T0 + 1000), "a", "line");
    expect(first.notify).toBe(true);
    const state: ConvState = { ...answered, ...first.patch } as ConvState;
    const second = inboundPatch(state, iso(T0 + 5000), "b", "line");
    expect(second.notify).toBe(false);
    expect(second.patch.waiting_since).toBe(iso(T0 + 1000));
    expect(second.patch.unread_count).toBe(2);
  });
  it("ห้องที่จบแล้ว ลูกค้าทักใหม่ = เปิดกลับ + แจ้งเตือน", () => {
    const done: ConvState = { ...answered, status: "done", waiting_since: iso(T0 - 9999) };
    const r = inboundPatch(done, iso(T0 + 1000), "มีอีกเรื่อง", "line");
    expect(r.notify).toBe(true);
    expect(r.patch.status).toBe("open");
    expect(r.patch.waiting_since).toBe(iso(T0 + 1000));
  });
  it("ข้อความเก่าที่มาช้า ไม่ทับล่าสุด ไม่ทำให้ห้องที่ตอบแล้วกลับเป็นรอ", () => {
    const r = inboundPatch(answered, iso(T0 - 60_000), "เก่า", "line");
    expect(r.notify).toBe(false);
    expect(r.patch).toEqual({ unread_count: 1 });
  });
  it("Facebook ตั้งเวลาตอบได้ 24 ชม.", () => {
    expect(inboundPatch(null, iso(T0), "x", "facebook").patch.reply_until).toBe(iso(T0 + 24 * 3600_000));
  });
  it("ส่งสำเร็จ = ตอบแล้ว + ล้างตัวนับ", () => {
    expect(outboundPatch(iso(T0), "ได้ครับ")).toEqual({ last_message_at: iso(T0), last_preview: "ได้ครับ", last_direction: "out", waiting_since: null, unread_count: 0 });
    expect(isUnanswered({ status: "open", waiting_since: iso(T0) })).toBe(true);
    expect(isUnanswered({ status: "done", waiting_since: iso(T0) })).toBe(false);
    expect(isUnanswered({ status: "open", waiting_since: null })).toBe(false);
  });
  it("ป้ายเวลารอ", () => {
    expect(waitingText(iso(T0), T0 + 20_000)).toBe("เพิ่งทัก");
    expect(waitingText(iso(T0), T0 + 5 * 60_000)).toBe("รอ 5 นาที");
    expect(waitingText(iso(T0), T0 + 3 * 3600_000)).toBe("รอ 3 ชม.");
    expect(waitingText(iso(T0), T0 + 50 * 3600_000)).toBe("รอ 2 วัน");
    expect(waitingText(null)).toBe("");
  });
});

describe("ตัวกรองรายการห้อง", () => {
  it("ค่าเริ่ม = ห้องที่ยังเปิด 60 ห้อง", () => {
    expect(parseChatFilter(new URLSearchParams())).toEqual({ channel: null, brand: null, status: "open", unanswered: false, mine: false, q: "", limit: 60 });
  });
  it("ค่าแปลกตัดทิ้ง · คำค้นตัดอักขระพิเศษของตัวกรอง", () => {
    const f = parseChatFilter(new URLSearchParams("channel=xx&brand=abc&status=zzz&limit=999&q=a,b(c)*%25d&unanswered=1&mine=1"));
    expect(f.channel).toBeNull();
    expect(f.brand).toBeNull();
    expect(f.status).toBe("open");
    expect(f.limit).toBe(100);
    expect(f.q).toBe("a b c d");
    expect(f.unanswered && f.mine).toBe(true);
    expect(parseChatFilter(new URLSearchParams("channel=line&status=all&brand=bd337b57-c9d9-4f8a-b45d-e0f6cab3ddc8")))
      .toMatchObject({ channel: "line", status: "all", brand: "bd337b57-c9d9-4f8a-b45d-e0f6cab3ddc8" });
  });
});

describe("ค่าตั้ง + ข้อความสำเร็จรูป", () => {
  const B = "bd337b57-c9d9-4f8a-b45d-e0f6cab3ddc8";
  it("ทำความสะอาดค่าตั้ง", () => {
    const s = cleanChatSettings({
      line_bots: { lm_oa: { enabled: true, brand_id: B }, "BAD KEY": { enabled: true }, ig: { enabled: "yes", brand_id: "x" } },
      quick_replies: [{ id: "a", label: "ทักทาย", body: "สวัสดีค่ะ {customer}" }, { label: "", body: "x" }, { id: "a", label: "ซ้ำ id", body: "y", brand_id: B }],
    });
    expect(s.line_bots).toEqual({ lm_oa: { enabled: true, brand_id: B }, ig: { enabled: false, brand_id: null } });
    expect(s.quick_replies.map((q) => q.id)).toEqual(["a", "a_"]);
    expect(cleanChatSettings(null)).toEqual({ line_bots: {}, quick_replies: [] });
  });
  it("ของแบรนด์ขึ้นก่อนค่ากลาง · ของแบรนด์อื่นไม่โผล่", () => {
    const list = [
      { id: "g", label: "กลาง", body: "x", brand_id: null },
      { id: "o", label: "แบรนด์อื่น", body: "x", brand_id: "11111111-1111-1111-1111-111111111111" },
      { id: "m", label: "ของแบรนด์", body: "x", brand_id: B },
    ];
    expect(quickRepliesFor(list, B).map((q) => q.id)).toEqual(["m", "g"]);
    expect(quickRepliesFor(list, null).map((q) => q.id)).toEqual(["g"]);
  });
  it("ประกอบข้อความ: {customer} + ตัวแปรแคปชั่นกลาง · บรรทัดที่ตัวแปรว่างตัดทิ้ง", () => {
    expect(renderQuickReply("สวัสดีค่ะ {customer}", { customer: "Nok" })).toBe("สวัสดีค่ะ Nok");
    expect(renderQuickReply("สวัสดีค่ะ {customer}", {})).toBe("สวัสดีค่ะ คุณลูกค้า");
    expect(renderQuickReply("รุ่น {product}\nราคา {price}", { product: "Tote" })).toBe("รุ่น Tote");
  });
});
