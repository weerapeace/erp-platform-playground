import { describe, expect, it } from "vitest";
import { arrangeEn, arrangeRows, arrangeTh, composeLines, enInsertAt, insertLines, materialLine, moveNewBlock, newBlockAt, newRowKey, oldRowsMoved, slotLine, slotText, splitLines } from "@/lib/detail-snippets";
import { findMaterialLinks, materialTerms, mentionsMaterial, publicMaterial, type MaterialRow } from "@/lib/product-materials";

const card = { id: "c", name: "ช่องใส่บัตรเครดิต", name_en: "Card slot", kind: "slot", template_en: "{n} card slots" };
const bill = { id: "b", name: "ช่องใส่ธนบัตร", name_en: "Bill compartment", kind: "slot" };
const noEn = { id: "x", name: "ช่องลับ", kind: "slot" };

describe("detail-snippets", () => {
  it("ช่อง + ตัวเลข → บรรทัดตามแบบเดิม", () => {
    expect(slotText(card, 6, "th")).toBe("ช่องใส่บัตรเครดิต 6 ช่อง");
    expect(slotText(card, 6, "en")).toBe("6 card slots");
    expect(slotText(bill, 2, "en")).toBe("Bill compartment × 2");
    expect(slotText(card, 0, "th")).toBeNull();
    expect(slotLine([{ item: card, n: 6 }, { item: bill, n: 2 }, { item: noEn, n: 0 }], "th")).toBe("ช่องใส่บัตรเครดิต 6 ช่อง และ ช่องใส่ธนบัตร 2 ช่อง");
    // อังกฤษขาดตัวไหน = ทั้งบรรทัดว่าง (ไม่ครึ่ง ๆ กลาง ๆ)
    expect(slotLine([{ item: card, n: 6 }, { item: noEn, n: 1 }], "en")).toBeNull();
  });

  it("วัสดุหลายตัว = บรรทัดเดียว", () => {
    const m = [{ id: "1", name: "หนังวัวนิ่มนัปป้า", name_en: "Nappa leather" }, { id: "2", name: "หนังวัวเรียบรูขน", name_en: "Smooth cowhide" }];
    expect(materialLine(m, "th")).toBe("วัสดุ: หนังวัวนิ่มนัปป้า และ หนังวัวเรียบรูขน");
    expect(materialLine(m, "en")).toBe("Materials: Nappa leather and Smooth cowhide");
    expect(materialLine([m[0]], "en")).toBe("Material: Nappa leather");
  });

  it("แทรกตรงตำแหน่งที่เลือก · ท้ายสุดไม่ไปอยู่ใต้บรรทัดว่าง", () => {
    const d = "- ผลิตจากหนังวัวแท้ 100%\n- ช่องอเนกประสงค์ 2 ช่อง\n\n";
    expect(splitLines(d)).toHaveLength(2);
    expect(insertLines(d, ["- วัสดุ: หนัง"], 1)).toBe("- ผลิตจากหนังวัวแท้ 100%\n- วัสดุ: หนัง\n- ช่องอเนกประสงค์ 2 ช่อง");
    expect(insertLines(d, ["- ท้าย"], 99)).toBe("- ผลิตจากหนังวัวแท้ 100%\n- ช่องอเนกประสงค์ 2 ช่อง\n- ท้าย");
    expect(insertLines("", ["- a", "- b"], 0)).toBe("- a\n- b");
    expect(insertLines("a\r\nb", ["x"], 0)).toBe("x\na\nb");
  });

  it("อังกฤษ: บรรทัดเท่ากัน = ตำแหน่งเดียวกัน · ไม่เท่า = ต่อท้าย", () => {
    expect(enInsertAt("a\nb\nc", "A\nB\nC", 1)).toBe(1);
    expect(enInsertAt("a\nb\nc", "A B C", 1)).toBe(1);
    expect(enInsertAt("a\nb\nc", "", 2)).toBe(0);
  });

  it("รวมที่เลือก → บรรทัดไทย/อังกฤษ + นับที่ไม่มีอังกฤษ", () => {
    const r = composeLines({
      phrases: [{ id: "p", name: "ผลิตในประเทศไทย", name_en: "Made in Thailand" }, { id: "q", name: "งานแฮนด์เมด" }],
      materials: [{ id: "1", name: "ผ้าแคนวาส", name_en: "Canvas" }],
      slots: [{ item: card, n: 6 }],
    });
    expect(r.th).toEqual(["- ผลิตในประเทศไทย", "- งานแฮนด์เมด", "- วัสดุ: ผ้าแคนวาส", "- ช่องใส่บัตรเครดิต 6 ช่อง"]);
    expect(r.en).toEqual(["- Made in Thailand", "- Material: Canvas", "- 6 card slots"]);
    expect(r.enMissing).toBe(1);
  });
});

