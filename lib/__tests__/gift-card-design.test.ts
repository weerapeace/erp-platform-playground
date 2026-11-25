import { describe, expect, it } from "vitest";
import { isSpecialTemplate, newFoldedDoc as nfdSpecial,
  acceptsMessage, buyerNoteOf, faceDoc, foldLine, groupTemplates, isFolded, newFoldedDoc, withFace, builtinTemplates, cardHtml, cardStatus, cardsPrintHtml, classifyNote, cleanDoc, docFonts, extractEngraveText,
  fillTexts, fontStack, googleFontsHref, resizeDoc, resolveSrc, roleTexts, suggestMessage, uploadFontFaces, type CardDoc,
} from "@/lib/gift-card-design";

const r2 = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}`;

describe("classifyNote — หมายเหตุจริงจากศูนย์ออเดอร์ (24 พ.ย. 69)", () => {
  const card = [
    "รบกวนผูกริบบิ้นเป็นของขวัญวันเกิดได้ไหมคะ",
    "กรุณาห่อเป็นของขวัญวันเกิดให้ทีนะคะ ขอบคุณมากค่ะ 🙏🏻",
    "รบกวนทางร้านห่อของขวัญให้หน่อยนะคะ",
    "รบกวนห่อของขวัญเขียนการ์ด Happy Birthday ให้ด้วยนะคะ",
  ];
  const engrave = [
    "สลักชื่อ : KORN", "Pasit", "KARUNA.M", "MN🤍", "สลักชื่อ MN🤍", "พิมพ์คำว่า Search", "ปั๊ม Nrink ฟร้อน Roman",
    "jay(ตัวพิมพ์เล็กทั้งหหมด)", "สลีกชื่อสีทองตรงกลาง “Radisa”", "L. SILAPONG", "AnAn-AnNa", "ใส่ชื่อว่า \"Pongrit\"",
    "ชื่อ: Patrick (พิมพ์ ใหญ่ 1 ตัว คือ ตัว P ที่เหลือพิมพ์เล็ก)\nFont : Time News Roman\nพิมพ์จม ตรงกลาง",
    "ปักชื่อ “ pattarawee ”", "พิมพ์ The Art ครับ ขอมุมขวาล่าง",
  ];
  const other = ["ฝากป้อมยาม", "ต้องการให้เจาะรูเพิ่ม 5 รู เริ่มรูแรกที่ 40“ ค่ะ", "กระเป๋าน้อยใส่เหรียญ ขอเป็นแบบผ้าลายค่ะ ขอบคุณค่ะ"];
  it.each(card)("การ์ด: %s", (n) => expect(classifyNote(n).card).toBe(true));
  it.each(engrave)("สลัก: %s", (n) => expect(classifyNote(n)).toEqual({ card: false, engrave: true }));
  it.each(other)("อื่น ๆ: %s", (n) => expect(classifyNote(n)).toEqual({ card: false, engrave: false }));
  it("ชื่อ + ของขวัญ = ทั้งสองแท็บ", () => expect(classifyNote("Phailor K.\n\nเป็นของขวัญค่ะ")).toEqual({ card: true, engrave: true }));
  it("ว่าง", () => expect(classifyNote("  ")).toEqual({ card: false, engrave: false }));
});

describe("suggestMessage / extractEngraveText", () => {
  it("เอาข้อความหลังคำว่าการ์ด", () => expect(suggestMessage("รบกวนห่อของขวัญเขียนการ์ด Happy Birthday ให้ด้วยนะคะ")).toBe("Happy Birthday"));
  it("ในเครื่องหมายคำพูดมาก่อน", () => expect(suggestMessage('ขอการ์ดว่า "รักนะ" ค่ะ')).toBe("รักนะ"));
  it("วันเกิดไม่มีข้อความ → Happy Birthday", () => expect(suggestMessage("กรุณาห่อเป็นของขวัญวันเกิดให้ทีนะคะ")).toBe("Happy Birthday"));
  it("ห่อเฉย ๆ → ว่าง", () => expect(suggestMessage("รบกวนทางร้านห่อของขวัญให้หน่อยนะคะ")).toBe(""));
  it("ชื่อสลัก", () => {
    expect(extractEngraveText("สลักชื่อ : KORN")).toBe("KORN");
    expect(extractEngraveText("สลีกชื่อสีทองตรงกลาง “Radisa”")).toBe("Radisa");
    expect(extractEngraveText("Pasit")).toBe("Pasit");
    expect(extractEngraveText("พิมพ์คำว่า Search")).toBe("Search");
    expect(extractEngraveText("ฝากป้อมยาม")).toBe("");
    expect(extractEngraveText("jay(ตัวพิมพ์เล็กทั้งหหมด)")).toBe("jay");
    expect(extractEngraveText("ปักชื่อ “ pattarawee ”")).toBe("pattarawee");
    expect(extractEngraveText("สลักชื่อ MN🤍")).toBe("MN🤍");
  });
  it("ขอบคุณ (คำสุภาพ) ไม่เดาเป็นการ์ดขอบคุณ", () => expect(suggestMessage("ขอเป็นแบบผ้าลายค่ะ ขอบคุณค่ะ")).toBe(""));
});

describe("buyerNoteOf", () => {
  it("Shopee / TikTok / สร้างเอง", () => {
    expect(buyerNoteOf({ shopee: { message_to_seller: " ห่อด้วย " } })).toBe("ห่อด้วย");
    expect(buyerNoteOf({ tiktok: { buyer_message: "MN" } })).toBe("MN");
    expect(buyerNoteOf({ note: "โทรมา" })).toBe("โทรมา");
    expect(buyerNoteOf({ shopee: { message_to_seller: "" } })).toBeNull();
    expect(buyerNoteOf(null)).toBeNull();
  });
});

describe("cleanDoc", () => {
  it("ค่าเสีย → ค่าตั้งต้น · ชิ้นเสียถูกตัด · รูปนอกระบบไม่รับ", () => {
    const d = cleanDoc({ w: 9999, h: "x", bg: { color: "red" }, els: [
      { kind: "text", text: "a", style: { size: 999, font: "Comic", color: "#ABCDEF" } },
      { kind: "image", src: "https://evil/x.png" },
      { kind: "image", src: "r2:../etc" },
      { kind: "image", src: "sticker:heart" },
      { kind: "bogus" },
    ] });
    expect(d.w).toBe(300); expect(d.h).toBe(105); expect(d.bg.color).toBe("#fffdf8");
    expect(d.els).toHaveLength(2);
    expect(d.els[0].style).toMatchObject({ size: 160, font: "Charm", color: "#abcdef" });
    expect(d.els[1].src).toBe("sticker:heart");
  });
  it("id ซ้ำถูกเปลี่ยน", () => {
    const d = cleanDoc({ els: [{ id: "a", kind: "text" }, { id: "a", kind: "text" }] });
    expect(new Set(d.els.map((e) => e.id)).size).toBe(2);
  });
  it("แม่แบบในตัวผ่านการตรวจครบ", () => {
    for (const t of builtinTemplates()) expect(cleanDoc(t.doc).els.length).toBe(t.doc.els.length);
  });
});

describe("ข้อความตาม role (แบบ A)", () => {
  const tpl = builtinTemplates().find((t) => t.id === "builtin:bday")!.doc;
  it("ใส่ข้อความลงชิ้น message/from · ถึงไม่มีชิ้น = ไม่เพิ่ม", () => {
    const d = fillTexts(tpl, { message: "สุขสันต์วันเกิด", from: "แม่", to: "ลูก" });
    expect(roleTexts(d)).toEqual({ message: "สุขสันต์วันเกิด", to: "", from: "แม่" });
    expect(d.els.length).toBe(tpl.els.length);
  });
  it("แม่แบบไม่มีชิ้นข้อความ → เพิ่มชิ้น message ให้", () => {
    const d = fillTexts(cleanDoc({ w: 100, h: 100 }), { message: "Hi" });
    expect(roleTexts(d).message).toBe("Hi");
  });
});

describe("resizeDoc", () => {
  it("ย่อตามสัดส่วน", () => {
    const d = cleanDoc({ w: 100, h: 100, els: [{ kind: "text", x: 50, y: 50, w: 40, h: 20, style: { size: 20 } }] });
    const r = resizeDoc(d, 50, 100);
    expect(r.els[0]).toMatchObject({ x: 25, y: 50, w: 20, h: 20 });
    expect(r.els[0].style!.size).toBe(10);
  });
});

describe("ฟอนต์", () => {
  it("ลิงก์ Google เฉพาะฟอนต์ในรายการ", () => {
    const h = googleFontsHref(["Charm", "Great Vibes", "upload:x", "Nope"]);
    expect(h).toContain("family=Charm:wght@400;700");
    expect(h).toContain("family=Great+Vibes:wght@400");
    expect(h).not.toContain("Nope");
    expect(googleFontsHref([])).toBe("");
  });
  it("ฟอนต์อัปโหลด", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(fontStack(`upload:${id}`)).toContain("gcf-123e4567e89b12d3a456426614174000");
    expect(uploadFontFaces([`upload:${id}`, "Charm"])).toContain(`/api/order-gift-cards/fonts/${id}`);
  });
});

describe("cardHtml / cardsPrintHtml", () => {
  const doc: CardDoc = cleanDoc({ w: 148, h: 105, els: [
    { kind: "text", text: "<b>hi</b>", x: 10, y: 10, w: 50, h: 20, style: { font: "Kanit", size: 10 } },
    { kind: "image", src: "r2:gift/a-b.png", x: 0, y: 0, w: 10, h: 10 },
    { kind: "text", text: "ซ่อน", hidden: true },
  ] });
  it("ขนาดจริง มม. + กันโค้ด", () => {
    const h = cardHtml(doc, { r2ToUrl: r2 });
    expect(h).toContain("width:148mm");
    expect(h).toContain("font-size:3.528mm");
    expect(h).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(h).toContain("/api/r2-image?key=gift%2Fa-b.png");
    expect(h).not.toContain("ซ่อน");
  });
  it("px สำหรับรูป", () => expect(cardHtml(doc, { r2ToUrl: r2, pxPerMm: 4 })).toContain("width:592px"));
  it("A4 วาง A6 ได้ 2 ใบ/แผ่น · 3 ใบ = 2 หน้า · ฟอนต์ถูกโหลด", () => {
    const h = cardsPrintHtml([doc, doc, doc], "sheet", { r2ToUrl: r2 });
    expect(h.match(/class="pg /g)?.length).toBe(2);
    expect(h).toContain("family=Kanit");
    expect(h).toContain("size:A4");
  });
  it("1 ใบต่อแผ่น = กระดาษขนาดการ์ด", () => {
    const h = cardsPrintHtml([doc], "single", { r2ToUrl: r2 });
    expect(h).toContain("size:148mm 105mm");
  });
  it("ไม่มีการ์ด", () => expect(cardsPrintHtml([], "sheet", { r2ToUrl: r2 })).toContain("ไม่มีการ์ดที่ต้องพิมพ์"));
  it("ฟอนต์ที่ใช้", () => expect(docFonts(doc)).toContain("Kanit"));
});

describe("resolveSrc / cardStatus", () => {
  it("สติ๊กเกอร์ = data url · r2 ผ่านตัวแปลง · อื่นไม่รับ", () => {
    expect(resolveSrc("sticker:heart", r2)).toMatch(/^data:image\/svg\+xml/);
    expect(resolveSrc("sticker:nope", r2)).toBeNull();
    expect(resolveSrc("r2:k", r2)).toBe("/api/r2-image?key=k");
    expect(resolveSrc("http://x", r2)).toBeNull();
  });
  it("สถานะ", () => {
    expect(cardStatus(null).key).toBe("none");
    expect(cardStatus({}).key).toBe("draft");
    expect(cardStatus({ printed_at: "x" }).key).toBe("printed");
    expect(cardStatus({ printed_at: "x", hand_written_at: "y" }).key).toBe("written");
  });
});

describe("การ์ดพับ A6 + กลุ่มแม่แบบ (2026-11-25)", () => {
  it("การ์ดพับใหม่ = A5 + ด้านในมีช่องข้อความจากลูกค้า · cleanDoc เก็บ fold/inside ไว้", () => {
    const d = newFoldedDoc("side");
    expect([d.w, d.h]).toEqual([210, 148]);
    expect(isFolded(d)).toBe(true);
    expect(acceptsMessage(d)).toBe(true);
    const c = cleanDoc(JSON.parse(JSON.stringify(d)));
    expect(c.fold).toBe("side");
    expect(c.inside?.els.some((e) => e.role === "message")).toBe(true);
    expect(foldLine(c)).toEqual({ x: 105 });
    expect(foldLine(newFoldedDoc("top"))).toEqual({ y: 105 });
  });
  it("fillTexts ใส่ข้อความลงด้านใน · roleTexts อ่านด้านในได้", () => {
    const d = fillTexts(newFoldedDoc("side"), { message: "สุขสันต์วันเกิด", from: "แม่" });
    expect(roleTexts(d)).toMatchObject({ message: "สุขสันต์วันเกิด", from: "แม่" });
    expect(d.els.some((e) => e.text === "สุขสันต์วันเกิด")).toBe(false);
  });
  it("faceDoc / withFace สลับด้านโดยไม่ทำด้านอื่นหาย", () => {
    const d = newFoldedDoc("side");
    const inside = faceDoc(d, "in");
    const changed = withFace(d, "in", { ...inside, bg: { ...inside.bg, color: "#eeeeee" } });
    expect(changed.inside?.bg.color).toBe("#eeeeee");
    expect(changed.bg.color).toBe(d.bg.color);
    expect(faceDoc(cleanDoc({ w: 148, h: 105, els: [] }), "in").w).toBe(148);   // การ์ดแผ่นเดียว = ตัวมันเอง
  });
  it("การ์ดไม่มีช่องข้อความจากลูกค้า = ข้อความตายตัว", () => {
    expect(acceptsMessage(cleanDoc({ w: 148, h: 105, els: [{ kind: "text", text: "HBD", style: {} }] }))).toBe(false);
  });
  it("พิมพ์การ์ดพับ: ด้านนอกทุกใบก่อน แล้วด้านในทุกใบ", () => {
    const html = cardsPrintHtml([newFoldedDoc("side"), newFoldedDoc("side")], "single", { r2ToUrl: () => null });
    expect((html.match(/class="pg fo"/g) ?? []).length).toBe(4);
  });
  it("groupTemplates: ในตัวที่ถูกแก้แล้วซ่อน · จัดกลุ่ม · ของที่ออกแบบเองเรียงตาม sort_order", () => {
    const own = [
      { id: "b", group: "การ์ดวันเกิด", sort_order: 20, replaces_builtin: null },
      { id: "a", group: "การ์ดวันเกิด", sort_order: 10, replaces_builtin: "builtin:bday" },
    ];
    const builtins = builtinTemplates().map((t) => ({ id: t.id, group: t.group, builtin: true }));
    const g = groupTemplates<{ id: string; group?: string | null; sort_order?: number; replaces_builtin?: string | null; builtin?: boolean }>(own, builtins);
    const bday = g.find((x) => x.group === "การ์ดวันเกิด")!;
    expect(bday.items.map((x) => x.id).slice(0, 2)).toEqual(["a", "b"]);
    expect(bday.items.some((x) => x.id === "builtin:bday")).toBe(false);
    expect(bday.items.some((x) => x.id === "builtin:bday-fold")).toBe(true);
  });
});

describe("isSpecialTemplate", () => {
  const flat = { v: 1 as const, w: 100, h: 70, bg: { color: "#fff", image: null, fit: "cover" as const }, els: [] };
  it("ติ๊กไว้ใช้ค่าที่ติ๊ก · ยังไม่ตั้ง = การ์ดพับเป็นพิเศษ", () => {
    expect(isSpecialTemplate({ doc: flat })).toBe(false);
    expect(isSpecialTemplate({ doc: nfdSpecial("side") })).toBe(true);
    expect(isSpecialTemplate({ is_special: true, doc: flat })).toBe(true);
    expect(isSpecialTemplate({ is_special: false, doc: nfdSpecial("top") })).toBe(false);
    expect(isSpecialTemplate({ is_special: null, doc: flat })).toBe(false);
  });
});
