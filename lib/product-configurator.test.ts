import { describe, it, expect } from "vitest";
import {
  normCode, defaultSelection, normalizeSelection, priceOf, resolveLayers, parseImageFileName, matchImageFile,
  expectedImages, countDesigns, templateSvg, validateOption, validateLayer, validateRule, validateModel,
  blueprintFromData, shotListCsv, cleanText, newDesignCode, layerCombos,
  type ConfigData, type Blueprint,
} from "./product-configurator";
import { sampleToteBlueprint } from "./product-configurator-sample";

/** แบบพิมพ์เขียว → ข้อมูลเต็ม (ใส่ id ปลอม) แบบเดียวกับที่ API สร้างจริง */
function dataFrom(bp: Blueprint): ConfigData {
  let n = 0;
  const id = () => `id-${++n}`;
  const model = { ...bp.model, id: "m1", shop_id: "s1" };
  const slots = bp.slots.map(({ options: _o, ...s }) => ({ ...s, id: id(), model_id: model.id }));
  const options = bp.slots.flatMap((s, i) => s.options.map((o) => ({ ...o, id: id(), model_id: model.id, slot_id: slots[i].id })));
  const layers = bp.layers.map(({ images: _im, ...l }) => ({ ...l, id: id(), model_id: model.id }));
  const rules = bp.rules.map((r) => ({ ...r, id: id(), model_id: model.id }));
  return { model, slots, options, layers, images: [], rules };
}
const tote = () => dataFrom(sampleToteBlueprint());

