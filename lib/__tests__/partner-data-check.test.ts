import { describe, it, expect } from "vitest";
import { isChinaPartner, partnerGaps, missingRequired, taxSwapped } from "../partner-data-check";

const full = {
  name_th: "บริษัท ตัวอย่าง จำกัด", address_line: "1 ถนนหนึ่ง", district: "เขตหนึ่ง", province: "กรุงเทพมหานคร",
  tax_id: "0105500000000", tax_branch: "00000", phone: "021234567", is_customer: true,
};

describe("partnerGaps — กติกาคู่ค้าข้อมูลไม่ครบ", () => {
  it("ครบทุกช่อง = ไม่ขาด", () => {
    expect(partnerGaps(full)).toEqual([]);
    expect(missingRequired(full)).toBe(false);
  });
  it("ช่อง company_name ว่างไม่นับว่าขาด (เอกสารพิมพ์จากชื่อไทย/อังกฤษ/ชื่อที่แสดง)", () => {
    expect(partnerGaps({ ...full, company_name: null })).toEqual([]);
    expect(partnerGaps({ ...full, name_th: "", display_name: "ร้านหนึ่ง" })).toEqual([]);
    expect(partnerGaps({ ...full, name_th: "", name_en: "", display_name: "" }).map((g) => g.key)).toEqual(["name"]);
  });
  it("ที่อยู่ต้องมีครบ บรรทัดที่อยู่ + อำเภอ + จังหวัด", () => {
    expect(partnerGaps({ ...full, district: "" }).map((g) => g.key)).toEqual(["address"]);
  });
  it("เบอร์โทร = ควรมี (ไม่ทำให้นับว่าไม่ครบบนการ์ด) · มือถืออย่างเดียวก็พอ", () => {
    const noPhone = { ...full, phone: "" };
    expect(partnerGaps(noPhone)).toEqual([{ key: "phone", label: "เบอร์โทร", required: false }]);
    expect(missingRequired(noPhone)).toBe(false);
    expect(partnerGaps({ ...noPhone, mobile: "0812345678" })).toEqual([]);
  });
  it("ร้านจีนไม่ตรวจ", () => {
    const cn = { is_supplier: true, wechat_id: "abc", name_th: "ร้านจีน" };
    expect(isChinaPartner(cn)).toBe(true);
    expect(partnerGaps(cn)).toEqual([]);
    expect(missingRequired(cn)).toBe(false);
    expect(isChinaPartner({ is_customer: true, wechat_id: "abc" })).toBe(false);   // ลูกค้าที่มี WeChat ไม่ใช่ร้านจีน
  });
  it("เลขภาษีอยู่ในช่องสาขา = กรอกสลับช่อง และนับว่าไม่ครบ", () => {
    const swapped = { ...full, tax_id: "", tax_branch: "0105500000000" };
    expect(taxSwapped(swapped)).toBe(true);
    expect(missingRequired(swapped)).toBe(true);
  });
});
