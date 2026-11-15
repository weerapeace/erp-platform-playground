import { describe, expect, it } from "vitest";
import { addMemory, ALL_SCOPE, hasMeasurement, isSimilar, memoryFor, normalizeMemory, removeMemory, similarity, textKey } from "@/lib/desc-ai-memory";

/** 🧠 ความจำ AI จุดเด่นสินค้า (เจ้าของ 2026-11-15: ไม่ชอบ = ไม่เขียนอีก · ชอบ = ใส่ถ้าเหมาะ · แก้ได้) */
const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("desc-ai-memory", () => {
  it("normalize: scope ต้องเป็น uuid หรือ * · ข้อความว่าง/ซ้ำทิ้ง · ตัด - หน้าข้อความ", () => {
    const m = normalizeMemory({ [B]: { liked: ["- ผลิตในประเทศไทย", "ผลิตในประเทศไทย ", ""], disliked: [{ text: "ใส่ได้ทุกโอกาส", by: "u1" }] }, junk: { liked: ["x"] }, "*": { rules: ["ห้ามใช้คำว่า ดีที่สุด"] } });
    expect(Object.keys(m).sort()).toEqual([ALL_SCOPE, B].sort());
    expect(m[B].liked.map((e) => e.text)).toEqual(["ผลิตในประเทศไทย"]);
    expect(m[B].disliked[0]).toMatchObject({ text: "ใส่ได้ทุกโอกาส", by: "u1" });
    expect(normalizeMemory(null)).toEqual({});
  });

  it("ชอบ ↔ ไม่ชอบ ย้ายฝั่ง · เพิ่มซ้ำไม่เพิ่ม · ลบได้ + คืนรายการที่ลบ (เช็กสิทธิ์ลบของตัวเอง)", () => {
    let s = addMemory({}, B, "liked", { text: "สายสะพายปรับความยาวได้", by: "u1" });
    s = addMemory(s, B, "liked", { text: "สายสะพาย ปรับความยาวได้!", by: "u2" });
    expect(s[B].liked).toHaveLength(1);
    s = addMemory(s, B, "disliked", { text: "สายสะพายปรับความยาวได้", by: "u2" });
    expect(s[B].liked).toHaveLength(0);
    expect(s[B].disliked[0].by).toBe("u2");
    const r = removeMemory(s, B, "disliked", "สายสะพายปรับความยาวได้");
    expect(r.removed?.by).toBe("u2");
    expect(r.store[B].disliked).toHaveLength(0);
    expect(removeMemory(s, B2, "disliked", "x").removed).toBeNull();
    expect(addMemory({}, "bad-scope", "liked", { text: "x" })).toEqual({});
  });

  it("memoryFor = ของแบรนด์ + ทุกแบรนด์ (ติดป้าย scope · ไม่ซ้ำ)", () => {
    let s = addMemory({}, B, "liked", { text: "มาพร้อมจี้แบรนด์" });
    s = addMemory(s, ALL_SCOPE, "liked", { text: "ผลิตในประเทศไทย" });
    s = addMemory(s, ALL_SCOPE, "liked", { text: "มาพร้อมจี้แบรนด์" });
    s = addMemory(s, B2, "rules", { text: "ห้ามพูดถึงราคา" });
    const m = memoryFor(s, B);
    expect(m.liked.map((e) => `${e.scope === ALL_SCOPE ? "*" : "b"}:${e.text}`)).toEqual(["b:มาพร้อมจี้แบรนด์", "*:ผลิตในประเทศไทย"]);
    expect(m.rules).toHaveLength(0);
    expect(memoryFor(s, null).liked).toHaveLength(2);
  });

  it("ความคล้าย: เขียนต่างนิดหน่อย = คล้าย · คนละเรื่อง = ไม่คล้าย", () => {
    expect(textKey("ใส่ได้ทุก โอกาส!")).toBe("ใส่ได้ทุกโอกาส");
    expect(isSimilar("ใส่ได้ทุกโอกาส", "ใส่ได้ทุกโอกาสเลย")).toBe(true);
    expect(isSimilar("สายสะพายปรับความยาวได้", "สายสะพายปรับระดับความยาวได้")).toBe(true);
    expect(isSimilar("สายสะพายปรับความยาวได้", "มีหูหิ้วด้านบน ถือได้")).toBe(false);
    expect(similarity("", "x")).toBe(0);
  });

  it("ตัวเลขขนาด/น้ำหนัก = ห้าม (AI ห้ามเขียน)", () => {
    expect(hasMeasurement("ขนาด 20 ซม.")).toBe(true);
    expect(hasMeasurement("หนักเพียง 320 กรัม")).toBe(true);
    expect(hasMeasurement("fits a 13\" laptop")).toBe(true);
    expect(hasMeasurement("Weighs 0.5 kg")).toBe(true);
    expect(hasMeasurement("มีให้เลือก 10 สี")).toBe(false);
    expect(hasMeasurement("ช่องใส่บัตร 4 ช่อง")).toBe(false);
  });
});