describe("product-configurator · รหัส + ข้อความปั๊ม", () => {
  it("normCode ทำเป็นตัวใหญ่ · ช่องว่าง/_ → -", () => {
    expect(normCode(" strap chain ")).toBe("STRAP-CHAIN");
    expect(normCode("zip_pocket")).toBe("ZIP-POCKET");
    expect(normCode("หนัง ดำ!")).toBe("");
  });
  it("cleanText ตัดตัวที่ปั๊มไม่ได้ + จำกัดความยาว + ตัวใหญ่อัตโนมัติ", () => {
    const r = cleanText({ config: { max_chars: 4 } }, "p.kก1234");
    expect(r.text).toBe("P.K1");
    expect(r.dropped).toEqual(["ก"]);
  });
  it("newDesignCode = XXXX-XXXX ไม่มีตัวที่สับสน (0/O/1/I)", () => {
    expect(newDesignCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
});

describe("product-configurator · กติกาและการเลือก", () => {
  it("ค่าเริ่มต้นเลือกตัวที่ติ๊กไว้ · multi = ว่าง · text = ว่าง", () => {
    const s = defaultSelection(tote());
    expect(s).toMatchObject({ MATERIAL: "PEBBLE", COLOR: "NOIR", ZIP: "COIL", STRAP: "HANDLES", METAL: "SILVER", LINING: "CREAM", "STAMP-STYLE": "DEBOSS", EXTRAS: [], INNER: [] });
  });
  it("หนังกลับไม่มีสีดำ → เปลี่ยนเป็นสีแรก (ตามลำดับที่แอดมินจัด) ที่ใช้ได้ พร้อมบอกเหตุผล", () => {
    const d = tote();
    const r = normalizeSelection(d, { ...defaultSelection(d), MATERIAL: "SUEDE" });
    expect(r.selection.COLOR).toBe("OLIVE");
    expect(r.messages.join()).toContain("หนังกลับมี 5 สี");
  });
  it("ลายจระเข้ + สายผ้า → เปลี่ยนสายเป็นหูหิ้ว (ตัวเริ่มต้น)", () => {
    const d = tote();
    const r = normalizeSelection(d, { ...defaultSelection(d), MATERIAL: "CROC", STRAP: "WEBBING" });
    expect(r.selection.STRAP).toBe("HANDLES");
    expect(r.messages.join()).toContain("ลายจระเข้ไม่เข้ากับสายผ้า");
  });
  it("ราคา = ราคาเริ่มต้น + ราคาเพิ่มของทุกตัวเลือก · วันผลิตบวกตามตัวเลือก", () => {
    const d = tote();
    const p = priceOf(d, { ...defaultSelection(d), MATERIAL: "SMOOTH", ZIP: "METAL", METAL: "GOLD", EXTRAS: ["FEET", "PLATE"], LINING: "MONOGRAM" });
    expect(p.total).toBe(4900 + 300 + 200 + 200 + 120 + 250 + 250);
    expect(p.leadDays).toBe(12);
  });
});

describe("product-configurator · ชั้นรูป", () => {
  it("ด้านหน้าค่าเริ่มต้น: โชว์เฉพาะชั้นที่เงื่อนไขตรง เรียงล่าง→บน + คอมโบถูก", () => {
    const d = tote();
    const r = resolveLayers(d, "front", defaultSelection(d));
    expect(r.map((x) => x.layer.code)).toEqual(["SHADOW", "HANDLE-FAR", "BODY", "ZIP", "HANDLE-NEAR", "RIVETS"]);
    expect(r.find((x) => x.layer.code === "BODY")?.comboKey).toBe("PEBBLE_NOIR");
    expect(r.find((x) => x.layer.code === "ZIP")?.comboKey).toBe("COIL_SILVER");
    expect(r.find((x) => x.layer.code === "BODY")?.placeholderHex).toBe("#1f1d1c");
  });
  it("พิมพ์ชื่อ = ชั้นตัวอักษรโผล่ ใช้แบบปั๊มจากช่องแบบการปั๊ม", () => {
    const d = tote();
    const { selection } = normalizeSelection(d, { ...defaultSelection(d), STAMP: "pk", "STAMP-STYLE": "GOLD" });
    const stamp = resolveLayers(d, "front", selection).find((x) => x.layer.code === "STAMP");
    expect(stamp?.text).toMatchObject({ value: "PK", style: "gold" });
  });
  it("ช่องเสียบด้านหลังโชว์เฉพาะด้านหลังเมื่อเลือก", () => {
    const d = tote();
    const sel = { ...defaultSelection(d), INNER: ["BACKPOCKET"] };
    expect(resolveLayers(d, "back", sel).some((x) => x.layer.code === "POCKET")).toBe(true);
    expect(resolveLayers(d, "back", defaultSelection(d)).some((x) => x.layer.code === "POCKET")).toBe(false);
  });
});

describe("product-configurator · ชื่อไฟล์ + รายการรูปที่ต้องถ่าย", () => {
  it("แยกชื่อไฟล์ได้ ยอมตัวเล็ก/ท้าย (1)", () => {
    expect(parseImageFileName("tote_front_body_pebble_noir (1).PNG")).toEqual({ model: "TOTE", view: "front", layer: "BODY", combo: ["PEBBLE", "NOIR"] });
    expect(parseImageFileName("TOTE_TOP_BODY.png")).toBeNull();
  });
  it("จับคู่ไฟล์กับชั้น + บอกเหตุผลเมื่อไม่ตรง", () => {
    const d = tote();
    expect(matchImageFile(d, "TOTE_FRONT_BODY_PEBBLE_NOIR.png")).toMatchObject({ ok: true, comboKey: "PEBBLE_NOIR" });
    expect(matchImageFile(d, "TOTE_INSIDE_SHADOW.png")).toMatchObject({ ok: true, comboKey: "" });
    expect(matchImageFile(d, "MINI_FRONT_BODY_PEBBLE_NOIR.png").ok).toBe(false);
    const short = matchImageFile(d, "TOTE_FRONT_BODY_PEBBLE.png");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toContain("MATERIAL + COLOR");
    const bad = matchImageFile(d, "TOTE_FRONT_BODY_PEBBLE_PINK.png");
    if (!bad.ok) expect(bad.reason).toContain("PINK");
  });
  it("ชั้นตัวกระเป๋าด้านหน้าต้องถ่าย 24 รูป (ตัดสีที่วัสดุไม่มีออกตามกติกา)", () => {
    const d = tote();
    const body = d.layers.find((l) => l.view === "front" && l.code === "BODY")!;
    expect(layerCombos(d, body)).toHaveLength(8 + 8 + 5 + 3);
    const all = expectedImages(d, "front");
    expect(all.filter((e) => e.layer.code === "BODY")).toHaveLength(24);
    expect(all.every((e) => e.image === null)).toBe(true);
    expect(all.find((e) => e.layer.code === "SHADOW")?.fileName).toBe("TOTE_FRONT_SHADOW.png");
  });
  it("นับแบบที่ประกอบได้ตามกติกา", () => {
    // Σ(สี×สาย ต่อวัสดุ) = 8×3+8×3+5×3+3×2 = 69 · × ซิป3 × โลหะ4 × ซับใน6 × แบบปั๊ม3 × ของตกแต่ง 2³ × ช่อง 2⁴
    expect(countDesigns(tote())).toEqual({ count: 69 * 3 * 4 * 6 * 3 * 8 * 16, capped: false });
  });
  it("CSV รายการรูปมี BOM + หัวตาราง", () => {
    const csv = shotListCsv(tote());
    expect(csv.startsWith("﻿มุม,ชั้น,ตัวเลือก,ชื่อไฟล์,สถานะ")).toBe(true);
    expect(csv).toContain("TOTE_INSIDE_LINING_MONOGRAM.png");
  });
  it("แม่แบบ SVG ขนาดเท่าผืนผ้าใบ + มีชื่อทรง/มุม + ไม้บรรทัดเมื่อตั้ง cm_px", () => {
    const svg = templateSvg(tote().model, "front");
    expect(svg).toContain('width="3000"');
    expect(svg).toContain("TOTE");
    expect(svg).toContain("ด้านหน้า");
    expect(svg).toContain("10 ซม.");
    expect(templateSvg(tote().model, "inside")).not.toContain("10 ซม.");
  });
});

describe("product-configurator · ตรวจค่าก่อนบันทึก + สำเนาทรง", () => {
  it("รหัสต้องเป็นตัวใหญ่ไม่มี _", () => {
    expect(validateOption({ code: "pebble", name_th: "x" }).ok).toBe(false);
    expect(validateOption({ code: "ZIP_POCKET", name_th: "x" }).ok).toBe(false);
    expect(validateOption({ code: "ZIP-POCKET", name_th: "ช่องซิป", price_delta: 0 })).toEqual({ ok: true });
  });
  it("ทรงต้องเปิดอย่างน้อย 1 มุม · ราคาไม่ติดลบ", () => {
    expect(validateModel({ code: "TOTE", name_th: "โท้ท", views: [] }).ok).toBe(false);
    expect(validateModel({ base_price: -1 }, { partial: true }).ok).toBe(false);
  });
  it("ชั้นที่ลงสีต้องไม่ \"เปลี่ยนตาม\" ช่องเดียวกัน · กติกาต้องคนละช่อง", () => {
    expect(validateLayer({ code: "BODY", name_th: "ตัว", view: "front", z_index: 1, depends_on: ["MATERIAL", "COLOR"], recolor_slot: "COLOR" }).ok).toBe(false);
    expect(validateRule({ kind: "block", if_slot: "COLOR", if_options: [], then_slot: "COLOR", then_options: ["NOIR"] }).ok).toBe(false);
  });
  it("blueprintFromData ตัด id ทิ้ง + ปิดทรงสำเนาไว้ก่อน", () => {
    const bp = blueprintFromData(tote(), { code: "TOTE-2", nameTh: "โท้ท (สำเนา)" });
    expect(bp.model).toMatchObject({ code: "TOTE-2", name_th: "โท้ท (สำเนา)", is_active: false });
    expect(bp.model).not.toHaveProperty("id");
    expect(bp.slots[0]).not.toHaveProperty("model_id");
    expect(bp.slots[0].options[0]).not.toHaveProperty("slot_id");
    expect(bp.slots).toHaveLength(10);
  });
});
