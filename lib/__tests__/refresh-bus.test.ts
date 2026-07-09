import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  markDirty,
  isDirty,
  refreshIfDirty,
  triggerRefresh,
  subscribeRefresh,
} from "@/lib/refresh-bus";

/**
 * พิสูจน์หัวใจของ refresh-bus: "รีเฟรชเฉพาะตอนมีการแก้จริง"
 * (ตรรกะ gating นี้คือสิ่งที่ทำให้ปิด Popup/Drawer แล้วหน้าเบื้องหลังโหลดใหม่ — แต่เฉพาะเมื่อมีบันทึก/ลบ)
 */
describe("refresh-bus", () => {
  beforeEach(() => {
    // ล้าง dirty flag ที่อาจค้างจากเทสต์ก่อนหน้า (triggerRefresh เคลียร์ให้)
    triggerRefresh();
  });

  it("subscribe + trigger → listener ถูกเรียก", () => {
    const fn = vi.fn();
    const off = subscribeRefresh(fn);
    triggerRefresh();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("unsubscribe แล้ว listener ไม่ถูกเรียกอีก", () => {
    const fn = vi.fn();
    const off = subscribeRefresh(fn);
    off();
    triggerRefresh();
    expect(fn).not.toHaveBeenCalled();
  });

  it("มีการแก้จริง (markDirty) → ปิด overlay (refreshIfDirty) → กริ่งดัง", () => {
    const fn = vi.fn();
    const off = subscribeRefresh(fn);
    markDirty();
    expect(isDirty()).toBe(true);
    refreshIfDirty();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isDirty()).toBe(false); // เคลียร์ flag หลังรีเฟรช
    off();
  });

  it("ไม่มีการแก้ (แค่เปิดดู/ยกเลิก) → ปิด overlay → กริ่งเงียบ = ประหยัด", () => {
    const fn = vi.fn();
    const off = subscribeRefresh(fn);
    refreshIfDirty(); // dirty=false
    expect(fn).not.toHaveBeenCalled();
    off();
  });

  it("แก้ครั้งเดียว ปิดหลาย overlay ซ้อน → รีเฟรชรอบเดียว (flag เคลียร์แล้ว)", () => {
    const fn = vi.fn();
    const off = subscribeRefresh(fn);
    markDirty();
    refreshIfDirty(); // overlay ชั้นในปิด → ดัง 1 ครั้ง + เคลียร์
    refreshIfDirty(); // overlay ชั้นนอกปิด → เงียบ (ไม่ dirty แล้ว)
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("listener หลายตัว (หลายตาราง/หน้า) ได้ยินกริ่งพร้อมกัน", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeRefresh(a);
    const offB = subscribeRefresh(b);
    markDirty();
    refreshIfDirty();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("listener ตัวหนึ่ง throw ไม่ทำให้ตัวอื่นพลาดกริ่ง", () => {
    const bad = vi.fn(() => { throw new Error("boom"); });
    const good = vi.fn();
    const off1 = subscribeRefresh(bad);
    const off2 = subscribeRefresh(good);
    markDirty();
    expect(() => refreshIfDirty()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });
});
