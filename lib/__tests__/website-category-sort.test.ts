import { describe, expect, it } from "vitest";
import { addCat, addToTarget, canAddTo, crossFamily, lacksSub, moveOut, shortcutTargets, groupByErp, guessWebCategory, inNode, isUnsorted, mainOf, moveToTarget, NONE, nosubNode, quickTargets, removeFromNode, sortedCats, withMain, withSub, withoutSubs, type SortCat } from "@/lib/website-category-sort";

/** หมวดจริงของ Louis (ย่อ) */
const CATS: SortCat[] = [
  { key: "accessories", label: "Accessories" },
  { key: "accessories-keychains", label: "Keychains", parent: "accessories" },
  { key: "wallets", label: "Wallets" },
  { key: "wallets-bifold-wallets", label: "กระเป๋าสตางค์พับสั้น", parent: "wallets" },
  { key: "belts", label: "Belts" },
  { key: "belts-automatic-belts", label: "Automatic Belts", parent: "belts" },
  { key: "bags", label: "Bags" },
  { key: "bags-crossbody-bags", label: "Crossbody Bags", parent: "bags" },
  { key: "bags-tote-bags", label: "Tote Bags", parent: "bags" },
  { key: "gifts", label: "Gifts" },
  { key: "men", label: "Men" },
];

describe("guessWebCategory — เดาหมวดเว็บจากชื่อหมวด ERP", () => {
  it("หมวด ERP จริงของ Louis → หมวดหลักที่ถูก", () => {
    expect(guessWebCategory("กระเป๋า", CATS)).toBe("bags");
    expect(guessWebCategory("เข็มขัด", CATS)).toBe("belts");
    expect(guessWebCategory("Bag Accessories", CATS)).toBe("accessories");
    expect(guessWebCategory("กระเป๋าสตางค์", CATS)).toBe("wallets");
    expect(guessWebCategory("Gift Set", CATS)).toBe("gifts");
    expect(guessWebCategory("Accessories", CATS)).toBe("accessories");
  });
  it("เดาไม่ได้ = ว่าง (ให้คนเลือก)", () => {
    expect(guessWebCategory("Risara Ja Kissa", CATS)).toBe("");
    expect(guessWebCategory("", CATS)).toBe("");
  });
});

describe("ย้ายหมวดบนกระดาน", () => {
  it("ใส่หมวดหลัก / ย้ายเข้าหมวดย่อย (แม่ก่อนลูก · ตัดหมวดย่อยพี่น้อง · คงหมวดอื่น)", () => {
    expect(withMain([], "bags")).toEqual(["bags"]);
    expect(withSub(["bags"], "bags-tote-bags", CATS)).toEqual(["bags", "bags-tote-bags"]);
    expect(withSub(["bags", "bags-tote-bags", "gifts"], "bags-crossbody-bags", CATS)).toEqual(["bags", "bags-crossbody-bags", "gifts"]);
    expect(withSub([], "belts-automatic-belts", CATS)).toEqual(["belts", "belts-automatic-belts"]);
    // หมวดหลักเดิมเป็นหมวดอื่น → คงหมวดหลักเดิมไว้ก่อน
    expect(withSub(["wallets", "wallets-bifold-wallets"], "bags-tote-bags", CATS)).toEqual(["wallets", "wallets-bifold-wallets", "bags", "bags-tote-bags"]);
  });
  it("เอาหมวดย่อยออก · เพิ่มหมวดแบบป้าย · หาแม่", () => {
    expect(withoutSubs(["bags", "bags-tote-bags", "gifts"], "bags", CATS)).toEqual(["bags", "gifts"]);
    expect(addCat(["bags"], "men")).toEqual(["bags", "men"]);
    expect(addCat(["bags", "men"], "men")).toEqual(["bags", "men"]);
    expect(mainOf(CATS, "bags-tote-bags")).toBe("bags");
    expect(mainOf(CATS, "gifts")).toBe("gifts");
  });
});

describe("ขั้น 1: สินค้าที่ยังไม่ได้จัด + จัดกลุ่มตามหมวด ERP", () => {
  it("ยังไม่ได้จัด = ไม่มีหลายหมวด (null/ว่าง) และไม่มีหมวดแบบเดิม", () => {
    expect(isUnsorted({ webCategories: null })).toBe(true);
    expect(isUnsorted({ webCategories: [] })).toBe(true);
    expect(isUnsorted({ webCategories: ["bags"] })).toBe(false);
    expect(isUnsorted({ webCategories: null, webCategory: "bags" })).toBe(false);
  });
  it("กลุ่มเรียงมาก→น้อย · ไม่มีหมวด ERP ไปท้ายสุด", () => {
    const g = groupByErp([{ erpCategory: "เข็มขัด" }, { erpCategory: "กระเป๋า" }, { erpCategory: "กระเป๋า" }, { erpCategory: null }]);
    expect(g.map((x) => [x.name, x.items.length])).toEqual([
      ["กระเป๋า", 2],
      ["เข็มขัด", 1],
      ["", 1],
    ]);
  });
});

