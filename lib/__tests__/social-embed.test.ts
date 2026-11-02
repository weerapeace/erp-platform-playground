import { describe, it, expect } from "vitest";
import { isSocialHost, parseSocialLink, socialEmbedSize, socialEmbedSrc } from "@/lib/social-embed";

describe("parseSocialLink — Pinterest", () => {
  it("ลิงก์พินทุกภาษา (www./es./th.) → เลขพิน + ลิงก์มาตรฐาน", () => {
    for (const raw of ["https://www.pinterest.com/pin/141511613288674010/", "https://es.pinterest.com/pin/895371969689965228/", "https://th.pinterest.com/pin/895371969689965228", "https://pinterest.co.uk/pin/895371969689965228/?nic=1"]) {
      const l = parseSocialLink(raw);
      expect(l?.kind).toBe("pinterest");
      expect(l?.short).toBe(false);
    }
    expect(parseSocialLink("https://es.pinterest.com/pin/895371969689965228/")).toEqual({ kind: "pinterest", id: "895371969689965228", short: false, url: "https://www.pinterest.com/pin/895371969689965228/" });
  });
  it("ลิงก์ที่ถูกตัดบรรทัดในกล่องข้อความบนกระดาน ยังอ่านได้", () => {
    expect(parseSocialLink("https://es.pinterest.com/\npin/89537196968996522\n8/\n")?.id).toBe("895371969689965228");
    expect(parseSocialLink("https://www.pinterest.com/pin/7528 04894010250850/")?.id).toBe("752804894010250850");
  });
  it("พินแบบมีชื่อนำหน้า (ชื่อ--เลข)", () => {
    expect(parseSocialLink("https://www.pinterest.com/pin/leather-bag--895371969689965228/")?.id).toBe("895371969689965228");
  });
  it("ลิงก์สั้น pin.it (มี/ไม่มี https://) → short", () => {
    expect(parseSocialLink("https://pin.it/2dkk0bTHQ")).toEqual({ kind: "pinterest", id: null, short: true, url: "https://pin.it/2dkk0bTHQ" });
    expect(parseSocialLink("pin.it/2dkk0bTHQ")?.short).toBe(true);
  });
  it("หน้าอื่นของ Pinterest (บอร์ด/โปรไฟล์) ไม่ใช่พิน → null", () => {
    expect(parseSocialLink("https://www.pinterest.com/carryleatherstudio/carryatwork/")).toBeNull();
    expect(parseSocialLink("https://www.pinterest.com/")).toBeNull();
  });
});

describe("parseSocialLink — TikTok", () => {
  it("ลิงก์คลิปเต็ม → เลขคลิป (ตัด query ทิ้ง)", () => {
    expect(parseSocialLink("https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1&sender_device=pc"))
      .toEqual({ kind: "tiktok", id: "6718335390845095173", short: false, url: "https://www.tiktok.com/@scout2015/video/6718335390845095173" });
    expect(parseSocialLink("https://m.tiktok.com/v/6718335390845095173.html")?.id).toBe("6718335390845095173");
    expect(parseSocialLink("https://www.tiktok.com/embed/v2/6718335390845095173")?.id).toBe("6718335390845095173");
  });
  it("ลิงก์สั้น vt./vm./t/ → short", () => {
    expect(parseSocialLink("https://vt.tiktok.com/ZSabc123/")).toEqual({ kind: "tiktok", id: null, short: true, url: "https://vt.tiktok.com/ZSabc123/" });
    expect(parseSocialLink("https://vm.tiktok.com/ZMabc123")?.short).toBe(true);
    expect(parseSocialLink("https://www.tiktok.com/t/ZTabc123/")?.short).toBe(true);
  });
  it("หน้าโปรไฟล์/หน้าแรก → null", () => {
    expect(parseSocialLink("https://www.tiktok.com/@scout2015")).toBeNull();
    expect(parseSocialLink("https://www.tiktok.com/")).toBeNull();
  });
});

describe("parseSocialLink — ไม่ใช่ลิงก์ที่รองรับ", () => {
  it("YouTube/ข้อความทั่วไป/โดเมนปลอม → null", () => {
    expect(parseSocialLink("https://www.youtube.com/watch?v=PsHutmw1YZg")).toBeNull();
    expect(parseSocialLink("Trend TikTok Videos")).toBeNull();
    expect(parseSocialLink("ref: https://www.pinterest.com/pin/141511613288674010/")).toBeNull();
    expect(parseSocialLink("https://pinterest.com.evil.io/pin/141511613288674010/")).toBeNull();
    expect(parseSocialLink("https://evil.io/www.tiktok.com/@a/video/6718335390845095173")).toBeNull();
    expect(parseSocialLink("")).toBeNull();
    expect(parseSocialLink(null)).toBeNull();
  });
});

describe("isSocialHost / socialEmbedSrc / socialEmbedSize", () => {
  it("โดเมนที่ลิงก์สั้นเด้งไปได้", () => {
    expect(isSocialHost("api.pinterest.com")).toBe(true);
    expect(isSocialHost("www.tiktok.com")).toBe(true);
    expect(isSocialHost("pin.it")).toBe(true);
    expect(isSocialHost("tiktok.com.evil.io")).toBe(false);
    expect(isSocialHost("169.254.169.254")).toBe(false);
  });
  it("ลิงก์ตัวฝังทางการ", () => {
    expect(socialEmbedSrc("pinterest", "141511613288674010")).toBe("https://assets.pinterest.com/ext/embed.html?id=141511613288674010");
    expect(socialEmbedSrc("tiktok", "6718335390845095173")).toContain("https://www.tiktok.com/player/v1/6718335390845095173");
  });
  it("ขนาดพินตามสัดส่วนรูป (564×689 → 345×518 เท่าที่วัดจริง)", () => {
    expect(socialEmbedSize("pinterest", 564 / 689)).toEqual({ width: 345, height: 518 });
    expect(socialEmbedSize("pinterest")).toEqual({ width: 345, height: 620 });
    expect(socialEmbedSize("tiktok")).toEqual({ width: 325, height: 578 });
  });
});
