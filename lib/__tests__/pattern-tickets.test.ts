import { describe, expect, it } from "vitest";
import { allowedActions, canEditTicket, canWorkOn, checklistFromTemplate, addDaysIso, canOpenTicketSheet, checklistLabel, CHECKLIST_EN, cleanLinks, cleanSheetIds, cleanTypeIcon, defaultDueDate, defaultTypeIcon, isOverdue, isUploadedTypeIcon, openCountsByType, ticketTitle, todayBangkok, type PatternActor } from "@/lib/pattern-tickets";

const REQ = "11111111-1111-1111-1111-111111111111";
const MAKER = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

const designer: PatternActor = { userId: REQ, canWork: false, canManage: false, canCreate: true };
const maker: PatternActor = { userId: MAKER, canWork: true, canManage: false, canCreate: false };
const otherMaker: PatternActor = { userId: OTHER, canWork: true, canManage: false, canCreate: false };
const manager: PatternActor = { userId: OTHER, canWork: true, canManage: true, canCreate: true };
const keys = (t: Parameters<typeof allowedActions>[0], a: PatternActor) => allowedActions(t, a).map((x) => x.key);

describe("ตั๋วงาน Pattern — ใครกดอะไรได้", () => {
  it("ตั๋วใหม่: ช่างกดรับได้ ผู้สั่งยกเลิกได้ ผู้สั่งที่ไม่ใช่ช่างกดรับไม่ได้", () => {
    const t = { status: "new", requester_id: REQ, assignee_id: null };
    expect(keys(t, maker)).toEqual(["claim"]);
    expect(keys(t, designer)).toEqual(["cancel"]);
  });
  it("กำลังทำ: เฉพาะช่างที่รับงานส่งตรวจได้ ช่างคนอื่นไม่ได้", () => {
    const t = { status: "doing", requester_id: REQ, assignee_id: MAKER };
    expect(keys(t, maker)).toEqual(["submit"]);
    expect(keys(t, otherMaker)).toEqual([]);
    expect(keys(t, manager)).toContain("submit");
  });
  it("รอตรวจ: ผู้สั่งอนุมัติ/ตีกลับ · ช่างทำอะไรไม่ได้", () => {
    const t = { status: "review", requester_id: REQ, assignee_id: MAKER };
    expect(keys(t, designer)).toEqual(["approve", "reject"]);
    expect(keys(t, maker)).toEqual([]);
  });
  it("ตีกลับ/ยกเลิก/เปิดใหม่ ต้องใส่เหตุผล", () => {
    const t = { status: "review", requester_id: REQ, assignee_id: MAKER };
    expect(allowedActions(t, designer).find((a) => a.key === "reject")?.needNote).toBe(true);
    expect(allowedActions({ ...t, status: "done" }, manager).map((a) => [a.key, a.needNote])).toEqual([["reopen", true]]);
  });
  it("งานเสร็จ: แก้ได้เฉพาะผู้จัดการ · ยกเลิกแล้วติ๊กเช็กลิสต์ไม่ได้", () => {
    const done = { status: "done", requester_id: REQ, assignee_id: MAKER };
    expect(canEditTicket(done, designer)).toBe(false);
    expect(canEditTicket(done, manager)).toBe(true);
    expect(canWorkOn({ ...done, status: "cancelled" }, manager)).toBe(false);
    expect(canWorkOn({ status: "doing", requester_id: REQ, assignee_id: MAKER }, otherMaker)).toBe(false);
  });
});

