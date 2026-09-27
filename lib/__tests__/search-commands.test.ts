import { describe, it, expect } from "vitest";
import { matchCommands, COMMANDS } from "@/lib/search-commands";

const all = () => true;

describe("search-commands (คำสั่งลัด Global Search)", () => {
  it("\"สร้าง PO\" → เปิดใบสั่งซื้อใหม่ ขึ้นก่อน", () => {
    const r = matchCommands("สร้าง PO", all);
    expect(r[0]?.cmd.id).toBe("new-po");
    expect(r[0]?.cmd.href).toContain("new=1");
  });

  it("\"เพิ่ม sku\" → เพิ่มสินค้าใหม่", () => {
    expect(matchCommands("เพิ่ม sku", all)[0]?.cmd.id).toBe("new-sku");
  });

  it("กริยาสร้างทำให้คะแนนสูงกว่าพิมพ์คำหลักเฉย ๆ", () => {
    const withVerb = matchCommands("สร้างใบขาย", all).find((x) => x.cmd.id === "new-invoice")!.score;
    const noVerb   = matchCommands("ใบขาย", all).find((x) => x.cmd.id === "new-invoice")!.score;
    expect(withVerb).toBeGreaterThan(noVerb);
  });

  it("ไม่มีสิทธิ์ → ไม่โชว์คำสั่งนั้น", () => {
    const can = (p?: string) => !p || p !== "so.create";
    expect(matchCommands("สร้างใบขาย", can).some((x) => x.cmd.id === "new-invoice")).toBe(false);
  });

  it("คำค้นไม่เกี่ยว → ว่าง · ทุกคำสั่งมี href", () => {
    expect(matchCommands("xyz123", all)).toEqual([]);
    for (const c of COMMANDS) expect(c.href.startsWith("/")).toBe(true);
  });
});
