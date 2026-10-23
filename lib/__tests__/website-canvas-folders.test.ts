import { describe, it, expect } from "vitest";
import { SECTION_PRESETS, SECTION_SCHEMAS, matchShowIf } from "../website-schema";
import { normalizeBlocks, newBlock, validateBlocks, type Block } from "../website-blocks";
import { CANVAS_SHAPES, folderCanvasStarter, validateCanvasFolders } from "../website-canvas";

/**
 * 🗂 ผืนผ้าใบโหมดแฟ้มซ้อน "แฟ้มวางอิสระ" (2026-10-23)
 * กันพลาด: ผืนเดิมไม่เปลี่ยน · ช่องแฟ้มโชว์เมื่อเปิดแฟ้มซ้อน · ชิ้นมี "อยู่แฟ้มที่" · การ์ดสำเร็จรูปในคลังได้ผืนที่ทำความสะอาดแล้วครบ
 */
type R = Record<string, unknown>;
const norm = (b: R) => normalizeBlocks([b])[0] as unknown as R & { items: R[] };
const sch = SECTION_SCHEMAS.canvas;
const shown = (b: R) => sch.fields.filter((x) => matchShowIf(x, b)).map((x) => x.key);
const item = (k: string) => sch.children!.fields.find((x) => x.key === k)!;

describe("🗂 ผืนผ้าใบแฟ้มซ้อน", () => {
  it("ผืนเดิม = ไม่ใช่แฟ้มซ้อน · ไม่เห็นช่องแฟ้ม · ชิ้นอยู่แฟ้ม 1", () => {
    const b = norm({ id: "c1", type: "canvas", items: [{ kind: "text", text: "A" }] });
    expect(b.folderMode).toBe(false);
    const keys = shown(b);
    expect(keys.some((k) => k.startsWith("folder") && k !== "folderMode")).toBe(false);
    expect(b.items[0].folder).toBe("1");
    expect(matchShowIf({ ...item("folder"), showIf: item("folder").showIfParent }, b)).toBe(false);
  });

  it("เปิดแฟ้มซ้อน = ช่องจำนวน/เปิดเมื่อ/แฟ้มเริ่ม + ป้าย/สีเท่าจำนวนแฟ้ม + หน้าตาแฟ้มชุดเดียวกับแกลเลอรี", () => {
    const b = norm({ id: "c2", type: "canvas", folderMode: true, folderCount: "4", folderPal: "custom" });
    const keys = shown(b);
    expect(keys).toEqual(expect.arrayContaining(["folderCount", "folderOpen", "folderStart", "folder1Label", "folder4Label", "folder4Color", "folderShape", "folderPos", "folderTex", "folderShadow", "folderRadius", "folderPal", "folderHex", "folderLabel", "folderPeek", "folderLift", "folderCover"]));
    expect(keys).not.toContain("folder5Label");
    expect(b).toMatchObject({ folderCount: "4", folderOpen: "hover", folderStart: "1", folderShape: "real", folderPos: "alt", folderTex: "lines", folderShadow: 2, folderRadius: 14, folderLabel: "auto", folderPeek: 56, folderLift: true });
    expect(matchShowIf({ ...item("folder"), showIf: item("folder").showIfParent }, b)).toBe(true);
  });

  it("ค่ามั่ว = ค่าเริ่ม · ชิ้นอยู่แฟ้มที่ไม่มีในรายการ = แฟ้ม 1", () => {
    const b = norm({ id: "c3", type: "canvas", folderMode: true, folderCount: "9", folderOpen: "x", items: [{ kind: "text", text: "A", folder: "7" }, { kind: "text", text: "B", folder: "3" }] });
    expect(b.folderCount).toBe("3");
    expect(b.folderOpen).toBe("hover");
    expect(b.items.map((i) => i.folder)).toEqual(["1", "3"]);
  });

  it("ตรวจก่อนเผยแพร่: แฟ้มว่าง · ชิ้นอยู่แฟ้มเกินจำนวน · ผืนปกติไม่เตือนเรื่องแฟ้ม", () => {
    expect(validateCanvasFolders({ folderMode: false, items: [] }, "ผืน")).toEqual([]);
    const m = validateCanvasFolders({ folderMode: true, folderCount: "3", items: [{ folder: "1" }, { folder: "5" }] }, "ผืน").map((x) => x.message).join(" | ");
    expect(m).toContain("แฟ้ม 2, 3 ยังว่าง");
    expect(m).toContain("1 ชิ้นอยู่แฟ้มที่เกินจำนวนแฟ้ม");
    const v = validateBlocks([norm({ id: "c4", type: "canvas", folderMode: true, folderCount: "2", items: [{ kind: "text", text: "A", folder: "1" }] }) as unknown as Block]).map((x) => x.message).join(" | ");
    expect(v).toContain("แฟ้ม 2 ยังว่าง");
  });

  it("การ์ด \"🗂 แฟ้มวางอิสระ\": ผืนชนิด canvas + แฟ้มซ้อน 3 แฟ้ม มีของทุกแฟ้ม · ผ่านตัวทำความสะอาดครบ ไม่เตือนแฟ้มว่าง", () => {
    const pr = SECTION_PRESETS.find((p) => p.id === "canvas-folders")!;
    expect(pr.type).toBe("canvas");
    const b = norm({ ...(newBlock("canvas", 1) as unknown as R), ...pr.values() });
    expect(b).toMatchObject({ type: "canvas", folderMode: true, folderCount: "3", folder1Label: "GRATITUDE DIARY", folder2Label: "TO DO LIST", folder3Label: "LIFESTYLE BLOG" });
    const per = [1, 2, 3].map((f) => b.items.filter((i) => i.folder === String(f)).length);
    expect(per.every((x) => x > 0)).toBe(true);
    expect(b.items.find((i) => i.shape === "note")).toMatchObject({ kind: "shape", color: "custom", colorHex: "#fac775" });
    expect(validateCanvasFolders(b, "ผืน")).toEqual([]);
    expect(folderCanvasStarter().folderMode).toBe(true);
  });

  it("ของตกแต่งสำเร็จรูปอยู่ในรายการลาย (บันทึกได้ไม่ถูกเปลี่ยนเป็นโบว์)", () => {
    const vals = CANVAS_SHAPES.map((o) => o.v);
    for (const s of ["clip", "binder", "tape", "note", "badge", "barcode"]) expect(vals).toContain(s);
    const b = norm({ id: "c5", type: "canvas", items: [{ kind: "shape", shape: "binder" }] });
    expect(b.items[0].shape).toBe("binder");
  });

  it("แกลเลอรีแบบแฟ้มยังได้ช่องหน้าตาแฟ้มครบหลังย้ายไปของกลาง (folderLookFields)", () => {
    const g = SECTION_SCHEMAS.gallery.fields.map((x) => x.key);
    for (const k of ["folderDir", "folderMedia", "folderShape", "folderPos", "folderTex", "folderShadow", "folderRadius", "folderPal", "folderHex", "folderLabel", "folderPeek", "folderLift", "folderCover", "coverTitle", "coverLogo"]) expect(g).toContain(k);
  });
});
