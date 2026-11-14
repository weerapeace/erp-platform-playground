import { describe, expect, it } from "vitest";
import { AI_MODEL_CHOICES, chatLimitParams, isReasoningModel, productDetailCostThb, REASONING_HEADROOM, responsesLimitParams } from "@/lib/ai-caption-models";
import { estimateCostThb, isValidModel } from "@/lib/paid-services";

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
    expect(p).toEqual({ max_completion_tokens: 1700 + REASONING_HEADROOM, reasoning_effort: "low" });
    expect("max_tokens" in p).toBe(false);
  });

  it("ค้นเว็บ (Responses API): รุ่น 5.x เผื่อเวลาคิด + คิดน้อย", () => {
    expect(responsesLimitParams("gpt-4.1-mini", 800)).toEqual({ max_output_tokens: 800 });
    expect(responsesLimitParams("gpt-5.4-mini", 800)).toEqual({ max_output_tokens: 800 + REASONING_HEADROOM, reasoning: { effort: "low" } });
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
