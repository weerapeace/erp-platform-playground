import { describe, expect, it } from "vitest";
import { splitPlatformsByConnection } from "@/lib/platform-visibility";

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
});
