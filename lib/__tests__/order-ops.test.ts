import { describe, expect, it } from "vitest";
import {
  canMoveCase,
  cleanOrderNo,
  engraveTextError,
  guessEngraveFromNote,
  invalidEngraveChars,
  isCaseOpen,
  mapLegacyRepairStatus,
  mapLegacyReturnStatus,
  parseMoney,
  splitEngraveChars,
  splitLegacyCommand,
} from "../order-ops";

describe("order-ops", () => {
  it("แยกคำสั่งรวมของแอปเก่า", () => {
    expect(splitLegacyCommand("ห่อ + การ์ดธรรมดา + ตัดชื่อ")).toEqual(["ห่อ", "การ์ดธรรมดา", "ตัดชื่อ"]);
    expect(splitLegacyCommand("-")).toEqual([]);
    expect(splitLegacyCommand("")).toEqual([]);
  });

  it("แยกตัวอักษรสลักชื่อ นับอีโมจิเป็นตัวเดียว และไม่เกิน 20", () => {
    expect(splitEngraveChars("❤️DUKE❤️")).toEqual(["❤️", "D", "U", "K", "E", "❤️"]);
    expect(splitEngraveChars("a".repeat(30))).toHaveLength(20);
    expect(splitEngraveChars("  ")).toEqual([]);
  });

  it("เส้นทางสถานะซ่อม", () => {
    expect(canMoveCase("repair", "waiting_customer", "repairing")).toBe(true);
    expect(canMoveCase("repair", "waiting_customer", "shipped_back")).toBe(false);
    expect(canMoveCase("repair", "shipped_back", "ready_to_ship")).toBe(true);
    expect(canMoveCase("return", "received", "closed")).toBe(true);
    expect(canMoveCase("return", "closed", "received")).toBe(false);
  });

  it("งานค้าง", () => {
    expect(isCaseOpen("repair", "repairing")).toBe(true);
    expect(isCaseOpen("repair", "shipped_back")).toBe(false);
    expect(isCaseOpen("return", "closed")).toBe(false);
  });

  it("แปลงสถานะแอปเก่า", () => {
    expect(mapLegacyRepairStatus("ส่งคืนแล้ว").status).toBe("shipped_back");
    expect(mapLegacyRepairStatus("เปลี่ยนสินค้าชิ้นใหม่", true)).toEqual({ status: "ready_to_ship", resolution: "เปลี่ยนสินค้าชิ้นใหม่" });
    expect(mapLegacyRepairStatus("").status).toBe("waiting_customer");
    expect(mapLegacyReturnStatus("ส่งคืนแล้ว")).toBe("closed");
    expect(mapLegacyReturnStatus("", true)).toBe("checked");
  });

  it("ตัวอักษรสลักได้/ไม่ได้", () => {
    expect(invalidEngraveChars("Pitchs 01", [])).toEqual([]);
    expect(invalidEngraveChars("Pitchs ❤️ ไทย", ["&"])).toEqual(["❤️", "ไ", "ท", "ย"]);
    expect(invalidEngraveChars("A&B ♥", ["&", "♥"])).toEqual([]);
    expect(engraveTextError("", [])).toMatch(/กรุณาใส่/);
    expect(engraveTextError("a".repeat(21), [])).toMatch(/ยาวเกิน/);
    expect(engraveTextError("a".repeat(20), [])).toBeNull();
    expect(engraveTextError("é", [])).toMatch(/ทำไม่ได้/);
  });

  it("เดาชื่อสลักจากหมายเหตุ", () => {
    expect(guessEngraveFromNote("สลักชื่อ Thaninnut ฟอยทอง ห่อของขวัญด้วยค่ะ")).toEqual({ text: "Thaninnut", type: "ฟอยทอง", position: null });
    expect(guessEngraveFromNote("ชื่อ DUKE ตรงกลาง")).toEqual({ text: "DUKE", type: null, position: "ตรงกลาง" });
    expect(guessEngraveFromNote("ขอการ์ดวันเกิด").text).toBeNull();
    expect(guessEngraveFromNote(null).text).toBeNull();
    // หมายเหตุจริงจาก Shopee (2026-11-24)
    expect(guessEngraveFromNote("ปักชื่อ “ pattarawee ”").text).toBe("pattarawee");
    expect(guessEngraveFromNote("สีดำ—> Nick❤️ สีน้ำเงิน—> Nice❤️").text).toBe("Nick");
  });

  it("ตัวช่วยเลขออเดอร์และเงิน", () => {
    expect(cleanOrderNo(" 261012E4MRM7B5  พิมพ์ตรงกลางด้านใน")).toBe("261012E4MRM7B5");
    expect(parseMoney("1,235")).toBe(1235);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
  });
});

describe("ถอดรหัสท้าย SKU สลัก", () => {
  it("D/G/N + /1 /2", async () => {
    const { decodeEngraveSku, engraveSkuMaps } = await import("../order-ops");
    expect(decodeEngraveSku("WK45-05G/2")).toEqual({ type: "ฟอยทอง", position: "ตรงกลาง", typeCode: "G", posCode: "2" });
    expect(decodeEngraveSku("TTM130-01D/1")).toMatchObject({ type: "พิมพ์จม", position: "มุมขวา" });
    expect(decodeEngraveSku("WK41-03N/2")).toMatchObject({ type: "ฟอยเงิน", position: "ตรงกลาง" });
    expect(decodeEngraveSku("MGN236-01/1")).toBeNull();
    expect(decodeEngraveSku("TTM130-01")).toBeNull();
    expect(decodeEngraveSku(null)).toBeNull();
    const maps = engraveSkuMaps([{ kind: "engrave_sku_type", label: "s", value: "ฟอยเงิน", is_active: true }]);
    expect(decodeEngraveSku("X-01S/1", maps.types, maps.positions)).toMatchObject({ type: "ฟอยเงิน", position: "มุมขวา" });
  });
});
