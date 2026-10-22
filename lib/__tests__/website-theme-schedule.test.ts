import { describe, it, expect } from "vitest";
import { mergeTheme, normalizeTheme } from "../website-theme";
import { themeLookOf } from "../website-saved-themes";
import { DEFAULT_SITE_PAGE, normalizeFestive, normalizeProof } from "../website-site-design";
import { cleanStatEvents } from "../website-web-stats";
import { thaiToday } from "../website-proof-db";
import {
  activeCampaign,
  applyCampaign,
  campaignState,
  isoToThaiLocal,
  overlappingCampaigns,
  sanitizeCampaignInput,
  sanitizePublishInput,
  scheduleFromRow,
  thaiLocalToIso,
  type ThemeSchedule,
} from "../website-theme-schedule";

const NOW = Date.parse("2026-11-01T05:00:00.000Z"); // 12:00 เวลาไทย
const camp = (over: Partial<ThemeSchedule>): ThemeSchedule => ({
  id: "c1",
  shopId: "s",
  kind: "campaign",
  name: "11.11",
  status: "pending",
  startsAt: "2026-11-10T17:00:00.000Z",
  endsAt: "2026-11-12T16:59:00.000Z",
  includeHome: false,
  look: null,
  festive: null,
  note: "",
  versionNo: null,
  createdByName: null,
  createdAt: "",
  doneAt: null,
  ...over,
});

