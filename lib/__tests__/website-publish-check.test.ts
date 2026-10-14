import { describe, it, expect } from "vitest";
import { listingIssues, shopPublishIssues } from "../website-listing-health";

const row = (code: string, price: number, imageCount = 1, categories = ["bags"], published = true) => ({
  code,
  published,
  issues: listingIssues({ price, imageCount, categories, colors: [] }),
});

describe("ตรวจก่อนเผยแพร่: ข้อมูลสินค้าของร้าน", () => {
  it("ไม่มีราคา = error (บอกรหัส) · ไม่มีรูป/ไม่อยู่หมวด = warning", () => {
    const out = shopPublishIssues([row("PIX11", 0), row("PIX12", 590, 0), row("PIX13", 590, 1, []), row("PIX14", 590)], "/fix");
    expect(out.map((i) => i.level)).toEqual(["error", "warning", "warning"]);
    expect(out[0].message).toContain("PIX11");
    expect(out[0].fix).toBe("/fix");
  });
  it("นับเฉพาะรุ่นที่ขึ้นเว็บ · ครบทุกอย่าง = ไม่มีปัญหา", () => {
    expect(shopPublishIssues([row("PIX20", 0, 1, ["bags"], false), row("PIX21", 990)])).toEqual([]);
  });
  it("รายชื่อยาว = ย่อ 'และอีก N'", () => {
    const many = Array.from({ length: 9 }, (_, i) => row(`P${i}`, 0));
    expect(shopPublishIssues(many)[0].message).toContain("และอีก 3");
  });
});
