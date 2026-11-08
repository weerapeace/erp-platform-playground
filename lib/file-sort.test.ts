import { describe, it, expect } from "vitest";
import {
  DEFAULT_ARTWORK_PROFILE, cleanFileSortConfig, findProfile, planFileSort, nasFolderFor, safeFolderName,
  relPathOf, normalizeExt, winJoin, fillNasPattern, nasPrefixOf, nasDateValues, cleanProductConfig, type FileSortProfile,
} from "./file-sort";

const logoFolder = [
  { path: "Logo Calypso\\logo.jpg", size: 1_200_000 },
  { path: "Logo Calypso\\logo.png", size: 3_400_000 },
  { path: "Logo Calypso\\logo.psd", size: 186_000_000 },
  { path: "Logo Calypso\\logo.ai", size: 42_000_000 },
  { path: "Logo Calypso\\logo.pdf", size: 8_100_000 },
  { path: "Logo Calypso\\Thumbs.db", size: 20_000 },
];

describe("planFileSort — สูตรเริ่มต้น โลโก้ / Artwork", () => {
  const plan = planFileSort(DEFAULT_ARTWORK_PROFILE, logoFolder, { jobFolder: "Logo Calypso" });

  it("เลือก JPG เป็นรูปตัวอย่าง (แถวบนสุดในสูตร)", () => {
    expect(plan.preview).toBe("logo.jpg");
    expect(plan.files.find((f) => f.name === "logo.jpg")?.preview).toBe(true);
    expect(plan.files.filter((f) => f.preview)).toHaveLength(1);
  });

  it("JPG ไม่ขึ้น Drive แต่ลง Z: · PNG/PSD/AI/PDF ขึ้นทั้ง Drive และ Z:", () => {
    const by = Object.fromEntries(plan.files.map((f) => [f.ext, f]));
    expect(by.jpg.drive).toBe(false); expect(by.jpg.nas).toBe(true);
    for (const e of ["png", "psd", "ai", "pdf"]) { expect(by[e].drive).toBe(true); expect(by[e].nas).toBe(true); }
  });

  it("ข้ามไฟล์ระบบ Thumbs.db และนับจำนวนถูก", () => {
    expect(plan.files.find((f) => f.name === "Thumbs.db")?.skip).toBe("junk");
    expect(plan.counts).toEqual({ total: 6, drive: 4, nas: 5, skipped: 1 });
    expect(plan.warnings).toEqual([]);
  });
});

describe("planFileSort — กรณีขอบ", () => {
  it("ไม่มี JPG → ใช้ PNG เป็นรูปตัวอย่าง (และ PNG ยังขึ้น Drive ตามเดิม)", () => {
    const plan = planFileSort(DEFAULT_ARTWORK_PROFILE, [{ path: "a.psd" }, { path: "a.png" }]);
    expect(plan.preview).toBe("a.png");
    const png = plan.files.find((f) => f.ext === "png")!;
    expect(png.drive && png.nas && png.preview).toBe(true);
  });

  it("ไม่มีรูปเลย → ไม่มีรูปตัวอย่าง + เตือน", () => {
    const plan = planFileSort(DEFAULT_ARTWORK_PROFILE, [{ path: "a.psd" }, { path: "a.ai" }]);
    expect(plan.preview).toBeNull();
    expect(plan.warnings[0]).toMatch(/รูปตัวอย่าง/);
  });

  it("ไฟล์ชั้นบนชนะไฟล์ในโฟลเดอร์ย่อย · เก็บโฟลเดอร์ย่อยไว้ใน dir", () => {
    const plan = planFileSort(DEFAULT_ARTWORK_PROFILE, [{ path: "export/b.jpg" }, { path: "z.jpg" }]);
    expect(plan.preview).toBe("z.jpg");
    expect(plan.files.find((f) => f.rel === "export/b.jpg")?.dir).toBe("export");
  });

  it("รูปตัวอย่างหลายรูปที่ไม่มีปลายทางอื่น → รูปที่ไม่ถูกเลือกถูกข้าม + เตือน", () => {
    const p: FileSortProfile = { ...DEFAULT_ARTWORK_PROFILE, rules: [{ ext: "jpg", library: true, drive: false, nas: false }] };
    const plan = planFileSort(p, [{ path: "a.jpg" }, { path: "b.jpg" }]);
    expect(plan.preview).toBe("a.jpg");
    expect(plan.files.find((f) => f.rel === "b.jpg")?.skip).toBe("extra_preview");
    expect(plan.warnings.some((w) => w.includes("หลายรูป"))).toBe(true);
  });

  it("นามสกุลที่ไม่อยู่ในสูตร → ใช้ค่า 'นามสกุลอื่น' (เริ่มต้น = ลง Z: อย่างเดียว)", () => {
    const plan = planFileSort(DEFAULT_ARTWORK_PROFILE, [{ path: "notes.txt" }]);
    expect(plan.files[0]).toMatchObject({ drive: false, nas: true, skip: null });
  });

  it("ไม่ส่งไปไหนเลย → ข้าม + เตือน", () => {
    const p: FileSortProfile = { ...DEFAULT_ARTWORK_PROFILE, other: { drive: false, nas: false } };
    const plan = planFileSort(p, [{ path: "notes.txt" }]);
    expect(plan.files[0].skip).toBe("no_destination");
    expect(plan.warnings.some((w) => w.includes("txt"))).toBe(true);
  });

  it("path ซ้ำ (ต่างตัวพิมพ์) นับครั้งเดียว · กัน ../", () => {
    const plan = planFileSort(DEFAULT_ARTWORK_PROFILE, [{ path: "A.jpg" }, { path: "a.JPG" }, { path: "../x/../b.png" }]);
    expect(plan.files.map((f) => f.rel)).toEqual(["A.jpg", "x/b.png"]);
  });
});

