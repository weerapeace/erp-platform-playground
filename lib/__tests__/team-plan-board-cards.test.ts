import { describe, expect, it } from "vitest";
import { cleanCoverKey, cleanImageUrl, cleanPlanLinked, normalizePlanMeta, planCoverSource, sameLinked, type PlanItem } from "@/lib/team-plan";
import { boardPlanLinks } from "@/lib/team-plan-board";
import { isEmptySync, partOf, planCardSkeleton, planCardStroke, planCardSync, PLAN_CARD_VERSION } from "@/components/team-plan/board-cards";

const NOW = new Date("2026-11-15T03:00:00Z");   // 10:00 เวลาไทย
const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: "plan-1", title: "สั่งผ้าก้างปลาเพิ่ม", note: null, status: "open", priority: "high",
  due_at: "2026-11-16T11:00:00Z", assigned_to: "u1", assigned_name: "แนน",
  created_by: "พี", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
  resolved_by: null, resolved_at: null, links: [], plan: normalizePlanMeta(null, NOW), ...over,
});
const parts = (els: Record<string, unknown>[]) => els.map((e) => (e.customData as Record<string, unknown>)._part);
const textOf = (els: Record<string, unknown>[], part: string) => els.find((e) => (e.customData as Record<string, unknown>)._part === part)?.text;
/** จำลองการ์ดที่วางบนกระดานแล้ว: ใส่ id + เลื่อนไปตำแหน่งจริง (เหมือน insert) */
const placed = (els: Record<string, unknown>[], dx = 500, dy = 300): Record<string, unknown>[] => els.map((e, i) => {
  const { _imageUrl, ...rest } = e;
  return { ...rest, ...(_imageUrl ? { fileId: "f1" } : {}), id: `el-${i}`, x: (Number(e.x) || 0) + dx, y: (Number(e.y) || 0) + dy };
});