/** ⏰🎪 ตั้งเวลาเผยแพร่ + ธีมแคมเปญ (แท็บดีไซน์ ชุด 5) */
describe("ตั้งเวลาเผยแพร่ + แคมเปญ", () => {
  it("เวลาไทยในช่อง ↔ ISO ตรงกัน (ไม่ขึ้นกับเครื่องที่เปิด)", () => {
    expect(thaiLocalToIso("2026-11-11T00:00")).toBe("2026-11-10T17:00:00.000Z");
    expect(isoToThaiLocal("2026-11-10T17:00:00.000Z")).toBe("2026-11-11T00:00");
    expect(thaiLocalToIso("2026-02-31T25:00")).toBeNull();
    expect(thaiLocalToIso("พรุ่งนี้")).toBeNull();
    expect(isoToThaiLocal(null)).toBe("");
  });

  it("ตั้งเวลาเผยแพร่: ต้องอยู่ในอนาคต ≥ 1 นาที และไม่เกิน 1 ปี", () => {
    expect(sanitizePublishInput({ at: "2026-11-01T05:00:30.000Z" }, NOW).ok).toBe(false);
    expect(sanitizePublishInput({ at: "2028-01-01T00:00:00.000Z" }, NOW).ok).toBe(false);
    expect(sanitizePublishInput({}, NOW).ok).toBe(false);
    const ok = sanitizePublishInput({ at: "2026-11-10T17:00:00.000Z", includeHome: true, note: " เปิดโปร " }, NOW);
    expect(ok).toEqual({ ok: true, value: { at: "2026-11-10T17:00:00.000Z", includeHome: true, note: "เปิดโปร" } });
  });

  it("แคมเปญ: ต้องมีชื่อ · จบหลังเริ่ม · ยังไม่จบ · ≤120 วัน · มีธีมหรือของตกแต่ง", () => {
    const base = { name: "11.11", startsAt: "2026-11-10T17:00:00.000Z", endsAt: "2026-11-12T16:59:00.000Z", festive: { kind: "confetti" } };
    expect(sanitizeCampaignInput({ ...base, name: "  " }, NOW).ok).toBe(false);
    expect(sanitizeCampaignInput({ ...base, endsAt: base.startsAt }, NOW).ok).toBe(false);
    expect(sanitizeCampaignInput({ ...base, startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-20T00:00:00.000Z" }, NOW).ok).toBe(false);
    expect(sanitizeCampaignInput({ ...base, endsAt: "2027-06-01T00:00:00.000Z" }, NOW).ok).toBe(false);
    expect(sanitizeCampaignInput({ ...base, festive: null, savedThemeId: "ไม่ใช่ id" }, NOW).ok).toBe(false);
    const ok = sanitizeCampaignInput(base, NOW);
    expect(ok.ok && ok.value.festive).toMatchObject({ kind: "confetti", amount: "some", where: "home", mobile: true });
  });

  it("สถานะแคมเปญ + แคมเปญที่ทำงาน (ทับกัน = เริ่มทีหลังชนะ)", () => {
    const a = camp({ id: "a", startsAt: "2026-10-30T00:00:00.000Z", endsAt: "2026-11-05T00:00:00.000Z" });
    const b = camp({ id: "b", startsAt: "2026-10-31T00:00:00.000Z", endsAt: "2026-11-02T00:00:00.000Z" });
    const later = camp({ id: "c" });
    const gone = camp({ id: "d", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T00:00:00.000Z" });
    expect([a, later, gone].map((c) => campaignState(c, NOW))).toEqual(["active", "upcoming", "ended"]);
    expect(campaignState(camp({ status: "cancelled" }), NOW)).toBe("cancelled");
    expect(activeCampaign([a, b, later, gone], NOW)?.id).toBe("b");
    expect(activeCampaign([later, gone], NOW)).toBeNull();
    expect(overlappingCampaigns([a, b, later], { id: "a", startsAt: a.startsAt, endsAt: a.endsAt! }).map((c) => c.id)).toEqual(["b"]);
  });

  it("ใส่หน้าตาแคมเปญ: สีจากธีมที่บันทึก · โลโก้/ป้าย/ป๊อปอัปคงเดิม · ของตกแต่งของแคมเปญทับ", () => {
    const base = normalizeTheme({ colors: { brand: "#1F3A5F" }, logo: { text: "LOUIS" }, page: { proof: { sold: true }, popup: { layout: "corner" }, density: "normal" } });
    const red = normalizeTheme({ colors: { brand: "#B3121B" }, page: { density: "airy", proof: { sold: false } } });
    const full = applyCampaign(base, camp({ look: { savedThemeId: null, name: "แดงทอง", scope: "full", theme: themeLookOf(red, "full") }, festive: normalizeFestive({ kind: "snow" }) }));
    expect(full.colors.brand).toBe("#B3121B");
    expect(full.page.density).toBe("airy");
    expect(full.logo.text).toBe("LOUIS");
    expect(full.page.proof.sold).toBe(true);
    expect(full.page.popup.layout).toBe("corner");
    expect(full.page.festive.kind).toBe("snow");
    const colorsOnly = applyCampaign(base, camp({ look: { savedThemeId: null, name: "แดง", scope: "colors", theme: themeLookOf(red, "colors") } }));
    expect([colorsOnly.colors.brand, colorsOnly.page.density, colorsOnly.page.festive.kind]).toEqual(["#B3121B", "normal", "none"]);
    expect(applyCampaign(base, camp({}))).toEqual(base);
  });

  it("แถวจากตาราง → ข้อมูลหน้าจอ (มีหน้าแรก = includeHome)", () => {
    const r = scheduleFromRow({ id: "x", shop_id: "s", kind: "publish", status: "weird", starts_at: "2026-11-10T17:00:00.000Z", has_layout: "blk1", note: null });
    expect([r.kind, r.status, r.includeHome, r.note, r.look, r.festive]).toEqual(["publish", "pending", true, "", null, null]);
    expect(scheduleFromRow({ kind: "campaign", look: { scope: "nope" }, festive: { kind: "hearts" } })).toMatchObject({ kind: "campaign", look: null, festive: { kind: "hearts" } });
  });
});

/** 🎄👀 ของตกแต่ง + ป้ายคนดู/ขายแล้ว (มิเรอร์ site-design) */
describe("ของตกแต่ง + ป้าย", () => {
  it("ธีมเก่า = ไม่มีของตกแต่ง ไม่มีป้าย (หน้าตาเดิม)", () => {
    const p = normalizeTheme({}).page;
    expect(p.festive).toEqual({ kind: "none", amount: "some", where: "home", mobile: true });
    expect(p.proof).toEqual({ viewers: false, viewersMin: 5, sold: false, soldMin: 10, soldSource: "web", soldPeriod: "30d", onCard: false });
    expect([p.festive, p.proof]).toEqual([DEFAULT_SITE_PAGE.festive, DEFAULT_SITE_PAGE.proof]);
  });

  it("ค่าที่เลือกรอดการบันทึก (ร่าง/เผยแพร่)", () => {
    const page = { festive: { kind: "lantern", amount: "many", where: "all", mobile: false }, proof: { viewers: true, viewersMin: 8, sold: true, soldMin: 30, soldSource: "all", soldPeriod: "all", onCard: true } };
    const back = normalizeTheme(mergeTheme({}, normalizeTheme({ page })));
    expect(back.page).toMatchObject(page);
  });

  it("ค่าแปลก = แบบเดิม · ขั้นต่ำถูกจำกัดช่วง", () => {
    expect(normalizeFestive({ kind: "fireworks", amount: "lots", where: "x", mobile: 0 })).toEqual({ kind: "none", amount: "some", where: "home", mobile: true });
    expect(normalizeFestive({ kind: "lantern", amount: "many", where: "all", mobile: false })).toEqual({ kind: "lantern", amount: "many", where: "all", mobile: false });
    expect(normalizeProof({ viewers: "yes", viewersMin: 0, soldMin: 99999, soldSource: "odoo", soldPeriod: "7d" })).toMatchObject({ viewers: false, viewersMin: 1, soldMin: 1000, soldSource: "web", soldPeriod: "30d" });
  });

  it("ตัวนับคนดูไม่ซ้ำ (item_viewer) ผ่านด่านตัวนับ · วันนี้ตามเวลาไทย", () => {
    expect(cleanStatEvents([{ m: "item_viewer", d: "roar01 " }, { m: "item_viewer", d: "" }, { m: "nope", d: "x" }])).toEqual([{ m: "item_viewer", d: "ROAR01" }]);
    expect(thaiToday(Date.parse("2026-11-10T17:30:00.000Z"))).toBe("2026-11-11");
  });
});
