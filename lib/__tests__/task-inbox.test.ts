import { describe, it, expect } from "vitest";
import { classifyTask, dueLabel, inboxCount, overdueDays, sortInbox, splitStale, todayBkk, type InboxItem } from "@/lib/task-inbox";

const item = (id: string, due: string | null, updated = "2026-11-01T00:00:00Z"): InboxItem => ({
  id, task_no: null, title: id, status: "need_review", due_date: due, updated_at: updated, brand: null, task_type: null,
  parent_code: null, cover_key: null, has_subtasks: false, checks: null,
});
const T = "2026-11-11";

describe("วันที่ / กำหนดส่ง", () => {
  it("todayBkk ใช้เวลาไทย (UTC+7)", () => {
    expect(todayBkk(new Date("2026-11-10T18:00:00Z"))).toBe("2026-11-11");
    expect(todayBkk(new Date("2026-11-10T16:59:00Z"))).toBe("2026-11-10");
  });
  it("overdueDays", () => {
    expect(overdueDays("2026-11-07", T)).toBe(4);
    expect(overdueDays("2026-11-11", T)).toBe(0);
    expect(overdueDays("2026-11-13", T)).toBe(-2);
    expect(overdueDays(null, T)).toBeNull();
    expect(overdueDays("2026-07-09", T)).toBe(125);
  });
  it("dueLabel", () => {
    expect(dueLabel("2026-11-07", T)).toEqual({ text: "เกินกำหนด 4 วัน", tone: "danger" });
    expect(dueLabel("2026-11-11", T).text).toBe("ครบกำหนดวันนี้");
    expect(dueLabel("2026-11-12", T)).toEqual({ text: "อีก 1 วันครบกำหนด", tone: "warn" });
    expect(dueLabel("2026-12-01", T)).toEqual({ text: "กำหนดส่ง 2026-12-01", tone: "muted" });
    expect(dueLabel(null, T).tone).toBe("muted");
  });
});

describe("เรียง / พับงานค้างนาน", () => {
  it("เกินกำหนดนานสุดก่อน → ใกล้กำหนด → ไม่มีกำหนด (แก้ล่าสุดก่อน)", () => {
    const r = sortInbox([item("a", null, "2026-11-01"), item("b", "2026-11-09"), item("c", "2026-07-09"), item("d", "2026-11-20"), item("e", null, "2026-11-05")], T);
    expect(r.map((x) => x.id)).toEqual(["c", "b", "d", "e", "a"]);
  });
  it("splitStale แยกงานเกินกำหนดเกิน 30 วัน", () => {
    const { recent, stale } = splitStale([item("a", "2026-11-07"), item("b", "2026-07-09"), item("c", null), item("d", "2026-10-12")], T);
    expect(recent.map((x) => x.id)).toEqual(["a", "c", "d"]);
    expect(stale.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("classifyTask — งานนี้อยู่กลุ่มไหนของฉัน", () => {
  const terminal = new Set(["done", "cancelled"]);
  const me = (o: Partial<{ isReviewer: boolean; isAssignee: boolean; canApproveUnassigned: boolean }>) => ({ isReviewer: false, isAssignee: false, canApproveUnassigned: false, ...o });
  it("รอตรวจ → เฉพาะผู้ตรวจ หรือคนที่มีสิทธิ์อนุมัติเมื่องานไม่ได้ตั้งผู้ตรวจ", () => {
    expect(classifyTask({ status: "need_review" }, me({ isReviewer: true }), terminal)).toBe("review");
    expect(classifyTask({ status: "need_review" }, me({ canApproveUnassigned: true }), terminal)).toBe("review");
    expect(classifyTask({ status: "need_review" }, me({ isAssignee: true }), terminal)).toBeNull();
  });
  it("ต้องแก้ → เฉพาะผู้รับผิดชอบ", () => {
    expect(classifyTask({ status: "revision" }, me({ isAssignee: true }), terminal)).toBe("revision");
    expect(classifyTask({ status: "revision" }, me({ isReviewer: true }), terminal)).toBeNull();
  });
  it("งานอื่นที่ยังไม่จบ → มอบให้คุณ · จบแล้ว/อนุมัติแล้ว → ไม่โชว์", () => {
    expect(classifyTask({ status: "in_progress" }, me({ isAssignee: true }), terminal)).toBe("assigned");
    expect(classifyTask({ status: "done" }, me({ isAssignee: true }), terminal)).toBeNull();
    expect(classifyTask({ status: "approved" }, me({ isAssignee: true }), terminal)).toBeNull();
  });
  it("inboxCount นับแค่รอตรวจ + ต้องแก้", () => {
    expect(inboxCount({ review: [item("a", null)], revision: [item("b", null)], assigned: [item("c", null), item("d", null)] })).toBe(2);
    expect(inboxCount(null)).toBe(0);
  });
});
