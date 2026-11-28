/**
 * ผู้ช่วยเสียง — กติกากลาง (ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์) · คู่มือ docs/voice-assistant.md
 *
 * 1 คำสั่ง = ฟังเสียง (/api/voice-assistant/transcribe) → ข้อความ (แก้ได้ก่อนส่ง) → เข้าใจคำสั่ง (/api/voice-assistant/command)
 * AI ตอบได้แค่แบบใน VOICE_ACTIONS และ "ทำเองไม่ได้" — ระบบเปิดหน้า / เปิดฟอร์มพร้อมค่า หรือโชว์สรุปให้คนกดยืนยัน (โหมด confirm) · ไม่บันทึกโดยไม่มีคนกด
 * คำสั่งไหนเปิด/โหมด/ตัวอย่างคำพูด = หน้าตั้งค่า /admin/voice-assistant (VoiceSettings)
 * ทุกค่าที่ AI ส่งมาต้องผ่าน normalizeVoiceReply ก่อนใช้ (หน้าต้องอยู่ในรายการที่คนนี้เห็นได้ · ตัวเลือกต้องเป็นตัวที่ระบบส่งไป)
 */

export const VOICE_ACTIONS = ["open_page", "add_sku", "product_detail", "choose", "none"] as const;
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
  /** ทำรายละเอียดสินค้า: คำค้นหาสินค้าแม่ (ชื่อ/รหัสที่พูด) — หน้าจอค้นต่อเอง */
  query?: string;
};

/* ─────────── ตั้งค่าผู้ช่วยเสียง (หน้า /admin/voice-assistant · เก็บ ui_config VOICE_SETTINGS_KEY) ─────────── */

/** คำสั่งที่ตั้งค่าได้ (choose/none เป็นกลไก ไม่ใช่คำสั่ง) */
export const VOICE_COMMANDS = ["open_page", "add_sku", "product_detail"] as const;
export type VoiceCommandKey = (typeof VOICE_COMMANDS)[number];
/** form = เปิดฟอร์ม/ตัวช่วยของเดิมให้คนทำต่อแล้วกดบันทึกเอง · confirm = ผู้ช่วยเตรียมให้ครบ แล้วโชว์สรุปให้กดยืนยันครั้งเดียว */
export type VoiceCmdMode = "form" | "confirm";
export type VoiceCommandSetting = { enabled: boolean; mode: VoiceCmdMode; examples: string[] };
export type VoiceSettings = { commands: Record<VoiceCommandKey, VoiceCommandSetting> };

export const VOICE_SETTINGS_KEY = "voice_assistant_settings";
export const VOICE_EXAMPLE_LIMITS = { perCommand: 12, chars: 120 } as const;

export const VOICE_COMMAND_INFO: Record<VoiceCommandKey, { label: string; desc: string; icon: string; modes: VoiceCmdMode[]; modeLabels: Partial<Record<VoiceCmdMode, string>>; examples: string[] }> = {
  open_page: {
    label: "เปิดหน้า", icon: "i:external-link", desc: "เปิดหน้าที่พูดถึง · เปิดได้เฉพาะหน้าที่คนนั้นมีสิทธิ์เห็น",
    modes: ["form"], modeLabels: { form: "เปิดหน้าให้" }, examples: ["เปิดหน้าใบสั่งซื้อ", "ไปหน้า SKU"],
  },
  add_sku: {
    label: "เพิ่ม SKU", icon: "i:plus", desc: "ฟังชื่อ สี รหัส ราคา แล้วเตรียม SKU ใหม่ให้",
    modes: ["form", "confirm"], modeLabels: { form: "เปิดฟอร์มให้คนกดบันทึก", confirm: "บันทึกเองหลังกดยืนยัน" },
    examples: ["เพิ่ม SKU ใหม่ กระเป๋าผ้าสีดำ ราคาซื้อ 120"],
  },
  product_detail: {
    label: "ทำรายละเอียดสินค้า", icon: "i:pencil", desc: "หาสินค้าแม่ (Parent SKU) → เปิดตัวช่วยเขียนรายละเอียดที่ขั้นจุดเด่น (AI ดูรูป)",
    modes: ["form", "confirm"], modeLabels: { form: "เปิดตัวช่วยให้คนกด AI เอง", confirm: "AI ร่างให้เลย แล้วกดแทรกและบันทึก" },
    examples: ["ทำรายละเอียดกระเป๋า Ma tote", "เขียนจุดเด่นสินค้า CVRT001"],
  },
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  commands: Object.fromEntries(VOICE_COMMANDS.map((k) => [k, { enabled: true, mode: "form", examples: [...VOICE_COMMAND_INFO[k].examples] }])) as Record<VoiceCommandKey, VoiceCommandSetting>,
};

