import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRINT_DESIGN,
  fitPlacement,
  normalizePlacements,
  normalizePrintDesign,
  normRot,
  printDesignExtra,
  printDesignUsable,
  printLineSuffix,
  printQuality,
  printTierOf,
  splitPrintLine,
  type PrintDesignConfig,
  type PrintLibLookup,
} from "@/lib/website-print-design";

const cfg: PrintDesignConfig = normalizePrintDesign({
  enabled: true,
  method: "DTF",
  prices: { S: 40, M: 70, L: 110 },
  maxPerZone: 2,
  allowUpload: true,
  library: [{ collectionId: "col-1", label: "ดอกไม้", extra: 20 }],
  zones: [
    { id: "front", label: "ตัวกระเป๋า", x: 10, y: 20, w: 80, h: 50, widthCm: 26, heightCm: 15 },
    { id: "pocket", label: "ช่องหน้า", x: 40, y: 40, w: 20, h: 20, widthCm: 9, heightCm: 9 },
  ],
});
const lib: PrintLibLookup = (id) => (id === "a1" ? { ar: 1, extra: 20, name: "ดอกไม้ชมพู" } : id === "a2" ? { ar: 0.5, extra: 0, name: "รุ้ง" } : id === "a3" ? { ar: null, extra: 0, name: "ไม่มีขนาด" } : null);
const uploadOk = (p: string) => p.startsWith("shop-1/");

describe("normalizePrintDesign", () => {
  it("ค่าว่าง = ปิด + ค่าเริ่ม", () => {
    expect(normalizePrintDesign(null)).toEqual(DEFAULT_PRINT_DESIGN);
    expect(printDesignUsable(normalizePrintDesign(null))).toBe(false);
  });
  it("ตัดค่าเกินขอบ + id ซ้ำ + ชุดลายซ้ำ", () => {
    const c = normalizePrintDesign({
      enabled: true,
      method: "XX",
      prices: { S: -5, M: "80", L: null },
      maxPerZone: 99,
      zones: [{ id: "A b!", x: 95, w: 50, widthCm: 500 }, { id: "ab" }],
      library: [{ collectionId: "c" }, { collectionId: "c" }],
    });
    expect(c.method).toBe("DTF");
    expect(c.prices).toEqual({ S: 0, M: 80, L: 110 });
    expect(c.maxPerZone).toBe(12);
    expect(c.zones[0].id).toBe("ab");
    expect(c.zones[0].w).toBe(5);
    expect(c.zones[0].widthCm).toBe(120);
    expect(c.zones[1].id).toBe("ab-2");
    expect(c.library).toHaveLength(1);
  });
  it("ใช้งานได้เมื่อเปิด + มีส่วนพิมพ์ + มีทางเพิ่มลาย", () => {
    expect(printDesignUsable(cfg)).toBe(true);
    expect(printDesignUsable({ ...cfg, allowUpload: false, library: [] })).toBe(false);
    expect(printDesignUsable({ ...cfg, zones: [] })).toBe(false);
  });
});

describe("ขนาด / ความชัด / หมุน", () => {
  it("ขนาดตามด้านยาวสุด", () => {
    expect(printTierOf(8, 3)).toBe("S");
    expect(printTierOf(5, 8.01)).toBe("M");
    expect(printTierOf(15, 15)).toBe("M");
    expect(printTierOf(15.1, 2)).toBe("L");
  });
  it("DPI ตามขนาดที่วางจริง", () => {
    expect(printQuality(1800, 15)).toMatchObject({ level: "ok", dpi: 305 });
    expect(printQuality(1000, 15).level).toBe("warn");
    expect(printQuality(220, 5)).toMatchObject({ level: "bad", dpi: 112, goodCm: 2.2 });
  });
  it("normRot", () => {
    expect(normRot(190)).toBe(-170);
    expect(normRot(-181)).toBe(179);
    expect(normRot(360)).toBe(0);
  });
  it("fitPlacement ย่อ + เลื่อนให้อยู่ในพื้นที่ (คิดกรอบหลังหมุน)", () => {
    const z = { widthCm: 9, heightCm: 9 };
    const big = fitPlacement({ x: 0, y: 0, w: 20, h: 10, rot: 0 }, z);
    expect(big.w).toBe(9);
    expect(big.h).toBe(4.5);
    expect(big.x).toBe(4.5);
    expect(big.y).toBe(2.25);
    const rot = fitPlacement({ x: 9, y: 9, w: 9, h: 9, rot: 45 }, z);
    expect(rot.w).toBeCloseTo(6.36, 1);
    expect(rot.x).toBeCloseTo(4.5, 1);
    const tiny = fitPlacement({ x: 4, y: 4, w: 0.2, h: 0.4, rot: 0 }, z);
    expect(tiny.h).toBe(1.5);
    expect(tiny.w).toBe(0.75);
  });
});

