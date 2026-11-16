import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/image-resize", () => ({ downscaleImageWidth: vi.fn(async (f: File) => f) }));

import { attachCard, cardSha, cardTitle, realSize, renameByCard, rowsWithoutCard, targetReady } from "../artwork-card";
import type { NestingItem } from "../data";
import type { FileInfo } from "../nest-utils";

const row = (key: string, p: Partial<NestingItem> = {}): NestingItem => ({
  key, asset_id: null, title: key, size: { mode: "natural", value: null }, qty: 1, fill_pct: 0, file: { name: `${key}.png`, sha: `sha${key}`.padEnd(16, "0") }, ...p,
});
const piece = (key: string, sha: string, index: number): NestingItem => row(key, {
  title: `ดอกไม้ · ${index + 1}`, file: { name: `${key}.png`, sha: `${key}`.padEnd(16, "1") },
  piece: { gap_mm: 2, joins: [], source: { name: "flower.png", sha }, index, count: 2, parent: { title: "ดอกไม้", size: { mode: "natural", value: null }, qty: 1 } },
});

describe("artwork-card", () => {
  it("แบรนด์+ชนิดต้องครบถึงสร้างการ์ดได้", () => {
    expect(targetReady({ brandId: "", types: ["ลายพิมพ์"] })).toBe(false);
    expect(targetReady({ brandId: "b1", types: [] })).toBe(false);
    expect(targetReady({ brandId: "b1", types: ["ลายพิมพ์"] })).toBe(true);
  });

  it("ชิ้นที่แยก = การ์ดของภาพต้นฉบับ (sha ต้นฉบับ + ชื่อภาพเต็ม)", () => {
    const p = piece("p1", "f".repeat(16), 0);
    expect(cardSha(p)).toBe("f".repeat(16));
    expect(cardTitle(p)).toBe("ดอกไม้");
  });

  it("แถวที่ยังไม่มีการ์ด กลุ่มตามไฟล์ (ภาพเดียว = การ์ดเดียว) · แถวที่มีการ์ด/ไม่มีไฟล์ ไม่นับ", () => {
    const src = "f".repeat(16);
    const items = [row("a"), row("b", { asset_id: "x" }), row("c", { file: null }), piece("p1", src, 0), piece("p2", src, 1)];
    const g = rowsWithoutCard(items);
    expect(g.map((x) => x.keys)).toEqual([["a"], ["p1", "p2"]]);
  });

  it("ใส่การ์ดให้ทุกแถวของไฟล์เดียวกัน ไม่แตะแถวที่มีการ์ดอยู่แล้ว", () => {
    const src = "f".repeat(16);
    const items = [piece("p1", src, 0), piece("p2", src, 1), row("z", { asset_id: "old" })];
    const out = attachCard(items, src, "new");
    expect(out.map((x) => x.asset_id)).toEqual(["new", "new", "old"]);
    expect(attachCard(out, src, "again")).toBe(out);   // ไม่มีอะไรเปลี่ยน = อ้างอิงเดิม
  });

  it("ชื่อการ์ดเปลี่ยน → ชื่อแถวตาม (ชิ้น = ชื่อ · ลำดับ + ชื่อตอนรวมกลับ)", () => {
    const src = "f".repeat(16);
    const items = attachCard([piece("p1", src, 0), piece("p2", src, 1), row("a", { asset_id: "other" })], src, "card");
    const out = renameByCard(items, "card", "  ดอกไม้ใหม่ ");
    expect(out.map((x) => x.title)).toEqual(["ดอกไม้ใหม่ · 1", "ดอกไม้ใหม่ · 2", "a"]);
    expect(out[0].piece?.parent.title).toBe("ดอกไม้ใหม่");
    expect(renameByCard(out, "card", "")).toBe(out);   // ชื่อว่าง = ไม่แตะ
  });

  it("ขนาดจริงจาก DPI (ส่วนที่มีภาพ) เป็น cm", () => {
    // 1037×647 px ที่ 300 dpi = 8.78 × 5.48 cm (ตัวอย่างในหน้าจริง)
    const info: FileInfo = { sha: "a".repeat(16), canvas_px: [1037, 647], dpi: [300, 300], trim_box: [0, 0, 1037, 647] };
    expect(realSize(info, "ขนาดจริง")).toEqual({ label: "ขนาดจริง", w: 8.78, h: 5.48, unit: "cm" });
    expect(realSize({ ...info, error: "bad" }, "x")).toBeNull();
    expect(realSize(undefined, "x")).toBeNull();
  });
});
