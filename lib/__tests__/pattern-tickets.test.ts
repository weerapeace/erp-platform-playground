import { describe, expect, it } from "vitest";
import { allowedActions, canEditTicket, canWorkOn, checklistFromTemplate, cleanLinks, cleanTypeIcon, defaultTypeIcon, isOverdue, isUploadedTypeIcon, openCountsByType, todayBangkok, type PatternActor } from "@/lib/pattern-tickets";

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
  it("ว่าง = กลับเป็นไอคอนเดิมของประเภท · ประเภทใหม่ = i:file", () => {
    expect(cleanTypeIcon("", "cut")).toBe("i:scissors");
    expect(cleanTypeIcon(null, "other")).toBe("i:dots-vertical");
    expect(cleanTypeIcon(undefined, "zzz")).toBe("i:file");
    expect(defaultTypeIcon("emb")).toBe("i:flower");
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
