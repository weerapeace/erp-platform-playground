import { describe, it, expect } from "vitest";
import { isSocialHost, parseSocialLink, pinRatioFromSize, pinterestFit, socialEmbedSize, socialEmbedSrc } from "@/lib/social-embed";

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

describe("pinterestFit — ยืด/หดกล่องพินแล้วไม่ถูกตัด", () => {
  const ratio = 564 / 1002; // พินแนวตั้งที่เจ้าของวาง (กล่องเริ่ม 345×710)
  const inside = (f: ReturnType<typeof pinterestFit>, w: number, h: number) => {
    expect(f.left).toBeGreaterThanOrEqual(-0.01); expect(f.top).toBeGreaterThanOrEqual(-0.01);
    expect(f.left + f.frameW * f.scale).toBeLessThanOrEqual(w + 0.01);
    expect(f.top + f.frameH * f.scale).toBeLessThanOrEqual(h + 0.01);
  };
  it("ขนาดตั้งต้น = ไม่ย่อไม่ขยาย", () => {
    const f = pinterestFit(345, 710, ratio);
    expect(f.frameW).toBe(345); expect(f.scale).toBeCloseTo(1, 2);
  });
  it("หดเล็กกว่าที่ตัวฝังรับได้ (เคสในภาพเจ้าของ ~130×230) → วาดกว้าง 236 แล้วย่อทั้งก้อน", () => {
    const f = pinterestFit(130, 230, ratio);
    expect(f.frameW).toBe(236); expect(f.scale).toBeLessThan(1); inside(f, 130, 230);
  });
  it("ยืดใหญ่เกิน 600 → วาด 600 แล้วขยายให้เต็มกล่อง", () => {
    const f = pinterestFit(900, 1850, ratio);
    expect(f.frameW).toBe(600); expect(f.scale).toBeGreaterThan(1); inside(f, 900, 1850);
  });
  it("ยืดแค่ด้านเดียว (กว้างขึ้น/เตี้ยลง) → ย่อให้พอดีด้านที่แคบกว่า + จัดกลาง", () => {
    const f = pinterestFit(500, 400, ratio); inside(f, 500, 400); expect(f.left).toBeGreaterThan(0);
  });
  it("ยังไม่รู้สัดส่วนรูป → ใช้สัดส่วนกล่อง (เต็มกล่องพอดี)", () => {
    const f = pinterestFit(300, 600, null);
    expect(f.left).toBeCloseTo(0, 5); expect(f.top).toBeCloseTo(0, 5);
  });
  it("สัดส่วนรูปจากขนาดที่ API คืน", () => {
    expect(pinRatioFromSize({ width: 345, height: 518 })).toBeCloseTo(564 / 689, 2);
  });
});