describe("normalizePlacements", () => {
  it("ลายคลัง + รูปลูกค้า → สัดส่วนจากไฟล์จริง + จัดในพื้นที่", () => {
    const r = normalizePlacements(
      [
        { zone: "front", kind: "lib", assetId: "a2", x: 13, y: 7, w: 10, h: 99, rot: 370 },
        { zone: "pocket", kind: "upload", name: "หมา", upload: { path: "shop-1/x.jpg", w: 2000, h: 1000, alpha: false }, x: 50, y: 50, w: 20 },
      ],
      cfg,
      { lib, uploadOk },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.placements[0]).toMatchObject({ kind: "lib", assetId: "a2", name: "รุ้ง", w: 10, h: 5, rot: 10 });
    expect(r.placements[1]).toMatchObject({ kind: "upload", w: 9, h: 4.5, x: 4.5, y: 6.75 });
    expect(r.placements[1].upload).toEqual({ path: "shop-1/x.jpg", w: 2000, h: 1000, alpha: false });
  });
  it("ปฏิเสธ: ลายที่ร้านไม่ได้เปิด · ไฟล์ร้านอื่น · ส่วนพิมพ์ไม่มี · เกินจำนวน · ว่าง", () => {
    expect(normalizePlacements([{ zone: "front", kind: "lib", assetId: "zzz" }], cfg, { lib, uploadOk }).ok).toBe(false);
    expect(normalizePlacements([{ zone: "front", kind: "upload", upload: { path: "other/x.png", w: 10, h: 10 } }], cfg, { lib, uploadOk }).ok).toBe(false);
    expect(normalizePlacements([{ zone: "back", kind: "lib", assetId: "a1" }], cfg, { lib, uploadOk }).ok).toBe(false);
    const three = [1, 2, 3].map(() => ({ zone: "front", kind: "lib", assetId: "a1" }));
    expect(normalizePlacements(three, cfg, { lib, uploadOk })).toMatchObject({ ok: false, error: "ตัวกระเป๋า ใส่ได้สูงสุด 2 ลาย" });
    expect(normalizePlacements([], cfg, { lib, uploadOk }).ok).toBe(false);
  });
  it("ลายคลังที่ไม่มีขนาดรูป = ใช้สัดส่วนจากหน้าเว็บ (กันค่าแปลก)", () => {
    const r = normalizePlacements([{ zone: "front", kind: "lib", assetId: "a3", w: 4, h: 8 }, { zone: "front", kind: "lib", assetId: "a3", w: 4, h: 999 }], cfg, { lib, uploadOk });
    if (!r.ok) throw new Error(r.error);
    expect(r.placements[0]).toMatchObject({ w: 4, h: 8 });
    expect(r.placements[1].h / r.placements[1].w).toBeCloseTo(20, 0);
  });
  it("ร้านปิดอัปรูป = รับเฉพาะลายคลัง", () => {
    const r = normalizePlacements([{ zone: "front", kind: "upload", upload: { path: "shop-1/x.png", w: 10, h: 10 } }], { ...cfg, allowUpload: false }, { lib, uploadOk });
    expect(r).toMatchObject({ ok: false, error: "รุ่นนี้ไม่รับรูปที่อัปเอง" });
  });
});

describe("ราคา", () => {
  it("ราคาตามขนาด + ราคาเพิ่มของชุดลาย", () => {
    const r = normalizePlacements(
      [
        { zone: "pocket", kind: "lib", assetId: "a1", w: 5 },
        { zone: "front", kind: "lib", assetId: "a2", w: 12 },
        { zone: "front", kind: "upload", upload: { path: "shop-1/a.png", w: 3000, h: 3000 }, w: 15 },
      ],
      cfg,
      { lib, uploadOk },
    );
    if (!r.ok) throw new Error(r.error);
    // ดอกไม้ 5 ซม. = S 40 + 20 · รุ้ง 12 ซม. = M 70 · รูปลูกค้า 15 ซม. = M 70 (ตัวกระเป๋าสูง 15 → ไม่ย่อ)
    expect(printDesignExtra(cfg, r.placements, lib)).toBe(200);
  });
});

describe("รหัสบรรทัดตะกร้า", () => {
  const id = "0f8a3b2c-1111-4222-8333-444455556666";
  it("ต่อท้าย + แยกกลับ (คงส่วนหน้าไว้ทั้งปั๊มชื่อ)", () => {
    const line = `sku-1234abcd#pz:emboss:center:AB${printLineSuffix(id, 199.6, 3)}`;
    expect(splitPrintLine(line)).toEqual({ rest: "sku-1234abcd#pz:emboss:center:AB", design: { id, extra: 200, count: 3 } });
    expect(splitPrintLine("sku-1")).toEqual({ rest: "sku-1", design: null });
    expect(splitPrintLine("sku-1#pd:nope:1:1").design).toBeNull();
  });
});
