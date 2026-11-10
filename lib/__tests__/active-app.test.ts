import { describe, it, expect, beforeEach, vi } from "vitest";

// ความจำกลาง "แอปที่กำลังเปิด" — แต่ละเทสต์โหลดโมดูลใหม่ (= เปิดแท็บใหม่)
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
});

describe("lib/active-app", () => {
  it("แท็บใหม่ → ใช้แอปล่าสุดใน localStorage", async () => {
    store.set("erp-active-app", "purchasing");
    const m = await import("@/lib/active-app");
    expect(m.initialActiveApp()).toBe("purchasing");
  });
  it("แอปของแท็บนี้ชนะ localStorage (แท็บอื่นเขียนทับไม่ทำให้แท็บนี้เด้ง)", async () => {
    const m = await import("@/lib/active-app");
    m.setTabActiveApp("purchasing");
    store.set("erp-active-app", "master");   // อีกแท็บเปลี่ยนแอป
    expect(m.initialActiveApp()).toBe("purchasing");
  });
  it("กดเลือกแอป → เชลล์ที่ mount ใหม่ได้แอปที่กด + จำ from/to", async () => {
    const m = await import("@/lib/active-app");
    m.setTabActiveApp("purchasing");
    m.pickActiveApp("master", "/purchasing", "/master/skus?tab=tags");
    expect(m.initialActiveApp()).toBe("master");
    expect(m.pendingAppPick()).toMatchObject({ app: "master", from: "/purchasing", to: "/master/skus" });
    expect(store.get("erp-active-app")).toBe("master");
    m.clearAppPick();
    expect(m.pendingAppPick()).toBeNull();
    expect(m.initialActiveApp()).toBe("master");
  });
  it("Ctrl+คลิก (เปิดแท็บใหม่) → จำไว้ให้แท็บใหม่ แต่แท็บนี้อยู่แอปเดิม", async () => {
    const m = await import("@/lib/active-app");
    m.setTabActiveApp("purchasing");
    m.rememberLastApp("master");
    expect(store.get("erp-active-app")).toBe("master");
    expect(m.initialActiveApp()).toBe("purchasing");
  });
});
