import { describe, it, expect } from "vitest";
import { isRuleLocked, ruleStatus, validateRulePatch, maxBytesLabel, fileTypesLabel, STORAGE_WIRING, type StorageRule } from "./storage-policy";

const rule = (over: Partial<StorageRule> = {}): StorageRule => ({
  id: "x", rule_key: "record_files", label: "ไฟล์แนบ", label_en: null, description: null, file_types: [],
  provider: "supabase", allowed_providers: ["supabase", "drive"], lock_reason: null, max_bytes: null,
  sort_order: 0, updated_by: null, updated_at: "", ...over,
});

describe("storage-policy · กฎที่เก็บไฟล์กลาง", () => {
  it("ล็อก = เลือกที่เก็บได้ทางเดียว", () => {
    expect(isRuleLocked(rule({ allowed_providers: ["drive"] }))).toBe(true);
    expect(isRuleLocked(rule())).toBe(false);
  });

  it("หมวดที่ล็อกเปลี่ยนที่เก็บไม่ได้ (เช่น ไฟล์งานพิมพ์ = Drive เท่านั้น)", () => {
    const locked = rule({ provider: "drive", allowed_providers: ["drive"], lock_reason: "กฎเจ้าของ" });
    const r = validateRulePatch(locked, { provider: "r2" });
    expect(r.error).toContain("ล็อก");
    expect(r.error).toContain("กฎเจ้าของ");
  });

  it("เลือกที่เก็บนอกรายการที่อนุญาตไม่ได้ · ค่ามั่วไม่ได้", () => {
    expect(validateRulePatch(rule(), { provider: "r2" }).error).toContain("เลือกได้เฉพาะ");
    expect(validateRulePatch(rule(), { provider: "s3" }).error).toContain("ไม่ถูกต้อง");
  });

  it("ส่งค่าเดิมมา = ไม่มีอะไรเปลี่ยน (ไม่เขียนฐานข้อมูล/ไม่ลง log เปล่า)", () => {
    expect(validateRulePatch(rule({ max_bytes: 100 }), { provider: "supabase", max_bytes: 100 }).patch).toEqual({});
  });

  it("เปลี่ยนที่เก็บที่อนุญาต + ขนาดสูงสุด (ว่าง = ไม่กำหนด)", () => {
    expect(validateRulePatch(rule(), { provider: "drive", max_bytes: "1048576" }).patch).toEqual({ provider: "drive", max_bytes: 1048576 });
    expect(validateRulePatch(rule({ max_bytes: 5 }), { max_bytes: "" }).patch).toEqual({ max_bytes: null });
    expect(validateRulePatch(rule(), { max_bytes: -1 }).error).toBeTruthy();
    expect(validateRulePatch(rule(), { max_bytes: "abc" }).error).toBeTruthy();
  });

  it("สถานะบอกตามจริงว่าระบบส่งไฟล์ไปไหน", () => {
    const wiring = { a: "r2" as const, b: "rule" as const };
    expect(ruleStatus({ rule_key: "a", provider: "r2" }, wiring)).toEqual({ kind: "matches", actual: "r2" });
    expect(ruleStatus({ rule_key: "a", provider: "supabase" }, wiring)).toEqual({ kind: "mismatch", actual: "r2" });
    expect(ruleStatus({ rule_key: "b", provider: "drive" }, wiring)).toEqual({ kind: "follows" });
    expect(ruleStatus({ rule_key: "zzz", provider: "r2" }, wiring)).toEqual({ kind: "unwired" });
  });

  it("บิลซัพพลายเออร์ตอนนี้ยังลง R2 (กฎแนะนำ Supabase → ต้องโชว์ว่ายังไม่ตรง)", () => {
    expect(STORAGE_WIRING.supplier_bills).toBe("r2");
    expect(ruleStatus({ rule_key: "supplier_bills", provider: "supabase" }).kind).toBe("mismatch");
  });

  it("ป้ายอ่านง่าย", () => {
    expect(maxBytesLabel(52428800)).toBe("50 MB");
    expect(maxBytesLabel(null)).toBeNull();
    expect(fileTypesLabel(["pdf", "ai"])).toBe("PDF · AI");
    expect(fileTypesLabel([])).toBeNull();
  });
});
