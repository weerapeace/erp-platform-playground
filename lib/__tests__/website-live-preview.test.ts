import { describe, it, expect } from "vitest";
import { previewReloadSig, previewStructureSig } from "../website-live-preview";

const base: Record<string, unknown>[] = [
  { id: "h1", type: "hero", enabled: true, title: "สวัสดี", style: { bg: "auto" } },
  { id: "p1", type: "products", enabled: true, title: "สินค้า", codes: ["A"], style: { bg: "auto" } },
  { id: "c1", type: "canvas", enabled: true, height: 500, items: [] },
];
const sig = (b: Record<string, unknown>[], live = true) => previewReloadSig(b as never, live);

describe("พรีวิวสด: ต้องโหลดพรีวิวใหม่ไหม", () => {
  it("แก้ข้อความ/รูปลักษณ์ของ Section ทั่วไป = ไม่ต้องโหลดใหม่ (พรีวิววาดเอง)", () => {
    const next = base.map((b) => (b.id === "h1" ? { ...b, title: "ใหม่", style: { bg: "brand" } } : b));
    expect(sig(next)).toBe(sig(base));
  });
  it("รูปลักษณ์/ซ่อนของ Section ที่ดึงข้อมูล = ไม่ต้องโหลดใหม่", () => {
    const next = base.map((b) => (b.id === "p1" ? { ...b, style: { bg: "ink" }, visibility: { mobile: false } } : b));
    expect(sig(next)).toBe(sig(base));
  });
  it("เนื้อหาของ Section ที่ดึงข้อมูลเปลี่ยน (เลือกสินค้าใหม่) = ต้องโหลดใหม่", () => {
    const next = base.map((b) => (b.id === "p1" ? { ...b, codes: ["A", "B"] } : b));
    expect(sig(next)).not.toBe(sig(base));
  });
  it("เพิ่ม Section ที่ดึงข้อมูล = ต้องโหลดใหม่ · เพิ่ม Section ทั่วไป/ย้ายลำดับ = ไม่ต้อง", () => {
    expect(sig([...base, { id: "f1", type: "featured", enabled: true, title: "x", style: {} } as never])).not.toBe(sig(base));
    expect(sig([...base, { id: "t2", type: "rich-text", enabled: true, title: "x", style: {} } as never])).toBe(sig(base));
    expect(sig([...base].reverse())).toBe(sig(base));
  });
  it("เว็บร้านรุ่นเก่า (ไม่รับค่าสด) = แบบเดิม: แก้อะไรก็โหลดใหม่ ยกเว้นเนื้อในผืนผ้าใบ", () => {
    const hero = base.map((b) => (b.id === "h1" ? { ...b, title: "ใหม่" } : b));
    expect(sig(hero, false)).not.toBe(sig(base, false));
    const canvas = base.map((b) => (b.id === "c1" ? { ...b, height: 900 } : b));
    expect(sig(canvas, false)).toBe(sig(base, false));
    expect(sig(base, false)).toBe(previewStructureSig(base as never));
  });
  it("เว็บร้านบอก serverTypes มาเอง = ใช้ชุดนั้น (ตารางสินค้าวาดสดได้ → เปลี่ยนรูปแบบไม่ต้องโหลดใหม่)", () => {
    const pb = [...base, { id: "p1", type: "products", enabled: true, layout: "grid", style: {} }] as Record<string, unknown>[];
    const next = pb.map((b) => (b.id === "p1" ? { ...b, layout: "mosaic" } : b));
    const st = ["featured", "personalize"];
    expect(previewReloadSig(next as never, true, st)).toBe(previewReloadSig(pb as never, true, st));
    // ไม่บอก = ชุดเดิม (products ยังโหลดใหม่ — เว็บร้านรุ่นเก่า)
    expect(previewReloadSig(next as never, true)).not.toBe(previewReloadSig(pb as never, true));
  });
});