describe("ตัวช่วย", () => {
  it("เช็กลิสต์ตั้งต้นจากประเภทงาน (ตัดค่าว่าง)", () => {
    expect(checklistFromTemplate(["ก", " ", "ข"])).toEqual([{ label: "ก", done: false }, { label: "ข", done: false }]);
    expect(checklistFromTemplate(null)).toEqual([]);
  });
  it("ลิงก์ต้องเป็น http(s)", () => {
    expect(cleanLinks([{ url: "https://drive.google.com/x" }, { url: "javascript:alert(1)" }])).toEqual([{ url: "https://drive.google.com/x", label: "" }]);
  });
  it("เลยกำหนดเทียบวันไทย และงานปิดไม่นับ", () => {
    expect(isOverdue("2026-11-04", "doing", "2026-11-05")).toBe(true);
    expect(isOverdue("2026-11-05", "doing", "2026-11-05")).toBe(false);
    expect(isOverdue("2026-11-01", "done", "2026-11-05")).toBe(false);
    expect(todayBangkok(new Date("2026-11-04T18:30:00Z"))).toBe("2026-11-05");
  });
});

describe("ไอคอนประเภทงาน", () => {
  it("ว่าง = กลับเป็นไอคอนตั้งต้น (Lottie มาตรฐาน) · ประเภทที่เพิ่มเอง = อื่นๆ", () => {
    expect(cleanTypeIcon("", "cut")).toBe("img:/lottie/library/cut.json");
    expect(cleanTypeIcon(null, "other")).toBe("img:/lottie/library/other.json");
    expect(cleanTypeIcon(undefined, "zzz")).toBe("img:/lottie/library/other.json");
    expect(defaultTypeIcon("emb")).toBe("img:/lottie/library/emb.json");
  });
  it("รับเฉพาะไอคอนระบบ หรือรูปในโฟลเดอร์ pattern-icons", () => {
    expect(cleanTypeIcon("i:bolt", "laser")).toBe("i:bolt");
    expect(cleanTypeIcon("img:pattern-icons/u1/123-4.png", "cut")).toBe("img:pattern-icons/u1/123-4.png");
    expect(cleanTypeIcon("img:payment-slips/x.png", "cut")).toBeNull();
    expect(cleanTypeIcon("img:pattern-icons/../secret.png", "cut")).toBeNull();
    expect(cleanTypeIcon("<script>", "cut")).toBeNull();
    expect(isUploadedTypeIcon("img:pattern-icons/a.png")).toBe(true);
    expect(isUploadedTypeIcon("i:bolt")).toBe(false);
  });
  it("นับตั๋วค้างต่อประเภท ไม่นับที่เสร็จ/ยกเลิก", () => {
    expect(openCountsByType([
      { type_key: "cut", status: "new" }, { type_key: "cut", status: "fix" },
      { type_key: "sew", status: "done" }, { type_key: "sew", status: "cancelled" }, { type_key: "laser", status: "doing" },
    ])).toEqual({ cut: 2, laser: 1 });
  });
});

describe("กำหนดส่งตั้งต้น", () => {
  it("ด่วน = วันนี้ · ปกติ = +3 วัน (ข้ามเดือน/ปีได้)", () => {
    expect(defaultDueDate(true, "2026-11-05")).toBe("2026-11-05");
    expect(defaultDueDate(false, "2026-11-05")).toBe("2026-11-08");
    expect(defaultDueDate(false, "2026-11-29")).toBe("2026-12-02");
    expect(defaultDueDate(false, "2026-12-30")).toBe("2027-01-02");
    expect(addDaysIso("2028-02-27", 3)).toBe("2028-03-01");
  });
});

describe("โหมด English", () => {
  it("เช็กลิสต์ตั้งต้นทุกข้อมีคำแปล · ข้อที่เพิ่มเองโชว์ไทยเดิม", () => {
    expect(checklistLabel("ใส่เกรนผ้า + รอยบาก", true)).toBe("Add grain lines + notches");
    expect(checklistLabel("ใส่เกรนผ้า + รอยบาก", false)).toBe("ใส่เกรนผ้า + รอยบาก");
    expect(checklistLabel("งานพิเศษ", true)).toBe("งานพิเศษ");
    expect(Object.keys(CHECKLIST_EN)).toHaveLength(33);
  });
  it("ชื่องาน: EN ใช้ title_en ถ้ามี", () => {
    expect(ticketTitle({ title: "กระเป๋า", title_en: "Bag" }, true)).toBe("Bag");
    expect(ticketTitle({ title: "กระเป๋า", title_en: "" }, true)).toBe("กระเป๋า");
    expect(ticketTitle({ title: "กระเป๋า", title_en: "Bag" }, false)).toBe("กระเป๋า");
  });
});

