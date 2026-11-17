import { describe, it, expect } from "vitest";
import { blockMoveOrder, groupMenuOrder, planSingleMoves, indexRange } from "@/lib/reorder-many";
import { moveItem } from "@/components/sortable-list";
import { monthGrid, orderRange, rangeDays, rangePresets, inRange } from "@/lib/date-range";
import { parsePastedCodes, looksLikeCodeList } from "@/lib/parse-pasted-codes";
import { sanitizeDraft, encodeDraft, decodeDraft, draftDiffers, DRAFT_TTL_MS, isSecretKey } from "@/lib/form-draft";

/** ทำตามแผนย้ายทีละตัว แล้วต้องได้ลำดับปลายทาง */
const apply = (arr: string[], moves: [number, number][]) => moves.reduce((a, [f, t]) => moveItem(a, f, t), arr);

describe("ย้ายหลายรายการพร้อมกัน", () => {
  const arr = ["a", "b", "c", "d", "e", "f"];
  it("ลากกลุ่ม b,d ลงไปที่ f", () => {
    const order = blockMoveOrder(6, [1, 3], 5);
    expect(order.map((i) => arr[i])).toEqual(["a", "c", "e", "f", "b", "d"]);
    expect(apply(arr, planSingleMoves(order))).toEqual(["a", "c", "e", "f", "b", "d"]);
  });
  it("ลากกลุ่ม d,e ขึ้นไปที่ b", () => {
    const order = blockMoveOrder(6, [3, 4], 1);
    expect(apply(arr, planSingleMoves(order))).toEqual(["a", "d", "e", "b", "c", "f"]);
  });
  it("เมนูกลุ่ม: บนสุด/ล่างสุด/ขึ้น/ลง", () => {
    expect(apply(arr, planSingleMoves(groupMenuOrder(6, [2, 4], "top")!))).toEqual(["c", "e", "a", "b", "d", "f"]);
    expect(apply(arr, planSingleMoves(groupMenuOrder(6, [0, 2], "bottom")!))).toEqual(["b", "d", "e", "f", "a", "c"]);
    expect(apply(arr, planSingleMoves(groupMenuOrder(6, [2, 3], "up")!))).toEqual(["a", "c", "d", "b", "e", "f"]);
    expect(apply(arr, planSingleMoves(groupMenuOrder(6, [2, 3], "down")!))).toEqual(["a", "b", "e", "c", "d", "f"]);
    expect(groupMenuOrder(6, [0, 1], "up")).toBeNull();
    expect(groupMenuOrder(6, [0, 1], "top")).toBeNull();
  });
  it("ช่วง Shift+คลิก", () => {
    expect(indexRange(4, 2)).toEqual([2, 3, 4]);
  });
});

describe("ช่วงวันที่", () => {
  it("ปฏิทิน พ.ย. 2026 เริ่มวันอาทิตย์", () => {
    const g = monthGrid(2026, 10);
    expect(g.length).toBe(6);
    expect(g[0][0]).toBe("2026-11-01"); // 1 พ.ย. 2026 = วันอาทิตย์
    expect(g[4][1]).toBe("2026-11-30");
  });
  it("คลิกกลับด้าน = เรียงให้ · นับวัน", () => {
    expect(orderRange("2026-11-20", "2026-11-03")).toEqual({ from: "2026-11-03", to: "2026-11-20" });
    expect(rangeDays({ from: "2026-02-27", to: "2026-03-02" })).toBe(4);
    expect(inRange("2026-11-05", { from: "2026-11-03", to: "2026-11-20" })).toBe(true);
  });
  it("ช่วงสำเร็จรูปตามเวลาไทย", () => {
    const p = Object.fromEntries(rangePresets(new Date("2026-11-30T18:00:00Z")).map((x) => [x.key, x.range]));
    expect(p.today).toEqual({ from: "2026-12-01", to: "2026-12-01" });
    expect(p.prev).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(p["7d"].from).toBe("2026-11-25");
  });
});

describe("วางรหัสหลายตัว", () => {
  it("แยกจาก Excel/จุลภาค ตัดซ้ำ คงลำดับ", () => {
    expect(parsePastedCodes("A-01\r\nB-02\t\n\"C-03\"\na-01")).toEqual(["A-01", "B-02", "C-03"]);
    expect(parsePastedCodes("x, y ; z")).toEqual(["x", "y", "z"]);
    expect(looksLikeCodeList("PIX-22")).toBe(false);
    expect(looksLikeCodeList("PIX-22\nPIX-23")).toBe(true);
  });
});

describe("กู้ข้อมูลที่พิมพ์ค้าง", () => {
  it("ไม่เก็บช่องลับ", () => {
    const v = sanitizeDraft({ name: "ก", password: "x", bank_account_no: "1", pin: "1234", cost: 5, note: "n" }, ["cost"]);
    expect(v).toEqual({ name: "ก", note: "n" });
    expect(isSecretKey("api_key")).toBe(true);
    expect(isSecretKey("description")).toBe(false);
  });
  it("หมดอายุ 7 วัน · ข้อมูลเสีย = null", () => {
    const raw = encodeDraft({ name: "ก" }, [], 1000);
    expect(decodeDraft(raw, 2000)?.values).toEqual({ name: "ก" });
    expect(decodeDraft(raw, 1000 + DRAFT_TTL_MS + 1)).toBeNull();
    expect(decodeDraft("{bad", 0)).toBeNull();
  });
  it("ร่างเหมือนค่าเดิม = ไม่ต้องถาม", () => {
    expect(draftDiffers({ a: 1, b: "x" }, { a: "1", b: "x", c: 2 })).toBe(false);
    expect(draftDiffers({ a: 2 }, { a: 1 })).toBe(true);
  });
});
