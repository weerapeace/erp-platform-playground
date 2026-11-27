/**
 * ผู้ช่วยเสียง — กติกากลาง (ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์) · คู่มือ docs/voice-assistant.md
 *
 * 1 คำสั่ง = ฟังเสียง (/api/voice-assistant/transcribe) → ข้อความ (แก้ได้ก่อนส่ง) → เข้าใจคำสั่ง (/api/voice-assistant/command)
 * AI ตอบได้แค่ 4 แบบ (VOICE_ACTIONS) และ "ทำเองไม่ได้" — ระบบแค่เปิดหน้า / เปิดตัวเพิ่ม SKU พร้อมค่า ให้คนกดบันทึกเอง
 * ทุกค่าที่ AI ส่งมาต้องผ่าน normalizeVoiceReply ก่อนใช้ (หน้าต้องอยู่ในรายการที่คนนี้เห็นได้ · ตัวเลือกต้องเป็นตัวที่ระบบส่งไป)
 */

export const VOICE_ACTIONS = ["open_page", "add_sku", "choose", "none"] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

/** ค่าที่ผู้ช่วยกรอกให้ตัวเพิ่ม SKU ได้ (คอลัมน์ skus_v2 ที่ตัวเพิ่ม SKU รับ prefill) — นอกจากนี้ทิ้ง */
export type VoiceSkuDraft = { name_th?: string; color?: string; code?: string; standard_price?: number; rmb_cost?: number };

export type VoiceChoice = { id: string; label: string };
export type VoiceTurn = { role: "user" | "assistant"; text: string };
export type VoicePageLite = { id: string; label: string; href: string; where?: string; keywords?: string[] };

export type VoiceReply = {
  say: string;
  action: VoiceAction;
  page?: { id: string; label: string; href: string };
  sku?: VoiceSkuDraft;
  choiceId?: string;
};

/** เพดานต่าง ๆ — กันข้อความยาวเกิน (ค่าใช้จ่าย) */
export const VOICE_LIMITS = { textChars: 400, historyTurns: 6, turnChars: 300, sayChars: 240, pages: 400 } as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[,฿\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined;
};

/** ประวัติที่ส่งให้ AI — เอาเฉพาะท้าย ๆ · ตัดยาว · ข้ามแถวเพี้ยน */
export function cleanHistory(raw: unknown): VoiceTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => ({ role: (t as VoiceTurn)?.role === "assistant" ? "assistant" : "user", text: str((t as VoiceTurn)?.text, VOICE_LIMITS.turnChars) }) as VoiceTurn)
    .filter((t) => t.text)
    .slice(-VOICE_LIMITS.historyTurns);
}

/** ตัวเลือกที่ค้างอยู่ (ฝั่งหน้าจอส่งมา) — id/label ต้องเป็นข้อความ · ไม่เกิน 12 ตัว */
export function cleanChoices(raw: unknown): VoiceChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({ id: str((c as VoiceChoice)?.id, 80), label: str((c as VoiceChoice)?.label, 80) })).filter((c) => c.id && c.label).slice(0, 12);
}

/**
 * ตรวจคำตอบของ AI ก่อนใช้ — ค่าที่ไม่อยู่ในรายการจริง = ไม่ทำ (action none) พร้อมข้อความภาษาคน
 * pages = หน้าที่คนนี้เห็นได้ · choices = ตัวเลือกที่ระบบส่งไป · canAddSku = มีสิทธิ์ products.create
 */
