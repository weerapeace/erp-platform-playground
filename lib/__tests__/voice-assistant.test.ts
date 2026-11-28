import { describe, expect, it } from "vitest";
import { buildVoiceSystemPrompt, cleanChoices, cleanHistory, CROSS_CHECK_HREF, matchChoiceLocally, matchFormFields, normalizeVoiceReply, normalizeVoiceSettings, pageCommandsFor, VOICE_COMMANDS, VOICE_EXAMPLE_LIMITS, VOICE_LIMITS } from "@/lib/voice-assistant";
import { isReasoningModel } from "@/lib/ai-caption-models";

const pages = [
  { id: "p1", label: "ใบสั่งซื้อ", href: "/purchasing/orders", where: "จัดซื้อ" },
  { id: "p2", label: "SKU", href: "/master/skus", where: "สินค้า" },
];
const choices = [{ id: "t1", label: "กระเป๋าสะพาย" }, { id: "t2", label: "กระเป๋าถือ" }, { id: "t3", label: "กระเป๋าสะพายข้าง" }];

describe("ผู้ช่วยเสียง — ตรวจคำตอบ AI", () => {
  it("เปิดหน้าได้เฉพาะหน้าที่อยู่ในรายการ", () => {
    expect(normalizeVoiceReply({ action: "open_page", page_id: "p1", say: "เปิดให้แล้วครับ" }, { pages, choices: [], canAddSku: true }))
      .toEqual({ action: "open_page", say: "เปิดให้แล้วครับ", page: { id: "p1", label: "ใบสั่งซื้อ", href: "/purchasing/orders" } });
    const bad = normalizeVoiceReply({ action: "open_page", page_id: "hacked", say: "x" }, { pages, choices: [], canAddSku: true });
    expect(bad.action).toBe("none");
    expect(bad.page).toBeUndefined();
  });

  it("เพิ่ม SKU: เก็บเฉพาะช่องที่รับ · ตัวเลขสะอาด · ไม่มีสิทธิ์ = ไม่เปิด", () => {
    const r = normalizeVoiceReply({ action: "add_sku", sku: { name_th: " กระเป๋าผ้า ", color: "ดำ", standard_price: "1,200", rmb_cost: -5, evil: "x" } }, { pages, choices: [], canAddSku: true });
    expect(r.action).toBe("add_sku");
    expect(r.sku).toEqual({ name_th: "กระเป๋าผ้า", color: "ดำ", standard_price: 1200 });
    expect(normalizeVoiceReply({ action: "add_sku", sku: { name_th: "x" } }, { pages, choices: [], canAddSku: false }).action).toBe("none");
  });

  it("เลือกตัวเลือกได้เฉพาะตัวที่ระบบส่งไป · คำสั่งแปลก = none พร้อมข้อความ", () => {
    expect(normalizeVoiceReply({ action: "choose", choice_id: "t2" }, { pages, choices, canAddSku: true }).choiceId).toBe("t2");
    expect(normalizeVoiceReply({ action: "choose", choice_id: "zz" }, { pages, choices, canAddSku: true }).action).toBe("none");
    const n = normalizeVoiceReply({ action: "delete_everything" }, { pages, choices: [], canAddSku: true });
    expect(n.action).toBe("none");
    expect(n.say.length).toBeGreaterThan(0);
    expect(normalizeVoiceReply(null, { pages, choices: [], canAddSku: true }).action).toBe("none");
  });

  it("ข้อความพูดตอบถูกตัดตามเพดาน", () => {
    expect(normalizeVoiceReply({ action: "none", say: "ก".repeat(999) }, { pages, choices: [], canAddSku: true }).say.length).toBe(VOICE_LIMITS.sayChars);
  });
});

describe("ผู้ช่วยเสียง — จับคำพูดกับตัวเลือกในเครื่อง (ไม่เสียค่า AI)", () => {
  it("ตรงตัว / อยู่ในประโยค / ชื่อยาวสุดชนะ", () => {
    expect(matchChoiceLocally("กระเป๋าถือ", choices)).toEqual(choices[1]);
    expect(matchChoiceLocally("เอาเป็นกระเป๋าถือครับ", choices)).toEqual(choices[1]);
    expect(matchChoiceLocally("กระเป๋าสะพายข้าง", choices)).toEqual(choices[2]);
  });
  it("ข้าม / กำกวม", () => {
    expect(matchChoiceLocally("ข้าม", choices)).toBe("skip");
    expect(matchChoiceLocally("เลือกเองดีกว่า", choices)).toBe("skip");
    expect(matchChoiceLocally("กระเป๋า", choices)).toBeNull();
    expect(matchChoiceLocally("", choices)).toBeNull();
  });
});

