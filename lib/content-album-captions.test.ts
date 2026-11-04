import { describe, expect, it } from "vitest";
import { captionForPlatform, hasAnyCaption, normalizeCaptionDrafts } from "./content-album-captions";

describe("normalizeCaptionDrafts", () => {
  it("รูปแบบผิด = ว่าง · คีย์แปลก/ค่าว่างถูกตัดทิ้ง", () => {
    expect(normalizeCaptionDrafts(null)).toEqual({});
    expect(normalizeCaptionDrafts([1, 2])).toEqual({});
    expect(normalizeCaptionDrafts({ "bad key!": { caption: "x" }, instagram: { caption: "  " }, x: "text" })).toEqual({});
  });
  it("เก็บแคปชั่น/แฮชแท็ก/แม่แบบ · ตัดยาวเกิน", () => {
    const r = normalizeCaptionDrafts({ instagram: { caption: "สวัสดี", hashtags: "#a #b", caption_type: "short" }, x: { caption: "y".repeat(12000) } });
    expect(r.instagram).toEqual({ caption: "สวัสดี", hashtags: "#a #b", caption_type: "short" });
    expect(r.x.caption?.length).toBe(10000);
  });
});

describe("captionForPlatform / hasAnyCaption", () => {
  const drafts = normalizeCaptionDrafts({ instagram: { caption: "IG", hashtags: "#ig" }, x: { caption_type: "short" } });
  it("ของแพลตฟอร์มเอง → ไม่มีใช้แคปชั่นกลาง → ไม่มีเลย = null", () => {
    expect(captionForPlatform(drafts, "กลาง", "instagram")?.caption).toBe("IG");
    expect(captionForPlatform(drafts, "กลาง", "facebook")?.caption).toBe("กลาง");
    expect(captionForPlatform(drafts, "กลาง", "x")).toEqual({ caption: "กลาง", hashtags: null, caption_type: "short" });
    expect(captionForPlatform({}, null, "facebook")).toBeNull();
  });
  it("นับว่ามีแคปชั่น: กลาง หรือแพลตฟอร์มไหนก็ได้", () => {
    expect(hasAnyCaption({}, null)).toBeNull();
    expect(hasAnyCaption({}, "กลาง")).toBe("กลาง");
    expect(hasAnyCaption(drafts, null)).toBe("IG");
  });
});