describe("การ์ดงานในแผนแบบใหม่ (board-cards)", () => {
  it("ชิ้นส่วน: กรอบ · แถบสี · ช่องรูป · ตัวอักษรแทนรูป · ป้าย · ชื่อ · คนทำ · กำหนด", () => {
    const els = planCardSkeleton(item(), NOW);
    expect(parts(els)).toEqual(["card", "stripe", "thumb", "thumbText", "badgeBox", "badge", "title", "who", "due"]);
    expect(els[0]).toMatchObject({ type: "rectangle", customData: { kind: "team_plan", id: "plan-1", _v: PLAN_CARD_VERSION } });
    expect(textOf(els, "badge")).toBe("ด่วน");
    expect(textOf(els, "who")).toBe("แนน");
    expect(textOf(els, "due")).toBe("พรุ่งนี้ 18:00");
    expect(textOf(els, "thumbText")).toBe("ส");
    // ทุกชิ้นอยู่กลุ่มเดียวกัน
    expect(new Set(els.map((e) => (e.groupIds as string[])[0])).size).toBe(1);
  });

  it("มีรูป = ชิ้น image แทนตัวอักษร · มีเช็กลิสต์/ผูก = บรรทัดรอง", () => {
    const t = item({ checklist: { open: ["a", "b"], done: 2 }, plan: { ...normalizePlanMeta(null, NOW), linked: [{ kind: "sku", id: "s", label: "S" }] } });
    const els = planCardSkeleton(t, NOW, "/api/r2-image?key=a&w=160");
    expect(parts(els)).toContain("image");
    expect(parts(els)).not.toContain("thumbText");
    expect(els.find((e) => e.type === "image")).toMatchObject({ _imageUrl: "/api/r2-image?key=a&w=160", customData: { _img: "/api/r2-image?key=a&w=160" } });
    expect(textOf(els, "meta")).toBe("เช็กลิสต์ 2/4 · ผูกไว้ 1 อย่าง");
  });

  it("สีแถบ: เสร็จ = เขียว · เกินกำหนด = แดง (กำหนดตัวแดง) · ป้าย = เสร็จแล้ว", () => {
    const done = item({ status: "resolved", resolved_by: "แนน" });
    expect(planCardStroke(done, NOW)).toBe("#16a34a");
    expect(textOf(planCardSkeleton(done, NOW), "badge")).toBe("เสร็จแล้ว");
    const late = planCardSkeleton(item({ due_at: "2026-11-13T11:00:00Z" }), NOW);
    expect(late.find((e) => (e.customData as Record<string, unknown>)._part === "stripe")).toMatchObject({ backgroundColor: "#dc2626" });
    expect(late.find((e) => (e.customData as Record<string, unknown>)._part === "due")).toMatchObject({ text: "เกินกำหนด 2 วัน", strokeColor: "#dc2626" });
    expect(textOf(planCardSkeleton(item({ due_at: null, assigned_name: null }), NOW), "due")).toBe("ไม่มีกำหนด");
  });

  it("ซิงค์: การ์ดที่ตรงอยู่แล้ว = ไม่มีอะไรต้องแก้", () => {
    const board = placed(planCardSkeleton(item(), NOW, null, "g1"));
    expect(isEmptySync(planCardSync(board, item(), NOW, null))).toBe(true);
  });

  it("ซิงค์: เปลี่ยนคนทำ → แก้เฉพาะข้อความ · ไม่ย้ายกรอบ", () => {
    const board = placed(planCardSkeleton(item(), NOW, null, "g1"));
    const s = planCardSync(board, item({ assigned_name: "ต้น" }), NOW, null);
    expect(s.insert).toEqual([]);
    expect(s.remove).toEqual([]);
    const whoId = board.find((e) => (e.customData as Record<string, unknown>)._part === "who")!.id as string;
    expect(s.patches.get(whoId)).toMatchObject({ text: "ต้น", originalText: "ต้น" });
    expect(s.patches.has("el-0")).toBe(false);   // กรอบการ์ด
  });

  it("ซิงค์: ใส่รูป → เพิ่มชิ้น image ที่ตำแหน่งจริง + เอาตัวอักษรแทนรูปออก · เปลี่ยนรูป → ลบรูปเดิม เพิ่มรูปใหม่", () => {
    const board = placed(planCardSkeleton(item(), NOW, null, "g1"));
    const s = planCardSync(board, item(), NOW, "/img/a");
    expect(s.insert).toHaveLength(1);
    expect(s.insert[0]).toMatchObject({ type: "image", _imageUrl: "/img/a", x: 500 + 17, y: 300 + 12, groupIds: ["g1"] });
    const tt = board.find((e) => (e.customData as Record<string, unknown>)._part === "thumbText")!.id;
    expect(s.remove).toEqual([tt]);

    const withImg = placed(planCardSkeleton(item(), NOW, "/img/a", "g1"));
    expect(isEmptySync(planCardSync(withImg, item(), NOW, "/img/a"))).toBe(true);
    const s2 = planCardSync(withImg, item(), NOW, "/img/b");
    const oldImg = withImg.find((e) => e.type === "image")!.id;
    expect(s2.remove).toEqual([oldImg]);
    expect(s2.insert[0]).toMatchObject({ type: "image", _imageUrl: "/img/b" });
  });

  it("ซิงค์: การ์ดแบบเก่า (กรอบ + ข้อความก้อนเดียว) → กรอบเดิมคง id · ข้อความเดิมกลายเป็นชื่องาน · เติมชิ้นที่ขาด", () => {
    const data = { kind: "team_plan", id: "plan-1", title: "สั่งผ้าก้างปลาเพิ่ม" };
    const old = [
      { id: "R", type: "rectangle", x: 100, y: 50, width: 260, height: 112, strokeColor: "#EF9F27", strokeWidth: 2, roundness: { type: 3 }, groupIds: ["g-old"], customData: data, boundElements: [{ id: "arrow-1", type: "arrow" }] },
      { id: "T", type: "text", x: 114, y: 64, text: "☐ สั่งผ้าก้างปลาเพิ่ม\nกำหนด: พรุ่งนี้ 18:00\nคนทำ: แนน", fontSize: 14, groupIds: ["g-old"], customData: data },
    ];
    expect(partOf(old[0])).toBe("card");
    expect(partOf(old[1])).toBe("title");
    const s = planCardSync(old, item(), NOW, null);
    expect(s.remove).toEqual([]);
    expect(s.patches.get("R")).toMatchObject({ width: 300, strokeColor: "#e2e8f0", strokeWidth: 1, customData: { _part: "card", _v: PLAN_CARD_VERSION } });
    expect(s.patches.get("R")).not.toHaveProperty("x");   // กรอบไม่ย้าย → เส้นผูกงานไม่หลุด
    expect(s.patches.get("T")).toMatchObject({ text: "สั่งผ้าก้างปลาเพิ่ม", fontFamily: 6 });
    expect(parts(s.insert)).toEqual(["stripe", "thumb", "thumbText", "badgeBox", "badge", "who", "due"]);
    expect(s.insert.every((e) => (e.groupIds as string[])[0] === "g-old")).toBe(true);
    expect(s.insert[0]).toMatchObject({ x: 100, y: 50 });
  });
});

