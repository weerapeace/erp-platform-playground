import { describe, it, expect } from "vitest";
import { folderLookKeys, galleryFoldersToCanvas, isGalleryFolders } from "../website-folder-convert";
import { normalizeBlocks } from "../website-blocks";
import { validateCanvasFolders } from "../website-canvas";

/**
 * 🗂 แปลงแกลเลอรีแบบแฟ้ม → แฟ้มวางอิสระ (2026-10-24)
 * กันพลาด: ของเดิมย้ายไปครบ (รูป/คลิป/ข้อความ/ลิงก์/ป้าย/สี/หน้าตาแฟ้ม) · ช่องว่างข้าม · เพดาน 6 แฟ้ม · ผลผ่านตัวทำความสะอาด
 */
type R = Record<string, unknown>;
const GAL: R = {
  id: "g1",
  type: "gallery",
  layout: "tabs",
  tabsLook: "folder",
  folderDir: "h",
  folderMedia: "pol",
  tabsH: 520,
  title: "แกลเลอรี",
  eyebrow: "NEW",
  folderShape: "slant",
  folderPal: "custom",
  folderHex: "#e6d6c8",
  folderTex: "dots",
  folderCover: true,
  coverTitle: "do a little,",
  coverFont2: "Great Vibes",
  items: [
    { id: "a", media: "image", imageKey: "img/a.jpg", title: "Gratitude", caption: "เขียนสิ่งดี ๆ", tabLabel: "GRATITUDE DIARY", folderColor: "#f4c0d1", crop: { x: 30, y: 40, zoom: 150 }, alt: "รูป a" },
    { id: "b", media: "video", videoKey: "vid/b.mp4", imageKey: "img/b.jpg", title: "To do list", href: "/shop", linkText: "ดูสินค้า" },
    { id: "c", media: "image", code: ["sku-1"], title: "" },
    { id: "d", media: "image", imageKey: "", title: "ว่าง" },
  ],
};
const conv = (g: R = GAL) => galleryFoldersToCanvas(g, [{ code: "SKU-1", name: "กระเป๋า", slug: "bag-1", imageKey: "prod/1.jpg" }]);
const inFolder = (items: R[], f: string) => items.filter((i) => i.folder === f);