describe("product-materials", () => {
  const nappa: MaterialRow = { id: "1", name: "หนังวัวนิ่มนัปป้า", name_en: "Nappa cowhide leather", slug: "nappa-leather", aliases: "หนังนัปป้า, Nappa leather, , N", description: "หนังนุ่ม", is_active: true };
  const empty: MaterialRow = { id: "2", name: "ผ้าแคนวาส", slug: "canvas", description: "  ", is_active: true };
  const off: MaterialRow = { ...nappa, id: "3", slug: "off", is_active: false };

  it("คำที่ใช้จับ = ชื่อ + อังกฤษ + คำเรียกอื่น (ตัดสั้น/ซ้ำ)", () => {
    expect(materialTerms(nappa)).toEqual(["หนังวัวนิ่มนัปป้า", "Nappa cowhide leather", "หนังนัปป้า", "Nappa leather"]);
  });

  it("ลิงก์เฉพาะวัสดุที่มีหน้า + ถูกพูดถึง (ไม่สนตัวพิมพ์เล็กใหญ่)", () => {
    const links = findMaterialLinks(["- วัสดุ: หนังวัวนิ่มนัปป้า และผ้าแคนวาส", null], [nappa, empty, off]);
    expect(links.map((l) => l.slug)).toEqual(["nappa-leather"]);
    expect(findMaterialLinks(["", "Made of NAPPA LEATHER"], [nappa])).toHaveLength(1);
    expect(findMaterialLinks(["ไม่มีวัสดุ"], [nappa])).toEqual([]);
  });

  it("พูดถึงวัสดุไหม — นับได้แม้ยังไม่มีหน้า (หน้าดูวัสดุบอก 'เขียนแล้วจะลิงก์ได้กี่รุ่น')", () => {
    expect(mentionsMaterial(["ผลิตจากผ้าแคนวาสหนา"], empty)).toBe(true);
    expect(mentionsMaterial([null, 42, "made of nappa leather"], nappa)).toBe(true);
    expect(mentionsMaterial(["", undefined], nappa)).toBe(false);
    expect(mentionsMaterial(["หนังวัวแท้"], nappa)).toBe(false);
  });

  it("ข้อมูลหน้าวัสดุไม่ส่งช่องว่าง", () => {
    const p = publicMaterial({ ...nappa, image_key: "a/b.jpg", care: "" }, (k) => `https://x/${k}`);
    expect(p).toMatchObject({ slug: "nappa-leather", name: "หนังวัวนิ่มนัปป้า", image: "https://x/a/b.jpg" });
    expect("care" in p).toBe(false);
  });
});

describe("detail-snippets — ขนาด/น้ำหนัก/ใส่ได้ (แท็บใหม่ในป๊อปแทรก)", () => {
  it("ขนาด: ข้ามช่องว่าง/0 · ทศนิยมตัด 0 ท้าย · ไม่มีเลย = null", async () => {
    const { sizeLine, weightLine, fitLine } = await import("@/lib/detail-snippets");
    expect(sizeLine({ w: 30, h: "20", d: 10.5 }, "th")).toBe("ขนาด: กว้าง 30 × สูง 20 × หนา 10.5 ซม.");
    expect(sizeLine({ w: 30, h: 0, d: "" }, "en")).toBe("Size: W 30 cm");
    expect(sizeLine({}, "th")).toBeNull();
    expect(weightLine(1250, "th")).toBe("น้ำหนัก: 1,250 กรัม");
    expect(weightLine("450", "en")).toBe("Weight: 450 g");
    expect(weightLine(0, "th")).toBeNull();
    const fits = [{ th: "แท็บเล็ต", en: "Tablet", size: "11 นิ้ว" }, { th: "เอกสาร A4", en: "A4 documents" }];
    expect(fitLine(fits, "th")).toBe("ใส่ได้: แท็บเล็ต (11 นิ้ว) และ เอกสาร A4");
    expect(fitLine(fits, "en")).toBe('Fits: Tablet (11") and A4 documents');
    expect(fitLine([{ th: "ขวดน้ำ" }], "en")).toBeNull();
    expect(fitLine([], "en")).toBeNull();
  });
  it("รวมบรรทัด: เรียง ข้อความ → … → ขนาด → น้ำหนัก → ใส่ได้ · อังกฤษของ 'ใส่ได้' ขาด = นับว่าขาด", () => {
    const out = composeLines({ phrases: [], materials: [], slots: [], size: { w: 30, h: 20 }, weight: 450, fits: [{ th: "เอกสาร A4" }] });
    expect(out.th).toEqual(["- ขนาด: กว้าง 30 × สูง 20 ซม.", "- น้ำหนัก: 450 กรัม", "- ใส่ได้: เอกสาร A4"]);
    expect(out.en).toEqual(["- Size: W 30 × H 20 cm", "- Weight: 450 g"]);
    expect(out.enMissing).toBe(1);
  });
});