describe("รูปหน้าการ์ด: แนบเอง → รูปของสิ่งที่ผูก", () => {
  it("planCoverSource", () => {
    expect(planCoverSource({ cover: null, linked: [] })).toBeNull();
    expect(planCoverSource({ cover: null, linked: [{ kind: "task", id: "t", label: "T" }, { kind: "sku", id: "s", label: "S", image: "/api/r2-image?key=x" }] })).toEqual({ url: "/api/r2-image?key=x" });
    expect(planCoverSource({ cover: "team-plan/u/1.jpg", linked: [{ kind: "sku", id: "s", label: "S", image: "/a" }] })).toEqual({ key: "team-plan/u/1.jpg" });
  });

  it("กรองค่ารูปแปลก", () => {
    expect(cleanImageUrl("/api/r2-image?key=a")).toBe("/api/r2-image?key=a");
    expect(cleanImageUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(cleanImageUrl("http://x.com/a.jpg")).toBeNull();
    expect(cleanImageUrl("javascript:alert(1)")).toBeNull();
    expect(cleanImageUrl("//evil.com/a")).toBeNull();
    expect(cleanCoverKey("team-plan/u1/123.jpg")).toBe("team-plan/u1/123.jpg");
    expect(cleanCoverKey("../etc")).toBeNull();
    expect(cleanCoverKey("")).toBeNull();
    expect(normalizePlanMeta({ cover: "team-plan/a.jpg" }).cover).toBe("team-plan/a.jpg");
  });

  it("รายการผูกเก็บรูป · ลากเส้นจากการ์ดที่มีรูป → ได้รูปติดมา", () => {
    expect(cleanPlanLinked([{ kind: "sku", id: "a", label: "A", image: "/img" }, { kind: "sku", id: "b", label: "B", image: "bad url" }]))
      .toEqual([{ kind: "sku", id: "a", label: "A", image: "/img" }, { kind: "sku", id: "b", label: "B" }]);
    expect(sameLinked([{ kind: "sku", id: "a", label: "A" }], [{ kind: "sku", id: "a", label: "A", image: "/img" }])).toBe(false);
    const els = [
      { id: "p", type: "rectangle", customData: { kind: "team_plan", id: "plan-1" } },
      { id: "s", type: "rectangle", customData: { kind: "sku", id: "sku-1", code: "WK01", image_url: "/api/r2-image?key=k" } },
      { id: "d", type: "rectangle", customData: { kind: "design_sheet", id: "ds-1", code: "DS-1", cover_url: "/api/r2-image?key=c" } },
      { id: "a1", type: "arrow", startBinding: { elementId: "p" }, endBinding: { elementId: "s" } },
      { id: "a2", type: "arrow", startBinding: { elementId: "d" }, endBinding: { elementId: "p" } },
    ];
    expect(boardPlanLinks(els).links.get("plan-1")).toEqual([
      { kind: "sku", id: "sku-1", label: "WK01", image: "/api/r2-image?key=k" },
      { kind: "design_sheet", id: "ds-1", label: "DS-1", image: "/api/r2-image?key=c" },
    ]);
  });
});
