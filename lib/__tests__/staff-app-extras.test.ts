import { describe, it, expect } from "vitest";
import { cleanAnnouncement, announcementActive, sortAnnouncements, usageByMenu } from "@/lib/staff-app-extras";
import { BADGE_COUNTERS, isBadgeCounter } from "@/lib/staff-app-counters";

describe("badge counters reuse the flow-map metric list", () => {
  it("includes document counters, excludes unit totals", () => {
    const keys = BADGE_COUNTERS.map((c) => c.key);
    expect(keys).toContain("mo_open");
    expect(keys).toContain("pr_waiting");
    expect(keys).not.toContain("stock_fg");
    expect(keys).not.toContain("stock_raw");
    expect(isBadgeCounter("wo_open")).toBe(true);
    expect(isBadgeCounter("nope")).toBe(false);
  });
});

describe("announcements", () => {
  it("validates title and date order", () => {
    expect(cleanAnnouncement({ title: "  " }).ok).toBe(false);
    expect(cleanAnnouncement({ title: "x", starts_at: "2026-11-20", expires_at: "2026-11-19" }).ok).toBe(false);
    const r = cleanAnnouncement({ title: "ประชุม 9 โมง", level: "bogus", expires_at: "2026-11-30T10:00:00+07:00" });
    expect(r.ok && r.value.level).toBe("info");
    expect(r.ok && r.value.expires_at).toBe("2026-11-30T03:00:00.000Z");
  });
  it("shows only live, started, unexpired items", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    expect(announcementActive({ deleted_at: null, starts_at: null, expires_at: null }, now)).toBe(true);
    expect(announcementActive({ deleted_at: "x", starts_at: null, expires_at: null }, now)).toBe(false);
    expect(announcementActive({ deleted_at: null, starts_at: "2026-11-21T00:00:00Z", expires_at: null }, now)).toBe(false);
    expect(announcementActive({ deleted_at: null, starts_at: null, expires_at: "2026-11-19T00:00:00Z" }, now)).toBe(false);
  });
  it("sorts pinned, then urgent, then newest", () => {
    const s = sortAnnouncements([
      { id: "a", pinned: false, level: "info", created_at: "2026-11-03" },
      { id: "b", pinned: false, level: "urgent", created_at: "2026-11-01" },
      { id: "c", pinned: true, level: "info", created_at: "2026-11-01" },
      { id: "d", pinned: false, level: "info", created_at: "2026-11-05" },
    ] as never[]) as { id: string }[];
    expect(s.map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("usageByMenu", () => {
  const menus = [{ id: "mo", href: "/mo" }, { id: "mo-plan", href: "/mo/plan" }, { id: "qc", href: "/qc?x=1" }, { id: "home", href: "/" }];
  const rows = [
    { path: "/mo", user_id: "u1", views: 3, last_at: "2026-11-10T01:00:00Z" },
    { path: "/mo/:id", user_id: "u2", views: 2, last_at: "2026-11-12T01:00:00Z" },
    { path: "/mo/plan", user_id: "u1", views: 5, last_at: "2026-11-11T01:00:00Z" },
    { path: "/mobile", user_id: "u1", views: 9, last_at: null },
    { path: "/payroll", user_id: "u1", views: 7, last_at: null },
  ];
  it("counts deep pages into the longest matching menu, ignores other pages", () => {
    const u = Object.fromEntries(usageByMenu(rows, menus).map((x) => [x.menu_id, x]));
    expect(u.mo).toEqual({ menu_id: "mo", views: 5, users: 2, last_at: "2026-11-12T01:00:00Z" });
    expect(u["mo-plan"].views).toBe(5);
    expect(u.qc.views).toBe(0);
    expect(u.home).toBeUndefined();
  });
  it("can count only a group of people", () => {
    const u = Object.fromEntries(usageByMenu(rows, menus, new Set(["u2"])).map((x) => [x.menu_id, x]));
    expect(u.mo.views).toBe(2);
    expect(u["mo-plan"].views).toBe(0);
  });
});
