import { describe, expect, it } from "vitest";
import {
  canMoveCase,
  cleanOrderNo,
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

  it("ตัวช่วยเลขออเดอร์และเงิน", () => {
    expect(cleanOrderNo(" 261012E4MRM7B5  พิมพ์ตรงกลางด้านใน")).toBe("261012E4MRM7B5");
    expect(parseMoney("1,235")).toBe(1235);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
  });
});