export function normalizeVoiceReply(raw: Record<string, unknown> | null | undefined, opts: { pages: VoicePageLite[]; choices: VoiceChoice[]; canAddSku: boolean }): VoiceReply {
  const r = raw ?? {};
  let say = str(r.say, VOICE_LIMITS.sayChars);
  const action = (VOICE_ACTIONS as readonly string[]).includes(String(r.action)) ? (r.action as VoiceAction) : "none";

  if (action === "open_page") {
    const id = str(r.page_id, 80);
    const p = opts.pages.find((x) => x.id === id);
    if (!p) return { say: "ไม่เจอหน้านี้ในเมนูที่คุณเข้าได้ ลองพูดชื่อหน้าอีกครั้ง", action: "none" };
    return { say: say || `เปิดหน้า ${p.label} ให้แล้ว`, action, page: { id: p.id, label: p.label, href: p.href } };
  }
  if (action === "add_sku") {
    if (!opts.canAddSku) return { say: "บัญชีนี้ยังไม่มีสิทธิ์เพิ่มสินค้า ให้หัวหน้าหรือแอดมินเปิดสิทธิ์ให้ก่อน", action: "none" };
    const s = (r.sku ?? {}) as Record<string, unknown>;
    const sku: VoiceSkuDraft = {};
    const name = str(s.name_th, 200); if (name) sku.name_th = name;
    const color = str(s.color, 60); if (color) sku.color = color;
    const code = str(s.code, 60).replace(/\s+/g, ""); if (code) sku.code = code;
    const price = num(s.standard_price); if (price !== undefined) sku.standard_price = price;
    const rmb = num(s.rmb_cost); if (rmb !== undefined) sku.rmb_cost = rmb;
    return { say: say || "เปิดตัวเพิ่ม SKU ให้แล้ว เลือกประเภทได้เลย", action, sku };
  }
  if (action === "choose") {
    const id = str(r.choice_id, 80);
    if (!opts.choices.some((c) => c.id === id)) return { say: say || "ยังไม่แน่ใจว่าเลือกตัวไหน กดเลือกจากรายการได้เลย", action: "none" };
    return { say, action, choiceId: id };
  }
  if (!say) say = "ยังไม่เข้าใจคำสั่ง ลองพูดใหม่อีกครั้ง เช่น \"เปิดหน้าใบสั่งซื้อ\" หรือ \"เพิ่ม SKU ใหม่\"";
  return { say, action: "none" };
}

