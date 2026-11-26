import { describe, expect, it } from "vitest";
import {
  LABEL_PAPERS, alreadyPrinted, chunk, fitPage, labelFailureText, labelPaperOf, labelSourceSupported, mmToPt, paperSlots, printedText,
} from "@/lib/shipping-label";
import { shopeeDocCreateOf, shopeeDocOrderList, shopeeDocParamsOf, shopeeDocResultOf, shopeePickDocType, isPdfBytes } from "@/lib/shopee";

describe("shipping-label rules", () => {
  it("supports only registered sources", () => {
    expect(labelSourceSupported("shopee_api")).toBe(true);
    expect(labelSourceSupported("email")).toBe(false);
    expect(labelSourceSupported(null)).toBe(false);
  });

  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("translates Shopee errors into Thai with a next step", () => {
    expect(labelFailureText("no_tracking")).toMatch(/นัดส่ง/);
    expect(labelFailureText("logistics.can_not_print_combine_order")).toMatch(/Seller Centre/);
    expect(labelFailureText("logistics.error_param", "The order is being allocated, please wait")).toMatch(/รอ/);
    expect(labelFailureText("logistics.order_status_error")).toMatch(/สถานะ/);
    expect(labelFailureText("token", "กุญแจหมด")).toBe("กุญแจหมด");
    expect(labelFailureText("", "")).toBe("ดึงใบปะหน้าไม่สำเร็จ");
  });

  it("default paper is the shop's 9x15 sticker", () => {
    expect(labelPaperOf(undefined).code).toBe("s90x150");
    expect(labelPaperOf("a4x4").perPage).toBe(4);
    expect(LABEL_PAPERS.some((p) => p.code === "original")).toBe(true);
  });

  it("A4 4-up gives 4 slots top-left first", () => {
    const s = paperSlots(labelPaperOf("a4x4"));
    expect(s).toHaveLength(4);
    expect(s[0].y).toBeGreaterThan(s[2].y);
    expect(s[1].x).toBeGreaterThan(s[0].x);
  });

  it("fits a 100x150 label onto 90x150 by shrinking (no rotation)", () => {
    const box = paperSlots(labelPaperOf("s90x150"))[0];
    const f = fitPage(mmToPt(100), mmToPt(150), box);
    expect(f.rotate).toBe(0);
    expect(f.scale).toBeCloseTo(0.9, 2);
    expect(f.x).toBeGreaterThan(-0.01);   // ชิดซ้าย (ทศนิยมคลาดเล็กน้อยได้)
  });

  it("rotates a landscape page onto a portrait sticker when bigger", () => {
    const box = paperSlots(labelPaperOf("s100x150"))[0];
    const f = fitPage(mmToPt(150), mmToPt(100), box);
    expect(f.rotate).toBe(90);
    expect(f.scale).toBeCloseTo(1, 2);
    expect(f.x).toBeCloseTo(box.w, 0);   // หมุนรอบมุมล่างซ้าย → x = ขอบขวา
  });

  it("lists already printed rows newest first + text", () => {
    const rows = [
      { id: "a", order_no: "A", supported: true, reason: null, printed: { n: 1, last: "2026-11-25T09:00:00Z", by: "สมใจ" } },
      { id: "b", order_no: "B", supported: true, reason: null, printed: null },
      { id: "c", order_no: "C", supported: true, reason: null, printed: { n: 2, last: "2026-11-26T09:00:00Z", by: null } },
      { id: "d", order_no: "D", supported: false, reason: "x", printed: { n: 1, last: "2026-11-26T10:00:00Z", by: null } },
    ];
    expect(alreadyPrinted(rows).map((r) => r.id)).toEqual(["c", "a"]);
    expect(printedText(rows[0].printed!)).toMatch(/โดย สมใจ/);
    expect(printedText(rows[2].printed!)).toMatch(/2 ครั้ง/);
  });
});

describe("shopee shipping document parsers", () => {
  it("prefers thermal waybill", () => {
    expect(shopeePickDocType("NORMAL_AIR_WAYBILL", ["NORMAL_AIR_WAYBILL", "THERMAL_AIR_WAYBILL"])).toBe("THERMAL_AIR_WAYBILL");
    expect(shopeePickDocType("NORMAL_AIR_WAYBILL", ["NORMAL_AIR_WAYBILL"])).toBe("NORMAL_AIR_WAYBILL");
    expect(shopeePickDocType(null, [])).toBe("THERMAL_AIR_WAYBILL");
  });

  it("never sends an empty package_number", () => {
    expect(shopeeDocOrderList([{ order_sn: "X", package_number: "" }, { order_sn: "Y", package_number: "9" }])).toEqual([{ order_sn: "X" }, { order_sn: "Y", package_number: "9" }]);
  });

  it("reads parameter / create / result responses", () => {
    expect(shopeeDocParamsOf({ response: { result_list: [{ order_sn: "A", suggest_shipping_document_type: "NORMAL_AIR_WAYBILL", selectable_shipping_document_type: ["THERMAL_AIR_WAYBILL"] }, { order_sn: "B", fail_error: "logistics.order_status_error", fail_message: "no" }] } }))
      .toEqual([
        { order_sn: "A", package_number: null, fail_error: null, fail_message: null, doc_type: "THERMAL_AIR_WAYBILL" },
        { order_sn: "B", package_number: null, fail_error: "logistics.order_status_error", fail_message: "no", doc_type: "THERMAL_AIR_WAYBILL" },
      ]);
    expect(shopeeDocCreateOf({ response: { result_list: [{ order_sn: "A" }] } })).toEqual([{ order_sn: "A", package_number: null, fail_error: null, fail_message: null }]);
    expect(shopeeDocResultOf({ response: { result_list: [{ order_sn: "A", status: "READY" }, { order_sn: "B", fail_error: "x" }] } }).map((r) => r.status)).toEqual(["READY", "FAILED"]);
  });

  it("detects PDF bytes", () => {
    expect(isPdfBytes(new TextEncoder().encode("%PDF-1.4"))).toBe(true);
    expect(isPdfBytes(new TextEncoder().encode("{\"error\":1}"))).toBe(false);
  });
});
