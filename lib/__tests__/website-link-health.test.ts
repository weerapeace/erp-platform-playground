import { describe, expect, it } from "vitest";
import { countLinkWarnings, helpColumnIssue, pageLinkIssue, type PageInfo } from "@/lib/website-link-health";

/** ข้อมูลจริงของ Louis (ย่อ) — ศูนย์ช่วยเหลือ 6 หน้าเป็นร่างทั้งหมด */
const PAGES: PageInfo[] = [
  { slug: "privacy", title: "นโยบายความเป็นส่วนตัว", status: "draft", help: "ข้อกฎหมาย" },
  { slug: "terms", title: "ข้อกำหนดและเงื่อนไข", status: "draft", help: "ข้อกฎหมาย" },
  { slug: "contact", title: "ติดต่อเรา", status: "draft", help: "ช่วยเหลือ" },
  { slug: "faq", title: "คำถามที่พบบ่อย", status: "draft", help: "ช่วยเหลือ" },
  { slug: "personalize-wallets", title: "Personalize Wallets", status: "draft" },
  { slug: "about-us", title: "เกี่ยวกับเรา", status: "published" },
];

describe("pageLinkIssue — ลิงก์ชนิดหน้า", () => {
  it("หน้าไม่มี / ร่าง = เตือน · เผยแพร่แล้ว = ผ่าน", () => {
    expect(pageLinkIssue("gifts", PAGES)?.level).toBe("warn");
    expect(pageLinkIssue("gifts", PAGES)?.text).toContain("ยังไม่มีหน้า /gifts");
    expect(pageLinkIssue("personalize-wallets", PAGES)?.level).toBe("warn");
    expect(pageLinkIssue("personalize-wallets", PAGES)?.text).toContain("ยังเป็นร่าง");
    expect(pageLinkIssue("about-us", PAGES)).toBeNull();
  });
  it("หน้าที่เว็บมีแบบเดิมในโค้ด (contact/privacy/track) = ไม่พัง แค่บอก", () => {
    expect(pageLinkIssue("contact", PAGES)?.level).toBe("info");
    expect(pageLinkIssue("track", PAGES)).toBeNull();
  });
  it("ยังไม่เลือกหน้า = บอกว่าไปหน้าแรก", () => {
    expect(pageLinkIssue("", PAGES)?.level).toBe("info");
  });
  it("หน้าที่ไม่มีสถานะ (API ไม่ส่ง) = ถือว่าขึ้นเว็บแล้ว", () => {
    expect(pageLinkIssue("x", [{ slug: "x", title: "X" }])).toBeNull();
  });
});

describe("helpColumnIssue — คอลัมน์ศูนย์ช่วยเหลือ", () => {
  it("ร่างทั้งกลุ่ม = เว็บจริงไม่โชว์", () => {
    const r = helpColumnIssue("ช่วยเหลือ", PAGES);
    expect(r?.level).toBe("warn");
    expect(r?.text).toContain("ร่างทั้ง 2 หน้า");
  });
  it("ไม่มีหน้า / ยังไม่เลือกกลุ่ม = เตือน", () => {
    expect(helpColumnIssue("SUPPORT", PAGES)?.level).toBe("warn");
    expect(helpColumnIssue("", PAGES)?.level).toBe("warn");
  });
  it("เผยแพร่บางหน้า = บอกจำนวน · ครบ = ผ่าน", () => {
    const some = PAGES.map((p) => (p.slug === "privacy" ? { ...p, status: "published" } : p));
    expect(helpColumnIssue("ข้อกฎหมาย", some)).toEqual({ level: "info", text: "ขึ้นเว็บจริง 1 จาก 2 หน้า — ที่เหลือยังเป็นร่าง" });
    const all = PAGES.map((p) => ({ ...p, status: "published" }));
    expect(helpColumnIssue("ข้อกฎหมาย", all)).toBeNull();
  });
});

describe("countLinkWarnings — นับลิงก์เสียทุกชั้น", () => {
  it("SERVICES ของ Louis: ร่าง 1 + ไม่มีหน้า 2 + เมนูย่อยร่าง 1 = 4 (contact มีหน้าแบบเดิม ไม่นับ)", () => {
    const links = [
      { kind: "page", value: "personalize-wallets" },
      { kind: "page", value: "gifts" },
      { kind: "page", value: "stores", children: [{ kind: "page", value: "faq" }, { kind: "shop", value: "" }] },
      { kind: "page", value: "contact" },
    ];
    expect(countLinkWarnings(links, PAGES)).toBe(4);
  });
});
