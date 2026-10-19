import { describe, expect, it } from "vitest";
import { parseVariants, pickVariant, resolvePhrase, variantOptions, variantSearchText } from "@/lib/phrase-variants";
import { fitLabels } from "@/lib/product-fits";

const zip = {
  id: "11111111-1111-4111-8111-111111111111", name: "ซิป", name_en: null, variant_mode: "select",
  variants: [
    { label: "ฟันเหล็ก", th: "ซิปฟันเหล็ก เปิด-ปิดง่ายไม่ติดขัด", en: "Smooth-glide metal zipper" },
    { label: "ไนล่อน", th: "ซิปไนลอนสัมผัสนุ่ม รูดลื่นเบามือ", en: "Smooth-glide nylon zipper" },
  ],
};
const lining = {
  id: "22222222-2222-4222-8222-222222222222", name: "ผ้าซับใน", name_en: null as string | null, variant_mode: "toggle",
  variants: [
    { label: "", th: "ผ้าซับในเนื้อละเอียด ทนทาน ไม่ขาดง่าย", en: "Fine, durable lining" },
    { label: "ทอลาย", th: "ผ้าซับในทอลายเนื้อละเอียด ทนทาน ไม่ขาดง่าย", en: "" },
  ],
};

describe("phrase-variants", () => {
  it("Dropdown: เลือกแบบไหน ได้ทั้งประโยคของแบบนั้น · ไม่เลือก = แบบแรก", () => {
    expect(variantOptions(zip)).toEqual(["ฟันเหล็ก", "ไนล่อน"]);
    expect(resolvePhrase(zip, "ไนล่อน").name).toBe("ซิปไนลอนสัมผัสนุ่ม รูดลื่นเบามือ");
    expect(resolvePhrase(zip, "ไนล่อน").name_en).toBe("Smooth-glide nylon zipper");
    expect(resolvePhrase(zip, "").name).toBe("ซิปฟันเหล็ก เปิด-ปิดง่ายไม่ติดขัด");
    expect(pickVariant(zip, "ไม่มีแบบนี้")?.label).toBe("ฟันเหล็ก");
  });

  it("ติ๊กสลับ: ไม่ติ๊ก = แบบที่ 1 · ติ๊ก = แบบที่ 2 · อังกฤษว่าง = null", () => {
    expect(variantOptions(lining)).toEqual(["ทอลาย"]);
    expect(resolvePhrase(lining, null).name).toBe("ผ้าซับในเนื้อละเอียด ทนทาน ไม่ขาดง่าย");
    expect(resolvePhrase(lining, "ทอลาย").name).toBe("ผ้าซับในทอลายเนื้อละเอียด ทนทาน ไม่ขาดง่าย");
    expect(resolvePhrase(lining, "ทอลาย").name_en).toBeNull();
  });

  it("ตั้งไม่ครบ = ใช้เป็นข้อความเดียวตามเดิม", () => {
    const plain = { name: "กันน้ำ", name_en: "Water resistant" };
    expect(resolvePhrase(plain, "x")).toBe(plain);
    expect(parseVariants("select", [{ label: "a", th: "A" }])).toBeNull();          // แบบเดียว
    expect(parseVariants("toggle", [{ label: "", th: "A" }, { label: "", th: "B" }])).toBeNull();   // ไม่มีชื่อช่องติ๊ก
    expect(parseVariants("other", zip.variants)).toBeNull();
    expect(parseVariants("select", JSON.stringify(zip.variants))?.variants).toHaveLength(2);
  });

  it("ค้นหาเจอจากข้อความทุกแบบ", () => {
    expect(variantSearchText(zip)).toContain("ไนลอนสัมผัสนุ่ม");
  });

  it("รายละเอียดเพิ่ม (ติ๊ก) บนเว็บ: ขึ้นประโยคของแบบที่เลือก ไม่ขึ้นชื่อหัวข้อ", () => {
    const catalog = [{ ...zip }, { ...lining }, { id: "33333333-3333-4333-8333-333333333333", name: "กันน้ำ", name_en: "Water resistant" }];
    const picks = [{ id: "11111111-1111-4111-8111-111111111111", size: "ไนล่อน" }, { id: "22222222-2222-4222-8222-222222222222" }, { id: "33333333-3333-4333-8333-333333333333" }];
    expect(fitLabels(picks, catalog)).toEqual(["ซิปไนลอนสัมผัสนุ่ม รูดลื่นเบามือ", "ผ้าซับในเนื้อละเอียด ทนทาน ไม่ขาดง่าย", "กันน้ำ"]);
    expect(fitLabels(picks, catalog, "en")).toEqual(["Smooth-glide nylon zipper", "Fine, durable lining", "Water resistant"]);
  });
});