describe("ขั้น 2: กระดาน (กอง · ปลายทาง · ย้าย)", () => {
  it("สินค้าอยู่กองไหน", () => {
    expect(inNode([], NONE, CATS)).toBe(true);
    expect(inNode(["bags"], nosubNode("bags"), CATS)).toBe(true);
    expect(inNode(["bags", "bags-tote-bags"], nosubNode("bags"), CATS)).toBe(false);
    expect(inNode(["bags", "bags-tote-bags"], "bags", CATS)).toBe(true);
    expect(inNode(["bags-tote-bags"], "bags", CATS)).toBe(true);
    expect(inNode(["bags", "gifts"], "gifts", CATS)).toBe(true);
  });
  it("ชิปปลายทาง: ยังไม่ได้จัด = หมวดชั้นบน · ในกลุ่มที่มีหมวดย่อย = หมวดย่อย · ป้าย = ชั้นบนอื่น", () => {
    expect(quickTargets(NONE, CATS)).toEqual(["accessories", "wallets", "belts", "bags", "gifts", "men"]);
    expect(quickTargets(nosubNode("bags"), CATS)).toEqual(["bags-crossbody-bags", "bags-tote-bags"]);
    expect(quickTargets("bags-tote-bags", CATS)).toEqual(["bags-crossbody-bags"]);
    expect(quickTargets("gifts", CATS)).toEqual(["accessories", "wallets", "belts", "bags", "men"]);
  });
  it("ย้าย: หมวดย่อย / ยังไม่มีหมวดย่อย / หมวดหลักแทนกัน / ป้ายเพิ่ม / ยังไม่ได้จัด", () => {
    expect(moveToTarget([], NONE, "bags", CATS)).toEqual(["bags"]);
    expect(moveToTarget(["bags"], nosubNode("bags"), "bags-tote-bags", CATS)).toEqual(["bags", "bags-tote-bags"]);
    expect(moveToTarget(["bags", "bags-tote-bags"], "bags-tote-bags", nosubNode("bags"), CATS)).toEqual(["bags"]);
    // ผิดกลุ่ม: กระเป๋า → กระเป๋าสตางค์ (แทนทั้งกลุ่ม คงป้ายไว้)
    expect(moveToTarget(["bags", "bags-tote-bags", "gifts"], "bags-tote-bags", "wallets", CATS)).toEqual(["wallets", "gifts"]);
    // ป้าย: จากกองหมวดหลัก = เพิ่ม · จากกองป้าย = แทน
    expect(moveToTarget(["bags"], "bags", "gifts", CATS)).toEqual(["bags", "gifts"]);
    expect(moveToTarget(["bags", "gifts"], "gifts", "men", CATS)).toEqual(["bags", "men"]);
    expect(moveToTarget(["gifts"], "gifts", "men", CATS)).toEqual(["men"]);
    // ป้าย → หมวดหลัก = หมวดหลักขึ้นก่อน คงป้าย
    expect(moveToTarget(["gifts"], "gifts", "bags", CATS)).toEqual(["bags", "gifts"]);
    expect(moveToTarget(["bags", "gifts"], "bags", NONE, CATS)).toEqual([]);
  });
  it("✕ เอาออกจากกอง + หมวดที่จัดไว้แล้ว", () => {
    expect(removeFromNode(["bags", "bags-tote-bags", "gifts"], "bags", CATS)).toEqual(["gifts"]);
    expect(removeFromNode(["bags", "bags-tote-bags"], "bags-tote-bags", CATS)).toEqual(["bags"]);
    expect(removeFromNode(["bags", "gifts"], "gifts", CATS)).toEqual(["bags"]);
    expect(sortedCats({ webCategories: null, categories: ["accessories"] })).toEqual([]);
    expect(sortedCats({ webCategories: ["bags"], categories: ["bags"] })).toEqual(["bags"]);
    expect(sortedCats({ webCategories: null, webCategory: "belts", categories: ["belts"] })).toEqual(["belts"]);
  });
});