/** ค่าที่อ่านจากฐานข้อมูล/ส่งมาจากหน้าตั้งค่า → ค่าที่ใช้ได้เสมอ (ช่องที่หาย = ค่าเริ่มต้น · โหมดที่คำสั่งไม่รองรับ = ตัวแรก) */
export function normalizeVoiceSettings(raw: unknown): VoiceSettings {
  const cmds = ((raw as { commands?: unknown } | null)?.commands ?? {}) as Record<string, Partial<VoiceCommandSetting> | undefined>;
  const out = {} as Record<VoiceCommandKey, VoiceCommandSetting>;
  for (const k of VOICE_COMMANDS) {
    const c = cmds[k] ?? {};
    const def = DEFAULT_VOICE_SETTINGS.commands[k];
    const modes = VOICE_COMMAND_INFO[k].modes;
    const examples = Array.isArray(c.examples)
      ? [...new Set(c.examples.map((x) => str(x, VOICE_EXAMPLE_LIMITS.chars)).filter(Boolean))].slice(0, VOICE_EXAMPLE_LIMITS.perCommand)
      : def.examples;
    out[k] = {
      enabled: typeof c.enabled === "boolean" ? c.enabled : def.enabled,
      mode: modes.includes(c.mode as VoiceCmdMode) ? (c.mode as VoiceCmdMode) : modes[0],
      examples,
    };
  }
  return { commands: out };
}

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
export function normalizeVoiceReply(raw: Record<string, unknown> | null | undefined, opts: { pages: VoicePageLite[]; choices: VoiceChoice[]; canAddSku: boolean; canEditProducts?: boolean; settings?: VoiceSettings }): VoiceReply {
  const r = raw ?? {};
  let say = str(r.say, VOICE_LIMITS.sayChars);
  const action = (VOICE_ACTIONS as readonly string[]).includes(String(r.action)) ? (r.action as VoiceAction) : "none";
  // คำสั่งที่ผู้ดูแลปิดไว้ในหน้าตั้งค่า = ไม่ทำ
  if ((VOICE_COMMANDS as readonly string[]).includes(action) && opts.settings && !opts.settings.commands[action as VoiceCommandKey].enabled)
    return { say: "คำสั่งนี้ผู้ดูแลปิดไว้ในหน้าตั้งค่าผู้ช่วยเสียง", action: "none" };

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
  if (action === "product_detail") {
    if (opts.canEditProducts === false) return { say: "บัญชีนี้ยังไม่มีสิทธิ์แก้ข้อมูลสินค้า ให้หัวหน้าหรือแอดมินเปิดสิทธิ์ให้ก่อน", action: "none" };
    const query = str(r.query, 80);
    if (!query) return { say: say || "ทำรายละเอียดสินค้าตัวไหนครับ พูดชื่อหรือรหัสสินค้าได้เลย", action: "none" };
    return { say: say || `กำลังหาสินค้า ${query} ครับ`, action, query };
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
export function buildVoiceSystemPrompt(pages: VoicePageLite[], canAddSku: boolean, settings: VoiceSettings = DEFAULT_VOICE_SETTINGS, canEditProducts = true): string {
  const list = pages.slice(0, VOICE_LIMITS.pages)
    .map((p) => [p.id, p.label, p.where ?? "", (p.keywords ?? []).join(",")].join(" | "))
    .join("\n");
  const on = (k: VoiceCommandKey) => settings.commands[k].enabled;
  const ex = (k: VoiceCommandKey) => (settings.commands[k].examples.length ? ` · ตัวอย่างคำพูด: ${settings.commands[k].examples.map((x) => `"${x}"`).join(", ")}` : "");
  const can = VOICE_COMMANDS.filter(on).map((k) => `"${VOICE_COMMAND_INFO[k].label}"`).join(" กับ ") || "(ยังไม่มีคำสั่งที่เปิด)";
  return [
    "คุณคือผู้ช่วยเสียงในระบบ ERP ของบริษัท (ผู้ใช้เป็นพนักงานไทย พูดภาษาไทยปนอังกฤษ ข้อความมาจากการถอดเสียง อาจสะกดเพี้ยน)",
    "หน้าที่: ฟังคำสั่งแล้วเลือกการกระทำ 1 อย่าง ตอบเป็น JSON เท่านั้น รูปแบบ:",
    '{"say":"ข้อความพูดตอบสั้น ๆ ไม่เกิน 2 ประโยค สุภาพ ลงท้ายครับ","action":"open_page|add_sku|product_detail|choose|none","page_id":"...","sku":{"name_th":"...","color":"...","code":"...","standard_price":0,"rmb_cost":0},"query":"...","choice_id":"..."}',
    "กติกา:",
    on("open_page")
      ? `1) open_page = ผู้ใช้อยากเปิด/ไปหน้าใดหน้าหนึ่ง → page_id ต้องเป็น id จากรายการหน้าด้านล่างเท่านั้น เลือกตัวที่ชื่อ/หมวด/คำพ้องใกล้ที่สุด ถ้าไม่มีหน้าที่ตรง ให้ action none แล้วบอกว่าไม่เจอ${ex("open_page")}`
      : "1) คำสั่งเปิดหน้าถูกปิดอยู่ → ถ้าขอเปิดหน้า ให้ action none แล้วบอกว่าผู้ดูแลปิดคำสั่งนี้",
    !on("add_sku")
      ? "2) คำสั่งเพิ่ม SKU ถูกปิดอยู่ → ถ้าขอเพิ่ม SKU ให้ action none แล้วบอกว่าผู้ดูแลปิดคำสั่งนี้"
      : canAddSku
        ? `2) add_sku = ผู้ใช้อยากเพิ่ม/สร้างสินค้าหรือ SKU ใหม่ → ใส่ค่าใน sku เฉพาะที่ผู้ใช้พูดจริง (name_th = ชื่อสินค้าภาษาไทย ไม่ต้องใส่คำว่า SKU · color = สี · code = รหัสถ้าพูด · standard_price = ราคาซื้อเป็นบาท · rmb_cost = ราคาหยวน) ห้ามเดาค่าที่ไม่ได้พูด${ex("add_sku")}`
        : "2) ผู้ใช้คนนี้ไม่มีสิทธิ์เพิ่มสินค้า → ถ้าขอเพิ่ม SKU ให้ action none แล้วบอกว่าต้องขอสิทธิ์ก่อน",
    !on("product_detail")
      ? "3) คำสั่งทำรายละเอียดสินค้าถูกปิดอยู่ → ถ้าขอ ให้ action none แล้วบอกว่าผู้ดูแลปิดคำสั่งนี้"
      : canEditProducts
        ? `3) product_detail = ผู้ใช้อยากทำ/เขียน/แก้รายละเอียด คำอธิบาย หรือจุดเด่นของสินค้า → query = ชื่อหรือรหัสสินค้าที่พูด (ตัดคำว่า ทำรายละเอียด/สินค้า ออก) ห้ามเดา${ex("product_detail")}`
        : "3) ผู้ใช้คนนี้ไม่มีสิทธิ์แก้ข้อมูลสินค้า → ถ้าขอทำรายละเอียดสินค้า ให้ action none แล้วบอกว่าต้องขอสิทธิ์ก่อน",
    "4) choose = มี \"ตัวเลือกที่ค้างอยู่\" และผู้ใช้พูดเลือกตัวใดตัวหนึ่ง → choice_id ต้องเป็น id จากตัวเลือกที่ค้างอยู่เท่านั้น",
    `5) none = คุยทั่วไป ถามสิ่งที่ทำไม่ได้ หรือไม่เข้าใจ → บอกสั้น ๆ ว่าตอนนี้ช่วยได้แค่ ${can}`,
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
