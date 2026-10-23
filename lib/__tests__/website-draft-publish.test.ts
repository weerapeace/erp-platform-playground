import { describe, expect, it, vi } from "vitest";

// ตัว hook ใช้ toast (React context) — เทสต์นี้ทดสอบเฉพาะฟังก์ชันล้วน
vi.mock("@/components/toast", () => ({ useToast: () => ({}) }));

import { publishedToast, summarizeChanges } from "@/components/website-draft-publish";

const types = [
  { type: "hero", label: "แบนเนอร์หลัก" },
  { type: "faq", label: "คำถามที่พบบ่อย" },
  { type: "cta", label: "แถบชวนติดต่อ" },
];

describe("summarizeChanges — ร่างต่างจากที่เผยแพร่ตรงไหน", () => {
  it("บอกชื่อ Section ที่เพิ่ม/ลบ/แก้ (ชื่ออ่านออก)", () => {
    const live = [
      { id: "a", type: "hero", title: "เดิม" },
      { id: "b", type: "faq" },
    ];
    const draft = [
      { id: "a", type: "hero", title: "ใหม่" },
      { id: "c", type: "cta" },
    ];
    expect(summarizeChanges(draft, live, types)).toEqual({ added: ["แถบชวนติดต่อ"], removed: ["คำถามที่พบบ่อย"], changed: ["แบนเนอร์หลัก"] });
  });

  it("เหมือนกัน = ไม่มีอะไรเปลี่ยน · ชนิดที่ไม่รู้จัก = ใช้ชื่อชนิด", () => {
    const same = [{ id: "a", type: "hero" }];
    expect(summarizeChanges(same, same, types)).toEqual({ added: [], removed: [], changed: [] });
    expect(summarizeChanges([{ id: "x", type: "mystery" }], [], types).added).toEqual(["mystery"]);
  });
});

describe("publishedToast — ข้อความเผยแพร่สำเร็จแบบเดียวกันทุกหน้า", () => {
  it("หน้าแรก (มีเลขเวอร์ชัน · ล้างแคชเว็บแล้ว)", () => {
    expect(publishedToast("", { version: 12, purged: true })).toBe("เผยแพร่แล้ว (เวอร์ชัน 12) — เว็บจริงเปลี่ยนแล้ว รีเฟรชดูได้เลย");
  });
  it("หน้าเว็บ / หน้าชุด (ไม่มีเลขเวอร์ชัน · ล้างแคชไม่ได้)", () => {
    expect(publishedToast("หน้านี้", {})).toBe("เผยแพร่หน้านี้แล้ว — เว็บจริงจะเปลี่ยนภายใน 1 นาที");
    expect(publishedToast("หน้าชุดนี้", { purged: true })).toBe("เผยแพร่หน้าชุดนี้แล้ว — เว็บจริงเปลี่ยนแล้ว รีเฟรชดูได้เลย");
  });
});