const normTh = (s: string) => s.toLowerCase().replace(/[\s.,!?'"()\-–—]/g, "");

/** คำที่แปลว่า "ข้าม/เลือกเองในฟอร์ม" ตอนมีตัวเลือกค้าง */
export const SKIP_WORDS = ["ข้าม", "เลือกเอง", "ไม่เลือก", "ไม่มี", "ไม่ใช่สักอัน", "skip"];

/**
 * จับคำพูดกับตัวเลือกที่ค้างอยู่ "ในเครื่อง" (ไม่เรียก AI = ไม่เสียเงิน) — เจอตัวเดียวชัด ๆ = คืนตัวนั้น · กำกวม = null (ส่งให้ AI)
 * "skip" = ผู้ใช้บอกข้าม
 */
export function matchChoiceLocally(text: string, choices: VoiceChoice[]): VoiceChoice | "skip" | null {
  const t = normTh(text);
  if (!t) return null;
  if (SKIP_WORDS.some((w) => t === normTh(w) || t.startsWith(normTh(w)))) return "skip";
  const exact = choices.filter((c) => normTh(c.label) === t);
  if (exact.length === 1) return exact[0];
  const hits = choices.filter((c) => { const l = normTh(c.label); return l.length >= 2 && (t.includes(l) || (t.length >= 3 && l.includes(t))); });
  if (hits.length === 1) return hits[0];
  // หลายตัวตรง → เลือกตัวที่ชื่อยาวสุดที่อยู่ในคำพูด (เช่น "กระเป๋าสะพายข้าง" ชนะ "กระเป๋า")
  const inText = hits.filter((c) => t.includes(normTh(c.label))).sort((a, b) => b.label.length - a.label.length);
  if (inText.length && (inText.length === 1 || normTh(inText[0].label).length > normTh(inText[1].label).length)) return inText[0];
  return null;
}

/** คำสั่งระบบให้ AI — ส่วนที่คงที่ต่อคน (หน้า/สิทธิ์) อยู่ต้น เพื่อให้ OpenAI จำแคชได้ (ถูกลง) */
export function buildVoiceSystemPrompt(pages: VoicePageLite[], canAddSku: boolean): string {
  const list = pages.slice(0, VOICE_LIMITS.pages)
    .map((p) => [p.id, p.label, p.where ?? "", (p.keywords ?? []).join(",")].join(" | "))
    .join("\n");
  return [
    "คุณคือผู้ช่วยเสียงในระบบ ERP ของบริษัท (ผู้ใช้เป็นพนักงานไทย พูดภาษาไทยปนอังกฤษ ข้อความมาจากการถอดเสียง อาจสะกดเพี้ยน)",
    "หน้าที่: ฟังคำสั่งแล้วเลือกการกระทำ 1 อย่าง ตอบเป็น JSON เท่านั้น รูปแบบ:",
    '{"say":"ข้อความพูดตอบสั้น ๆ ไม่เกิน 2 ประโยค สุภาพ ลงท้ายครับ","action":"open_page|add_sku|choose|none","page_id":"...","sku":{"name_th":"...","color":"...","code":"...","standard_price":0,"rmb_cost":0},"choice_id":"..."}',
    "กติกา:",
    "1) open_page = ผู้ใช้อยากเปิด/ไปหน้าใดหน้าหนึ่ง → page_id ต้องเป็น id จากรายการหน้าด้านล่างเท่านั้น เลือกตัวที่ชื่อ/หมวด/คำพ้องใกล้ที่สุด ถ้าไม่มีหน้าที่ตรง ให้ action none แล้วบอกว่าไม่เจอ",
    canAddSku
      ? "2) add_sku = ผู้ใช้อยากเพิ่ม/สร้างสินค้าหรือ SKU ใหม่ → ใส่ค่าใน sku เฉพาะที่ผู้ใช้พูดจริง (name_th = ชื่อสินค้าภาษาไทย ไม่ต้องใส่คำว่า SKU · color = สี · code = รหัสถ้าพูด · standard_price = ราคาซื้อเป็นบาท · rmb_cost = ราคาหยวน) ห้ามเดาค่าที่ไม่ได้พูด"
      : "2) ผู้ใช้คนนี้ไม่มีสิทธิ์เพิ่มสินค้า → ถ้าขอเพิ่ม SKU ให้ action none แล้วบอกว่าต้องขอสิทธิ์ก่อน",
    "3) choose = มี \"ตัวเลือกที่ค้างอยู่\" และผู้ใช้พูดเลือกตัวใดตัวหนึ่ง → choice_id ต้องเป็น id จากตัวเลือกที่ค้างอยู่เท่านั้น",
    "4) none = คุยทั่วไป ถามสิ่งที่ทำไม่ได้ หรือไม่เข้าใจ → บอกสั้น ๆ ว่าตอนนี้ช่วยได้แค่ \"เปิดหน้า\" กับ \"เพิ่ม SKU ใหม่\"",
    "ห้ามบอกว่าบันทึกแล้ว — ระบบแค่เปิดหน้า/ฟอร์มให้ ผู้ใช้กดบันทึกเอง · ห้ามแต่ง id ที่ไม่มีในรายการ",
    "",
    "รายการหน้าที่ผู้ใช้นี้เข้าได้ (id | ชื่อ | แอป·หมวด | คำพ้อง):",
    list || "(ไม่มี)",
  ].join("\n");
}

/** ข้อความผู้ใช้ส่งให้ AI (ส่วนที่เปลี่ยนทุกครั้ง) */
export function buildVoiceUserPayload(input: { text: string; history: VoiceTurn[]; choices: VoiceChoice[]; path?: string }): string {
  return JSON.stringify({
    current_page: input.path ?? "",
    history: input.history,
    pending_choices: input.choices,
    command: input.text,
  });
}
