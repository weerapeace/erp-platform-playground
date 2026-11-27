import { describe, expect, it } from "vitest";
import { AI_MODEL_CHOICES, chatLimitParams, cleanMainSetting, DEFAULT_MAIN_MODEL, DEFAULT_REASONING_EFFORT, isReasoningModel, productDetailCostThb, REASONING_HEADROOM, reasoningExtraOut, responsesLimitParams } from "@/lib/ai-caption-models";
import { callCostThb, estimateCostThb, followsMain, isValidModel, modelSource, PAID_SERVICES, paidService } from "@/lib/paid-services";

describe("ai-caption-models — รุ่น GPT ที่เลือกได้", () => {
  it("มีรุ่น 5.4 ให้เลือก และศูนย์ AI ยอมรับ", () => {
    for (const id of ["gpt-5.4-mini", "gpt-5.4"]) {
      expect(AI_MODEL_CHOICES.some((m) => m.id === id)).toBe(true);
      expect(isValidModel(id)).toBe(true);
    }
  });

  it("แยกรุ่นคิดก่อนตอบ (5.x / o-series) ออกจากรุ่น 4.x", () => {
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true);
    expect(isReasoningModel("gpt-5.4")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
    expect(isReasoningModel("gpt-4.1-mini")).toBe(false);
    expect(isReasoningModel("gpt-4o")).toBe(false);
  });

  it("รุ่น 4.x ใช้ max_tokens · รุ่น 5.x ใช้ max_completion_tokens + เผื่อเวลาคิด + คิดน้อย (ห้ามส่ง max_tokens)", () => {
    expect(chatLimitParams("gpt-4.1-mini", 1700)).toEqual({ max_tokens: 1700 });
    const p = chatLimitParams("gpt-5.4", 1700);
    expect(p).toEqual({ max_completion_tokens: 1700 + REASONING_HEADROOM, reasoning_effort: "medium" });
    expect("max_tokens" in p).toBe(false);
  });

  it("ค้นเว็บ (Responses API): รุ่น 5.x เผื่อเวลาคิด + คิดน้อย", () => {
    expect(responsesLimitParams("gpt-4.1-mini", 800)).toEqual({ max_output_tokens: 800 });
    expect(responsesLimitParams("gpt-5.4-mini", 800)).toEqual({ max_output_tokens: 800 + REASONING_HEADROOM, reasoning: { effort: "medium" } });
  });

  it("ประมาณค่าใช้จ่ายใช้ราคาของรุ่นนั้นจริง (ไม่ตกไปใช้ราคารุ่นแรก)", () => {
    // gpt-5.4: เข้า 90 / ออก 540 บาทต่อล้าน token
    expect(estimateCostThb("gpt-5.4", 1_000_000, 0)).toBe(90);
    expect(estimateCostThb("gpt-5.4", 0, 1_000_000)).toBe(540);
  });

  it("ราคาต่อสินค้าเรียงตามความแพง: 4.1-mini < 5.4-mini < 5.4", () => {
    const c = (id: string) => productDetailCostThb(AI_MODEL_CHOICES.find((m) => m.id === id)!);
    expect(c("gpt-4.1-mini")).toBeCloseTo(0.28, 2);
    expect(c("gpt-4.1-mini")).toBeLessThan(c("gpt-5.4-mini"));
    expect(c("gpt-5.4-mini")).toBeLessThan(c("gpt-5.4"));
  });
});

describe("รุ่นหลักของทั้งระบบ + ระดับการคิด (แบบ B · 2026-11-27)", () => {
  it("ระดับการคิดส่งเข้า API ตามที่ตั้ง · รุ่น 4.x ไม่ได้รับ", () => {
    expect(chatLimitParams("gpt-5.4", 1000, "high")).toEqual({ max_completion_tokens: 1000 + 16000, reasoning_effort: "high" });
    expect(chatLimitParams("gpt-5.4", 1000, "low")).toEqual({ max_completion_tokens: 1000 + 4000, reasoning_effort: "low" });
    expect(responsesLimitParams("gpt-5.4-mini", 800, "high")).toEqual({ max_output_tokens: 800 + 16000, reasoning: { effort: "high" } });
    expect(chatLimitParams("gpt-4.1-mini", 1000, "high")).toEqual({ max_tokens: 1000 });
  });

  it("ราคาต่อครั้งแพงขึ้นตามระดับการคิด (เฉพาะรุ่น 5.x)", () => {
    const t = { in: 3000, out: 400 };
    expect(callCostThb("gpt-5.4-mini", t, "low")).toBeLessThan(callCostThb("gpt-5.4-mini", t, "medium"));
    expect(callCostThb("gpt-5.4-mini", t, "medium")).toBeLessThan(callCostThb("gpt-5.4-mini", t, "high"));
    expect(callCostThb("gpt-4.1-mini", t, "low")).toBe(callCostThb("gpt-4.1-mini", t, "high"));
    expect(reasoningExtraOut("gpt-4o", "high")).toBe(0);
  });

  it("ค่าตั้งรุ่นหลัก: ไม่เคยตั้ง = ค่าเดิมของป๊อป · ค่าแปลก = ค่าเริ่ม", () => {
    expect(cleanMainSetting(null, "gpt-5.4-mini")).toEqual({ model: "gpt-5.4-mini", effort: DEFAULT_REASONING_EFFORT });
    expect(cleanMainSetting({ model: "gpt-5.4", effort: "high" }, "gpt-4o-mini")).toEqual({ model: "gpt-5.4", effort: "high" });
    expect(cleanMainSetting({ model: "gpt-9", effort: "max" }, "nope")).toEqual({ model: DEFAULT_MAIN_MODEL, effort: DEFAULT_REASONING_EFFORT });
  });

  it("งานที่ทำตามรุ่นหลักเป็นงาน GPT ทั้งหมด · งานอ่านบิล/แปล ไม่ตามรุ่นหลัก", () => {
    for (const s of PAID_SERVICES.filter((x) => x.modelTier === "main")) expect(s.kind).toBe("ai_chat");
    expect(followsMain(paidService("ai.product_detail"))).toBe(true);
    expect(followsMain(paidService("ai.caption"))).toBe(true);
    for (const k of ["ai.seller_bill", "ai.delivery_bill", "ai.translate", "ai.tag_setup"]) expect(followsMain(paidService(k))).toBe(false);
  });

  it("ป้ายที่มาของรุ่น: ตั้งเฉพาะ > ตามรุ่นหลัก > รุ่นที่เหมาะกับงาน", () => {
    const pd = paidService("ai.product_detail")!, sb = paidService("ai.seller_bill")!;
    expect(modelSource(pd, "gpt-4.1")).toBe("own");
    expect(modelSource(pd, null)).toBe("main");
    expect(modelSource(sb, null)).toBe("fixed");
  });
});
