import { describe, it, expect } from "vitest";
import { FILE_TYPES, FILE_TYPE_GROUPS, FILE_GROUP_META, normalizeExt, fileTypeOf, cleanExtList, suggestFileLabel, fileTypeSvg } from "../file-types";

const th = (a: string) => a;

describe("file-types", () => {
  it("ทะเบียนไม่มีนามสกุลซ้ำ · ทุกตัวอยู่ในกลุ่มที่มีจริง · มีตัวที่เจ้าของขอครบ", () => {
    const exts = FILE_TYPES.map((d) => d.ext);
    expect(new Set(exts).size).toBe(exts.length);
    for (const d of FILE_TYPES) expect(FILE_TYPE_GROUPS).toContain(d.group);
    for (const e of ["jpg", "cr2", "psd", "ai", "pdf", "png", "mp4", "xlsx", "dxf", "sew"]) expect(exts).toContain(e);
    for (const g of FILE_TYPE_GROUPS) expect(FILE_GROUP_META[g].color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("อ่านนามสกุลจากชื่อไฟล์ / .PSD / ชื่อเรียกอื่น · ตัดอักษรแปลก", () => {
    expect(normalizeExt("รูปสินค้า_01.JPEG")).toBe("jpg");
    expect(normalizeExt(".PSD")).toBe("psd");
    expect(normalizeExt("IMG_0001.CR2")).toBe("cr2");
    expect(normalizeExt("tiff")).toBe("tif");
    expect(normalizeExt("<script>")).toBe("script");
    expect(normalizeExt("a.b\"><svg")).toBe("bsvg");
    expect(normalizeExt("")).toBe("");
  });

  it("ไม่รู้จัก = กลุ่มอื่น ๆ สีเทา แต่โชว์นามสกุลตามที่พิมพ์", () => {
    const d = fileTypeOf("งาน.heif");
    expect(d.known).toBe(false);
    expect(d.group).toBe("other");
    expect(d.ext).toBe("heif");
    expect(fileTypeOf("psd").color).toBe("#1d6fd6");    // สีเฉพาะตัว
    expect(fileTypeOf("png").color).toBe(FILE_GROUP_META.image.color);   // สีกลุ่ม
  });

  it("รายการนามสกุล: ไม่ซ้ำ · ทิ้งของเสีย · จำกัดจำนวน", () => {
    expect(cleanExtList(["JPG", "jpeg", ".png", 5, "", null, "psd"])).toEqual(["jpg", "png", "psd"]);
    expect(cleanExtList("jpg")).toEqual([]);
    expect(cleanExtList(Array.from({ length: 20 }, (_, i) => `e${i}`))).toHaveLength(12);
  });

  it("ชื่อกล่องแนะนำ: กลุ่มเดียว = ชื่อกลุ่ม · ปนกัน = ไฟล์", () => {
    expect(suggestFileLabel(["cr2", "nef"], th)).toBe("ไฟล์ดิบจากกล้อง (RAW)");
    expect(suggestFileLabel(["jpg", "psd"], th)).toBe("ไฟล์");
  });

  it("ไอคอน SVG: มีนามสกุลตัวใหญ่ · สีตามชนิด · ปลอดภัยจากข้อความแปลก", () => {
    const svg = fileTypeSvg("pdf", 40);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(">PDF</text>");
    expect(svg).toContain("#dc2626");
    expect(svg).toContain('width="40" height="48"');
    const evil = fileTypeSvg('x"><script>alert(1)</script>');
    expect(evil).not.toContain("<script");
    expect(evil).toContain('aria-label="XSCRIP"');   // เหลือแต่ a-z0-9 · ป้ายไม่เกิน 6 ตัว
    expect(fileTypeSvg("")).toContain(">?</text>");
  });
});