describe("ตั้งค่าประเภทงาน", () => {
  it("แม่แบบเช็กลิสต์: ข้อความเดิม + {th,en} · ข้อเดิมหาคำแปลจากตาราง", async () => {
    const { templateItems, checklistFromTemplate, checklistLabel } = await import("@/lib/pattern-tickets");
    expect(templateItems(["ทดสอบชิ้นแรก", { th: "พับขอบ", en: "Fold edges" }, " "])).toEqual([
      { th: "ทดสอบชิ้นแรก", en: "Test the first piece" }, { th: "พับขอบ", en: "Fold edges" },
    ]);
    const items = checklistFromTemplate([{ th: "พับขอบ", en: "Fold edges" }, "ทดสอบชิ้นแรก"]);
    expect(items).toEqual([{ label: "พับขอบ", en: "Fold edges", done: false }, { label: "ทดสอบชิ้นแรก", done: false }]);
    expect(checklistLabel("พับขอบ", true, "Fold edges")).toBe("Fold edges");
    expect(checklistLabel("ทดสอบชิ้นแรก", true)).toBe("Test the first piece");
    expect(checklistLabel("พับขอบ", false, "Fold edges")).toBe("พับขอบ");
  });
  it("ไฟล์ที่ต้องส่ง: ตัวใหญ่ ไม่ซ้ำ ตัดจุด ตัดของแปลก", async () => {
    const { cleanDeliverables } = await import("@/lib/pattern-tickets");
    expect(cleanDeliverables(["dxf", ".ai", "DXF", "x", "toolongext", "PDF"])).toEqual(["DXF", "AI", "PDF"]);
  });
  it("ไอคอน: คลัง Lottie / อัปเอง / เส้น · ค่าแปลกไม่รับ", async () => {
    const { cleanTypeIcon, typeIconKind, typeIconOf, defaultTypeIcon } = await import("@/lib/pattern-tickets");
    expect(cleanTypeIcon("img:/lottie/library/cut.json", "cut")).toBe("img:/lottie/library/cut.json");
    expect(cleanTypeIcon("img:/lottie/library/nope.json", "cut")).toBeNull();
    expect(cleanTypeIcon("img:/etc/passwd", "cut")).toBeNull();
    expect(cleanTypeIcon("", "laser")).toBe("img:/lottie/library/laser.json");
    expect(typeIconKind("img:/lottie/library/cut.json")).toBe("library");
    expect(typeIconKind("img:pattern-icons/u/1.png")).toBe("uploaded");
    expect(typeIconKind("i:scissors")).toBe("line");
    expect(typeIconOf({ key: "tnew", icon: "" })).toBe(defaultTypeIcon("tnew"));
  });
});

describe("Design sheet ที่แนบ", () => {
  const A = "aaaaaaaa-1111-2222-3333-444444444444";
  const B = "BBBBBBBB-1111-2222-3333-444444444444";
  it("ตัดค่าผิด/ซ้ำ · ตัวพิมพ์เล็ก · ไม่เกิน 20", () => {
    expect(cleanSheetIds([A, A, B, "x", null, 5])).toEqual([A, B.toLowerCase()]);
    expect(cleanSheetIds("nope")).toEqual([]);
    expect(cleanSheetIds(Array.from({ length: 30 }, (_, i) => `aaaaaaaa-1111-2222-3333-${String(i).padStart(12, "0")}`))).toHaveLength(20);
  });
  it("พนักงานกดเปิด Design sheet ไม่ได้ · ผู้สั่ง/ผู้จัดการ ได้", () => {
    expect(canOpenTicketSheet(maker)).toBe(false);
    expect(canOpenTicketSheet(designer)).toBe(true);
    expect(canOpenTicketSheet(manager)).toBe(true);
  });
});
