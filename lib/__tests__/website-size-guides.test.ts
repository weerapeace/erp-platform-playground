import { describe, it, expect } from "vitest";
import { normalizeSizeGuides, parseFitRange, resolveSizeGuide, publicSizeGuide, SIZE_GUIDE_TEMPLATES } from "../website-size-guides";

/** 📏 ตารางไซส์ — ช่วงใต้ปุ่มไซส์/ตัวช่วยแนะนำไซส์อ่านจากช่องเดียว · ตารางของหมวดย่อยชนะหมวดแม่ · ทับรายรุ่นได้ */
const belt = { id: "belt", ...SIZE_GUIDE_TEMPLATES[0].make(), categories: ["belts"] };
const womens = { ...belt, id: "womens", name: "เข็มขัดผู้หญิง", categories: ["belts-womens-belts"] };
const cats = [
  { key: "belts", parent: null },
  { key: "belts-womens-belts", parent: "belts" },
  { key: "belts-automatic-belts", parent: "belts" },
  { key: "wallets", parent: null },
];

describe("website-size-guides", () => {
  it("อ่านช่วงจากข้อความที่พิมพ์หลายแบบ", () => {
    expect(parseFitRange("28–32")).toEqual({ min: 28, max: 32 });
    expect(parseFitRange("28 - 32 นิ้ว")).toEqual({ min: 28, max: 32 });
    expect(parseFitRange("34")).toEqual({ min: 34, max: 34 });
    expect(parseFitRange("32.5–36")).toEqual({ min: 32.5, max: 36 });
    expect(parseFitRange("ตามสั่ง")).toBeNull();
  });

  it("ตามหมวด: หมวดย่อยชนะหมวดแม่ · หมวดอื่น = ไม่มี", () => {
    const guides = normalizeSizeGuides([belt, womens]);
    expect(resolveSizeGuide(guides, ["belts-automatic-belts"], cats, null)?.id).toBe("belt");
    expect(resolveSizeGuide(guides, ["belts-womens-belts"], cats, null)?.id).toBe("womens");
    expect(resolveSizeGuide(guides, ["wallets"], cats, null)).toBeNull();
  });

  it("ทับรายรุ่น: none = ไม่แสดง · id = ตารางนั้น", () => {
    const guides = normalizeSizeGuides([belt, womens]);
    expect(resolveSizeGuide(guides, ["belts"], cats, "none")).toBeNull();
    expect(resolveSizeGuide(guides, ["wallets"], cats, "womens")?.id).toBe("womens");
  });

  it("ทำความสะอาด: ไซส์ซ้ำ/ว่างตัดทิ้ง · fitColumn ต้องมีจริง · JSON string ได้ · เก็บคำแปล _en", () => {
    const [g] = normalizeSizeGuides(JSON.stringify([{ ...belt, rows: [...belt.rows, { size: "s", cells: {} }, { size: "", cells: {} }], fitColumn: "nope" }]));
    expect(g.rows.map((r) => r.size)).toEqual(["S", "M", "L", "XL"]);
    expect(g.fitColumn).toBeNull();
    expect(g.name_en).toBe("Belt size guide");
    expect(g.columns[0].label_en).toBe("Waist (in)");
    expect(normalizeSizeGuides("ไม่ใช่ JSON")).toEqual([]);
  });

  it("ค่าที่ส่งเว็บ: แถวมี min/max จากคอลัมน์ fit", () => {
    const pub = publicSizeGuide(normalizeSizeGuides([belt])[0]);
    expect(pub.rows[1]).toMatchObject({ size: "M", min: 32, max: 36 });
  });
});

import { normalizeShopFilters, DEFAULT_SHOP_FILTERS } from "../website-listing";

describe("ตัวกรองไซส์ (option2) ในหน้ารายการสินค้า", () => {
  it("ร้านใหม่ (ยังไม่เคยบันทึก) = มีตัวกรองไซส์เปิดอยู่ ต่อจาก 'ขนาด'", () => {
    const ids = DEFAULT_SHOP_FILTERS.map((f) => f.id);
    expect(ids.indexOf("option2")).toBe(ids.indexOf("size") + 1);
    expect(normalizeShopFilters(undefined).find((f) => f.id === "option2")?.enabled).toBe(true);
  });
  it("ร้านที่บันทึกตัวกรองไว้แล้ว = ต่อท้ายแบบปิด (ไม่โผล่เอง) · บันทึกแบบเปิดแล้วเก็บไว้ได้", () => {
    const saved = [{ kind: "category" }, { kind: "price" }];
    expect(normalizeShopFilters(saved).find((f) => f.id === "option2")).toMatchObject({ enabled: false, label: "ไซส์" });
    expect(normalizeShopFilters([...saved, { kind: "option2", label: "Size", enabled: true }]).find((f) => f.id === "option2")).toMatchObject({ enabled: true, label: "Size" });
  });
});
