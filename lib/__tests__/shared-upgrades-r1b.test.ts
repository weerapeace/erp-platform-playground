import { describe, it, expect, beforeEach } from "vitest";
import { reorderTarget, moveItem } from "@/components/sortable-list";
import { nextWheelZoom } from "@/lib/hover-delay";
import { buildMiniExport } from "@/lib/mini-table-export";
import { navArrowDir, isTypingTarget } from "@/lib/record-nav-keys";
import { buildDuplicateValues } from "@/lib/record-duplicate";
import { detectScanBurst, exactScanMatch } from "@/lib/scan-burst";
import { pastedFileName } from "@/lib/paste-files";
import { readLastPrint, rememberLastPrint } from "@/lib/print-last-used";

describe("ลากจัดลำดับ: เมนู ขึ้น/ลง/บนสุด/ล่างสุด", () => {
  it("คำนวณปลายทาง + อยู่สุดแล้ว = null", () => {
    expect(reorderTarget("up", 2, 5)).toBe(1);
    expect(reorderTarget("down", 2, 5)).toBe(3);
    expect(reorderTarget("top", 3, 5)).toBe(0);
    expect(reorderTarget("bottom", 1, 5)).toBe(4);
    expect(reorderTarget("up", 0, 5)).toBeNull();
    expect(reorderTarget("bottom", 4, 5)).toBeNull();
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("ชี้รูป: ล้อเมาส์ซูม", () => {
  it("ซูมเข้า/ออก อยู่ในช่วง 1–5", () => {
    expect(nextWheelZoom(1, -100)).toBeCloseTo(1.15);
    expect(nextWheelZoom(1, 100)).toBe(1);
    let s = 1; for (let i = 0; i < 50; i++) s = nextWheelZoom(s, -1);
    expect(s).toBe(5);
  });
});

describe("ตารางเล็ก: ส่งออก Excel", () => {
  type R = { code: string; name: string; cost: number };
  const rows: R[] = [{ code: "A1", name: "เสื้อ", cost: 10 }, { code: "B2", name: "กางเกง", cost: 20 }];
  it("ใช้ exportValue/sortValue/ข้อความ · ตัดคอลัมน์ปุ่ม · ส่งสิทธิ์ต่อคอลัมน์", () => {
    const out = buildMiniExport<R>([
      { key: "code", header: "รหัส", cell: (r) => r.code },
      { key: "name", header: "ชื่อ", cell: () => ({}), sortValue: (r) => r.name },
      { key: "cost", header: "ทุน", cell: (r) => r.cost, exportPermission: "products.cost.view" },
      { key: "act", header: "", cell: () => ({ type: "button" }) },
    ], rows);
    expect(out.columns.map((c) => c.key)).toEqual(["code", "name", "cost"]);
    expect(out.columns[2].permission).toBe("products.cost.view");
    expect(out.rows[1]).toEqual({ code: "B2", name: "กางเกง", cost: 20 });
  });
});

describe("ลิ้นชัก: ลูกศร ← →", () => {
  it("เฉพาะลูกศรเปล่า", () => {
    expect(navArrowDir({ key: "ArrowLeft", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(-1);
    expect(navArrowDir({ key: "ArrowRight", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(1);
    expect(navArrowDir({ key: "ArrowRight", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })).toBeNull();
    expect(navArrowDir({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeNull();
  });
  it("กำลังพิมพ์ในช่อง = ไม่เลื่อนรายการ", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox", closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("ทำสำเนา", () => {
  it("เว้นว่างรหัส/ช่องห้ามซ้ำ/คำนวณ/แท็ก · คงค่าอื่น", () => {
    const { values, cleared } = buildDuplicateValues(
      { id: "1", code: "PX-01", name: "กระเป๋า", price: 100, tax_id: "T1", total: 5, tags: ["a"], created_at: "x" },
      [
        { key: "code", type: "text" }, { key: "name", type: "text" }, { key: "price", type: "number" },
        { key: "tax_id", type: "text", validations: ["unique"] }, { key: "total", type: "computed" }, { key: "tags", type: "many2many" },
      ],
      { uniqueKey: "code" },
    );
    expect(values).toEqual({ name: "กระเป๋า", price: 100 });
    expect(cleared.sort()).toEqual(["code", "tags", "tax_id", "total"].sort());
  });
});

describe("ยิงบาร์โค้ดเข้าช่องค้น", () => {
  it("พิมพ์รัว + Enter = รหัส · คนพิมพ์ช้า = ไม่ใช่", () => {
    const fast = "TH1234".split("").map((ch, i) => ({ t: 1000 + i * 10, ch }));
    expect(detectScanBurst(fast, 1070)).toBe("TH1234");
    const slow = "TH1234".split("").map((ch, i) => ({ t: 1000 + i * 200, ch }));
    expect(detectScanBurst(slow, 2010)).toBeNull();
    // คนพิมพ์ "ab" ช้า ๆ แล้วเครื่องยิงต่อท้าย → เอาแค่ช่วงรัว
    const mixed = [{ t: 0, ch: "a" }, { t: 500, ch: "b" }, ...fast];
    expect(detectScanBurst(mixed, 1070)).toBe("TH1234");
  });
  it("เลือกตัวที่ตรงเป๊ะ (รหัส/บาร์โค้ด)", () => {
    const rows = [{ code: "TH1234-R" }, { code: "TH1234", barcode: "885000" }];
    expect(exactScanMatch(rows, "th1234")).toEqual(rows[1]);
    expect(exactScanMatch(rows, "885000")).toEqual(rows[1]);
    expect(exactScanMatch(rows, "TH12")).toBeNull();
  });
});

describe("วางรูปจากคลิปบอร์ด", () => {
  it("image.png → ชื่อตามเวลา · ไฟล์มีชื่อจริง = คงชื่อ", () => {
    const now = new Date(2026, 10, 17, 9, 5, 7);
    expect(pastedFileName({ name: "image.png", type: "image/png" }, now)).toBe("วางรูป-20261117-090507.png");
    expect(pastedFileName({ name: "image.png", type: "image/jpeg" }, now, 1)).toBe("วางรูป-20261117-090507-2.jpg");
    expect(pastedFileName({ name: "ใบเสร็จ.pdf", type: "application/pdf" }, now)).toBe("ใบเสร็จ.pdf");
  });
});

describe("จำตัวเลือกพิมพ์ล่าสุด", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0,
    } as Storage;
  });
  it("จำได้ · ค่ากลางเปลี่ยน = ทิ้ง · เท่าค่ากลาง = ไม่จำ", () => {
    const base = { font: 10 };
    rememberLastPrint("doc:so", base, { font: 12 });
    expect(readLastPrint("doc:so", base)).toEqual({ font: 12 });
    expect(readLastPrint("doc:so", { font: 11 })).toBeNull();
    rememberLastPrint("doc:so", base, { font: 10 });
    expect(readLastPrint("doc:so", base)).toBeNull();
  });
});
