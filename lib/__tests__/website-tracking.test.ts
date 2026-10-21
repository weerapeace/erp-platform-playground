import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { cleanTrackingId, maskSiteInfoSecrets, normalizeSiteInfo, publicSiteInfo, restoreMaskedSecrets, SITE_INFO_SECRET_MASK } from "../website-site-info";
import { buildCapiPurchase, catalogItemId, hashedUserData, lineCatalogIds, parseTracking } from "../meta-capi";

/** 📊 วัดผล & โฆษณา (ชุด 1 · 2026-10-21) — รหัสวัดผล · โทเค็นลับ · Meta Conversions API */
describe("รหัสวัดผลในข้อมูลร้าน", () => {
  it("เก็บเฉพาะรูปแบบที่ถูก (ตัด space · ตัวพิมพ์ตามผู้ให้บริการ) · ผิดรูป = ว่าง", () => {
    expect(cleanTrackingId("ga4_id", " g-ab12CD34ef ")).toBe("G-AB12CD34EF");
    expect(cleanTrackingId("ga4_id", "UA-1234-1")).toBe("");
    expect(cleanTrackingId("meta_pixel_id", "1234 5678 9012 345")).toBe("123456789012345");
    expect(cleanTrackingId("meta_pixel_id", "<script>")).toBe("");
    expect(cleanTrackingId("tiktok_pixel_id", "c1abcdefghij2345")).toBe("C1ABCDEFGHIJ2345");
    expect(cleanTrackingId("line_tag_id", "AB12CD34-0000-1111-2222-333344445555")).toBe("ab12cd34-0000-1111-2222-333344445555");
  });

  it("โทเค็น CAPI ไม่หลุดไปหน้าเว็บ · รหัส Pixel ไปได้", () => {
    const info = normalizeSiteInfo({ meta_pixel_id: "123456789012", meta_capi_token: "EAAB secret" });
    const pub = publicSiteInfo(info) as unknown as Record<string, unknown>;
    expect(pub.meta_pixel_id).toBe("123456789012");
    expect("meta_capi_token" in pub).toBe(false);
    expect(info.meta_capi_token).toBe("EAABsecret");
  });

  it("หน้าจอ ERP เห็นแค่ mask · ส่ง mask กลับมา = คงค่าเดิม · พิมพ์ใหม่ = เปลี่ยน · ลบ = ว่าง", () => {
    const before = { meta_capi_token: "EAAREAL" };
    expect(maskSiteInfoSecrets(before).meta_capi_token).toBe(SITE_INFO_SECRET_MASK);
    expect(maskSiteInfoSecrets({ meta_capi_token: "" }).meta_capi_token).toBe("");
    expect(restoreMaskedSecrets({ meta_capi_token: SITE_INFO_SECRET_MASK }, before).meta_capi_token).toBe("EAAREAL");
    expect(restoreMaskedSecrets({ meta_capi_token: "EAANEW" }, before).meta_capi_token).toBe("EAANEW");
    expect(restoreMaskedSecrets({ meta_capi_token: "" }, before).meta_capi_token).toBe("");
  });
});

describe("Meta Conversions API", () => {
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");

  it("รหัสสินค้าแคตตาล็อก = รุ่น + 8 ตัวแรกของ SKU (ตรงกับฟีดเว็บร้าน)", () => {
    expect(catalogItemId("ROAR01", "1a2b3c4d-5555-6666")).toBe("ROAR01-1a2b3c4d");
    expect(catalogItemId("ROAR01", "sku-1a2b3c4d")).toBe("ROAR01-1a2b3c4d");
    expect(catalogItemId("ROAR01", null)).toBe("ROAR01");
    expect(catalogItemId(null, "x")).toBe("");
  });

  it("บรรทัดออเดอร์ใช้รหัสจากหน้าเว็บ เฉพาะที่ขึ้นต้นด้วยรหัสรุ่นของบรรทัดจริง · ไม่ตรง = รหัสรุ่น", () => {
    const lines = [{ parent_code: "ROAR01" }, { parent_code: "ROAR01" }, { parent_code: "BELT9" }, { parent_code: null }];
    expect(lineCatalogIds(lines, ["ROAR01-aaaa1111", "ROAR01-bbbb2222", "HACK-x"])).toEqual(["ROAR01-aaaa1111", "ROAR01-bbbb2222", "BELT9", ""]);
    expect(lineCatalogIds([{ parent_code: "A1" }])).toEqual(["A1"]);
    expect(parseTracking({ consent: true, ids: ["A1-12345678", "<script>", 5, "ok id"] })?.ids).toEqual(["A1-12345678"]);
  });

  it("อีเมล/เบอร์ แฮชตามกติกา Meta (ตัวเล็ก · เบอร์ไทยเป็น 66…)", () => {
    const u = hashedUserData(" Ann@Mail.com ", "081-234-5678");
    expect(u.em).toEqual([sha("ann@mail.com")]);
    expect(u.ph).toEqual([sha("66812345678")]);
    expect(hashedUserData("ไม่ใช่อีเมล", "12")).toEqual({});
  });

  it("รับค่าจากหน้าเว็บอย่างปลอดภัย (คุกกี้ fbp/fbc ผิดรูป = ทิ้ง · ไม่ส่ง consent = ไม่ยินยอม)", () => {
    expect(parseTracking({ consent: true, fbp: "fb.1.1712345678901.123456789", fbc: "javascript:x", url: "https://shop.co/checkout" })).toMatchObject({ consent: true, fbp: "fb.1.1712345678901.123456789", fbc: undefined, url: "https://shop.co/checkout" });
    expect(parseTracking({ fbp: "fb.1.1712345678901.1" })?.consent).toBe(false);
    expect(parseTracking(null)).toBeNull();
  });

  it("event ซื้อสำเร็จ: event_id = เลขออเดอร์ (ตัดซ้ำกับ Pixel) · ยอด/รายการ/ข้อมูลผู้ใช้ครบ", () => {
    const e = buildCapiPurchase({
      orderNo: "LM-256910-00012",
      createdAt: "2026-10-21T10:00:00Z",
      value: 1780,
      items: [
        { id: "ROAR01-1a2b3c4d", qty: 2, price: 890 },
        { id: "", qty: 1, price: 50 },
      ],
      email: "a@b.co",
      phone: "0812345678",
      ip: "1.2.3.4",
      tracking: { consent: true, fbp: "fb.1.1712345678901.123456789", ua: "UA", url: "https://shop.co/checkout" },
    }) as { event_name: string; event_id: string; event_time: number; user_data: Record<string, unknown>; custom_data: Record<string, unknown> };
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("LM-256910-00012");
    expect(e.event_time).toBe(Math.floor(Date.parse("2026-10-21T10:00:00Z") / 1000));
    expect(e.user_data).toMatchObject({ client_ip_address: "1.2.3.4", client_user_agent: "UA", fbp: "fb.1.1712345678901.123456789" });
    expect(e.custom_data).toMatchObject({ currency: "THB", value: 1780, content_ids: ["ROAR01-1a2b3c4d"], num_items: 2 });
  });
});
