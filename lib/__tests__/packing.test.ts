import { describe, it, expect } from "vitest";
import {
  parsePackCommand, cleanScanCode, packGate, suggestBox, boxSizeText, applyItemScan, allChecked, checkProgress, boxCommandCode,
  type CheckItem,
} from "@/lib/packing";
import { typedChar } from "@/lib/shortcut-key";

describe("parsePackCommand — การ์ดบาร์โค้ดคำสั่ง", () => {
  it("อ่านคำสั่งพื้นฐาน (ตัวเล็กก็ได้)", () => {
    expect(parsePackCommand("*PK-DONE")).toEqual({ kind: "done" });
    expect(parsePackCommand(" *pk-problem ")).toEqual({ kind: "problem" });
    expect(parsePackCommand("*PK-REDO")).toEqual({ kind: "redo" });
    expect(parsePackCommand("*PK-SKIP")).toEqual({ kind: "skip" });
  });
  it("การ์ดกล่องเก็บชื่อกล่องตามตัวพิมพ์เดิม (มีช่องว่าง/+)", () => {
    expect(parsePackCommand(boxCommandCode("B+3"))).toEqual({ kind: "box", box: "B+3" });
    expect(parsePackCommand("*PK-BOX-CLOTH BOX")).toEqual({ kind: "box", box: "CLOTH BOX" });
  });
  it("รหัสสินค้าที่ขึ้นต้น PK- (ไม่มี *) ไม่ใช่คำสั่ง — ชนรหัสสินค้าจริง", () => {
    expect(parsePackCommand("PK-DONE")).toBeNull();
    expect(parsePackCommand("PK-0012")).toBeNull();
    expect(parsePackCommand("*PK-")).toBeNull();
    expect(parsePackCommand("*PK-BOX-")).toBeNull();
  });
});

describe("cleanScanCode", () => {
  it("ตัดช่องว่างและตัวที่ทำให้ตัวกรองค้นพัง", () => {
    expect(cleanScanCode(" 2611110UCRAVX1 \n")).toBe("2611110UCRAVX1");
    expect(cleanScanCode("TH12,34(5)")).toBe("TH12345");
    expect(cleanScanCode('a"b')).toBe("ab");
    expect(cleanScanCode("")).toBe("");
  });
});

describe("packGate — แพ็คได้ไหม", () => {
  it("ยกเลิก / ยังไม่จ่าย = ห้าม", () => {
    expect(packGate({ status: "cancelled" }).level).toBe("block");
    expect(packGate({ status: "new", platform_status: "UNPAID" }).level).toBe("block");
    expect(packGate({ status: "new", platform_status: "ON_HOLD" }).level).toBe("block");
  });
  it("ส่งแล้ว / เคยแพ็ค = เตือน (ยังแพ็คซ้ำได้)", () => {
    expect(packGate({ status: "shipped" }).level).toBe("warn");
    const g = packGate({ status: "packed", packed_at: "2026-11-17T03:42:00Z", packed_by_name: "เอ" });
    expect(g.level).toBe("warn");
    expect(g.reasons[0]).toContain("เอ");
  });
  it("พร้อมแพ็ค = ok", () => {
    expect(packGate({ status: "new", platform_status: "READY_TO_SHIP" })).toEqual({ level: "ok", reasons: [] });
    expect(packGate({ status: "packed", platform_status: "PROCESSED" }).level).toBe("ok");
  });
});

describe("suggestBox", () => {
  const A = { name: "A", width_cm: 14, length_cm: 20, height_cm: 6 };
  const C = { name: "C", width_cm: 20, length_cm: 30, height_cm: 11 };
  it("เลือกกล่องปริมาตรใหญ่สุด", () => {
    expect(suggestBox([A, C, null])?.name).toBe("C");
    expect(suggestBox([null, undefined])).toBeNull();
  });
  it("กล่องไม่มีขนาดก็ยังแนะนำได้", () => {
    expect(suggestBox([{ name: "BAG", width_cm: null, length_cm: null, height_cm: null }])?.name).toBe("BAG");
    expect(boxSizeText(C)).toBe("20×30×11 ซม.");
    expect(boxSizeText({ name: "BAG", width_cm: null, length_cm: null, height_cm: null })).toBe("");
  });
});

