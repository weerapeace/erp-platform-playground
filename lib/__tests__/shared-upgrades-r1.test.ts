import { describe, it, expect } from "vitest";
import { evalExpression, looksLikeFormula } from "@/lib/calc-expression";
import { dateShortcuts, endOfMonthYmd } from "@/lib/date";
import { pushRecentColor } from "@/lib/recent-colors";
import { pushEscLayer, popEscLayer, isTopEscLayer, escLayerCount } from "@/lib/esc-stack";
import { isSaveShortcut, registerSaveHandler, runTopSave } from "@/lib/save-shortcut";
import { buildErrorReport, detailText, UNDO_MS } from "@/components/toast";

describe("calc-expression (ช่องเงินพิมพ์สูตร)", () => {
  it("คำนวณตามลำดับ * / ก่อน + -", () => {
    expect(evalExpression("1200*3+50")).toBe(3650);
    expect(evalExpression("(100+50)/3")).toBe(50);
    expect(evalExpression("1,200 x 2")).toBe(2400);
    expect(evalExpression("10÷4")).toBe(2.5);
    expect(evalExpression("-5+2")).toBe(-3);
    expect(evalExpression("0.1+0.2")).toBe(0.3);
  });
  it("สูตรผิด / หารศูนย์ / มีโค้ดแปลก → null (ไม่รันอะไร)", () => {
    expect(evalExpression("1/0")).toBeNull();
    expect(evalExpression("2*")).toBeNull();
    expect(evalExpression("(1+2")).toBeNull();
    expect(evalExpression("alert(1)")).toBeNull();
    expect(evalExpression("1..2")).toBeNull();
  });
  it("แยกสูตรกับเลขติดลบธรรมดา", () => {
    expect(looksLikeFormula("-100")).toBe(false);
    expect(looksLikeFormula("1,200")).toBe(false);
    expect(looksLikeFormula("100-20")).toBe(true);
    expect(looksLikeFormula("3*4")).toBe(true);
  });
});

describe("ปุ่มลัดวันที่ (เวลาไทย)", () => {
  it("ตี 2 เวลาไทย (ยังเป็นเมื่อวานตาม UTC) ต้องได้วันนี้ของไทย", () => {
    const now = new Date("2026-11-30T19:30:00Z"); // = 1 ธ.ค. 02:30 เวลาไทย
    const q = Object.fromEntries(dateShortcuts(now).map((x) => [x.key, x.ymd]));
    expect(q.today).toBe("2026-12-01");
    expect(q.tomorrow).toBe("2026-12-02");
    expect(q.plus7).toBe("2026-12-08");
    expect(q.eom).toBe("2026-12-31");
  });
  it("สิ้นเดือน ก.พ. ปีอธิกสุรทิน", () => {
    expect(endOfMonthYmd("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonthYmd("2026-02-10")).toBe("2026-02-28");
  });
});

describe("สีที่ใช้ล่าสุด", () => {
  it("ใหม่ขึ้นหน้า ตัดซ้ำ เก็บ 8", () => {
    let l: string[] = [];
    for (let i = 0; i < 10; i++) l = pushRecentColor(l, `#00000${i}`.slice(0, 7));
    expect(l.length).toBe(8);
    l = pushRecentColor(["#aaaaaa", "#bbbbbb"], "#BBBBBB");
    expect(l).toEqual(["#bbbbbb", "#aaaaaa"]);
    expect(pushRecentColor(["#aaaaaa"], "red")).toEqual(["#aaaaaa"]);
  });
});

describe("Esc ปิดทีละชั้น (กองกลาง)", () => {
  it("ชั้นที่เปิดหลังสุดอยู่บน · ปิดแล้วชั้นล่างขึ้นมาแทน", () => {
    const base = escLayerCount();
    const a = pushEscLayer();
    const b = pushEscLayer();
    expect(isTopEscLayer(b)).toBe(true);
    expect(isTopEscLayer(a)).toBe(false);
    popEscLayer(b);
    expect(isTopEscLayer(a)).toBe(true);
    popEscLayer(a);
    expect(escLayerCount()).toBe(base);
  });
});

describe("Ctrl+S บันทึก", () => {
  it("แป้นไทย Ctrl+ห (KeyS) = บันทึก · Ctrl+Shift+S ไม่ใช่", () => {
    expect(isSaveShortcut({ key: "ห", code: "KeyS", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isSaveShortcut({ key: "s", code: "KeyS", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isSaveShortcut({ key: "S", code: "KeyS", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe(false);
    expect(isSaveShortcut({ key: "s", code: "KeyS", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
  });
  it("ฟอร์มบนสุดที่กดได้บันทึกตัวเดียว", () => {
    const calls: string[] = [];
    const offA = registerSaveHandler(() => calls.push("A"));
    const offB = registerSaveHandler(() => calls.push("B"), () => false); // ป๊อปบนยังไม่มีอะไรให้บันทึก
    expect(runTopSave()).toBe(true);
    expect(calls).toEqual(["A"]);
    const offC = registerSaveHandler(() => calls.push("C"));
    runTopSave();
    expect(calls).toEqual(["A", "C"]);
    offA(); offB(); offC();
    expect(runTopSave()).toBe(false);
  });
});

describe("แจ้งผล: คัดลอกรายละเอียด / ย้อนกลับ", () => {
  it("รายงานมีข้อความ + รายละเอียด + หน้า", () => {
    const r = buildErrorReport("บันทึกไม่ได้", detailText(new Error("boom")), { url: "https://x/y", at: new Date(0), ua: "UA" });
    expect(r).toContain("ข้อผิดพลาด: บันทึกไม่ได้");
    expect(r).toContain("boom");
    expect(r).toContain("หน้า: https://x/y");
    expect(r).toContain("เบราว์เซอร์: UA");
    expect(detailText({ code: 23505 })).toContain("23505");
  });
  it("ย้อนกลับนับ 5 วินาที", () => {
    expect(UNDO_MS).toBe(5000);
  });
});
