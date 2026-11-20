import { describe, expect, it } from "vitest";
import { cleanTargetUrl, extractUrls, isShortenableShopUrl, normalizeShortCode, replaceWithShortLinks, shortCodeProblem, shortLinkSourceOf, randomShortCode, SHORT_CODE_RE } from "@/lib/short-links";

describe("short-links", () => {
  it("รับเฉพาะ http/https", () => {
    expect(cleanTargetUrl("https://shop.tiktok.com/view/product/1?region=TH")).toBe("https://shop.tiktok.com/view/product/1?region=TH");
    expect(cleanTargetUrl("javascript:alert(1)")).toBeNull();
    expect(cleanTargetUrl("data:text/html,x")).toBeNull();
    expect(cleanTargetUrl("ftp://x.com")).toBeNull();
    expect(cleanTargetUrl("https://a.com/x y")).toBeNull();
  });
  it("ย่อเฉพาะลิงก์ร้าน ไม่ย่อลิงก์สั้นของเราเอง", () => {
    expect(isShortenableShopUrl("https://shop.tiktok.com/view/product/1738645110616196218?region=TH")).toBe(true);
    expect(isShortenableShopUrl("https://shopee.co.th/product/123/456789")).toBe(true);
    expect(isShortenableShopUrl("https://google.com/search?q=aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isShortenableShopUrl("https://louismontini.co.th/go/abc12")).toBe(false);
  });
  it("ดึงลิงก์จากแคปชั่น + แทนด้วยลิงก์สั้น", () => {
    const text = "TikTok: https://shop.tiktok.com/view/product/1?region=TH\n#tag";
    expect(extractUrls(text)).toEqual(["https://shop.tiktok.com/view/product/1?region=TH"]);
    expect(replaceWithShortLinks(text, { "https://shop.tiktok.com/view/product/1?region=TH": "https://louismontini.co.th/go/ab12c" }))
      .toBe("TikTok: https://louismontini.co.th/go/ab12c\n#tag");
  });
  it("ชื่อตั้งเอง", () => {
    expect(normalizeShortCode(" Fleur TikTok! ")).toBe("fleur-tiktok");
    expect(shortCodeProblem("fleur-tiktok")).toBeNull();
    expect(shortCodeProblem("admin")).not.toBeNull();
    expect(shortCodeProblem("a")).not.toBeNull();
    expect(SHORT_CODE_RE.test(randomShortCode())).toBe(true);
  });
  it("เดาที่มาจากแอป", () => {
    expect(shortLinkSourceOf("Mozilla/5.0 ... [FBAN/FBIOS;FBAV/400]")).toBe("facebook");
    expect(shortLinkSourceOf("Mozilla/5.0 ... Instagram 300.0")).toBe("instagram");
    expect(shortLinkSourceOf("Mozilla/5.0 ... Line/13.1.0")).toBe("line");
    expect(shortLinkSourceOf("Mozilla/5.0 ... musical_ly_30")).toBe("tiktok");
    expect(shortLinkSourceOf("Mozilla/5.0 Chrome", { qr: true })).toBe("qr");
    expect(shortLinkSourceOf("Mozilla/5.0 Chrome")).toBe("other");
  });
});
