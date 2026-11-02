import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bracketCode, skuIdsByBracketCode } from "@/lib/pr-line-code";

// ใบขอซื้อจากแท็บใบสั่งผลิต/บอร์ด ส่งแค่ "[รหัส] ชื่อ" → ต้องหา SKU ให้ได้ ไม่งั้นรับของแล้วไม่เข้าสต็อก
describe("bracketCode", () => {
  it("ดึงรหัสจาก [รหัส] ชื่อ", () => {
    expect(bracketCode("[ZIP-05] ซิป 5 นิ้ว")).toBe("ZIP-05");
    expect(bracketCode("[ ABC ] x")).toBe("ABC");
  });
  it("ไม่มีวงเล็บ = null", () => {
    expect(bracketCode("ซิป 5 นิ้ว")).toBeNull();
    expect(bracketCode(null)).toBeNull();
    expect(bracketCode("ซิป [ZIP-05]")).toBeNull();
  });
});

function fakeAdmin(rows: { id: string; code: string }[]): SupabaseClient {
  const q = { select: () => q, in: (_c: string, codes: string[]) => ({ eq: async () => ({ data: rows.filter((r) => codes.includes(r.code)) }) }) };
  return { from: () => q } as unknown as SupabaseClient;
}

describe("skuIdsByBracketCode", () => {
  it("รหัสตรงตัวเดียว → ได้ id · รหัสซ้ำ → ไม่เดา", async () => {
    const admin = fakeAdmin([{ id: "a", code: "ZIP-05" }, { id: "b", code: "DUP" }, { id: "c", code: "DUP" }]);
    const m = await skuIdsByBracketCode(admin, ["[ZIP-05] ซิป", "[DUP] ของซ้ำ", "ไม่มีรหัส", "[NONE] ไม่มีในระบบ"]);
    expect(m.get("ZIP-05")).toBe("a");
    expect(m.has("DUP")).toBe(false);
    expect(m.has("NONE")).toBe(false);
  });
  it("ไม่มีรหัสเลย = ไม่ยิงฐานข้อมูล", async () => {
    const m = await skuIdsByBracketCode({ from: () => { throw new Error("ไม่ควรถูกเรียก"); } } as unknown as SupabaseClient, ["ไม่มีรหัส"]);
    expect(m.size).toBe(0);
  });
});
