import { describe, expect, it } from "vitest";
import {
  NOTIFY_SOURCES, bellSourceOf, inQuietHours, isNewSource, notifyOn, notifySource, parseNotifyPrefs, withNotifySetting,
} from "@/lib/notify-sources";
import { PUSH_CATEGORIES, pushEnabledFor } from "@/lib/push-categories";

describe("ทะเบียนแหล่งแจ้งเตือน", () => {
  it("ประเภทกระดิ่งทุกตัวขึ้นในทะเบียนเอง (ยกเว้นป๊อปเตือนงานที่อยู่ในศูนย์แล้ว) · key ไม่ซ้ำ", () => {
    for (const c of PUSH_CATEGORIES.filter((x) => x.key !== "work_popup")) expect(notifySource(`bell.${c.key}`)?.push).toBe(c.key);
    expect(new Set(NOTIFY_SOURCES.map((s) => s.key)).size).toBe(NOTIFY_SOURCES.length);
    expect(bellSourceOf("po.approved")).toBe("bell.purchasing");
    expect(bellSourceOf("something.unknown")).toBe("bell.other");
  });
  it("ค่าเริ่มต้น · ตั้งแล้วเก็บเฉพาะที่ต่าง · ความปลอดภัยปิดไม่ได้", () => {
    const p = parseNotifyPrefs(null);
    expect(notifyOn(p, "work", "bounce")).toBe(true);
    expect(notifyOn(p, "line_order", "bounce")).toBe(false);
    expect(notifyOn(p, "bell.tasks", "bounce")).toBe(false);
    const off = withNotifySetting(p, "work", "center", false);
    expect(off.set).toEqual({ "work:center": false });
    expect(withNotifySetting(off, "work", "center", true).set).toEqual({});
    expect(notifyOn(withNotifySetting(p, "bell.security", "center", false), "bell.security", "center")).toBe(true);
  });
  it("อ่านค่าเพี้ยนทิ้ง", () => {
    const p = parseNotifyPrefs({ set: { "work:center": false, "nope:center": false, "work:push": false, "gif:bounce": "x" }, quiet: { on: true, from: "25:00", to: "07:30" } });
    expect(p.set).toEqual({ "work:center": false });
    expect(p.quiet).toEqual({ on: true, from: "18:00", to: "07:30" });
  });
  it("เด้งที่เครื่อง: ความปลอดภัยปิดไม่ได้ แม้ตั้งปิดไว้", () => {
    expect(pushEnabledFor({ off: ["security", "tasks"] }, "security.new_device")).toBe(true);
    expect(pushEnabledFor({ off: ["security", "tasks"] }, "task_assigned")).toBe(false);
  });
  it("ห้ามรบกวน ข้ามเที่ยงคืนได้", () => {
    const q = { on: true, from: "18:00", to: "08:00" };
    expect(inQuietHours(q, "19:00")).toBe(true);
    expect(inQuietHours(q, "07:59")).toBe(true);
    expect(inQuietHours(q, "08:00")).toBe(false);
    expect(inQuietHours(q, "12:00")).toBe(false);
    expect(inQuietHours({ on: true, from: "12:00", to: "13:00" }, "12:30")).toBe(true);
    expect(inQuietHours({ ...q, on: false }, "19:00")).toBe(false);
  });
  it("ป้ายใหม่ 14 วัน", () => {
    const s = { key: "x", group: "center" as const, label: "x", icon: "x", added: "2026-11-05" };
    expect(isNewSource(s, Date.parse("2026-11-06T05:00:00Z"))).toBe(true);
    expect(isNewSource(s, Date.parse("2026-11-30T05:00:00Z"))).toBe(false);
  });
});