describe("ผู้ช่วยเสียง — ข้อมูลเข้า", () => {
  it("ประวัติ: เอาท้าย ๆ · บทบาทแปลก = user · ข้ามแถวว่าง", () => {
    const h = cleanHistory([...Array(10)].map((_, i) => ({ role: i % 2 ? "assistant" : "hacker", text: `m${i}` })).concat([{ role: "user", text: "  " }] as never));
    expect(h.length).toBe(VOICE_LIMITS.historyTurns);
    expect(h.every((t) => t.role === "user" || t.role === "assistant")).toBe(true);
    expect(cleanHistory("x")).toEqual([]);
  });
  it("ตัวเลือก: ต้องมี id + label", () => {
    expect(cleanChoices([{ id: "a", label: "A" }, { id: "", label: "B" }, null])).toEqual([{ id: "a", label: "A" }]);
  });
  it("คำสั่งระบบมีรายการหน้า และบอกเรื่องสิทธิ์เพิ่มสินค้า", () => {
    const s = buildVoiceSystemPrompt(pages, false);
    expect(s).toContain("p1 | ใบสั่งซื้อ");
    expect(s).toContain("ไม่มีสิทธิ์เพิ่มสินค้า");
  });
});

describe("รุ่น GPT ที่คิดก่อนตอบ", () => {
  it("gpt-5 / gpt-6 / o-series = คิดก่อนตอบ · gpt-4 ไม่ใช่", () => {
    expect(isReasoningModel("gpt-6-luna")).toBe(true);
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true);
    expect(isReasoningModel("o3")).toBe(true);
    expect(isReasoningModel("gpt-4o-mini")).toBe(false);
    expect(isReasoningModel("gpt-4.1")).toBe(false);
  });
});

describe("ผู้ช่วยเสียง — ตั้งค่าคำสั่ง (หน้า /admin/voice-assistant)", () => {
  it("ค่าว่าง/เพี้ยน = ค่าเริ่มต้น · โหมดที่คำสั่งไม่รองรับ = ตัวแรก · ตัวอย่างตัดซ้ำ/ตัดยาว", () => {
    const d = normalizeVoiceSettings(null);
    expect(VOICE_COMMANDS.every((k) => d.commands[k].enabled && d.commands[k].mode === "form")).toBe(true);
    const s = normalizeVoiceSettings({ commands: { open_page: { mode: "confirm", enabled: false }, add_sku: { mode: "confirm", examples: ["a", "a", " ", "x".repeat(500)] } } });
    expect(s.commands.open_page).toMatchObject({ enabled: false, mode: "form" });
    expect(s.commands.add_sku.mode).toBe("confirm");
    expect(s.commands.add_sku.examples).toEqual(["a", "x".repeat(VOICE_EXAMPLE_LIMITS.chars)]);
    expect(s.commands.product_detail.examples.length).toBeGreaterThan(0);
  });

  it("คำสั่งที่ปิด = ไม่ทำ แม้ AI จะตอบมา", () => {
    const settings = normalizeVoiceSettings({ commands: { add_sku: { enabled: false } } });
    expect(normalizeVoiceReply({ action: "add_sku", sku: { name_th: "x" } }, { pages, choices: [], canAddSku: true, settings }).action).toBe("none");
    expect(normalizeVoiceReply({ action: "open_page", page_id: "p1" }, { pages, choices: [], canAddSku: true, settings }).action).toBe("open_page");
  });

  it("ทำรายละเอียดสินค้า: ต้องมีคำค้น · ไม่มีสิทธิ์แก้สินค้า = ไม่ทำ", () => {
    expect(normalizeVoiceReply({ action: "product_detail", query: " Ma tote " }, { pages, choices: [], canAddSku: true }).query).toBe("Ma tote");
    expect(normalizeVoiceReply({ action: "product_detail", query: "" }, { pages, choices: [], canAddSku: true }).action).toBe("none");
    expect(normalizeVoiceReply({ action: "product_detail", query: "x" }, { pages, choices: [], canAddSku: true, canEditProducts: false }).action).toBe("none");
  });

  it("คำสั่งระบบให้ AI: ใส่ตัวอย่างคำพูด · คำสั่งที่ปิดบอกให้ตอบ none", () => {
    const settings = normalizeVoiceSettings({ commands: { open_page: { examples: ["ขอดูหน้าสต็อก"] }, add_sku: { enabled: false } } });
    const p = buildVoiceSystemPrompt(pages, true, settings);
    expect(p).toContain("ขอดูหน้าสต็อก");
    expect(p).toContain("คำสั่งเพิ่ม SKU ถูกปิดอยู่");
    expect(p).toContain("product_detail");
  });
});

