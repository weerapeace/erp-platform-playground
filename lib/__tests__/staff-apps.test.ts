import { describe, it, expect } from "vitest";
import {
  cleanDraft, planPublish, planDetachAll, draftFromMenus, publishProblems, newStaffAppKey, draftChanged,
  appVisibleTo, appMenuLabel, appMenuSection, appLabelFor, type StaffAppDraft,
} from "@/lib/staff-apps";

const draft: StaffAppDraft = {
  label: "แอปผลิตหน้างาน", label_en: "Shop floor",
  sections: [{ key: "work", label: "งานวันนี้", label_en: "Today" }],
  menus: [
    { menu_id: "m1", section: "work", label: "งานวันนี้", label_en: "Today's jobs" },
    { menu_id: "m2" },
  ],
};

describe("cleanDraft", () => {
  it("drops bad values, duplicate menus and unknown sections", () => {
    const d = cleanDraft({
      label: "  แอป  ", theme_color: "red", icon: "🏭",
      sections: [{ key: "A b", label: "x" }, { key: "ok", label: "หัวข้อ" }, { key: "ok", label: "ซ้ำ" }],
      menus: [{ menu_id: "m1", section: "nope" }, { menu_id: "m1" }, { menu_id: "" }, { menu_id: "m2", section: "ok", label: "ชื่อ" }],
    });
    expect(d.label).toBe("แอป");
    expect(d.theme_color).toBeUndefined();
    expect(d.sections).toEqual([{ key: "ok", label: "หัวข้อ" }]);
    expect(d.menus).toEqual([{ menu_id: "m1" }, { menu_id: "m2", section: "ok", label: "ชื่อ" }]);
  });
  it("keeps audience in the shared format", () => {
    expect(cleanDraft({ label: "a", audience: { roles: ["staff"] } }).audience).toEqual({ roles: ["staff"] });
    expect(cleanDraft({ label: "a", audience: {} }).audience).toBeUndefined();
  });
});

describe("planPublish", () => {
  const rows = [
    { id: "m1", app_keys: ["production"], app_overrides: { production: { sort: 5 } } },
    { id: "m2", app_keys: [], app_overrides: null },
    { id: "m3", app_keys: ["staff-x", "qc"], app_overrides: { "staff-x": { sort: 10 }, qc: { place: "more" } } },
    { id: "m4", app_keys: ["qc"], app_overrides: null },
  ];
  const plan = planPublish(draft, rows, "staff-x");
  const byId = Object.fromEntries(plan.map((p) => [p.id, p]));

  it("adds the app to chosen menus with per-app names, without touching other apps", () => {
    expect(byId.m1.app_keys).toEqual(["production", "staff-x"]);
    expect(byId.m1.app_overrides).toEqual({
      production: { sort: 5 },
      "staff-x": { sort: 10, label: "งานวันนี้", label_en: "Today's jobs", section: "งานวันนี้", section_en: "Today" },
    });
    expect(byId.m2.app_keys).toEqual(["staff-x"]);
    expect(byId.m2.app_overrides).toEqual({ "staff-x": { sort: 20 } });
  });
  it("removes menus no longer in the draft, keeps other apps' settings", () => {
    expect(byId.m3.app_keys).toEqual(["qc"]);
    expect(byId.m3.app_overrides).toEqual({ qc: { place: "more" } });
  });
  it("leaves unrelated menus alone", () => {
    expect(byId.m4).toBeUndefined();
  });
  it("is a no-op when publishing the same draft twice", () => {
    const after = rows.map((r) => {
      const p = byId[r.id];
      return p ? { ...r, app_keys: p.app_keys ?? r.app_keys, app_overrides: p.app_overrides ?? r.app_overrides } : r;
    });
    expect(planPublish(draft, after, "staff-x")).toEqual([]);
  });
  it("detach-all removes the app from every menu", () => {
    const d = planDetachAll(rows, "staff-x");
    expect(d.map((p) => p.id)).toEqual(["m3"]);
  });
});