describe("applyItemScan — เช็กของ", () => {
  const items = (): CheckItem[] => [
    { key: "l1", qty: 2, codes: ["JEAN08-01", "8850000000011"], scanned: 0, manual: 0 },
    { key: "l2", qty: 1, codes: ["PIX34-05"], scanned: 0, manual: 0 },
  ];
  it("ยิงถูกนับทีละชิ้น ครบแล้วเกิน = เตือน", () => {
    let list = items();
    let r = applyItemScan(list, "jean08-01"); list = r.items;
    expect(r.result).toEqual({ kind: "ok", key: "l1", done: false });
    r = applyItemScan(list, "8850000000011"); list = r.items;
    expect(r.result).toEqual({ kind: "ok", key: "l1", done: true });
    r = applyItemScan(list, "JEAN08-01");
    expect(r.result).toEqual({ kind: "over", key: "l1" });
    expect(r.items).toBe(list);
  });
  it("ไม่อยู่ในออเดอร์ = ไม่แก้รายการ", () => {
    const list = items();
    const r = applyItemScan(list, "XYZ-1");
    expect(r.result.kind).toBe("not_in_order");
    expect(r.items).toBe(list);
  });
  it("รหัสเดียวกันหลายบรรทัด ลงบรรทัดที่ยังไม่ครบ", () => {
    let list: CheckItem[] = [
      { key: "a", qty: 1, codes: ["S1"], scanned: 0, manual: 0 },
      { key: "b", qty: 1, codes: ["S1"], scanned: 0, manual: 0 },
    ];
    list = applyItemScan(list, "S1").items;
    const r = applyItemScan(list, "S1");
    expect(r.result).toEqual({ kind: "ok", key: "b", done: true });
    expect(allChecked(r.items)).toBe(true);
  });
  it("ติ๊กมือนับรวม · ความคืบหน้า", () => {
    const list = items().map((it) => (it.key === "l1" ? { ...it, manual: 1, scanned: 1 } : it));
    expect(checkProgress(list)).toEqual({ done: 2, total: 3 });
    expect(allChecked(list)).toBe(false);
    expect(allChecked([])).toBe(false);
  });
});

describe("typedChar — เครื่องยิงตอนเปิดแป้นภาษาไทย", () => {
  it("แป้นไทยได้ตัวอังกฤษตามปุ่มจริง", () => {
    expect(typedChar({ key: "ฮ", code: "KeyT", shiftKey: true })).toBe("T");
    expect(typedChar({ key: "้", code: "KeyH", shiftKey: false })).toBe("h");
    expect(typedChar({ key: "ๅ", code: "Digit1", shiftKey: false })).toBe("1");
    expect(typedChar({ key: "/", code: "Digit2", shiftKey: false })).toBe("2");   // แป้นไทยเลข 2 = "/" ห้ามเชื่อ
    expect(typedChar({ key: "-", code: "Digit3", shiftKey: false })).toBe("3");
    expect(typedChar({ key: "+", code: "Digit1", shiftKey: true })).toBe("!");
    expect(typedChar({ key: "๊", code: "Digit8", shiftKey: true })).toBe("*");
    expect(typedChar({ key: "x", code: "", shiftKey: false })).toBe("x");          // ไม่รู้ตำแหน่งปุ่ม = ใช้ e.key
    expect(typedChar({ key: "ข", code: "Minus", shiftKey: false })).toBe("-");
  });
  it("ตัวอังกฤษปกติ + ปุ่มพิเศษ", () => {
    expect(typedChar({ key: "a", code: "KeyA", shiftKey: false })).toBe("a");
    expect(typedChar({ key: "Shift", code: "ShiftLeft", shiftKey: true })).toBe("");
    expect(typedChar({ key: "Enter", code: "Enter", shiftKey: false })).toBe("");
  });
});