describe("ใส่อะไรได้ — ขนาดฝั่งอังกฤษ", () => {
  it("หน่วยไทย → อังกฤษ (ฝั่งไทยคงเดิม)", async () => {
    const { fitLabels, fitSizeEn } = await import("@/lib/product-fits");
    expect(fitSizeEn("11 นิ้ว")).toBe('11"');
    expect(fitSizeEn("500 มล.")).toBe("500 ml");
    expect(fitSizeEn("ถึง 6.7 นิ้ว")).toBe('up to 6.7"');
    const id = "00000000-0000-0000-0000-000000000001";
    const cat = [{ id, name: "ไอแพด", name_en: "iPad" }];
    expect(fitLabels([{ id, size: "11 นิ้ว" }], cat, "en")).toEqual(['iPad (11")']);
    expect(fitLabels([{ id, size: "11 นิ้ว" }], cat)).toEqual(["ไอแพด (11 นิ้ว)"]);
  });
});

describe("รูปแบบบรรทัดกลาง (⚙️) — คำเชื่อม · คำนำหน้า · อังกฤษในวงเล็บ · หูหิ้ว/สาย · เตือนซ้ำ", () => {
  it("คำเชื่อม: 1 / 2 / 3+ รายการ · ตั้งเองได้", async () => {
    const { joinList, normalizeInsertTemplates } = await import("@/lib/detail-snippets");
    expect(joinList(["A"], "th")).toBe("A");
    expect(joinList(["A", "B"], "th")).toBe("A และ B");
    expect(joinList(["A", "B", "C"], "th")).toBe("A, B และ C");
    expect(joinList(["A", "B", "C"], "en")).toBe("A, B and C");
    const t = normalizeInsertTemplates({ joiner: { last: " กับ " } });
    expect(joinList(["A", "B"], "th", t)).toBe("A กับ B");
    expect(t.joiner.sep).toBe(", ");
  });
  it("ค่าที่บันทึกมาไม่ครบ/ผิดชนิด = ค่าเริ่มต้น · คำนำหน้าว่างได้", async () => {
    const { normalizeInsertTemplates, DEFAULT_INSERT_TEMPLATES, materialLine } = await import("@/lib/detail-snippets");
    expect(normalizeInsertTemplates(null)).toEqual(DEFAULT_INSERT_TEMPLATES);
    const t = normalizeInsertTemplates({ prefix: { material: { th: "", en: 5 } }, enInBrackets: { material: true, fit: "yes" } });
    expect(t.prefix.material).toEqual({ th: "", en: "Material:" });
    expect(t.enInBrackets).toEqual({ phrase: false, material: true, slot: false, fit: false });
    const ts = normalizeInsertTemplates({ enInBrackets: { slot: true } });
    const { slotLine } = await import("@/lib/detail-snippets");
    expect(slotLine([{ item: { id: "s", name: "ช่องหลัก", name_en: "Main compartment", kind: "slot" }, n: 2 }], "th", ts)).toBe("ช่องหลัก (Main compartment) 2 ช่อง");
    expect(materialLine([{ id: "1", name: "ผ้าไนล่อน", name_en: "Nylon" }], "th", t)).toBe("ผ้าไนล่อน (Nylon)");
  });
  it("หูหิ้ว / สาย (ช่วง = ปรับได้)", async () => {
    const { handleLine, strapLine } = await import("@/lib/detail-snippets");
    expect(handleLine(12, "th")).toBe("ความสูงหูหิ้ว: 12 ซม.");
    expect(strapLine(100, 120, "th")).toBe("ความยาวสายสะพาย: 100–120 ซม. (ปรับได้)");
    expect(strapLine(100, 120, "en")).toBe("Strap drop: 100–120 cm (adjustable)");
    expect(strapLine("", 35, "th")).toBe("ความยาวสายสะพาย: 35 ซม.");
    expect(strapLine(0, 0, "th")).toBeNull();
  });
  it("เตือนซ้ำเมื่อคำอธิบายมีเรื่องนั้นอยู่แล้ว", async () => {
    const { alreadyMentions } = await import("@/lib/detail-snippets");
    const d = "- วัสดุ: ผ้าขนเฟอร์\n- ความยาวสายสะพาย 35 cm.";
    expect(alreadyMentions(d, "strap")).toBe(true);
    expect(alreadyMentions(d, "material")).toBe(true);
    expect(alreadyMentions(d, "weight")).toBe(false);
    expect(alreadyMentions("", "size")).toBe(false);
  });
});