/** ↪ ย้าย / ＋ เพิ่ม — เจ้าของ: "มีหลายหมวดได้ เวลาเลือกหมวดอยากให้ถามว่าจะย้ายหรือจะเพิ่ม" */
describe("addToTarget — เพิ่มเข้าหมวด (คงหมวดเดิม)", () => {
  it("เพิ่มหมวดป้าย = ต่อท้าย หมวดหลักเดิมยังอยู่หน้า", () => {
    expect(addToTarget(["belts", "belts-automatic-belts"], "men", CATS)).toEqual(["belts", "belts-automatic-belts", "men"]);
    expect(addToTarget(["belts", "men"], "men", CATS)).toEqual(["belts", "men"]);
  });
  it("เพิ่มหมวดย่อยของแม่อื่น = ใส่แม่ด้วย (แม่ก่อนลูก) ไม่แตะหมวดเดิม", () => {
    expect(addToTarget(["belts", "belts-automatic-belts"], "accessories-keychains", CATS)).toEqual(["belts", "belts-automatic-belts", "accessories", "accessories-keychains"]);
  });
  it("เพิ่มหมวดย่อยอีกอันในแม่เดียวกัน = อยู่ได้ 2 หมวดย่อย (ย้ายถึงจะตัดอันเดิม)", () => {
    expect(addToTarget(["bags", "bags-tote-bags"], "bags-crossbody-bags", CATS)).toEqual(["bags", "bags-crossbody-bags", "bags-tote-bags"]);
    expect(moveToTarget(["bags", "bags-tote-bags"], "bags-tote-bags", "bags-crossbody-bags", CATS)).toEqual(["bags", "bags-crossbody-bags"]);
  });
  it("หมวดหลัก (มีหมวดย่อย) = เพิ่มต่อท้าย ไม่แย่งหมวดหลัก · ย้าย = แทนหมวดหลักเดิม", () => {
    expect(addToTarget(["belts", "belts-automatic-belts"], "wallets", CATS)).toEqual(["belts", "belts-automatic-belts", "wallets"]);
    expect(moveToTarget(["belts", "belts-automatic-belts"], "belts", "wallets", CATS)).toEqual(["wallets"]);
  });
  it("กองพิเศษ = เพิ่มไม่ได้ (ไม่เปลี่ยน)", () => {
    expect(addToTarget(["belts"], NONE, CATS)).toEqual(["belts"]);
    expect(addToTarget(["belts", "belts-automatic-belts"], nosubNode("belts"), CATS)).toEqual(["belts", "belts-automatic-belts"]);
  });
  it("ถามได้เมื่อ: มาจากกองที่จัดแล้ว และปลายทางเป็นหมวดจริง", () => {
    expect(canAddTo("belts", "men")).toBe(true);
    expect(canAddTo(NONE, "men")).toBe(false);
    expect(canAddTo("belts", NONE)).toBe(false);
    expect(canAddTo("belts", nosubNode("belts"))).toBe(false);
  });
});

describe("ยังไม่มีหมวดย่อย / หมวดโปรด", () => {
  it("lacksSub — อยู่แม่ที่มีหมวดย่อยแต่ยังไม่ได้เลือกหมวดย่อย", () => {
    expect(lacksSub(["belts"], "belts", CATS)).toBe(true);
    expect(lacksSub(["belts", "belts-automatic-belts"], "belts", CATS)).toBe(false);
    expect(lacksSub(["gifts"], "gifts", CATS)).toBe(false); // ไม่มีหมวดย่อยให้เลือก
    expect(lacksSub(["wallets"], "belts", CATS)).toBe(false);
  });
  it("shortcutTargets — ปุ่มลัดต่อด้วยหมวดโปรดที่ไม่ซ้ำ ไม่รวมกองที่เปิดอยู่", () => {
    expect(shortcutTargets(["belts-automatic-belts"], ["men", "belts-automatic-belts", "belts"], "belts")).toEqual(["belts-automatic-belts", "men"]);
  });
});

describe("moveOut — ย้ายที่ผู้ใช้เลือกเอง (ออกจากที่เดิมจริง)", () => {
  it("หมวดหลัก → หมวดป้าย = ออกจากทั้งตระกูลเดิม ป้ายขึ้นเป็นหมวดหลัก", () => {
    expect(moveOut(["belts", "belts-automatic-belts"], "belts", "men", CATS)).toEqual(["men"]);
    expect(crossFamily("belts", "men", CATS)).toBe(true);
  });
  it("จากหมวดย่อย → หมวดย่อยของแม่อื่น = ออกจากทั้งตระกูลเดิม · ป้ายอื่นคงไว้", () => {
    expect(moveOut(["belts", "belts-automatic-belts", "men"], "belts-automatic-belts", "wallets-bifold-wallets", CATS)).toEqual(["wallets", "wallets-bifold-wallets", "men"]);
  });
  it("ในตระกูลเดียวกัน = กติกาเดิม (เปลี่ยนหมวดย่อย คงแม่)", () => {
    expect(moveOut(["belts", "belts-automatic-belts", "men"], "belts", "belts-automatic-belts", CATS)).toEqual(["belts", "belts-automatic-belts", "men"]);
    expect(crossFamily("belts-automatic-belts", "belts", CATS)).toBe(false);
  });
  it("ออกจากป้าย (ไม่ใช่หมวดหลัก) → ปลายทางต่อท้าย หมวดหลักเดิมคงไว้", () => {
    expect(moveOut(["belts", "men"], "men", "gifts", CATS)).toEqual(["belts", "gifts"]);
    expect(moveOut(["belts", "men"], "men", "wallets", CATS)).toEqual(["belts", "wallets"]);
  });
  it("กองยังไม่ได้จัด / ไปกองพิเศษ = กติกาเดิม", () => {
    expect(moveOut([], NONE, "men", CATS)).toEqual(moveToTarget([], NONE, "men", CATS));
    expect(moveOut(["belts", "belts-automatic-belts"], "belts-automatic-belts", nosubNode("belts"), CATS)).toEqual(["belts"]);
  });
});
