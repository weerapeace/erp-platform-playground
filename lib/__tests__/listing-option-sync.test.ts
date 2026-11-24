import { describe, expect, test } from "vitest";
import { sizePricesForNewColor, sizeSkusForNewColor, skuMatchesSys, sysOptionName, sysVariantOfOption, sysVariantsNotOnShop, type SysVariantView } from "@/lib/listing-option-sync";

const SV = (code: string, name: string, active = true): SysVariantView => ({ code, values: [name], price: 390, image: `r2:${code}.jpg`, stock: 3, active });

describe("ตัวเลือกบนร้าน ↔ สีในระบบ (2026-11-24)", () => {
  test("จับคู่รหัส: ตรงตัว / ต่อท้ายด้วยไซซ์ / ชุด A+B · ห้ามจับ 01 กับ 010", () => {
    expect(skuMatchesSys("PIX23-05", "pix23-05")).toBe(true);
    expect(skuMatchesSys("MCT13-02L", "MCT13-02")).toBe(true);
    expect(skuMatchesSys("WK46-01D/3", "WK46-01D")).toBe(true);
    expect(skuMatchesSys("CVRB001-01+BSAC001-01", "CVRB001-01")).toBe(true);
    expect(skuMatchesSys("PIX23-010", "PIX23-01")).toBe(false);
    expect(skuMatchesSys(null, "X")).toBe(false);
  });
  test("สีในระบบที่ยังไม่อยู่บนร้าน (เฉพาะที่เปิดใช้)", () => {
    const sys = [SV("CVR001-01", "ดำ (01)"), SV("CVR001-05", "แดง (05)"), SV("CVR001-09", "ทอง (09)", false)];
    expect(sysVariantsNotOnShop(["CVR001-05"], sys).map((v) => v.code)).toEqual(["CVR001-01"]);
  });
  test("ตัวเลือกบนร้าน → สีในระบบ (รหัสยาวสุดชนะ) · ชื่อตามระบบ", () => {
    const sys = [SV("WK46-01", "ดำ"), SV("WK46-01D", "ดำ ลายจุด")];
    const models = [{ sku: "WK46-01D/3", tierIndex: [0, 0] }, { sku: "WK46-01D/4", tierIndex: [0, 1] }];
    expect(sysVariantOfOption(models, 0, sys)?.code).toBe("WK46-01D");
    expect(sysVariantOfOption(models, 1, sys)).toBeNull();
    expect(sysOptionName(sys[1])).toBe("ดำ ลายจุด");
    expect(sysOptionName({ values: ["  ม่วง   (05) "] })).toBe("ม่วง (05)");
  });
  test("สี×ไซซ์: รหัสต่อไซซ์ของสีใหม่ตามแบบแผนสีเดิม · ราคาที่พบบ่อยของไซซ์นั้น", () => {
    const sys = [SV("MCT13-02", "ขาว"), SV("MCT13-03", "แดง"), SV("MCT13-07", "ฟ้า")];
    const models = [
      { sku: "MCT13-02S", tierIndex: [0, 0], originalPrice: 390 }, { sku: "MCT13-02M", tierIndex: [0, 1], originalPrice: 390 },
      { sku: "MCT13-03S", tierIndex: [1, 0], originalPrice: 390 }, { sku: "MCT13-03M", tierIndex: [1, 1], originalPrice: 420 }, { sku: "MCT13-03XL", tierIndex: [1, 1], originalPrice: 420 },
    ];
    expect(sizeSkusForNewColor(models, sys, "MCT13-07", 3)).toEqual(["MCT13-07S", "MCT13-07M", null]);
    expect(sizePricesForNewColor(models, 3, 399)).toEqual([390, 420, 399]);
  });
});
