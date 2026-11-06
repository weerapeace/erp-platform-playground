import { describe, expect, it } from "vitest";
import { NOTIFY_REMARK_MAX, NOTIFY_TOPICS, cleanNotifyRemarks, isNotifyTopicId, notifyRemark, type NotifyLive } from "@/lib/flow-map-notify";

const withNote = NOTIFY_TOPICS.find((t) => t.note)!;
const noNote = NOTIFY_TOPICS.find((t) => !t.note)!;
const live = (remarks?: Record<string, string>) => ({ remarks } as unknown as NotifyLive);

describe("หมายเหตุของเรื่องแจ้งเตือน", () => {
  it("ยังไม่เคยเขียน = ข้อสังเกตในทะเบียน · เขียนแล้ว = ใช้ที่เขียน · เขียนว่าง = ไม่โชว์", () => {
    expect(notifyRemark(withNote, null)).toBe(withNote.note);
    expect(notifyRemark(noNote, live({}))).toBe("");
    expect(notifyRemark(noNote, live({ [noNote.id]: "ผู้ตรวจ = หัวหน้าทีม" }))).toBe("ผู้ตรวจ = หัวหน้าทีม");
    expect(notifyRemark(withNote, live({ [withNote.id]: "" }))).toBe("");
  });
  it("รับเฉพาะ id ที่รู้จัก (เรื่องในทะเบียน / report:<uuid>) · ตัดยาวเกิน · ทิ้งค่าที่ไม่ใช่ข้อความ", () => {
    expect(isNotifyTopicId(noNote.id)).toBe(true);
    expect(isNotifyTopicId("report:0b6f6d4e-1c2a-4b3c-9d8e-123456789abc")).toBe(true);
    expect(isNotifyTopicId("report:x")).toBe(false);
    expect(isNotifyTopicId("ไม่มีจริง")).toBe(false);
    const out = cleanNotifyRemarks({ [noNote.id]: "  a  ", bogus: "x", [withNote.id]: 5, long: "y" });
    expect(out).toEqual({ [noNote.id]: "a" });
    expect(cleanNotifyRemarks({ [noNote.id]: "z".repeat(NOTIFY_REMARK_MAX + 50) })[noNote.id].length).toBe(NOTIFY_REMARK_MAX);
    expect(cleanNotifyRemarks(null)).toEqual({});
    expect(cleanNotifyRemarks(["x"])).toEqual({});
  });
});