describe("cleanFileSortConfig", () => {
  it("ค่าว่าง/พัง → สูตรเริ่มต้น", () => {
    expect(cleanFileSortConfig(null).profiles[0]).toEqual(DEFAULT_ARTWORK_PROFILE);
    expect(cleanFileSortConfig("x").profiles).toHaveLength(1);
  });

  it("นามสกุลที่ทำรูปตัวอย่างไม่ได้ ห้ามติ๊กคลังกลาง · ตัดซ้ำ · ทำนามสกุลให้สะอาด", () => {
    const cfg = cleanFileSortConfig({ profiles: [{ key: "artwork", label: "x", nasRoot: "Z:\\Assets\\", rules: [
      { ext: ".PSD", library: true, drive: true, nas: true }, { ext: "psd", library: false, drive: false, nas: false }, { ext: "*.JPG", library: true },
    ], other: { drive: true, nas: false } }] });
    const p = findProfile(cfg, "artwork");
    expect(p.rules).toEqual([{ ext: "psd", library: false, drive: true, nas: true }, { ext: "jpg", library: true, drive: false, nas: false }]);
    expect(p.nasRoot).toBe("Z:\\Assets");
    expect(p.other).toEqual({ drive: true, nas: false });
  });

  it("ไม่มีสูตร artwork → เติมให้เสมอ", () => {
    const cfg = cleanFileSortConfig({ profiles: [{ key: "product", label: "งานสินค้า", rules: [] }] });
    expect(cfg.profiles.map((p) => p.key)).toEqual(["artwork", "product"]);
  });
});

describe("path บน Z:", () => {
  it("ราก › แบรนด์ › ซับชนิด › ชื่องาน", () => {
    expect(nasFolderFor(DEFAULT_ARTWORK_PROFILE, "[01] Louis Montini", "01_Logo", "Logo Calypso"))
      .toBe("Z:\\Assets\\[01] Louis Montini\\01_Logo\\Logo Calypso");
  });
  it("ไม่มีชนิด = ข้ามชั้น · ไม่มีโฟลเดอร์แบรนด์หรือราก = null", () => {
    expect(nasFolderFor(DEFAULT_ARTWORK_PROFILE, "[04] Pixie Dustie", "", "งาน A")).toBe("Z:\\Assets\\[04] Pixie Dustie\\งาน A");
    expect(nasFolderFor(DEFAULT_ARTWORK_PROFILE, "", "01_Logo", "x")).toBeNull();
    expect(nasFolderFor({ ...DEFAULT_ARTWORK_PROFILE, nasPattern: "" }, "[01] Louis Montini", "01_Logo", "x")).toBeNull();
  });
  it("ชื่อที่ Windows ไม่รับ ถูกแก้ให้ปลอดภัย", () => {
    expect(safeFolderName('Logo: A/B? "new".')).toBe("Logo- A-B- -new-");
    expect(safeFolderName("   ")).toBe("ไม่มีชื่อ");
    expect(safeFolderName("CON")).toBe("CON_");
  });
  it("ตัวช่วยเล็ก", () => {
    expect(relPathOf("C:/x/Job/a/b.png", "C:/x/Job")).toBe("a/b.png");
    expect(normalizeExt(" *.TiFF ")).toBe("tiff");
    expect(winJoin("\\\\nas\\share\\", "a", "", "\\b\\")).toBe("\\\\nas\\share\\a\\b");
  });
});

