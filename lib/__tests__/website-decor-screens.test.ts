import { describe, it, expect } from "vitest";
import { normalizeBlocks, newDecor, decorPlaceOf, decorIsCustom, patchDecorPlace, resetDecorPlace, decorHideKey } from "../website-blocks";

/** 📱 ของตกแต่งของ Section ปรับแยก คอม / แท็บเล็ต / มือถือ */
describe("ของตกแต่ง: ปรับแยกตามจอ", () => {
  it("ข้อมูลเก่า = แท็บเล็ต/มือถือใช้ค่าคอม · ซ่อนเฉพาะที่ตั้งไว้", () => {
    const [n] = normalizeBlocks([{ id: "s1", type: "cta", style: { decor: [{ id: "a", kind: "shape", shape: "bow", x: 10, y: 20, w: 12, rotate: 15, hideMobile: true }] } }]);
    const d = n.style.decor![0];
    expect([d.tab, d.mob, d.hideDesktop, d.hideTablet, d.hideMobile]).toEqual([null, null, false, false, true]);
    expect(decorPlaceOf(d, "tablet")).toEqual({ x: 10, y: 20, w: 12, size: 40, rotate: 15 });
    expect(decorIsCustom(d, "mobile")).toBe(false);
  });

  it("บันทึก: เก็บค่าที่ปรับแยก + ตัดค่าเกินขอบ · ไม่ใช่ object = ไม่ได้ปรับแยก", () => {
    const [n] = normalizeBlocks([
      { id: "s2", type: "cta", style: { decor: [{ id: "a", kind: "shape", x: 50, y: 50, w: 8, tab: { x: 70, y: 999, w: 20 }, mob: "junk", hideTablet: true }] } },
    ]);
    const d = n.style.decor![0];
    expect(d.tab).toEqual({ x: 70, y: 120, w: 20, size: 40, rotate: 0 });
    expect(d.mob).toBeNull();
    expect(d.hideTablet).toBe(true);
  });

  it("แก้บนแท็บเล็ตครั้งแรก = เริ่มจากค่าคอม · คอมไม่ขยับ · มือถือยังตามคอม", () => {
    const d = newDecor("shape", { x: 30, y: 40, w: 10, rotate: 5 });
    const t = patchDecorPlace(d, "tablet", { x: 80, y: 60 });
    expect(t.tab).toEqual({ x: 80, y: 60, w: 10, size: d.size, rotate: 5 });
    expect([t.x, t.y]).toEqual([30, 40]);
    expect(decorPlaceOf(t, "mobile")).toEqual({ x: 30, y: 40, w: 10, size: d.size, rotate: 5 });
    // แก้คอมทีหลัง = แท็บเล็ตที่ปรับแยกแล้วไม่เปลี่ยนตาม
    const c = patchDecorPlace(t, "desktop", { x: 5 });
    expect([c.x, c.tab!.x]).toEqual([5, 80]);
    // กลับไปใช้ตามคอม
    const r = resetDecorPlace(c, "tablet");
    expect(r.tab).toBeNull();
    expect(decorPlaceOf(r, "tablet").x).toBe(5);
  });

  it("ช่องซ่อนของแต่ละจอ", () => {
    expect([decorHideKey("desktop"), decorHideKey("tablet"), decorHideKey("mobile")]).toEqual(["hideDesktop", "hideTablet", "hideMobile"]);
  });
});