describe("รอบ 5 — ช่องด้านใน/นอก · อังกฤษเอกพจน์ · ชุดรายการตามประเภท", () => {
  it("ช่องแยกบรรทัด ด้านนอก → ด้านใน → ไม่ระบุ", () => {
    const main = { id: "a", name: "ช่องซิปหลัก", name_en: "Main zip compartment", kind: "slot", slot_side: "inside" };
    const bill = { id: "b", name: "ช่องใส่ธนบัตร", name_en: "Bill compartment", kind: "slot", slot_side: "inside", template_en: "{n} bill compartments" };
    const front = { id: "c", name: "ช่องซิปด้านหน้า", name_en: "Front zip pocket", kind: "slot", slot_side: "outside" };
    const r = composeLines({ phrases: [], materials: [], slots: [{ item: main, n: 1 }, { item: bill, n: 1 }, { item: front, n: 1 }, { item: card, n: 2 }] });
    expect(r.th).toEqual([
      "- ด้านนอก: ช่องซิปด้านหน้า 1 ช่อง",
      "- ด้านในกระเป๋า: ช่องซิปหลัก 1 ช่อง และ ช่องใส่ธนบัตร 1 ช่อง",
      "- ช่องใส่บัตรเครดิต 2 ช่อง",
    ]);
    // 1 ชิ้น = เอกพจน์อัตโนมัติ
    expect(r.en[1]).toBe("- Inside: Main zip compartment × 1 and 1 bill compartment");
    expect(r.pairs).toHaveLength(3);
  });
  it("อังกฤษเอกพจน์/พหูพจน์ + {s}", () => {
    expect(slotText({ id: "x", name: "ช่อง", kind: "slot", template_en: "{n} card slots" }, 1, "en")).toBe("1 card slot");
    expect(slotText({ id: "x", name: "ช่อง", kind: "slot", template_en: "{n} card slots" }, 2, "en")).toBe("2 card slots");
    expect(slotText({ id: "x", name: "ช่อง", kind: "slot", template_en: "{n} pouches" }, 1, "en")).toBe("1 pouch");
    expect(slotText({ id: "x", name: "ช่อง", kind: "slot", template_en: "{n} pocket{s} inside" }, 1, "en")).toBe("1 pocket inside");
    expect(slotText({ id: "x", name: "ช่อง", kind: "slot", template_en: "{n} pocket{s} inside" }, 3, "en")).toBe("3 pockets inside");
  });
  it("ชุดรายการ: ไล่หมวดขึ้นไปหาหมวดแม่ · ไม่มีชุด = null · กรองรายการ", async () => {
    const { normalizeProfiles, pickProfile, profileAllows } = await import("@/lib/detail-snippets");
    const ps = normalizeProfiles([
      { id: "wallet", name: "กระเป๋าสตางค์", categoryIds: ["cat-wallet"], tabs: ["phrase", "slot", "bogus"], items: { slot: ["s1"] }, sizeFields: ["w", "zz"] },
      { id: "", name: "ไม่มี id" },
      { id: "belt", name: "เข็มขัด", categoryIds: ["cat-belt-a", "cat-belt-b"] },
    ]);
    expect(ps.map((p) => p.id)).toEqual(["wallet", "belt"]);
    expect(ps[0].tabs).toEqual(["phrase", "slot"]);
    expect(ps[0].sizeFields).toEqual(["w"]);
    expect(ps[1].tabs).toBeNull();
    const parentOf = new Map<string, string | null>([["cat-wallet-long", "cat-wallet"], ["cat-wallet", "lm"], ["lm", null]]);
    expect(pickProfile(ps, "cat-wallet-long", parentOf)?.id).toBe("wallet");
    expect(pickProfile(ps, "cat-belt-b", parentOf)?.id).toBe("belt");
    expect(pickProfile(ps, "other", parentOf)).toBeNull();
    expect(pickProfile(ps, null, parentOf)).toBeNull();
    expect(profileAllows(ps[0], "slot", "s1")).toBe(true);
    expect(profileAllows(ps[0], "slot", "s2")).toBe(false);
    expect(profileAllows(ps[0], "phrase", "anything")).toBe(true);
    expect(profileAllows(null, "slot", "s2")).toBe(true);
  });
});