describe("แม่แบบที่เก็บบน Z:", () => {
  it("เติมช่อง · ช่องว่างข้ามชั้น · ช่องบังคับว่าง = null · ไม่มีไดรฟ์ = null", () => {
    expect(fillNasPattern("Z:\\Work In Process\\[03] Banner\\{ปี}-{เดือน}", { ปี: "2026", เดือน: "11" })).toBe("Z:\\Work In Process\\[03] Banner\\2026-11");
    expect(fillNasPattern("Z:\\A\\{แบรนด์}\\{ชนิด}\\{ชื่องาน}", { แบรนด์: "B", ชื่องาน: "Job: 1" })).toBe("Z:\\A\\B\\Job- 1");
    expect(fillNasPattern("Z:\\A\\{แบรนด์}\\{ชื่องาน}", { ชื่องาน: "x" }, ["แบรนด์"])).toBeNull();
    expect(fillNasPattern("Assets\\{ชื่องาน}", { ชื่องาน: "x" })).toBeNull();
    expect(fillNasPattern("", {})).toBeNull();
    expect(fillNasPattern("\\\\nas\\share\\{รุ่น}", { รุ่น: "BSD15" })).toBe("\\\\nas\\share\\BSD15");
  });
  it("ส่วนต้นของแม่แบบ · ปี/เดือนตามเวลาไทย", () => {
    expect(nasPrefixOf("Z:\\Assets\\{แบรนด์}\\{ชนิด}")).toBe("Z:\\Assets");
    expect(nasPrefixOf("Z:\\A\\B")).toBe("Z:\\A\\B");
    expect(nasDateValues(new Date("2026-10-31T18:30:00Z"))).toEqual({ ปี: "2026", เดือน: "11" });
  });
  it("แยกตามชนิดงาน + ค่าเดิม (nasRoot) แปลงเป็นแม่แบบผลเหมือนเดิม", () => {
    const p = { ...DEFAULT_ARTWORK_PROFILE, nasByType: { ลายพิมพ์: "Z:\\Print\\{ปี}\\{ชื่องาน}" } };
    expect(nasFolderFor(p, "[01] LM", "02_Artwork", "Tiger", "ลายพิมพ์", new Date("2026-11-08T00:00:00Z"))).toBe("Z:\\Print\\2026\\Tiger");
    expect(nasFolderFor(p, "[01] LM", "01_Logo", "Calypso", "โลโก้")).toBe("Z:\\Assets\\[01] LM\\01_Logo\\Calypso");
    const legacy = findProfile(cleanFileSortConfig({ profiles: [{ key: "artwork", nasRoot: "Y:\\Old", rules: [] }] }), "artwork");
    expect(legacy.nasPattern).toBe("Y:\\Old\\{แบรนด์}\\{ชนิด}\\{ชื่องาน}");
    expect(legacy.nasRoot).toBe("Y:\\Old");
    expect(findProfile(cleanFileSortConfig({ profiles: [{ key: "artwork", nasRoot: "" }] }), "artwork").nasPattern).toBe("");
    expect(cleanProductConfig({ nasRoot: "Y:\\NP" }).nasPatterns).toEqual({ new: "Y:\\NP\\{รุ่น}", color: "Y:\\NP\\{รุ่น}", edit: "Y:\\NP\\{รุ่น}" });
    expect(cleanProductConfig({ nasPatterns: { new: "Z:\\A\\{รุ่น}", color: "" } }).nasPatterns).toEqual({ new: "Z:\\A\\{รุ่น}", color: "", edit: "Z:\\Work In Process\\[01] New Product\\{รุ่น}" });
  });
});
