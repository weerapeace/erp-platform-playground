import { describe, expect, it } from "vitest";
import {
  applyDueAt, countTargets, coverFromRaw, isApplyDue, isRevertDue, listingOnSale, nextCampaignStatus, restoreCover, sameImageRef, stillInReview, swapCover, checkReverted, isRevertCheckDue, validateCampaign,
  type CampaignTiming,
} from "@/lib/promo-cover";

const H = 3600_000;
const START = Date.parse("2026-12-12T00:00:00+07:00");
const END = Date.parse("2026-12-13T00:00:00+07:00");
const camp = (o: Partial<CampaignTiming> = {}): CampaignTiming => ({
  status: "scheduled", starts_at: new Date(START).toISOString(), ends_at: new Date(END).toISOString(), auto_revert: true, early_hours: 24,
  confirmed_at: new Date(START - 72 * H).toISOString(), revert_requested_at: null, deleted_at: null, ...o,
});

describe("เวลาส่ง (ข้อเสนอ 2: TikTok/Lazada ส่งล่วงหน้า)", () => {
  it("ร้านที่เปลี่ยนทันที ส่งตอนเริ่มโปร · TikTok/Lazada ส่งก่อน early_hours", () => {
    expect(applyDueAt(camp(), "shopee")).toBe(START);
    expect(applyDueAt(camp(), "website")).toBe(START);
    expect(applyDueAt(camp(), "tiktok")).toBe(START - 24 * H);
    expect(applyDueAt(camp({ early_hours: 6 }), "lazada")).toBe(START - 6 * H);
  });
  it("ร่าง = ไม่มีเวลาส่ง · ไม่ตั้งเวลาเริ่ม = เริ่มตอนยืนยัน", () => {
    expect(applyDueAt(camp({ status: "draft" }), "shopee")).toBeNull();
    const c = camp({ starts_at: null });
    expect(applyDueAt(c, "shopee")).toBe(Date.parse(c.confirmed_at!));
  });
  it("isApplyDue ตามเวลา และไม่ส่งเมื่อถึงเวลาย้อนแล้ว/ลบแล้ว", () => {
    expect(isApplyDue(camp(), "tiktok", START - 25 * H)).toBe(false);
    expect(isApplyDue(camp(), "tiktok", START - 23 * H)).toBe(true);
    expect(isApplyDue(camp(), "shopee", START - 23 * H)).toBe(false);
    expect(isApplyDue(camp(), "shopee", START + 1)).toBe(true);
    expect(isApplyDue(camp(), "shopee", END + 1)).toBe(false);
    expect(isApplyDue(camp({ deleted_at: new Date().toISOString() }), "shopee", START + 1)).toBe(false);
  });
});

describe("เวลาย้อน", () => {
  it("ย้อนอัตโนมัติเมื่อถึงเวลาจบ · ปิดย้อนอัตโนมัติ = ไม่ย้อนเอง · กดย้อนเอง = ย้อนทันที", () => {
    expect(isRevertDue(camp({ status: "live" }), END - 1)).toBe(false);
    expect(isRevertDue(camp({ status: "live" }), END)).toBe(true);
    expect(isRevertDue(camp({ status: "live", auto_revert: false }), END + H)).toBe(false);
    expect(isRevertDue(camp({ status: "live", auto_revert: false, revert_requested_at: new Date().toISOString() }), START)).toBe(true);
    expect(isRevertDue(camp({ status: "ended" }), END + H)).toBe(false);
  });
});

describe("แทนรูปแรก / ย้อนรูปแรก", () => {
  it("swapCover แทนเฉพาะรูปแรก", () => {
    expect(swapCover(["a", "b", "c"], "P")).toEqual(["P", "b", "c"]);
    expect(swapCover([], "P")).toEqual(["P"]);
  });
  it("ย้อนได้เมื่อรูปแรกยังเป็นปกโปร · เก็บรูปที่คนเพิ่มทีหลังไว้", () => {
    expect(restoreCover(["P", "b", "c", "new"], "P", "a")).toEqual({ ok: true, list: ["a", "b", "c", "new"], already: false });
  });
  it("มีคนเปลี่ยนปกเองระหว่างโปร = ไม่ย้อนทับ (force = ทับได้)", () => {
    const r = restoreCover(["X", "b"], "P", "a");
    expect(r.ok).toBe(false);
    expect(restoreCover(["X", "b"], "P", "a", { force: true })).toEqual({ ok: true, list: ["a", "b"], already: false });
  });
  it("ปกเดิมกลับมาแล้ว = ไม่ต้องส่ง · ไม่มีปกเดิม = ย้อนไม่ได้", () => {
    expect(restoreCover(["a", "b"], "P", "a")).toMatchObject({ ok: true, already: true });
    expect(restoreCover(["P"], "P", null).ok).toBe(false);
  });
  it("ไม่ใส่ปกเดิมซ้ำ ถ้าคนย้ายไปไว้รูปอื่น", () => {
    expect(restoreCover(["P", "a", "b"], "P", "a")).toEqual({ ok: true, list: ["a", "b"], already: false });
  });
  it("เทียบลิงก์รูปแบบไม่สน https/query/_tn", () => {
    expect(sameImageRef("https://cf.shopee.co.th/file/abc_tn", "http://cf.shopee.co.th/file/abc?x=1")).toBe(true);
    expect(sameImageRef("a", "")).toBe(false);
    expect(sameImageRef("https://sg-test-11.slatic.net/p/d7065a6a.jpg", "https://th-live-01.slatic.net/p/d7065a6a.jpg")).toBe(true);
    expect(sameImageRef("https://sg-test-11.slatic.net/p/d7065a6a.jpg", "https://img.lazcdn.com/g/p/d7065a6a.jpg_720x720q80.jpg")).toBe(true);
    expect(sameImageRef("https://th-live.slatic.net/p/aaa.jpg", "https://th-live.slatic.net/p/bbb.jpg")).toBe(false);
  });
});

