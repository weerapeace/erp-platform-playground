import { describe, expect, it } from "vitest";
import { megaBlockLinks, megaCategoryKeyOf, megaLinkLabel, newMegaLink, normalizeMegaPanel } from "../website-mega-menu";

describe("🔗 ลิงก์หมวดใช้ชื่อหมวดปัจจุบัน (ชื่อว่าง = ตามหมวด)", () => {
  it("อ่านรหัสหมวดจากลิงก์", () => {
    expect(megaCategoryKeyOf("/c/wallets-bifold-wallets")).toBe("wallets-bifold-wallets");
    expect(megaCategoryKeyOf("/shop?cat=bags&sort=new")).toBe("bags");
    expect(megaCategoryKeyOf("/shop?sort=new")).toBeNull();
    expect(megaCategoryKeyOf("/product/roar01")).toBeNull();
  });

  it("ชื่อว่าง = ชื่อหมวด (ตามภาษาที่ส่งมา) · ตั้งเอง = ใช้ชื่อนั้น · ไม่รู้ชื่อ = รหัส", () => {
    const labels = { "wallets-bifold-wallets": "กระเป๋าสตางค์พับสั้น" };
    expect(megaLinkLabel(newMegaLink("", "/c/wallets-bifold-wallets"), labels)).toBe("กระเป๋าสตางค์พับสั้น");
    expect(megaLinkLabel(newMegaLink("ดูทั้งหมด", "/c/wallets"), labels)).toBe("ดูทั้งหมด");
    expect(megaLinkLabel(newMegaLink("", "/c/belts"), labels)).toBe("belts");
  });

  it("ตัวล้างข้อมูลเก็บลิงก์หมวดที่ชื่อว่างไว้ (ลิงก์อื่นชื่อว่าง = ทิ้งเหมือนเดิม) · รายการที่โชว์ได้ชื่อหมวด", () => {
    const p = normalizeMegaPanel({
      layout: "columns",
      blocks: [{ kind: "links", links: [{ label: "", href: "/c/wallets-bifold-wallets" }, { label: "", href: "/shop" }, { label: "มาใหม่", href: "/shop?sort=new" }] }],
    });
    const b = p!.blocks[0];
    expect(b.links.map((l) => l.href)).toEqual(["/c/wallets-bifold-wallets", "/shop?sort=new"]);
    const shown = megaBlockLinks(b, { categories: [], collections: [], tones: [], labels: { "wallets-bifold-wallets": "Bifold Wallets" } });
    expect(shown.map((l) => l.label)).toEqual(["Bifold Wallets", "มาใหม่"]);
  });
});
