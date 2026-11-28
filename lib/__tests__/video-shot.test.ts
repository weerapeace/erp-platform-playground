import { describe, expect, it } from "vitest";
import { cleanShotBody, cleanTags, moveInOrder, parseShotLink, rangeText, shotEmbedSrc, shotWatchUrl } from "@/lib/video-shot";

describe("parseShotLink", () => {
  it("อ่านลิงก์ YouTube ทุกแบบ + เวลาที่ติดมา", () => {
    expect(parseShotLink("https://www.youtube.com/watch?v=r2nD_knsNrc&t=60s")).toMatchObject({ platform: "youtube", id: "r2nD_knsNrc", startHint: 60 });
    expect(parseShotLink("youtu.be/r2nD_knsNrc?t=1m5s")).toMatchObject({ platform: "youtube", id: "r2nD_knsNrc", startHint: 65 });
    expect(parseShotLink("https://youtube.com/shorts/abcDEF12345")).toMatchObject({ platform: "youtube", id: "abcDEF12345", startHint: null });
  });
  it("TikTok / Pinterest / ลิงก์สั้น", () => {
    expect(parseShotLink("https://www.tiktok.com/@shop/video/7312345678901234567")).toMatchObject({ platform: "tiktok", id: "7312345678901234567" });
    expect(parseShotLink("https://www.pinterest.com/pin/123456789012/")).toMatchObject({ platform: "pinterest", id: "123456789012" });
    expect(parseShotLink("https://vt.tiktok.com/ZSabc123/")).toMatchObject({ platform: "tiktok", id: null, short: true });
    expect(parseShotLink("https://pin.it/abc")).toMatchObject({ platform: "pinterest", id: null, short: true });
  });
  it("ลิงก์อื่น = null", () => {
    expect(parseShotLink("https://example.com/video.mp4")).toBeNull();
    expect(parseShotLink("")).toBeNull();
  });
});

describe("ลิงก์เล่น/เปิด", () => {
  it("YouTube ฝังพร้อมเริ่ม-จบ · เปิดลิงก์เริ่มตรงเวลา", () => {
    const src = shotEmbedSrc("youtube", "r2nD_knsNrc", { start: 62, end: 68.4 });
    expect(src).toContain("start=62");
    expect(src).toContain("end=69");
    expect(src).toContain("enablejsapi=1");
    expect(shotWatchUrl("youtube", "x", "r2nD_knsNrc", 62)).toBe("https://www.youtube.com/watch?v=r2nD_knsNrc&t=62s");
  });
  it("TikTok เปิดลิงก์ = ลิงก์เดิม (ใส่เวลาไม่ได้)", () => {
    expect(shotWatchUrl("tiktok", "https://www.tiktok.com/@a/video/1", "1", 3)).toBe("https://www.tiktok.com/@a/video/1");
    expect(shotEmbedSrc("tiktok", "7312345678901234567")).toContain("/player/v1/7312345678901234567");
  });
  it("rangeText", () => {
    expect(rangeText(62, 68)).toBe("1:02–1:08");
    expect(rangeText(null, 8)).toBe("0:00–0:08");
    expect(rangeText(5, null)).toBe("ตั้งแต่ 0:05");
    expect(rangeText(null, null)).toBe("");
  });
});

describe("cleanShotBody", () => {
  it("สร้าง: ต้องมีลิงก์ + ชื่อ · จบต้องมากกว่าเริ่ม", () => {
    expect(cleanShotBody({ title: "a" }, false).ok).toBe(false);
    expect(cleanShotBody({ url: "https://youtu.be/r2nD_knsNrc", title: "" }, false).ok).toBe(false);
    expect(cleanShotBody({ url: "https://youtu.be/r2nD_knsNrc", title: "a", start_sec: "1:08", end_sec: "1:02" }, false).ok).toBe(false);
    const ok = cleanShotBody({ url: "https://youtu.be/r2nD_knsNrc", title: "แพน", start_sec: "1:02", end_sec: 68, shot_size: "medium", camera_move: "xx", tags: "หนัง, กระเป๋า, หนัง" }, false);
    expect(ok).toMatchObject({ ok: true, patch: { platform: "youtube", video_id: "r2nD_knsNrc", start_sec: 62, end_sec: 68, shot_size: "medium", tags: ["หนัง", "กระเป๋า"] } });
    if (ok.ok) expect(ok.patch.camera_move).toBeNull();
  });
  it("ลิงก์สั้นที่ยังไม่ย่อ = ไม่ผ่าน", () => {
    expect(cleanShotBody({ url: "https://pin.it/abc", title: "a" }, false).ok).toBe(false);
  });
  it("แก้บางช่อง: เทียบเวลากับของเดิม", () => {
    expect(cleanShotBody({ end_sec: 10 }, true, { start_sec: 20, end_sec: 30 }).ok).toBe(false);
    expect(cleanShotBody({ end_sec: 40 }, true, { start_sec: 20, end_sec: 30 })).toMatchObject({ ok: true, patch: { end_sec: 40 } });
  });
});

describe("ตัวช่วยอื่น", () => {
  it("cleanTags ตัดซ้ำไม่สนตัวพิมพ์", () => { expect(cleanTags(["Pan", "pan", " ", "#x"])).toEqual(["Pan", "#x"]); });
  it("moveInOrder", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b"], "a", -1)).toBeNull();
  });
});
