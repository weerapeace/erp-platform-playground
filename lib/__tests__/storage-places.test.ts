import { describe, it, expect } from "vitest";
import { STORAGE_PLACES, storagePlaceOf, isPlaceKey, guessPlace, storagePlaceSvg } from "../storage-places";
import { STORAGE_PROVIDERS } from "../storage-policy";

describe("storage-places", () => {
  it("ไม่มี key ซ้ำ · ที่เก็บจริง 3 ตัวใช้คำอธิบายจากระบบ (ที่เดียว)", () => {
    const keys = STORAGE_PLACES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(0, 3)).toEqual(["drive", "r2", "supabase"]);
    expect(storagePlaceOf("drive")!.hintTh).toBe(STORAGE_PROVIDERS.drive.goodAt);
    expect(storagePlaceOf("supabase")!.hintTh).toBe(STORAGE_PROVIDERS.supabase.goodAt);
    for (const p of STORAGE_PLACES) expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("ตรวจ key · ไม่รู้จัก = null", () => {
    expect(isPlaceKey("nas")).toBe(true);
    expect(isPlaceKey("evil\"><script>")).toBe(false);
    expect(storagePlaceOf("zzz")).toBeNull();
    expect(storagePlaceOf(undefined)).toBeNull();
  });
  it("เดาที่เก็บจากชื่อกล่องเดิม", () => {
    expect(guessPlace("Google Drive\nไฟล์งาน")).toBe("drive");
    expect(guessPlace("R2")).toBe("r2");
    expect(guessPlace("Supabase\nเก็บใบส่งของ")).toBe("supabase");
    expect(guessPlace("ไดรฟ์ Z: ออฟฟิศ")).toBe("nas");
    expect(guessPlace("แพ็กของ")).toBeNull();
  });
  it("ไอคอน SVG: ขนาดตามสั่ง · ไม่รู้จัก = ไอคอนฐานข้อมูล", () => {
    const svg = storagePlaceSvg("drive", 44);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="44" height="44"');
    expect(storagePlaceSvg("nope")).toContain('aria-label="db"');
  });
});
