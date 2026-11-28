import { describe, expect, it } from "vitest";
import { shopStatusOf, splitPlatformsByConnection } from "@/lib/platform-visibility";

type P = { code: string; connected: boolean; onSale: boolean };
const split = (ps: P[]) => splitPlatformsByConnection(ps, (p) => p.connected, (p) => p.onSale);

describe("splitPlatformsByConnection", () => {
  it("โชว์ร้านที่เชื่อมแล้ว ซ่อนร้านที่ยังไม่เชื่อม (คงลำดับเดิม)", () => {
    const r = split([
      { code: "shopee", connected: true, onSale: false },
      { code: "lazada", connected: false, onSale: false },
      { code: "line_shopping", connected: true, onSale: true },
      { code: "tiktok", connected: false, onSale: false },
    ]);
    expect(r.shown.map((p) => p.code)).toEqual(["shopee", "line_shopping"]);
    expect(r.hidden.map((p) => p.code)).toEqual(["lazada", "tiktok"]);
  });

  it("สินค้าที่อยู่บนร้านแล้วยังโชว์ แม้บัญชีร้านถูกปิด (ของที่ขายอยู่ห้ามหาย)", () => {
    const r = split([{ code: "lazada", connected: false, onSale: true }]);
    expect(r.shown.map((p) => p.code)).toEqual(["lazada"]);
    expect(r.hidden).toEqual([]);
  });

  it("แบรนด์ยังไม่เชื่อมร้านไหนเลย = ซ่อนหมด", () => {
    const r = split([{ code: "shopee", connected: false, onSale: false }, { code: "website", connected: false, onSale: false }]);
    expect(r.shown).toEqual([]);
    expect(r.hidden).toHaveLength(2);
  });

  it("ร้านที่แบรนด์สั่งซ่อน → แยกไปกลุ่ม brandHidden แม้เชื่อมแล้ว (เช่น Instagram)", () => {
    const ps = [
      { code: "instagram", connected: true, onSale: false },
      { code: "shopee", connected: true, onSale: false },
      { code: "lazada", connected: false, onSale: false },
    ];
    const r = splitPlatformsByConnection(ps, (p) => p.connected, (p) => p.onSale, (p) => p.code === "instagram");
    expect(r.shown.map((p) => p.code)).toEqual(["shopee"]);
    expect(r.brandHidden.map((p) => p.code)).toEqual(["instagram"]);
    expect(r.hidden.map((p) => p.code)).toEqual(["lazada"]);
  });

  it("สั่งซ่อนแล้วแต่สินค้านี้อยู่บนร้านนั้น → ยังโชว์ (ของที่ขายอยู่ห้ามหาย)", () => {
    const r = splitPlatformsByConnection([{ code: "shopee", connected: true, onSale: true }], (p) => p.connected, (p) => p.onSale, () => true);
    expect(r.shown.map((p) => p.code)).toEqual(["shopee"]);
    expect(r.brandHidden).toEqual([]);
  });
});

describe("shopStatusOf — สินค้านี้ลงร้านไหนแล้ว (แท็บแพลตฟอร์ม + ผู้ช่วยเสียง)", () => {
  it("ลงแล้ว = ร่างส่งสำเร็จ/มีรายการบนร้าน · ยังไม่ลง = เชื่อมแล้วแต่ยังไม่ลง · ร้านไม่เชื่อม/แบรนด์ซ่อน ไม่นับ", () => {
    const r = shopStatusOf({
      platforms: [{ id: "a", code: "lazada", name_th: "Lazada" }, { id: "b", code: "shopee", name_th: "Shopee" }, { id: "c", code: "tiktok", name_th: "TikTok" }, { id: "d", code: "ig", name_th: "IG" }, { id: "e", code: "line_shopping", name_th: "LINE" }],
      drafts: { a: { status: "published" } },
      accounts: { a: { is_active: true }, b: { is_active: true }, c: { is_active: false }, d: { is_active: true }, e: { is_active: true } },
      matchedListings: { e: { id: "L1" } },
      hiddenPlatformCodes: ["ig"],
    });
    expect(r.listed.map((x) => x.code)).toEqual(["lazada", "line_shopping"]);
    expect(r.listed.find((x) => x.code === "line_shopping")?.listingId).toBe("L1");
    expect(r.notListed.map((x) => x.code)).toEqual(["shopee"]);
  });
});
