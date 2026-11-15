/**
 * กันของซ้ำ — แผงผ้า (Swatch) มีของกลางชุดเดียว: components/sku-swatch-browser
 * (เจ้าของสั่ง 2026-11-15: "ถ้าอันไหนมี search มาที่ swatch ให้ใช้ที่เราปรับ (เป็นของกลาง)")
 *   ค้น / เลือก / ดู / ติดแท็กแผงผ้า → ใช้ SwatchBrowser (onPickSpot / onPickSkus) · SwatchTagModal · saveSwatchTags
 *   ห้ามหน้าอื่นยิง /api/sku-swatches เองแล้วทำรายการแผงของตัวเอง (เคยมี 2 จุด: ช่องสีในใบงานออกแบบ · ป๊อปติดแท็กของ Design Library)
 * เทสต์นี้ไม่ผ่าน = มีไฟล์ใหม่เรียก API แผงผ้าตรง → ย้ายไปใช้ของกลาง หรือเพิ่มความสามารถให้ของกลาง (ห้ามเพิ่มไฟล์ใน ALLOWED เพื่อให้ผ่านเฉย ๆ)
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SHARED_PARTS } from "@/lib/shared-parts-registry";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "lib", "components"];
const SKIP = /[\\/](node_modules|__tests__|\.next)[\\/]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p + path.sep)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

/** ที่อนุญาตให้เรียก API แผงผ้าตรง */
const ALLOWED: RegExp[] = [
  /^app\/api\/sku-swatches\//,          // ตัว API เอง
  /^components\/sku-swatch-browser\//,  // ของกลาง
  /^components\/sku-swatch-links\//,    // หน้า SKU: "SKU นี้อยู่บนแผ่นไหน" (?sku_id= ย้อนกลับ ไม่ใช่รายการแผง)
  /^lib\/paid-services\.ts$/,           // ทะเบียนบริการเสียเงิน (อ้างชื่อไฟล์ AI อ่านแผง)
];
/** สตริง URL ที่ขึ้นต้นด้วย /api/sku-swatches (import type จาก "@/app/api/sku-swatches/route" ไม่นับ) */
const CALL = /["'`]\/api\/sku-swatches/;

describe("แผงผ้า (Swatch) — ใช้ของกลางชุดเดียว", () => {
  it("ไม่มีหน้าไหนยิง /api/sku-swatches เอง นอกจากของกลาง", () => {
    const bad = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
      .map((p) => ({ file: rel(p), src: fs.readFileSync(p, "utf8") }))
      .filter((f) => CALL.test(f.src) && !ALLOWED.some((re) => re.test(f.file)))
      .map((f) => f.file);
    expect(bad, `ไฟล์เหล่านี้ยิง API แผงผ้าเอง — ใช้ SwatchBrowser (onPickSpot/onPickSkus) · SwatchTagModal · saveSwatchTags จาก components/sku-swatch-browser แทน:\n${bad.join("\n")}`).toEqual([]);
  });

  it("ทะเบียนของกลางมีแผงผ้า + บอกว่าห้ามทำรายการแผงเอง", () => {
    const part = SHARED_PARTS.find((p) => p.key === "sku-swatch-browser");
    expect(part, "ต้องมี sku-swatch-browser ใน lib/shared-parts-registry.ts").toBeDefined();
    expect(part!.notWhen ?? "", "notWhen ต้องบอกว่าห้ามยิง /api/sku-swatches ทำรายการแผงเอง").toMatch(/sku-swatches/);
  });

  it("Design Library ป๊อปติดแท็กแผง = ส่งต่อของกลาง (ไม่ทำรายการเอง)", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/design-library/board-tag.tsx"), "utf8");
    expect(src).toMatch(/sku-swatch-browser\/tag-modal/);
  });
});

describe("สแกน QR ป้ายแผงผ้า", () => {
  it("รหัสแผ่น / ชิ้น / ลิงก์ /s/ อ่านเป็นแผงผ้า", async () => {
    const { parseScanned, scanPath } = await import("@/lib/scan-code");
    expect(parseScanned("SW-0001").kind).toBe("swatch");
    expect(parseScanned("sw-0002-14").kind).toBe("swatch");
    expect(parseScanned("https://erp.example.com/s/SW-0003").kind).toBe("swatch");
    expect(scanPath("SW-0001")).toBe("/s/SW-0001");
    expect(parseScanned("PO-2026-00070").kind).toBe("po");   // ของเดิมไม่เพี้ยน
  });
});