describe("ผู้ช่วยเสียง รอบ 3 — คำสั่งพื้นฐาน + Platform", () => {
  const base = { pages, choices: [], canAddSku: true };
  it("เปิดเอกสาร / ค้นในหน้านี้ / สร้างใหม่", () => {
    expect(normalizeVoiceReply({ action: "open_record", query: "PO-2026-0018" }, base)).toMatchObject({ action: "open_record", query: "PO-2026-0018" });
    expect(normalizeVoiceReply({ action: "open_record" }, base).action).toBe("none");
    // ค้นในหน้านี้ได้เฉพาะหน้าที่มีตารางลงชื่อไว้
    expect(normalizeVoiceReply({ action: "search_here", query: "tote" }, base).action).toBe("none");
    expect(normalizeVoiceReply({ action: "search_here", query: "tote" }, { ...base, pageCaps: ["search_here"] }).query).toBe("tote");
    const c = normalizeVoiceReply({ action: "create_new", page_id: "p2", values: { ชื่อ: "ร้านเจริญผล", เบอร์: 812345678, "": "x", evil: { a: 1 } } }, base);
    expect(c.page?.href).toBe("/master/skus");
    expect(c.values).toEqual({ ชื่อ: "ร้านเจริญผล", เบอร์: "812345678" });
    expect(normalizeVoiceReply({ action: "create_new", page_id: "nope" }, base).action).toBe("none");
  });
  it("คำสั่งร้าน: ต้องมีสินค้า · ไม่มีสิทธิ์ = ไม่ทำ · ตรวจข้ามร้าน = ลิงก์คงที่", () => {
    expect(normalizeVoiceReply({ action: "copy_to_shop", query: "Ma tote", target: "Lazada" }, base)).toMatchObject({ action: "copy_to_shop", query: "Ma tote", target: "Lazada" });
    expect(normalizeVoiceReply({ action: "shop_status", query: "x" }, { ...base, canPlatforms: false }).action).toBe("none");
    expect(normalizeVoiceReply({ action: "list_all_shops" }, base).action).toBe("none");
    expect(normalizeVoiceReply({ action: "cross_check" }, base).page?.href).toBe(CROSS_CHECK_HREF);
  });
  it("ปุ่มลัดคำสั่งของหน้านี้ — ตามหน้า + ตัวทำงาน + เปิดอยู่", () => {
    const s = normalizeVoiceSettings(null);
    expect(pageCommandsFor("/master/platform-listing", s)).toEqual(expect.arrayContaining(["list_all_shops", "shop_status", "copy_to_shop", "cross_check"]));
    expect(pageCommandsFor("/purchase-orders", s)).toEqual([]);
    expect(pageCommandsFor("/purchase-orders", s, ["search_here"])).toEqual(["search_here"]);
    const off = normalizeVoiceSettings({ commands: { cross_check: { enabled: false } } });
    expect(pageCommandsFor("/master/platform-catalog", off)).not.toContain("cross_check");
    expect(pageCommandsFor("/master/parent-skus", s)).toContain("product_detail");
  });
  it("สร้างใหม่: จับชื่อช่องที่พูดกับช่องในฟอร์ม", () => {
    const fields = [{ key: "name", label: "ชื่อ" }, { key: "phone", label: "เบอร์โทรศัพท์" }, { key: "tax_id", label: "เลขผู้เสียภาษี" }];
    expect(matchFormFields({ ชื่อ: "ร้าน A", เบอร์โทร: "081", สีโปรด: "แดง" }, fields)).toEqual({ patch: { name: "ร้าน A", phone: "081" }, unmatched: ["สีโปรด"] });
  });
  it("คำสั่งระบบ: มีกติกาคำสั่งใหม่ + ไม่มีสิทธิ์ร้าน = บอกให้ขอสิทธิ์", () => {
    const p = buildVoiceSystemPrompt(pages, { canAddSku: true, canPlatforms: false });
    expect(p).toContain("open_record");
    expect(p).toContain("ไม่มีสิทธิ์ดูการลงสินค้าบนแพลตฟอร์ม");
  });
});
