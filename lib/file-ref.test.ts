import { describe, it, expect } from "vitest";
import { parseFileRef, supabaseFileRef, isRefForCategory, isSupabaseRef, newCategoryPath, fileRefName, isPdfRef, ERP_FILES_BUCKET } from "./file-ref";

describe("file-ref · ที่อยู่ไฟล์กลาง", () => {
  it("ค่าเดิม (ไม่มี sb:) = R2 key — ข้อมูลเก่าใช้ต่อได้ไม่ต้องแปลง", () => {
    expect(parseFileRef("goods-receipts/2026/a.jpg")).toEqual({ provider: "r2", key: "goods-receipts/2026/a.jpg" });
    expect(parseFileRef("")).toBeNull();
    expect(parseFileRef(null)).toBeNull();
  });

  it("sb:<bucket>/<path> = Supabase · รู้หมวดจากชั้นแรกของ path ใน erp-files", () => {
    const ref = supabaseFileRef(ERP_FILES_BUCKET, "supplier_bills/2026-11/1-x.jpg");
    expect(ref).toBe("sb:erp-files/supplier_bills/2026-11/1-x.jpg");
    expect(parseFileRef(ref)).toEqual({ provider: "supabase", bucket: "erp-files", path: "supplier_bills/2026-11/1-x.jpg", category: "supplier_bills" });
    expect(parseFileRef("sb:invoices/a.pdf")).toEqual({ provider: "supabase", bucket: "invoices", path: "a.pdf", category: null });
    expect(isSupabaseRef(ref)).toBe(true);
    expect(isSupabaseRef("a.jpg")).toBe(false);
  });

  it("กัน ref แปลก ๆ (ไม่มี path / มี .. / ช่องว่างในทาง)", () => {
    expect(parseFileRef("sb:erp-files")).toBeNull();
    expect(parseFileRef("sb:erp-files/")).toBeNull();
    expect(parseFileRef("sb:/x.jpg")).toBeNull();
    expect(parseFileRef("sb:erp-files/supplier_bills/../finance_private/x.pdf")).toBeNull();
    expect(parseFileRef("sb:erp-files/supplier_bills//x.pdf")).toBeNull();
  });

  it("บันทึกเอกสารได้เฉพาะไฟล์ของหมวดตัวเอง (กันยัดไฟล์หมวดอื่นมา)", () => {
    expect(isRefForCategory("sb:erp-files/supplier_bills/2026-11/x.jpg", "supplier_bills")).toBe(true);
    expect(isRefForCategory("sb:erp-files/finance_private/2026-11/x.pdf", "supplier_bills")).toBe(false);
    expect(isRefForCategory("sb:invoices/supplier_bills/x.pdf", "supplier_bills")).toBe(false);
    expect(isRefForCategory("goods-receipts/a.jpg", "supplier_bills")).toBe(true);
    expect(isRefForCategory("", "supplier_bills")).toBe(false);
  });

  it("path ใหม่: <หมวด>/<ปี-เดือน UTC>/<เวลา>-<สุ่ม>.<นามสกุลตัวเล็ก>", () => {
    const d = new Date(Date.UTC(2026, 10, 30, 23, 59));   // 30 พ.ย. 2026 UTC (เวลาไทยเป็น 1 ธ.ค. แล้ว)
    expect(newCategoryPath("supplier_bills", "บิล ร้าน.JPG", d, "abc123")).toBe(`supplier_bills/2026-11/${d.getTime()}-abc123.jpg`);
    expect(newCategoryPath("supplier_bills", "noext", d, "z")).toBe(`supplier_bills/2026-11/${d.getTime()}-z`);
  });

  it("ชื่อไฟล์ + PDF", () => {
    expect(fileRefName("sb:erp-files/supplier_bills/2026-11/1-x.pdf")).toBe("1-x.pdf");
    expect(isPdfRef("sb:erp-files/a/b.PDF")).toBe(true);
    expect(isPdfRef("a/b.jpg")).toBe(false);
  });
});
