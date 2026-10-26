import { describe, expect, it } from "vitest";
import { normalizePushPrefs, pushCategoryOf, pushEnabledFor } from "@/lib/push-categories";

describe("pushCategoryOf", () => {
  it("จัด event_type ที่มีจริงในระบบเข้าประเภทถูก", () => {
    expect(pushCategoryOf("task_overdue")).toBe("task_due");
    expect(pushCategoryOf("task_due_soon")).toBe("task_due");
    expect(pushCategoryOf("wo.due_soon")).toBe("task_due");
    expect(pushCategoryOf("task_assigned")).toBe("tasks");
    expect(pushCategoryOf("subtask_submitted")).toBe("tasks");
    expect(pushCategoryOf("checklist.assigned")).toBe("tasks");
    expect(pushCategoryOf("pr_created")).toBe("purchasing");
    expect(pushCategoryOf("pr.approved")).toBe("purchasing");
    expect(pushCategoryOf("material_request.result")).toBe("purchasing");
    expect(pushCategoryOf("so.confirm")).toBe("sales");
    expect(pushCategoryOf("storefront_contact.created")).toBe("sales");
    expect(pushCategoryOf("qc.defect")).toBe("production");
    expect(pushCategoryOf("security.new_device")).toBe("security");
  });
  it("event ใหม่ที่ไม่รู้จัก → อื่น ๆ", () => {
    expect(pushCategoryOf("gif_poke")).toBe("other");
    expect(pushCategoryOf("report.popup_later")).toBe("other");
    expect(pushCategoryOf("something.brand_new")).toBe("other");
  });
});

describe("pushEnabledFor", () => {
  it("ปิดประเภทแล้วไม่เด้ง · ทดสอบเด้งเสมอ", () => {
    const prefs = normalizePushPrefs({ off: ["task_due", "other"] });
    expect(pushEnabledFor(prefs, "task_overdue")).toBe(false);
    expect(pushEnabledFor(prefs, "gif_poke")).toBe(false);
    expect(pushEnabledFor(prefs, "task_assigned")).toBe(true);
    expect(pushEnabledFor(prefs, "push.test")).toBe(true);
  });
  it("ค่าเพี้ยน/ว่าง = เปิดทุกประเภท · ตัด key ที่ไม่รู้จัก", () => {
    expect(normalizePushPrefs(null)).toEqual({ off: [] });
    expect(normalizePushPrefs({ off: "x" })).toEqual({ off: [] });
    expect(normalizePushPrefs({ off: ["tasks", "nope", "tasks", 3] })).toEqual({ off: ["tasks"] });
  });
});
