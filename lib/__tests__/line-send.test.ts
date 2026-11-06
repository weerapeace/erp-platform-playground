import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLineBotKey, lineBot, lineBotKeyFor, lineBots, lineConfigForBot, linePush, linePushRaw, lineErrorText, lineText, lineTokenFor,
  type LineConfig,
} from "@/lib/line-send";

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

  it("ไม่ได้เลือกบอท = ทุก slot ใช้บอทหลัก", () => {
    expect(lineTokenFor({ token: "TK" }, "qc")).toBe("TK");
    expect(lineTokenFor({ token: "TK" }, null)).toBe("TK");
    expect(lineTokenFor({}, "qc")).toBe("");
  });
});

describe("หลายบอท", () => {
  const cfg: LineConfig = {
    token: "MAIN", group_id: "Gmain",
    bots: { bprod: { label: "บอทผลิต", token: "PROD", channel_secret: "s", group_id: "Gp" }, bnotk: { label: "ไม่มีโทเคน" } },
    slot_bot: { production: "bprod", qc: "bnotk", creative: "bgone" },
  };

  it("กลุ่มที่เลือกบอทเสริม → ใช้โทเคนบอทนั้น", () => {
    expect(lineTokenFor(cfg, "production")).toBe("PROD");
    expect(lineBotKeyFor(cfg, "production")).toBe("bprod");
  });

  it("บอทยังไม่มีโทเคน / บอทถูกลบ / ไม่ได้เลือก → กลับไปบอทหลัก (ไม่เงียบ)", () => {
    expect(lineTokenFor(cfg, "qc")).toBe("MAIN");
    expect(lineTokenFor(cfg, "creative")).toBe("MAIN");
    expect(lineTokenFor(cfg, "bills")).toBe("MAIN");
    expect(lineTokenFor(cfg, null)).toBe("MAIN");   // ส่งหาช่างรายคน = บอทหลัก
  });

  it("ส่งจริงด้วยโทเคนของบอทที่ดูแลกลุ่ม", async () => {
    const fn = stubFetch(200);
    await linePush(cfg, { to: "Gp", slot: "production", messages: [lineText("x")] });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer PROD");
  });

  it("รายชื่อบอท: บอทหลักก่อนเสมอ", () => {
    expect(lineBots(cfg).map((b) => b.key)).toEqual(["main", "bprod", "bnotk"]);
    expect(lineBot(cfg, "nope")).toBeNull();
  });

  it("ค่าตั้งในมุมบอทเสริม (ให้ webhook) → token/กลุ่มล่าสุดเป็นของบอทนั้น ที่เหลือเหมือนเดิม", () => {
    const v = lineConfigForBot(cfg, "bprod");
    expect(v.token).toBe("PROD");
    expect(v.group_id).toBe("Gp");
    expect(v.slot_bot).toEqual(cfg.slot_bot);
    expect(lineConfigForBot(cfg, "main")).toBe(cfg);
  });

  it("คีย์บอทใน URL: รับเฉพาะรูปแบบปลอดภัย และไม่ใช่ main", () => {
    expect(isLineBotKey("bprod")).toBe(true);
    expect(isLineBotKey("main")).toBe(false);
    expect(isLineBotKey("../x")).toBe(false);
  });
});
