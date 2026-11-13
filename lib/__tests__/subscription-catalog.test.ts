import { describe, expect, it } from "vitest";
import {
  catalogKey, findCatalogApp, findPlan, mergePlans, normalizePlans, parseLookupResult, planMatches, searchCatalog,
  toCatalogApp, validateCatalogInput, type CatalogApp,
} from "@/lib/subscription-catalog";

const app = (name: string, plans: unknown[] = []): CatalogApp => toCatalogApp({ id: name, name, plans });

describe("คลังแพ็กเกจ App Subscription", () => {
  it("จับคู่ชื่อแอปไม่สนตัวพิมพ์/ช่องว่าง", () => {
    expect(catalogKey("  Chat  GPT ")).toBe("chat gpt");
    const list = [app("ChatGPT"), app("Canva")];
    expect(findCatalogApp(list, "chatgpt")?.name).toBe("ChatGPT");
    expect(findCatalogApp(list, "chat")).toBeNull();
  });

  it("ค้นในคลัง: ขึ้นต้นด้วยคำค้นมาก่อนที่มีอยู่กลางชื่อ", () => {
    const list = [app("Adobe Photoshop"), app("Photoshop Express"), app("Canva")];
    expect(searchCatalog(list, "photo").map((a) => a.name)).toEqual(["Photoshop Express", "Adobe Photoshop"]);
    expect(searchCatalog(list, "")).toEqual([]);
  });

  it("ทำความสะอาดแพ็กเกจ: ตัดสกุลเงิน/รอบบิลแปลก ชื่อว่าง ชื่อซ้ำ · ปัดราคา 2 ตำแหน่ง", () => {
    const plans = normalizePlans([
      { name: "Plus", cost: 20, currency: "usd", billing_cycle: "monthly" },
      { name: "plus", cost: 25, currency: "USD", billing_cycle: "monthly" },
      { name: "Pro", cost: 9.999, currency: "JPY", billing_cycle: "monthly" },
      { name: "", cost: 1, currency: "THB", billing_cycle: "monthly" },
      { name: "Team", cost: 99.999, currency: "THB", billing_cycle: "yearly" },
    ]);
    expect(plans.map((p) => [p.name, p.cost, p.currency])).toEqual([["Plus", 20, "USD"], ["Team", 100, "THB"]]);
    expect(plans.every((p) => p.id)).toBe(true);
  });

  it("เทียบราคาในรายการกับแพ็กเกจ + รวมแพ็กเกจไม่ทับของเดิม", () => {
    const a = app("ChatGPT", [{ id: "p1", name: "Plus", cost: 20, currency: "USD", billing_cycle: "monthly" }]);
    const plus = findPlan(a, "plus")!;
    expect(planMatches(plus, { cost: 20, currency: "USD", billing_cycle: "monthly" })).toBe(true);
    expect(planMatches(plus, { cost: 22, currency: "USD", billing_cycle: "monthly" })).toBe(false);
    const merged = mergePlans(a.plans, normalizePlans([{ name: "PLUS", cost: 99, currency: "USD", billing_cycle: "monthly" }, { name: "Pro", cost: 200, currency: "USD", billing_cycle: "monthly" }]));
    expect(merged.map((p) => [p.name, p.cost])).toEqual([["Plus", 20], ["Pro", 200]]);
  });

  it("ตรวจข้อมูลก่อนบันทึก", () => {
    expect(validateCatalogInput({ name: " " }, true)).toBeTruthy();
    expect(validateCatalogInput({ name: "X", plans: [{ id: "1", name: "A", cost: -1, currency: "THB", billing_cycle: "monthly" }] }, true)).toBeTruthy();
    expect(validateCatalogInput({ name: "X", plans: [{ id: "1", name: "A", cost: 10, currency: "THB", billing_cycle: "monthly" }] }, true)).toBeNull();
  });

  it("แกะคำตอบ AI: ห่อด้วย ```json / มีคำนำ · ตัดแพ็กเกจฟรี · เว็บต้องเป็นโดเมน", () => {
    const text = 'นี่คือผล:\n```json\n{"found":true,"name":"CapCut","category":"Video","site":"https://www.capcut.com/pricing","plans":[{"name":"Free","cost":0,"currency":"USD","billing_cycle":"monthly"},{"name":"Pro (monthly)","cost":9.99,"currency":"USD","billing_cycle":"monthly"}],"note":"ราคาจากหน้าเว็บ {ทางการ}"}\n```';
    const r = parseLookupResult(text, "capcut");
    expect(r).toMatchObject({ found: true, name: "CapCut", category: "Video", site: "capcut.com" });
    expect(r.plans.map((p) => p.name)).toEqual(["Pro (monthly)"]);
    expect(r.note).toContain("{ทางการ}");
  });

  it("แกะคำตอบ AI: ไม่เจอ / อ่านไม่ออก / ไม่มีแพ็กเกจเสียเงิน = found false", () => {
    expect(parseLookupResult('{"found":false,"name":"Xyz"}', "xyz").found).toBe(false);
    expect(parseLookupResult("ขออภัย หาไม่เจอ", "xyz")).toMatchObject({ found: false, name: "xyz" });
    expect(parseLookupResult('{"found":true,"name":"A","plans":[{"name":"Free","cost":0,"currency":"USD","billing_cycle":"monthly"}]}', "a").found).toBe(false);
  });
});
