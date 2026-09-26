import { describe, it, expect } from "vitest";
import { splitBillLineToVoucherLines, normDate } from "@/lib/delivery-bill";

describe("ใบส่งของขนส่ง — แบ่งน้ำหนัก/คิวลงสินค้าที่จับคู่", () => {
  // แถวจริงจากใบ: BOX qty 20 · 2.5 kg · 0.0099 m3 → จับคู่สินค้า 2 ตัว (12 + 8 ชิ้น)
  it("ต่อชิ้น = ยอดรวม ÷ จำนวนชิ้นรวมของทุกสินค้าที่จับคู่", () => {
    const out = splitBillLineToVoucherLines({ weight_kg: 2.5, m3: 0.0099 }, [{ id: "a", qty: 12 }, { id: "b", qty: 8 }]);
    expect(out[0].kg_per_unit).toBe(0.125);
    expect(out[1].kg_per_unit).toBe(0.125);
    expect(out[0].cbm_per_unit).toBe(0.000495);
    // รวมกลับต้องเท่ายอดบรรทัด
    expect(Math.round((out[0].kg_per_unit! * 12 + out[1].kg_per_unit! * 8) * 1000) / 1000).toBe(2.5);
  });
  it("ไม่มีจำนวน → null (ไม่หารศูนย์) · ค่าที่อ่านไม่ได้คง null", () => {
    expect(splitBillLineToVoucherLines({ weight_kg: 2.5, m3: null }, [{ id: "a", qty: 0 }])[0].kg_per_unit).toBeNull();
    expect(splitBillLineToVoucherLines({ weight_kg: 2.5, m3: null }, [{ id: "a", qty: 5 }])[0].cbm_per_unit).toBeNull();
  });
  it("วันที่หลายรูปแบบ → YYYY-MM-DD", () => {
    expect(normDate("11-09-2026")).toBe("2026-09-11");
    expect(normDate("2026-9-1")).toBe("2026-09-01");
    expect(normDate("11/09/2026")).toBe("2026-09-11");
    expect(normDate("")).toBeNull();
  });
});
