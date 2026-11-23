import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANY_LAYOUT, normalizeCompanyLayout } from "@/lib/line-company";
import {
  MENU_IMAGE_HISTORY_MAX, coverCrop, menuButtonCount, menuImageAreas, menuImageFits, menuImageTarget, menuImagesOf, revertMenuImage, setMenuImage, type MenuImage,
} from "@/lib/line-company-images";

const img = (k: string, count = 4): MenuImage => ({ r2_key: k, width: 2500, height: count <= 3 ? 843 : 1686, count, bytes: 1000, uploaded_at: "2026-11-23T00:00:00Z", uploaded_by: null, name: k });
const layout = normalizeCompanyLayout(DEFAULT_COMPANY_LAYOUT);

describe("รูปเมนูไลน์ที่ออกแบบเอง", () => {
  it("ขนาดตามจำนวนปุ่ม (กฎ LINE)", () => {
    expect(menuImageTarget(3)).toEqual({ width: 2500, height: 843 });
    expect(menuImageTarget(4)).toEqual({ width: 2500, height: 1686 });
  });
  it("ใช้ได้เฉพาะเมื่อจำนวนปุ่มตรง", () => {
    expect(menuImageFits(img("a", 4), 4)).toBe(true);
    expect(menuImageFits(img("a", 4), 5)).toBe(false);   // ขนาดเท่ากันแต่ช่องกดคนละที่
    expect(menuImageFits(null, 4)).toBe(false);
  });
  it("ใส่รูปใหม่ = รูปเดิมเข้าประวัติ · ย้อนได้ · กลับไปใช้รูปที่ระบบวาดได้", () => {
    let s = menuImagesOf(null);
    s = setMenuImage(s, "employee", img("a"), "t1");
    s = setMenuImage(s, "employee", img("b"), "t2");
    expect(s.slots.employee?.current?.r2_key).toBe("b");
    expect(s.slots.employee?.history.map((h) => h.r2_key)).toEqual(["a"]);
    const back = revertMenuImage(s, "employee", 0, "t3")!;
    expect(back.slots.employee?.current?.r2_key).toBe("a");
    expect(back.slots.employee?.history.map((h) => h.r2_key)).toEqual(["b"]);
    const drawn = setMenuImage(back, "employee", null, "t4");
    expect(drawn.slots.employee?.current).toBeNull();
    expect(drawn.slots.employee?.history.map((h) => h.r2_key)).toEqual(["a", "b"]);
    expect(revertMenuImage(drawn, "employee", 9)).toBeNull();
  });
  it("ประวัติเก็บไม่เกินที่กำหนด + อ่านข้อมูลเสียได้", () => {
    let s = menuImagesOf({ slots: { guest: { current: { r2_key: "" }, history: "x" } } });
    expect(s.slots.guest).toBeUndefined();
    for (let i = 0; i < 9; i++) s = setMenuImage(s, "guest", img(`k${i}`, 2));
    expect(s.slots.guest?.history.length).toBe(MENU_IMAGE_HISTORY_MAX);
    expect(menuImagesOf(JSON.parse(JSON.stringify(s))).slots.guest?.current?.r2_key).toBe("k8");
  });
  it("ตัดขอบกลางรูปให้สัดส่วนตรง", () => {
    const c = coverCrop({ width: 3000, height: 3000 }, { width: 2500, height: 1686 });
    expect(c.sx).toBe(0); expect(c.sw).toBe(3000); expect(c.sh).toBe(2023); expect(c.off).toBeGreaterThan(0.3);
    expect(coverCrop({ width: 5000, height: 3372 }, { width: 2500, height: 1686 }).off).toBeLessThan(0.001);
  });
  it("ช่องกดของหน้าแอดมินมีแถบแท็บด้านบน", () => {
    const areas = menuImageAreas("admin", layout);
    expect(areas.filter((a) => a.tab).length).toBe(3);
    expect(areas.filter((a) => !a.tab).length).toBe(menuButtonCount("admin", layout));
    expect(areas.find((a) => !a.tab)?.box.y).toBe(200);
  });
});