describe("🗂 แปลงแกลเลอรีแบบแฟ้ม → แฟ้มวางอิสระ", () => {
  it("ปุ่มแปลงโชว์เฉพาะแกลเลอรีแบบแฟ้ม", () => {
    expect(isGalleryFolders(GAL)).toBe(true);
    expect(isGalleryFolders({ ...GAL, tabsLook: "plain" })).toBe(false);
    expect(isGalleryFolders({ ...GAL, layout: "grid" })).toBe(false);
  });
  it("หน้าตาแฟ้มที่ย้าย = ช่องที่มีทั้งสองแบบ (ไม่รวมทิศ/แบบรูป/ช่องของผืน)", () => {
    const k = folderLookKeys();
    for (const x of ["folderShape", "folderPos", "folderTex", "folderShadow", "folderRadius", "folderPal", "folderHex", "folderLabel", "folderPeek", "folderLift", "folderCover", "coverTitle", "coverTitle2", "coverFont", "coverFont2", "coverSize", "coverLogo"]) expect(k).toContain(x);
    for (const x of ["folderDir", "folderMedia", "folderMode", "folderCount", "folder1Label"]) expect(k).not.toContain(x);
  });
  it("แฟ้ม: จำนวนตามช่องที่มีรูป (ช่องว่างข้าม) · ป้าย = ป้ายที่ตั้ง/หัวข้อ/ชื่อสินค้า · สีรายแฟ้ม · หน้าตาแฟ้มครบ · หัวข้อ Section แยกออกมา", () => {
    const r = conv();
    expect(r.folders).toBe(3);
    expect(r.canvas).toMatchObject({ folderMode: true, folderCount: "3", folderOpen: "hover", height: 520, folder1Label: "GRATITUDE DIARY", folder1Color: "#f4c0d1", folder2Label: "To do list", folder3Label: "กระเป๋า", folderShape: "slant", folderPal: "custom", folderHex: "#e6d6c8", folderTex: "dots", folderCover: true, coverTitle: "do a little," });
    expect(r.heading).toEqual({ eyebrow: "NEW", title: "แกลเลอรี", body: "" });
    expect(r.warnings.join(" ")).toContain("ข้าม 1 ช่อง");
  });
  it("ของในแต่ละแฟ้ม: โพลารอยด์ + หัวข้อ + คำอธิบาย · คลิปพร้อมรูปปก · ลิงก์มีข้อความ = ปุ่ม · รูปจากสินค้า = รูปแรก + ลิงก์หน้าสินค้า", () => {
    const items = conv().canvas.items as R[];
    const f1 = inFolder(items, "1");
    expect(f1.map((i) => i.kind)).toEqual(["image", "text", "text"]);
    expect(f1[0]).toMatchObject({ imageKey: "img/a.jpg", frame: "polaroid", cropX: 30, cropY: 40, cropZoom: 150, alt: "รูป a" });
    expect(f1[1]).toMatchObject({ text: "Gratitude", font: "display" });
    expect(f1[2]).toMatchObject({ text: "เขียนสิ่งดี ๆ", color: "muted" });
    const f2 = inFolder(items, "2");
    expect(f2[0]).toMatchObject({ kind: "video", videoKey: "vid/b.mp4", posterKey: "img/b.jpg" });
    expect(f2[0].href).toBeUndefined();
    expect(f2.find((i) => i.kind === "button")).toMatchObject({ label: "ดูสินค้า", href: "/shop" });
    const f3 = inFolder(items, "3");
    expect(f3[0]).toMatchObject({ kind: "image", imageKey: "prod/1.jpg", href: "/product/bag-1", alt: "กระเป๋า" });
    // ทุกชิ้นอยู่ในผืน (กว้าง 1200 · สูงตามแฟ้ม)
    for (const it of items) expect(Number(it.x) + Number(it.w)).toBeLessThanOrEqual(1200);
  });
  it("แบบเต็มแฟ้ม: รูปเต็มผืน + ตัวหนังสือขาว", () => {
    const items = conv({ ...GAL, folderMedia: "full" }).canvas.items as R[];
    expect(items[0]).toMatchObject({ x: 0, y: 0, w: 1200, h: 520, frame: "rect" });
    expect(items.find((i) => i.kind === "text")).toMatchObject({ color: "white" });
  });
  it("เพดาน 6 แฟ้ม · ช่องเดียว = เพิ่มแฟ้ม 2 ว่าง · แนวตั้ง = เตือนว่าเป็นแนวนอน · รูปสินค้าหาไม่เจอ = เตือนรหัส", () => {
    const many = { ...GAL, items: Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, imageKey: `k/${i}.jpg`, title: `T${i}` })) };
    const r1 = galleryFoldersToCanvas(many);
    expect(r1.folders).toBe(6);
    expect(r1.warnings.join(" ")).toContain("ย้ายแค่ 6 ช่องแรก");
    const r2 = galleryFoldersToCanvas({ ...GAL, folderDir: "v", items: [{ id: "a", imageKey: "k/a.jpg", title: "A" }, { id: "c", code: ["NOPE"] }] });
    expect(r2.canvas.folderCount).toBe("2");
    expect(r2.warnings.join(" ")).toContain("แฟ้ม 2");
    expect(r2.warnings.join(" ")).toContain("แนวนอน");
    expect(r2.warnings.join(" ")).toContain("NOPE");
  });
  it("ผลผ่านตัวทำความสะอาดครบ · ไม่มีแฟ้มว่าง (ไม่เตือน)", () => {
    const r = conv();
    const [b] = normalizeBlocks([{ id: "c1", type: "canvas", ...r.canvas } as never]) as unknown as (R & { items: R[] })[];
    expect(b).toMatchObject({ folderMode: true, folderCount: "3", folderShape: "slant", folder1Label: "GRATITUDE DIARY" });
    expect(b.items.length).toBe((r.canvas.items as R[]).length);
    expect(b.items.find((i) => i.kind === "video")).toMatchObject({ videoKey: "vid/b.mp4", folder: "2" });
    expect(validateCanvasFolders(b, "ผืน")).toEqual([]);
  });
});
