import { describe, it, expect } from "vitest";
import { cleanTemplateBlock, cleanTemplateName, defaultTemplateName } from "../website-section-templates";
import { toWebVersion } from "../website-versions";
import { SECTION_SCHEMAS } from "../website-schema";

/**
 * ⭐ แม่แบบ Section + 🕘 ประวัติเวอร์ชัน (ตัวกลางฝั่งข้อมูล)
 *  - แม่แบบเก็บ Section ที่ทำความสะอาดแล้ว ไม่มี id (ใช้ซ้ำได้ไม่ชน) · ชนิดที่ไม่รู้จัก/ของแปลก ไม่รับ
 *  - ประวัติ: แถวจากตาราง → จำนวน Section + ชื่อ Section ที่เปิดใช้ (ซ่อนอยู่ไม่นับในชื่อ)
 */
describe("แม่แบบ Section — cleanTemplateBlock", () => {
  it("เก็บเนื้อหา + รูปลักษณ์ + ชิ้นย่อย แต่ตัด id ของ Section", () => {
    const b = cleanTemplateBlock({
      id: "faq-9",
      type: "faq",
      title: "คำถามที่พบบ่อย",
      items: [{ id: "q1", q: "ส่งกี่วัน", a: "1-2 วัน" }],
      style: { bg: "brand", text: { font: "Charm", size: "l" } },
    });
    expect(b).not.toBeNull();
    expect(b!.id).toBeUndefined();
    expect(b!.type).toBe("faq");
    expect(b!.title).toBe("คำถามที่พบบ่อย");
    expect((b!.items as { q: string }[])[0].q).toBe("ส่งกี่วัน");
    expect((b!.style as { bg: string; text: { font: string } }).bg).toBe("brand");
    expect((b!.style as { text: { font: string } }).text.font).toBe("Charm");
  });

  it("ชนิดที่ไม่รู้จัก / ไม่ใช่ object / array = ไม่รับ", () => {
    expect(cleanTemplateBlock({ type: "hacker", html: "<script>" })).toBeNull();
    expect(cleanTemplateBlock(null)).toBeNull();
    expect(cleanTemplateBlock("faq")).toBeNull();
    expect(cleanTemplateBlock([{ type: "faq" }])).toBeNull();
  });

  it("ชื่อแม่แบบ: ตัดช่องว่างเกิน + ยาวสุด 80 · ชื่อตั้งต้น = ชนิด — หัวข้อ", () => {
    expect(cleanTemplateName("  โปร   ปีใหม่  ")).toBe("โปร ปีใหม่");
    expect(cleanTemplateName("x".repeat(200))).toHaveLength(80);
    expect(defaultTemplateName({ type: "faq", title: "ถามบ่อย" })).toBe(`${SECTION_SCHEMAS.faq.meta.label} — ถามบ่อย`);
    expect(defaultTemplateName({ type: "divider" })).toBe(SECTION_SCHEMAS.divider.meta.label);
  });
});

describe("ประวัติเวอร์ชัน — toWebVersion", () => {
  it("นับ Section ทั้งหมด · ชื่อเฉพาะที่เปิดใช้ ตามลำดับ", () => {
    const v = toWebVersion({
      version_no: 3,
      created_at: "2026-10-14T10:00:00Z",
      actor: "owner@example.com",
      layout: [
        { id: "a", type: "faq", enabled: true, title: "x", items: [] },
        { id: "b", type: "divider", enabled: false },
        { id: "c", type: "rich-text", enabled: true, title: "y", body: "" },
      ],
    });
    expect(v.versionNo).toBe(3);
    expect(v.blocks).toBe(3);
    expect(v.labels).toHaveLength(2);
    expect(v.actor).toBe("owner@example.com");
  });

  it("ข้อมูลเก่าเสีย/ว่าง ไม่พัง", () => {
    expect(toWebVersion({ version_no: 1, created_at: "2026-01-01T00:00:00Z", actor: null, layout: null }).blocks).toBe(0);
  });
});