describe("draftFromMenus (template / copy)", () => {
  it("copies visible menus with their sections, skips hidden ones", () => {
    const rows = [
      { id: "a", label: "ใบสั่งผลิต", section: "งานผลิต", app_overrides: null },
      { id: "b", label: "ซ่อน", section: "งานผลิต", app_overrides: { production: { place: "hidden" } } },
      { id: "c", label: "สต๊อก", section: "", app_overrides: { production: { label: "ดูสต๊อก", section: "คลัง" } } },
    ];
    const d = draftFromMenus("ผลิต (สำเนา)", rows, "production");
    expect(d.sections).toEqual([{ key: "s1", label: "งานผลิต" }, { key: "s2", label: "คลัง" }]);
    expect(d.menus).toEqual([{ menu_id: "a", section: "s1" }, { menu_id: "c", section: "s2", label: "ดูสต๊อก" }]);
  });
});

describe("publishProblems", () => {
  it("reports missing name, empty menus, deleted and disabled menus", () => {
    expect(publishProblems({ label: "", sections: [], menus: [] }, [])).toHaveLength(2);
    const p = publishProblems(draft, [{ id: "m1", is_active: false, label: "ใบสั่งผลิต" }]);
    expect(p.some((x) => x.includes("ถูกลบ"))).toBe(true);
    expect(p.some((x) => x.includes("ใบสั่งผลิต"))).toBe(true);
    expect(publishProblems(draft, [{ id: "m1" }, { id: "m2" }])).toEqual([]);
  });
});

describe("appVisibleTo — who sees a staff app", () => {
  const staff = { id: "u1", role: "staff" };
  const admin = { id: "a1", role: "admin" };
  it("module apps unchanged", () => {
    expect(appVisibleTo({ kind: "module" }, staff)).toBe(true);
    expect(appVisibleTo({}, staff)).toBe(true);
  });
  it("drafts and trashed apps are admin-only", () => {
    expect(appVisibleTo({ kind: "staff", status: "draft" }, staff)).toBe(false);
    expect(appVisibleTo({ kind: "staff", status: "draft" }, admin)).toBe(true);
    expect(appVisibleTo({ kind: "staff", status: "published", deleted_at: "2026-11-19" }, staff)).toBe(false);
    expect(appVisibleTo({ kind: "module", deleted_at: "2026-11-19" }, staff)).toBe(false);
  });
  it("published apps follow audience", () => {
    const app = { kind: "staff", status: "published", audience: { roles: ["manager"], users: ["u9"] } };
    expect(appVisibleTo(app, staff)).toBe(false);
    expect(appVisibleTo(app, { id: "u9", role: "staff" })).toBe(true);
    expect(appVisibleTo({ ...app, audience: null }, staff)).toBe(true);
    expect(appVisibleTo({ ...app, audience: null }, null)).toBe(false);
  });
});

describe("labels by language", () => {
  const item = { label: "ใบสั่งผลิต", section: "ผลิต", app_overrides: { s: { label: "งานวันนี้", label_en: "Today", section: "หน้างาน" } } };
  it("uses the per-app name and falls back to Thai", () => {
    expect(appMenuLabel(item, "s", "th")).toBe("งานวันนี้");
    expect(appMenuLabel(item, "s", "en")).toBe("Today");
    expect(appMenuLabel(item, "other", "en")).toBe("ใบสั่งผลิต");
    expect(appMenuSection(item, "s", "en")).toBe("หน้างาน");
    expect(appLabelFor({ label: "ผลิต", label_en: null }, "en")).toBe("ผลิต");
  });
});

describe("misc", () => {
  it("new key avoids existing keys", () => {
    let n = 0;
    const seq = [0, 0, 0.5];
    const k = newStaffAppKey(["staff-0000"], () => seq[n++] ?? 0.7);
    expect(k).not.toBe("staff-0000");
    expect(k).toMatch(/^staff-[a-z0-9]{4}$/);
  });
  it("draftChanged compares cleaned drafts", () => {
    expect(draftChanged(draft, null)).toBe(true);
    expect(draftChanged(draft, JSON.parse(JSON.stringify(draft)))).toBe(false);
    expect(draftChanged({ ...draft, label: "อื่น" }, draft)).toBe(true);
  });
});
