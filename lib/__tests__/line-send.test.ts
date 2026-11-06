import { afterEach, describe, expect, it, vi } from "vitest";
import { linePush, linePushRaw, lineErrorText, lineText, lineTokenFor } from "@/lib/line-send";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const stubFetch = (status: number, body = "") => {
  const fn = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
};

describe("line-send (ตัวส่ง LINE กลาง)", () => {
  it("ส่งสำเร็จ → ใช้โทเคนบอทหลัก + ส่งไปปลายทางที่ระบุ", async () => {
    const fn = stubFetch(200);
    const r = await linePush({ token: " TK " }, { to: "G1", slot: "production", messages: [lineText("hi")] });
    expect(r).toEqual({ ok: true, status: 200, error: null });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TK");
    expect(JSON.parse(String(init.body))).toEqual({ to: "G1", messages: [{ type: "text", text: "hi" }] });
  });

  it("โควตาหมด (429) → ข้อความภาษาคนว่าโควตาหมด", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(429, '{"message":"You have reached your monthly limit."}');
    const r = await linePushRaw("TK", "G1", [lineText("x")]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
    expect(r.error).toContain("โควตา");
    expect(r.detail).toContain("monthly limit");
  });

  it("ยังไม่ตั้งโทเคน / ไม่มีปลายทาง → ไม่เรียก LINE เลย", async () => {
    const fn = stubFetch(200);
    expect((await linePush({}, { to: "G1", messages: [lineText("x")] })).ok).toBe(false);
    expect((await linePush({ token: "TK" }, { to: "", messages: [lineText("x")] })).ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("ติดต่อ LINE ไม่ได้ → status 0 ไม่โยน error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const r = await linePushRaw("TK", "G1", [lineText("x")]);
    expect(r).toEqual({ ok: false, status: 0, error: lineErrorText(0) });
  });

  it("ข้อความยาวเกิน → ตัดเหลือ 4,900 ตัวอักษร", () => {
    expect(String(lineText("ก".repeat(6000)).text).length).toBe(4900);
  });

  it("ตอนนี้ทุก slot ใช้บอทหลักตัวเดียว", () => {
    expect(lineTokenFor({ token: "TK" }, "qc")).toBe("TK");
    expect(lineTokenFor({ token: "TK" }, null)).toBe("TK");
    expect(lineTokenFor({}, "qc")).toBe("");
  });
});