describe("detail-snippets — ⠿ ลากสลับทุกบรรทัดในตัวอย่าง", () => {
  const n = (s: string) => newRowKey(s);
  it("ยังไม่ลาก = ก้อนบรรทัดใหม่ที่ตำแหน่ง at (เหมือน insertLines)", () => {
    const rows = arrangeRows(3, [n("a"), n("b")], 1, null);
    expect(rows).toEqual(["o:0", "n:a", "n:b", "o:1", "o:2"]);
    expect(arrangeTh(rows, ["x", "y", "z"], (k) => k.slice(2)).join("\n")).toBe(insertLines("x\ny\nz", ["a", "b"], 1));
    expect(newBlockAt(rows)).toBe(1);
    expect(oldRowsMoved(rows)).toBe(false);
  });
  it("ลากแล้ว: ตัวที่เลิกเลือกหาย · ตัวใหม่ต่อท้ายบรรทัดใหม่ตัวสุดท้าย · บรรทัดเดิมครบเสมอ", () => {
    const custom = ["o:2", "n:a", "o:0", "n:b", "o:1"];
    const rows = arrangeRows(3, [n("a"), n("c")], 3, custom);
    expect(rows).toEqual(["o:2", "n:a", "n:c", "o:0", "o:1"]);
    expect(oldRowsMoved(rows)).toBe(true);
    expect(newBlockAt(["o:0", "n:a", "o:1", "n:b"])).toBeNull();
    // ยังไม่มีบรรทัดใหม่ในลำดับที่ลากไว้ → วางก่อนบรรทัดเดิมตัวแรกที่อยู่ตั้งแต่ตำแหน่ง at
    expect(arrangeRows(2, [n("a")], 1, ["o:1"])).toEqual(["n:a", "o:1", "o:0"]);
  });
  it("ย้ายก้อนบรรทัดใหม่ (บนสุด/ท้ายสุด/คลิกช่อง) รักษาลำดับที่ลากไว้", () => {
    expect(moveNewBlock(["o:1", "n:b", "o:0", "n:a"], 0)).toEqual(["n:b", "n:a", "o:1", "o:0"]);
    expect(moveNewBlock(["n:a", "o:0", "o:1"], 2)).toEqual(["o:0", "o:1", "n:a"]);
  });
  it("อังกฤษ: บรรทัดเท่ากัน = เรียงตามไทย · ไม่เท่า = เดิม + ต่อท้าย", () => {
    const rows = ["o:1", "n:a", "o:0"];
    const en = (k: string) => (k === "n:a" ? "A" : null);
    expect(arrangeEn(rows, ["x", "y"], ["X", "Y"], en)).toEqual(["Y", "A", "X"]);
    expect(arrangeEn(rows, ["x", "y"], ["XY"], en)).toEqual(["XY", "A"]);
    expect(arrangeEn(rows, ["x", "y"], ["X", "Y"], () => null)).toEqual(["Y", "X"]);
  });
});

