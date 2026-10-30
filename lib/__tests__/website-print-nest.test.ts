import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderPrintPiece } from "@/lib/website-print-nest";
import { normalizePrintZone, type PrintPlacement } from "@/lib/website-print-design";

/** ภาพสีแดงทึบ (กว้าง × สูง) */
const solid = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#ff0000" } }).png().toBuffer();
const alphaAt = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
};
const place = (p: Partial<PrintPlacement>): PrintPlacement => ({ zone: "z", kind: "upload", name: "ลาย", x: 5, y: 5, w: 10, h: 10, rot: 0, ...p });

describe("ไฟล์พิมพ์ตัดตามทรง (sharp)", () => {
  it("วงกลม: มุมลายโปร่งใส กลางลายทึบ · ขนาดเท่าไฟล์เดิม", async () => {
    const zone = normalizePrintZone({ id: "z", shape: "ellipse", widthCm: 10, heightCm: 10 }, 0);
    const { png, cut } = await renderPrintPiece(await solid(400, 400), place({}), zone);
    expect(cut).toBe(true);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([400, 400, "png"]);
    expect(await alphaAt(png, 2, 2)).toBe(0);
    expect(await alphaAt(png, 200, 200)).toBe(255);
  });
  it("สี่เหลี่ยม = ไม่ตัด (ทึบทั้งภาพ)", async () => {
    const zone = normalizePrintZone({ id: "z", shape: "rect", widthCm: 10, heightCm: 10 }, 0);
    const { png, cut } = await renderPrintPiece(await solid(300, 150), place({ w: 8, h: 4 }), zone);
    expect(cut).toBe(false);
    expect(await alphaAt(png, 1, 1)).toBe(255);
  });
  it("ย่อไม่เกิน 600 DPI ที่ขนาดพิมพ์จริง", async () => {
    const zone = normalizePrintZone({ id: "z", shape: "rect", widthCm: 10, heightCm: 10 }, 0);
    // กว้าง 2.54 ซม. → 600 px สูงสุด
    const { png } = await renderPrintPiece(await solid(2000, 1000), place({ w: 2.54, h: 1.27, x: 5, y: 5 }), zone);
    expect((await sharp(png).metadata()).width).toBe(600);
  });
});
