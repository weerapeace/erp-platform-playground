import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_CONFIG, cleanContentConfig, cleanFileSortConfig } from "@/lib/file-sort";
import { contentFolderKey, contentNasFolder, isRawFolder, planContentSort, platformOfFolder } from "@/lib/file-sort-content";

const files = (paths: string[], size = 100) => paths.map((path) => ({ path, size }));

describe("สูตร Content ของตัวแยกไฟล์", () => {
  it("ชื่อโฟลเดอร์: ไม่สนเลขนำหน้า · แพลตฟอร์ม · โฟลเดอร์ไฟล์ดิบ", () => {
    expect(contentFolderKey("01_Instagram")).toBe("instagram");
    expect(contentFolderKey("[02] Facebook")).toBe("facebook");
    expect(platformOfFolder("01_Instagram")).toBe("instagram");
    expect(platformOfFolder("03_X")).toBe("x");
    expect(platformOfFolder("05 LINE OA")).toBe("line_oa");
    expect(platformOfFolder("04_Shop Decoration")).toBeNull();
    expect(platformOfFolder("01_Images_1")).toBeNull();
    const raw = DEFAULT_CONTENT_CONFIG.rawFolders;
    expect(isRawFolder("00_rawfiles", raw)).toBe(true);
    expect(isRawFolder("00_rawfiles_1", raw)).toBe(true);
    expect(isRawFolder("Raw Files 2", raw)).toBe(true);
    expect(isRawFolder("RAW", raw)).toBe(true);
    expect(isRawFolder("rawhide", raw)).toBe(false);
    expect(isRawFolder("01_Images_1", raw)).toBe(false);
  });

  it("รูป/วิดีโอลงอัลบั้ม · ไฟล์ดิบ / PSD อยู่บน Z: · ไฟล์ระบบข้าม · แพลตฟอร์มจากโฟลเดอร์ชั้นบน", () => {
    const p = planContentSort(files([
      "01_Instagram/1.jpg", "01_Instagram/reel.MP4", "02_Facebook/1.png", "03_X/a.webp", "04_Shop Decoration/banner.png",
      "01_Images_1/cover.jpg", "01_Images_1/cover.psd", "00_rawfiles/IMG_1.CR2", "00_rawfiles_1/IMG_1.jpg", "Thumbs.db",
    ]), DEFAULT_CONTENT_CONFIG);
    const by = (rel: string) => p.files.find((f) => f.rel === rel)!;
    expect(by("01_Instagram/reel.MP4")).toMatchObject({ album: true, kind: "video", platform: "instagram" });
    expect(by("04_Shop Decoration/banner.png")).toMatchObject({ album: true, platform: null });
    expect(by("01_Images_1/cover.psd")).toMatchObject({ album: false, nas: true, why: "not_media" });
    expect(by("00_rawfiles_1/IMG_1.jpg")).toMatchObject({ album: false, nas: true, why: "raw" });
    expect(by("Thumbs.db")).toMatchObject({ album: false, nas: false, why: "junk" });
    expect(p.platforms).toEqual(["instagram", "facebook", "x"]);
    expect(p.counts).toMatchObject({ total: 10, album: 6, raw: 2, other: 1, nas: 9, already: 0 });
  });

  it("ชื่อไฟล์ชนกันคนละโฟลเดอร์ → ชื่อในอัลบั้มนำหน้าด้วยโฟลเดอร์ · ไม่ชน = ชื่อเดิม", () => {
    const p = planContentSort(files(["01_Images_1/1.jpg", "01_Images_2/1.JPG", "01_Images_2/2.jpg"]), DEFAULT_CONTENT_CONFIG);
    expect(p.files.map((f) => f.albumName)).toEqual(["01_Images_1_1.jpg", "01_Images_2_1.JPG", "2.jpg"]);
  });

  it("กดซ้ำ: ไฟล์ที่อัลบั้มมีแล้ว (ชื่อ + ขนาด) ข้าม · ขนาดต่าง = ลงใหม่", () => {
    const p = planContentSort(files(["1.jpg", "2.jpg", "3.jpg"], 500), DEFAULT_CONTENT_CONFIG, {
      existing: [{ file_name: "1.JPG", size_bytes: 500 }, { file_name: "2.jpg", size_bytes: 999 }, { file_name: "3.jpg", size_bytes: null }],
    });
    expect(p.files.map((f) => `${f.rel}:${f.album ? "album" : f.why}`)).toEqual(["1.jpg:already", "2.jpg:album", "3.jpg:already"]);
    expect(p.counts.already).toBe(2);
    const all = planContentSort(files(["1.jpg"], 500), DEFAULT_CONTENT_CONFIG, { existing: [{ file_name: "1.jpg", size_bytes: 500 }] });
    expect(all.warnings.some((w) => w.includes("อยู่ในอัลบั้มแล้ว"))).toBe(true);
  });

  it("ไม่มีรูป/วิดีโอเลย → เตือน (ก๊อป Z: อย่างเดียว)", () => {
    const p = planContentSort(files(["00_rawfiles/a.CR2", "x.psd"]), DEFAULT_CONTENT_CONFIG);
    expect(p.counts.album).toBe(0);
    expect(p.warnings.some((w) => w.includes("ไม่มีรูป/วิดีโอ"))).toBe(true);
  });

  it("ที่เก็บบน Z: ตามแม่แบบ + ค่าตั้งทำความสะอาด (ข้อความคั่น , ได้) + config เดิมไม่มี content = ค่าเริ่มต้น", () => {
    expect(contentNasFolder(DEFAULT_CONTENT_CONFIG, "2026_11_08-1_MPU15", "MPU15")).toBe("Z:\\Work In Process\\[01] New Product\\[02] Contents\\2026_11_08-1_MPU15");
    const c = cleanContentConfig({ nasPattern: "Z:\\C\\{แบรนด์}\\{ปี}\\{ชื่องาน}\\", rawFolders: " RawFiles , dump ", albumExts: ".JPG, mp4, jpg" });
    expect(c.nasPattern).toBe("Z:\\C\\{แบรนด์}\\{ปี}\\{ชื่องาน}");
    expect(c.nasRoot).toBe("Z:\\C");
    expect(c.rawFolders).toEqual(["rawfiles", "dump"]);
    expect(c.albumExts).toEqual(["jpg", "mp4"]);
    expect(contentNasFolder(c, "f", "Album 1", "[01] LM", new Date("2026-11-08T00:00:00Z"))).toBe("Z:\\C\\[01] LM\\2026\\Album 1");
    expect(contentNasFolder(cleanContentConfig({ nasPattern: "" }), "f", "a")).toBeNull();
    expect(cleanFileSortConfig({ profiles: [] }).content).toEqual(DEFAULT_CONTENT_CONFIG);
  });
});