describe("สินค้าบนร้านที่เปลี่ยนปก", () => {
  it("เฉพาะที่เปิดขาย", () => {
    expect(listingOnSale("shopee", "normal")).toBe(true);
    expect(listingOnSale("shopee", "unlist")).toBe(false);
    expect(listingOnSale("lazada", "inactive")).toBe(false);
    expect(listingOnSale("tiktok", "activate")).toBe(true);
    expect(listingOnSale("tiktok", "seller_deactivated")).toBe(false);
    expect(listingOnSale("line_shopping", null)).toBe(true);
    expect(listingOnSale("line_shopping", "removed")).toBe(false);
  });
  it("ปกเดิมจากสำเนาย่อ", () => {
    expect(coverFromRaw("shopee", { shopee: { image: "https://x/1" } })).toBe("https://x/1");
    expect(coverFromRaw("line_shopping", { line: { imageUrls: ["https://l/1", "https://l/2"] } })).toBe("https://l/1");
    expect(coverFromRaw("lazada", { lazada: { skus: [] } })).toBeNull();
  });
});

describe("ตรวจค่า + สถานะชุด", () => {
  const base = { name: "12.12", starts_at: "2026-12-12T00:00:00+07:00", ends_at: "2026-12-13T00:00:00+07:00", auto_revert: true, early_hours: 24, platforms: ["shopee"] };
  it("ตรวจค่าเวลา/ร้าน", () => {
    expect(validateCampaign(base)).toEqual([]);
    expect(validateCampaign({ ...base, ends_at: base.starts_at })).toContain("เวลาจบต้องหลังเวลาเริ่ม");
    expect(validateCampaign({ ...base, platforms: [] }, { forConfirm: true, now: START - H })).toContain("เลือกร้านอย่างน้อย 1 ร้าน");
    expect(validateCampaign({ ...base, ends_at: null }, { forConfirm: true })).toContain("ตั้งให้ย้อนอัตโนมัติ ต้องใส่เวลาจบโปร");
    expect(validateCampaign({ ...base, platforms: ["meta"] })).toContain("มีร้านที่ระบบไม่รู้จัก");
  });
  it("สถานะชุดตามผลรายร้าน", () => {
    expect(nextCampaignStatus(camp(), [{ status: "pending" }], START - H)).toBe("scheduled");
    expect(nextCampaignStatus(camp(), [{ status: "applied" }, { status: "pending" }], START + H)).toBe("live");
    expect(nextCampaignStatus(camp({ status: "live" }), [{ status: "reverted" }, { status: "conflict" }, { status: "skipped" }], END + H)).toBe("ended");
    expect(nextCampaignStatus(camp({ status: "live" }), [{ status: "reverted" }, { status: "applied" }], END + H)).toBe("live");
    expect(countTargets([{ status: "applied" }, { status: "applied" }, { status: "failed" }])).toMatchObject({ total: 3, applied: 2, failed: 1 });
  });

  it("ย้อนตอนร้านยังตรวจไม่เสร็จ = รอก่อน (ไม่ถือว่าย้อนแล้ว)", () => {
    expect(stillInReview("review", "https://th-live.slatic.net/p/old.jpg", "https://sg-test-11.slatic.net/p/promo.jpg", "https://th-live-01.slatic.net/p/old.jpg")).toBe(true);
    expect(stillInReview("review", "https://th-live.slatic.net/p/promo.jpg", "https://sg-test-11.slatic.net/p/promo.jpg", "https://th-live.slatic.net/p/old.jpg")).toBe(false);
    expect(stillInReview("applied", "old", "promo", "old")).toBe(false);
    expect(stillInReview("review", "other", "promo", "old")).toBe(false);
  });

  it("เช็กซ้ำหลังย้อน: เวลาที่ต้องรอรายร้าน", () => {
    const now = Date.parse("2026-11-21T12:00:00Z");
    expect(isRevertCheckDue("tiktok", "2026-11-21T10:30:00Z", now)).toBe(true);
    expect(isRevertCheckDue("tiktok", "2026-11-21T11:30:00Z", now)).toBe(false);
    expect(isRevertCheckDue("lazada", "2026-11-21T00:00:00Z", now)).toBe(false);
    expect(isRevertCheckDue("lazada", "2026-11-20T11:00:00Z", now)).toBe(true);
    expect(isRevertCheckDue("shopee", "2026-11-01T00:00:00Z", now)).toBe(false);
  });

  it("เช็กซ้ำหลังย้อน: ผลบนร้าน", () => {
    const base = { original: "old", applied: "promo", revertedAt: "2026-11-21T00:00:00Z", now: Date.parse("2026-11-21T12:00:00Z"), same: (a: string, b: string) => a === b };
    expect(checkReverted({ ...base, current: "old", reviewing: false, rejected: [] }).verdict).toBe("ok");
    expect(checkReverted({ ...base, current: "promo", reviewing: true, rejected: [] }).verdict).toBe("wait");
    expect(checkReverted({ ...base, current: "promo", reviewing: false, rejected: [] }).verdict).toBe("stuck");
    expect(checkReverted({ ...base, current: "old", reviewing: false, rejected: ["รูปไม่ชัด"] }).verdict).toBe("stuck");
    expect(checkReverted({ ...base, current: "someone", reviewing: false, rejected: [] }).verdict).toBe("changed");
    expect(checkReverted({ ...base, now: Date.parse("2026-11-25T00:00:00Z"), current: "promo", reviewing: true, rejected: [] }).verdict).toBe("stuck");
  });
});
