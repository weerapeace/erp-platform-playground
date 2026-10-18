import { describe, it, expect } from "vitest";
import { buildNameFromParts, cleanNameParts, describeNameParts, removeToken, tidyName, DEFAULT_NAME_PARTS } from "@/lib/name-parts";

// ข้อมูลจริงจาก parent_skus_v2 (2026-10-18)
const ONX05 = {
  code: "ONX05", brand_label: "Louis Montini", collection_label: "ONYX",
  name_th: "Louis Montini (ONYX) กระเป๋าคาดอก Belt bag กระเป๋าผ้าไนล่อนผสมหนังวัวแท้ ONX05",
  name_en: "Louis Montini (ONYX) Nylon Belt Bag",
};
const BSD14 = {
  code: "BSD14", brand_label: "Louis Montini",
  name_th: "Louis Montini (Patchwork Collection) กระเป๋าถือและสะพายข้าง หนังแท้ ดีไซน์ Patchwork",
};

describe("ชื่อประกอบ (Name Platform)", () => {
  it("ค่าตั้งต้น = ชื่อ + รหัส เหมือนเดิม", () => {
    expect(buildNameFromParts(BSD14, null)).toBe(`${BSD14.name_th} BSD14`);
  });
  it("ชื่อมีรหัสอยู่แล้ว → ไม่ต่อรหัสซ้ำ (สูตรเดิมได้ … ONX05 ONX05)", () => {
    expect(buildNameFromParts(ONX05, DEFAULT_NAME_PARTS)).toBe("Louis Montini (ONYX) กระเป๋าคาดอก Belt bag กระเป๋าผ้าไนล่อนผสมหนังวัวแท้ ONX05");
  });
  it("สลับตำแหน่ง: รหัสขึ้นก่อน → ดึงรหัสออกจากชื่อแล้ววางหน้าสุด", () => {
    const cfg = { parts: [{ key: "code" }, { key: "name" }], sep: " - " };
    expect(buildNameFromParts(ONX05, cfg)).toBe("ONX05 - Louis Montini (ONYX) กระเป๋าคาดอก Belt bag กระเป๋าผ้าไนล่อนผสมหนังวัวแท้");
  });
  it("แบรนด์ไว้ท้าย → ย้ายแบรนด์ออกจากหัวชื่อ · คอลเลกชันในวงเล็บถูกดึงออก วงเล็บว่างหายไป", () => {
    const cfg = { parts: [{ key: "collection" }, { key: "name" }, { key: "code" }, { key: "brand" }], sep: " " };
    expect(buildNameFromParts(ONX05, cfg)).toBe("ONYX กระเป๋าคาดอก Belt bag กระเป๋าผ้าไนล่อนผสมหนังวัวแท้ ONX05 Louis Montini");
  });
  it("ปิดไม่ใส่ซ้ำ = ต่อตรง ๆ", () => {
    expect(buildNameFromParts(ONX05, { parts: [{ key: "name" }, { key: "code" }], dedupe: false })).toMatch(/ONX05 ONX05$/);
  });
  it("ภาษาอังกฤษใช้ Name En + ข้อความพิมพ์เองฉบับอังกฤษ", () => {
    const cfg = { parts: [{ key: "name" }, { key: "text", text: "ของแท้", text_en: "Authentic" }, { key: "code" }] };
    expect(buildNameFromParts(ONX05, cfg, "en")).toBe("Louis Montini (ONYX) Nylon Belt Bag Authentic ONX05");
    expect(buildNameFromParts(ONX05, cfg, "th")).toMatch(/หนังวัวแท้ ของแท้ ONX05$/);
  });
  it("ชิ้นที่ไม่มีข้อมูลข้ามไป (ไม่มีคอลเลกชัน)", () => {
    expect(buildNameFromParts(BSD14, { parts: [{ key: "collection" }, { key: "code" }] })).toBe("BSD14");
  });
});

describe("ครอบวงเล็บ + ตัวคั่นรายชิ้น", () => {
  it("ครอบคอลเลกชันด้วย ( ) และรหัสด้วย [ ] · ตัวคั่นก่อนรหัส = ขีด", () => {
    const cfg = { parts: [{ key: "brand" }, { key: "collection", wrap: "paren" }, { key: "name" }, { key: "code", wrap: "square", before: " - " }] };
    expect(buildNameFromParts(ONX05, cfg)).toBe("Louis Montini (ONYX) กระเป๋าคาดอก Belt bag กระเป๋าผ้าไนล่อนผสมหนังวัวแท้ - [ONX05]");
  });
  it("ไม่ครอบซ้ำ ถ้าครอบอยู่แล้ว · ชิ้นแรกไม่ใส่ตัวคั่น", () => {
    const cfg = { parts: [{ key: "code", wrap: "lenticular", before: " | " }, { key: "text", text: "(ของแท้)", wrap: "paren", before: "" }] };
    expect(buildNameFromParts(ONX05, cfg)).toBe("【ONX05】(ของแท้)");
  });
  it("ค่าแปลกทิ้ง (wrap/before ที่ไม่รู้จัก)", () => {
    expect(cleanNameParts({ parts: [{ key: "code", wrap: "x", before: "<b>" }] })).toEqual({ parts: [{ key: "code" }], sep: " ", dedupe: true });
  });
});

describe("ล้างค่าตั้ง", () => {
  it("ชิ้นซ้ำ/ไม่รู้จัก/ข้อความว่าง ทิ้ง · ตัวคั่นแปลก = เว้นวรรค · ว่าง = ค่าตั้งต้น", () => {
    expect(cleanNameParts({ parts: [{ key: "code" }, { key: "code" }, { key: "x" }, { key: "text", text: "  " }], sep: "<b>" }))
      .toEqual({ parts: [{ key: "code" }], sep: " ", dedupe: true });
    expect(cleanNameParts(undefined)).toEqual(DEFAULT_NAME_PARTS);
    expect(cleanNameParts({ parts: [] })).toEqual(DEFAULT_NAME_PARTS);
  });
  it("สรุปภาษาคน", () => {
    expect(describeNameParts({ parts: [{ key: "brand" }, { key: "code" }], dedupe: false })).toBe("แบรนด์ + รหัส (Code)");
  });
});

describe("ตัดคำ", () => {
  it("ไม่กินคำที่ติดตัวอักษร/ตัวเลข (IG-CHAIN ≠ IG-CHAIN01)", () => {
    expect(removeToken("โซ่กระเป๋า IG-CHAIN01", "IG-CHAIN")).toBe("โซ่กระเป๋า IG-CHAIN01");
    expect(removeToken("กระเป๋า onx05 สวย", "ONX05")).toBe("กระเป๋า  สวย");
  });
  it("เก็บกวาด", () => {
    expect(tidyName(" () กระเป๋า  [ ]  สวย - ")).toBe("กระเป๋า สวย");
  });
});
