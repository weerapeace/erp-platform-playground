import { describe, expect, it } from "vitest";
import { searchThaiAddress, thaiAddressCount } from "@/lib/thai-address-search";

describe("thai-address", () => {
  it("ถอดรูปได้ครบทั้งประเทศ (~7,400 ตำบล)", () => {
    expect(thaiAddressCount()).toBeGreaterThan(7000);
  });
  it("ค้นด้วยรหัสไปรษณีย์", () => {
    const r = searchThaiAddress("10500");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.postal === "10500")).toBe(true);
    expect(r.some((a) => a.subdistrict === "สีลม" && a.province === "กรุงเทพมหานคร")).toBe(true);
  });
  it("ค้นด้วยชื่อตำบล — ตำบลขึ้นต้นก่อน", () => {
    const r = searchThaiAddress("สีลม");
    expect(r[0]).toMatchObject({ subdistrict: "สีลม", district: "บางรัก", province: "กรุงเทพมหานคร", postal: "10500" });
  });
  it("หลายคำ = ทุกคำต้องเจอ · ตัดคำนำหน้า ต./อ.", () => {
    const r = searchThaiAddress("ต.ช้างเผือก เชียงใหม่");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.province === "เชียงใหม่")).toBe(true);
  });
  it("ว่าง/สั้น = ไม่มีผล", () => {
    expect(searchThaiAddress("")).toEqual([]);
  });
});