describe("รอบ 8 — ลำดับบรรทัดตั้งได้ (⚙️ รูปแบบบรรทัด)", () => {
  it("ไม่ตั้ง = ลำดับเดิม · ตั้งแล้ว = เรียงตามนั้น", async () => {
    const { normalizeInsertTemplates, normalizeLineOrder, DEFAULT_LINE_ORDER } = await import("@/lib/detail-snippets");
    const sel = { phrases: [{ id: "p", name: "ผลิตในประเทศไทย", name_en: "Made in Thailand" }], materials: [{ id: "m", name: "หนังวัวแท้", name_en: "Cowhide" }], slots: [], size: { w: 30, h: 20, d: 10 }, weight: 450, fits: [{ th: "เอกสาร A4" }] };
    const base = composeLines(sel).th;
    expect(base.map((l) => l.slice(2, 8))).toEqual(["ผลิตใน", "วัสดุ:", "ขนาด: ", "น้ำหนั", "ใส่ได้"]);
    const tpl = normalizeInsertTemplates({ order: ["fit", "size", "phrase"] });
    expect(tpl.order.slice(0, 3)).toEqual(["fit", "size", "phrase"]);
    expect(tpl.order).toHaveLength(DEFAULT_LINE_ORDER.length);
    expect(composeLines(sel, tpl).th.map((l) => l.slice(2, 8))).toEqual(["ใส่ได้", "ขนาด: ", "ผลิตใน", "วัสดุ:", "น้ำหนั"]);
  });
  it("ลำดับเพี้ยน = ทิ้งตัวที่ไม่รู้จัก/ซ้ำ · ที่ขาดต่อท้าย", async () => {
    const { normalizeLineOrder, DEFAULT_LINE_ORDER } = await import("@/lib/detail-snippets");
    expect(normalizeLineOrder(null)).toEqual(DEFAULT_LINE_ORDER);
    const o = normalizeLineOrder(["strap", "x", "strap", 5, "phrase"]);
    expect(o.slice(0, 2)).toEqual(["strap", "phrase"]);
    expect(new Set(o).size).toBe(DEFAULT_LINE_ORDER.length);
  });
});

describe("รอบ 10 — 🌿 Lifestyle / อื่นๆ", () => {
  it("ข้อความของสไตล์ + พิมพ์เอง = บรรทัดละข้อ (อังกฤษจับคู่ตามบรรทัด) · อยู่ท้ายตามลำดับตั้งต้น", async () => {
    const { freeLines } = await import("@/lib/detail-snippets");
    const free = freeLines("- ใส่ไปคาเฟ่ก็ปัง\n\nใส่ไปทำงานก็ดี", "Cafe-ready\n");
    expect(free).toEqual([{ th: "ใส่ไปคาเฟ่ก็ปัง", en: "Cafe-ready" }, { th: "ใส่ไปทำงานก็ดี", en: null }]);
    const r = composeLines({ phrases: [{ id: "p", name: "กันน้ำ", name_en: "Water resistant" }], materials: [], slots: [], lifestyle: [{ th: "อินสไปร์จากยุค 2000s", en: "Inspired by the 2000s" }, ...free] });
    expect(r.th).toEqual(["- กันน้ำ", "- อินสไปร์จากยุค 2000s", "- ใส่ไปคาเฟ่ก็ปัง", "- ใส่ไปทำงานก็ดี"]);
    expect(r.en).toEqual(["- Water resistant", "- Inspired by the 2000s", "- Cafe-ready"]);
    expect(r.enMissing).toBe(1);
  });
  it("prompt ถาม ChatGPT มีสินค้า + สไตล์ + ตัวอย่าง + คำอธิบาย", async () => {
    const { lifestylePrompt } = await import("@/lib/detail-snippets");
    const q = lifestylePrompt({ product: "กระเป๋า PIX33", style: { name: "Y2K", name_en: "Y2K" }, examples: ["อินสไปร์จากยุค 2000s"], description: "กระเป๋าหนัง" });
    expect(q).toContain("สินค้า: กระเป๋า PIX33");
    expect(q).toContain("สไตล์: Y2K (Y2K)");
    expect(q).toContain("- อินสไปร์จากยุค 2000s");
    expect(q).toContain("กระเป๋าหนัง");
  });
});

describe("รอบ 11 — ⧉ คัดลอกจากรุ่นอื่น", () => {
  it("บรรทัดที่คัดลอกคงรูปเดิม (ไม่เติม - ) และอยู่ก่อนบรรทัดอื่น", () => {
    const r = composeLines({ phrases: [{ id: "p", name: "กันน้ำ", name_en: "Water resistant" }], materials: [], slots: [], copied: [{ th: "ขนาด 20 x 10 ซม.", en: "Size 20 x 10 cm" }, { th: "- ผ้าซับในเนื้อดี", en: null }, { th: "  ", en: null }] });
    expect(r.th).toEqual(["ขนาด 20 x 10 ซม.", "- ผ้าซับในเนื้อดี", "- กันน้ำ"]);
    expect(r.en).toEqual(["Size 20 x 10 cm", "- Water resistant"]);
    expect(r.enMissing).toBe(1);
  });
});
