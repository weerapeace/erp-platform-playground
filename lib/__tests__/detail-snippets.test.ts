import { describe, expect, it } from "vitest";
import { composeLines, enInsertAt, insertLines, materialLine, slotLine, slotText, splitLines } from "@/lib/detail-snippets";
import { findMaterialLinks, materialTerms, publicMaterial, type MaterialRow } from "@/lib/product-materials";

const card = { id: "c", name: "ช่องใส่บัตรเครดิต", name_en: "Card slot", kind: "slot", template_en: "{n} card slots" };
const bill = { id: "b", name: "ช่องใส่ธนบัตร", name_en: "Bill compartment", kind: "slot" };
const noEn = { id: "x", name: "ช่องลับ", kind: "slot" };

describe("detail-snippets", () => {
  it("ช่อง + ตัวเลข → บรรทัดตามแบบเดิม", () => {
    expect(slotText(card, 6, "th")).toBe("ช่องใส่บัตรเครดิต 6 ช่อง");
    expect(slotText(card, 6, "en")).toBe("6 card slots");
    expect(slotText(bill, 2, "en")).toBe("Bill compartment × 2");
    expect(slotText(card, 0, "th")).toBeNull();
    expect(slotLine([{ item: card, n: 6 }, { item: bill, n: 2 }, { item: noEn, n: 0 }], "th")).toBe("ช่องใส่บัตรเครดิต 6 ช่อง, ช่องใส่ธนบัตร 2 ช่อง");
    // อังกฤษขาดตัวไหน = ทั้งบรรทัดว่าง (ไม่ครึ่ง ๆ กลาง ๆ)
    expect(slotLine([{ item: card, n: 6 }, { item: noEn, n: 1 }], "en")).toBeNull();
  });

  it("วัสดุหลายตัว = บรรทัดเดียว", () => {
    const m = [{ id: "1", name: "หนังวัวนิ่มนัปป้า", name_en: "Nappa leather" }, { id: "2", name: "หนังวัวเรียบรูขน", name_en: "Smooth cowhide" }];
    expect(materialLine(m, "th")).toBe("วัสดุ: หนังวัวนิ่มนัปป้า และหนังวัวเรียบรูขน");
    expect(materialLine(m, "en")).toBe("Materials: Nappa leather and Smooth cowhide");
    expect(materialLine([m[0]], "en")).toBe("Material: Nappa leather");
  });

  it("แทรกตรงตำแหน่งที่เลือก · ท้ายสุดไม่ไปอยู่ใต้บรรทัดว่าง", () => {
    const d = "- ผลิตจากหนังวัวแท้ 100%\n- ช่องอเนกประสงค์ 2 ช่อง\n\n";
    expect(splitLines(d)).toHaveLength(2);
    expect(insertLines(d, ["- วัสดุ: หนัง"], 1)).toBe("- ผลิตจากหนังวัวแท้ 100%\n- วัสดุ: หนัง\n- ช่องอเนกประสงค์ 2 ช่อง");
    expect(insertLines(d, ["- ท้าย"], 99)).toBe("- ผลิตจากหนังวัวแท้ 100%\n- ช่องอเนกประสงค์ 2 ช่อง\n- ท้าย");
    expect(insertLines("", ["- a", "- b"], 0)).toBe("- a\n- b");
    expect(insertLines("a\r\nb", ["x"], 0)).toBe("x\na\nb");
  });

  it("อังกฤษ: บรรทัดเท่ากัน = ตำแหน่งเดียวกัน · ไม่เท่า = ต่อท้าย", () => {
    expect(enInsertAt("a\nb\nc", "A\nB\nC", 1)).toBe(1);
    expect(enInsertAt("a\nb\nc", "A B C", 1)).toBe(1);
    expect(enInsertAt("a\nb\nc", "", 2)).toBe(0);
  });

  it("รวมที่เลือก → บรรทัดไทย/อังกฤษ + นับที่ไม่มีอังกฤษ", () => {
    const r = composeLines({
      phrases: [{ id: "p", name: "ผลิตในประเทศไทย", name_en: "Made in Thailand" }, { id: "q", name: "งานแฮนด์เมด" }],
      materials: [{ id: "1", name: "ผ้าแคนวาส", name_en: "Canvas" }],
      slots: [{ item: card, n: 6 }],
    });
    expect(r.th).toEqual(["- ผลิตในประเทศไทย", "- งานแฮนด์เมด", "- วัสดุ: ผ้าแคนวาส", "- ช่องใส่บัตรเครดิต 6 ช่อง"]);
    expect(r.en).toEqual(["- Made in Thailand", "- Material: Canvas", "- 6 card slots"]);
    expect(r.enMissing).toBe(1);
  });
});

describe("product-materials", () => {
  const nappa: MaterialRow = { id: "1", name: "หนังวัวนิ่มนัปป้า", name_en: "Nappa cowhide leather", slug: "nappa-leather", aliases: "หนังนัปป้า, Nappa leather, , N", description: "หนังนุ่ม", is_active: true };
  const empty: MaterialRow = { id: "2", name: "ผ้าแคนวาส", slug: "canvas", description: "  ", is_active: true };
  const off: MaterialRow = { ...nappa, id: "3", slug: "off", is_active: false };

  it("คำที่ใช้จับ = ชื่อ + อังกฤษ + คำเรียกอื่น (ตัดสั้น/ซ้ำ)", () => {
    expect(materialTerms(nappa)).toEqual(["หนังวัวนิ่มนัปป้า", "Nappa cowhide leather", "หนังนัปป้า", "Nappa leather"]);
  });

  it("ลิงก์เฉพาะวัสดุที่มีหน้า + ถูกพูดถึง (ไม่สนตัวพิมพ์เล็กใหญ่)", () => {
    const links = findMaterialLinks(["- วัสดุ: หนังวัวนิ่มนัปป้า และผ้าแคนวาส", null], [nappa, empty, off]);
    expect(links.map((l) => l.slug)).toEqual(["nappa-leather"]);
    expect(findMaterialLinks(["", "Made of NAPPA LEATHER"], [nappa])).toHaveLength(1);
    expect(findMaterialLinks(["ไม่มีวัสดุ"], [nappa])).toEqual([]);
  });

  it("ข้อมูลหน้าวัสดุไม่ส่งช่องว่าง", () => {
    const p = publicMaterial({ ...nappa, image_key: "a/b.jpg", care: "" }, (k) => `https://x/${k}`);
    expect(p).toMatchObject({ slug: "nappa-leather", name: "หนังวัวนิ่มนัปป้า", image: "https://x/a/b.jpg" });
    expect("care" in p).toBe(false);
  });
});
