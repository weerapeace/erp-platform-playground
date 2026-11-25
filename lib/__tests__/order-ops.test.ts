import { describe, expect, it } from "vitest";
import {
  canMoveCase,
  choiceGroups,
  cleanCommandDetails,
  commandBoxOf,
  commandSummary,
  engraveOfOrder,
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

describe("engraveOfOrder — สินค้าสลักชื่อในออเดอร์", () => {
  const modes = { pReq: "required", pOpt: "optional", pNone: "none" } as const;
  it("รหัสท้าย SKU = งานสลัก + ถอดรูปแบบ/ตำแหน่ง · ไม่มีหมายเหตุ = เตือน", () => {
    const r = engraveOfOrder({ items: [{ sku_code: "TTM130-01D/1" }], modes, note: null, noteEngrave: false, status: "new" });
    expect(r.engrave).toBe(true);
    expect(r.sources).toEqual(["sku_code"]);
    expect(r.items[0].decoded?.type).toBe("พิมพ์จม");
    expect(r.needsName).toBe(true);
  });
  it("รุ่นต้องสลักทุกชิ้น = งานสลักเสมอ · มีหมายเหตุ = ไม่เตือน", () => {
    expect(engraveOfOrder({ items: [{ sku_code: "WK45-01", parent_id: "pReq" }], modes, note: null, noteEngrave: false }).needsName).toBe(true);
    const r = engraveOfOrder({ items: [{ sku_code: "WK45-01", parent_id: "pReq" }], modes, note: "Pasit", noteEngrave: true });
    expect(r.engrave).toBe(true);
    expect(r.needsName).toBe(false);
  });
  it("รุ่นสลักได้ไม่บังคับ: ไม่มีรหัสท้าย/หมายเหตุ = ไม่ใช่งานสลัก · หมายเหตุบอกสลัก = งานสลัก ไม่เตือน", () => {
    const a = engraveOfOrder({ items: [{ sku_code: "WK41-01", parent_id: "pOpt" }], modes, note: null, noteEngrave: false });
    expect(a.engrave).toBe(false);
    expect(a.hasOptional).toBe(true);
    const b = engraveOfOrder({ items: [{ sku_code: "WK41-01", parent_id: "pOpt" }], modes, note: "สลัก Lillyz", noteEngrave: true });
    expect(b.engrave).toBe(true);
    expect(b.items[0].engrave).toBe(true);
    expect(b.needsName).toBe(false);
  });
  it("ส่งแล้ว/ยกเลิกแล้ว = ไม่เตือน · สินค้าทั่วไปไม่มีหมายเหตุ = ไม่ใช่งานสลัก", () => {
    expect(engraveOfOrder({ items: [{ sku_code: "TTM130-01D/1" }], modes, note: "", noteEngrave: false, status: "shipped" }).needsName).toBe(false);
    expect(engraveOfOrder({ items: [{ sku_code: "TTM130-01D/1" }], modes, note: "", noteEngrave: false, status: "cancelled" }).needsName).toBe(false);
    expect(engraveOfOrder({ items: [{ sku_code: "BAG-01", parent_id: "pNone" }], modes, note: null, noteEngrave: false }).engrave).toBe(false);
  });
});

describe("กล่องตั้งค่าต่อคำสั่ง (2026-11-25)", () => {
  it("เดาชนิดกล่องจากชื่อคำสั่ง · ตั้งเองทับได้", () => {
    expect(commandBoxOf("ห่อ")).toBe("choice");
    expect(commandBoxOf("การ์ดแทรก")).toBe("choice");
    expect(commandBoxOf("ติดสติกเกอร์")).toBe("choice");
    expect(commandBoxOf("การ์ดของขวัญ")).toBe("card");
    expect(commandBoxOf("เปลี่ยนสินค้า")).toBe("swap");
    expect(commandBoxOf("อื่นๆ")).toBe("text");
    expect(commandBoxOf("ห่อ", "none")).toBe("none");
  });
  it("ตัวเลือกแยกกลุ่ม (ห่อ › กระดาษ/ริบบิ้น) · ซ่อนแล้วไม่โผล่ ยกเว้นค่าที่เลือกไว้", () => {
    const opts = [
      { kind: "command_choice", label: "คราฟท์", value: "ห่อ|กระดาษ", is_active: true },
      { kind: "command_choice", label: "แดง", value: "ห่อ|ริบบิ้น", is_active: true },
      { kind: "command_choice", label: "ทอง", value: "ห่อ|ริบบิ้น", is_active: false },
      { kind: "command_choice", label: "Thank you", value: "ติดสติกเกอร์", is_active: true },
    ];
    expect(choiceGroups(opts, "ห่อ")).toEqual([{ group: "กระดาษ", items: ["คราฟท์"] }, { group: "ริบบิ้น", items: ["แดง"] }]);
    expect(choiceGroups(opts, "ห่อ", { ริบบิ้น: "ทอง" })[1].items).toEqual(["แดง", "ทอง"]);
    expect(choiceGroups(opts, "ติดสติกเกอร์")).toEqual([{ group: "แบบ", items: ["Thank you"] }]);
  });
  it("ทำความสะอาดค่า: เก็บเฉพาะคำสั่งที่เลือก · ตัดค่าว่าง", () => {
    const d = cleanCommandDetails({ ห่อ: { choice: { กระดาษ: "คราฟท์", ริบบิ้น: "" } }, อื่นๆ: { text: "  " }, เปลี่ยนสินค้า: { sku_code: "WK41-03", sku_id: "x" } }, ["ห่อ", "อื่นๆ"]);
    expect(d).toEqual({ ห่อ: { choice: { กระดาษ: "คราฟท์" } } });
  });
  it("ข้อความสั้นของคำสั่ง", () => {
    expect(commandSummary("ห่อ", { choice: { กระดาษ: "คราฟท์", ริบบิ้น: "แดง" } })).toBe("ห่อ: คราฟท์ · แดง");
    expect(commandSummary("เปลี่ยนสินค้า", { sku_code: "WK41-03" })).toBe("เปลี่ยนสินค้า → WK41-03");
    expect(commandSummary("อื่นๆ", null)).toBe("อื่นๆ");
  });
});
