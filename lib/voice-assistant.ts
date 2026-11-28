/**
 * ผู้ช่วยเสียง — กติกากลาง (ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์) · คู่มือ docs/voice-assistant.md
 *
 * 1 คำสั่ง = ฟังเสียง (/api/voice-assistant/transcribe) → ข้อความ (แก้ได้ก่อนส่ง) → เข้าใจคำสั่ง (/api/voice-assistant/command)
 * AI ตอบได้แค่แบบใน VOICE_ACTIONS และ "ทำเองไม่ได้" — ระบบเปิดหน้า / เปิดฟอร์ม-ตัวช่วยพร้อมค่า หรือโชว์สรุปให้คนกดยืนยัน (โหมด confirm) · ไม่บันทึกโดยไม่มีคนกด
 * คำสั่งไหนเปิด/โหมด/ตัวอย่างคำพูด = หน้าตั้งค่า /admin/voice-assistant (VoiceSettings)
 * ทุกค่าที่ AI ส่งมาต้องผ่าน normalizeVoiceReply ก่อนใช้ (หน้าต้องอยู่ในรายการที่คนนี้เห็นได้ · ตัวเลือกต้องเป็นตัวที่ระบบส่งไป)
 *
 * 3 ชั้น (เจ้าของเลือก 2026-11-28):
 *   ชั้น 1 คำสั่งพื้นฐานทุกหน้า (group "base") — เปิดเอกสาร (ค้นหารวม) · ค้นในตารางของหน้า · สร้างใหม่พร้อมค่า (?new=1)
 *   ชั้น 2 หน้าประกาศคำสั่งของตัวเอง — `pages` ในทะเบียนนี้ (ปุ่มลัด "คำสั่งของหน้านี้") + ตัวทำงานฝั่งหน้า useVoiceHandler (components/voice-assistant/page-handlers)
 *   ชั้น 3 ชุดคำสั่ง Platform (group "platform") — ลงทุกร้าน · ลงร้านไหนแล้ว · ลงร้านอื่นจากรายการนี้ · ตรวจข้ามร้าน
 */

export const VOICE_ACTIONS = [
  "open_page", "add_sku", "product_detail",
  "open_record", "search_here", "create_new",
  "list_all_shops", "shop_status", "copy_to_shop", "cross_check",
  "choose", "none",
] as const;
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
  /** คำค้น: สินค้าแม่ (ทำรายละเอียด/คำสั่งร้าน) · เลขเอกสาร/ชื่อ (เปิดเอกสาร) · คำค้นในตาราง (ค้นในหน้านี้) */
  query?: string;
  /** สร้างใหม่พร้อมค่า: ชื่อช่องตามที่พูด → ค่า (หน้าจอจับคู่กับช่องในฟอร์มเอง) */
  values?: Record<string, string>;
  /** ลงร้านอื่น: ชื่อร้านปลายทางที่พูด (ว่าง = ทุกร้านที่ยังไม่ลง) */
  target?: string;
};

/** ลิงก์มุมมองตรวจข้ามร้าน (หน้าสินค้าบนแพลตฟอร์ม) */
export const CROSS_CHECK_HREF = "/master/platform-catalog?view=cross";

/* ─────────── ทะเบียนคำสั่ง + ตั้งค่า (หน้า /admin/voice-assistant · เก็บ ui_config VOICE_SETTINGS_KEY) ─────────── */

/** คำสั่งที่ตั้งค่าได้ (choose/none เป็นกลไก ไม่ใช่คำสั่ง) */
export const VOICE_COMMANDS = [
  "open_record", "search_here", "create_new",
  "list_all_shops", "shop_status", "copy_to_shop", "cross_check",
  "open_page", "add_sku", "product_detail",
] as const;
export type VoiceCommandKey = (typeof VOICE_COMMANDS)[number];
/** form = เปิดฟอร์ม/ตัวช่วยของเดิมให้คนทำต่อแล้วกดบันทึกเอง · confirm = ผู้ช่วยเตรียมให้ครบ แล้วโชว์สรุปให้กดยืนยันครั้งเดียว */
export type VoiceCmdMode = "form" | "confirm";
export type VoiceCommandSetting = { enabled: boolean; mode: VoiceCmdMode; examples: string[] };
export type VoiceSettings = { commands: Record<VoiceCommandKey, VoiceCommandSetting> };
export type VoiceGroup = "base" | "platform" | "product";

export const VOICE_SETTINGS_KEY = "voice_assistant_settings";
export const VOICE_EXAMPLE_LIMITS = { perCommand: 12, chars: 120 } as const;

export const VOICE_GROUPS: Record<VoiceGroup, { label: string; desc: string }> = {
  base: { label: "คำสั่งพื้นฐาน (ทุกหน้า)", desc: "ใช้ได้ทุกหน้าที่ใช้ตาราง/ฟอร์ม/ค้นหากลาง — ไม่ต้องทำแยกต่อหน้า" },
  platform: { label: "หน้า: ลงสินค้าบนแพลตฟอร์ม", desc: "ทุกคำสั่งเปิดตัวช่วยของเดิม คนกดลงร้านเอง · ใช้ได้ทุกหน้า ปุ่มลัดโชว์ในหน้า Platform/Parent SKU" },
  product: { label: "สินค้า / หน้าทั่วไป", desc: "คำสั่งชุดแรก" },
};

/** ส่วนท้าย path ที่นับเป็นหน้า Platform (ปุ่มลัด "คำสั่งของหน้านี้") */
const PLATFORM_PAGES = ["/master/platform-listing", "/master/platform-catalog", "/master/parent-skus"];

export type VoiceCommandInfo = {
  label: string; desc: string; icon: string; group: VoiceGroup;
  modes: VoiceCmdMode[]; modeLabels: Partial<Record<VoiceCmdMode, string>>; examples: string[];
  /** ชั้น 2: หน้าที่โชว์คำสั่งนี้เป็นปุ่มลัด (path ขึ้นต้น) · ไม่ใส่ = ไม่มีปุ่มลัด */
  pages?: string[];
  /** ต้องมีตัวทำงานจากหน้านั้น (useVoiceHandler) ถึงจะใช้ได้ — เช่น ค้นในตาราง */
  needsHandler?: boolean;
};

export const VOICE_COMMAND_INFO: Record<VoiceCommandKey, VoiceCommandInfo> = {
  open_record: {
    label: "เปิดเอกสาร/รายการ", icon: "i:search", group: "base", desc: "พูดเลขเอกสารหรือชื่อ → ค้นหารวมแล้วเปิดใบนั้น (เจอหลายตัว = ให้เลือก) · ไม่แก้ข้อมูล",
    modes: ["form"], modeLabels: { form: "เปิดให้ดู" }, examples: ["เปิด PO-2026-0018", "เปิดใบเสนอราคา QT-2026-0042"],
  },
  search_here: {
    label: "ค้นในหน้านี้", icon: "i:filter", group: "base", desc: "ใส่คำค้นในตารางของหน้าที่เปิดอยู่ · ไม่แก้ข้อมูล · ใช้ได้ในหน้าที่มีตารางกลาง",
    modes: ["form"], modeLabels: { form: "ค้นในตาราง" }, examples: ["หาสินค้าที่ชื่อมีคำว่า tote", "ค้นหา JEAN10"], needsHandler: true,
  },
  create_new: {
    label: "สร้างใหม่พร้อมค่า", icon: "i:file-plus", group: "base", desc: "เปิดฟอร์ม \"เพิ่มใหม่\" ของหน้านั้น (ของเดิม) พร้อมเติมค่าที่พูดลงช่องที่ชื่อตรงกัน · คนกดบันทึกเอง",
    modes: ["form"], modeLabels: { form: "เปิดฟอร์มให้คนกดบันทึก" }, examples: ["สร้างลูกค้าใหม่ ชื่อร้านเจริญผล เบอร์ 0812345678"],
  },
  list_all_shops: {
    label: "ลงสินค้าทุกร้าน", icon: "i:cloud-upload", group: "platform", pages: PLATFORM_PAGES,
    desc: "หาสินค้า → เปิดตัวช่วยลงสินค้า (ของเดิม) ติ๊กร้านที่เชื่อมแล้วแต่ยังไม่ลงให้ · คนกดลงร้านเอง",
    modes: ["form"], modeLabels: { form: "เปิดตัวช่วยให้คนกดลง" }, examples: ["ลงสินค้า Ma tote ทุกร้าน", "เอา CVRT001 ขึ้นทุกร้านที่ยังไม่ลง"],
  },
  shop_status: {
    label: "ลงร้านไหนแล้ว", icon: "i:building-store", group: "platform", pages: PLATFORM_PAGES,
    desc: "บอกเป็นเสียงว่าสินค้านี้ลงร้านไหนแล้ว ร้านไหนยังไม่ลง · ไม่แก้ข้อมูล",
    modes: ["form"], modeLabels: { form: "ตอบเป็นเสียง" }, examples: ["Ma tote ลงร้านไหนแล้วบ้าง", "CVRT001 อยู่ Shopee หรือยัง"],
  },
  copy_to_shop: {
    label: "ลงร้านอื่นจากรายการนี้", icon: "i:copy", group: "platform", pages: PLATFORM_PAGES,
    desc: "ใช้รายการบนร้านที่ลงแล้วเป็นต้นแบบ → เปิดตัวช่วยลงร้านปลายทาง (เขียนเป็นร่างก่อน) · คนกดลงเอง",
    modes: ["form"], modeLabels: { form: "เปิดตัวช่วยให้คนกดลง" }, examples: ["ก๊อป Ma tote ไปร้าน Lazada", "ลง CVRT001 ร้านอื่นจากของบน Shopee"],
  },
  cross_check: {
    label: "ตรวจข้ามร้าน", icon: "i:table", group: "platform", pages: PLATFORM_PAGES,
    desc: "เปิดมุมมองตรวจข้ามร้าน (สินค้าแต่ละตัวลงร้านไหน ราคา/ชื่อตรงกันไหม)",
    modes: ["form"], modeLabels: { form: "เปิดหน้าให้" }, examples: ["เปิดหน้าตรวจข้ามร้าน", "ดูสินค้าที่ข้อมูลไม่ตรงกับร้าน"],
  },
  open_page: {
    label: "เปิดหน้า", icon: "i:external-link", group: "product", desc: "เปิดหน้าที่พูดถึง · เปิดได้เฉพาะหน้าที่คนนั้นมีสิทธิ์เห็น",
    modes: ["form"], modeLabels: { form: "เปิดหน้าให้" }, examples: ["เปิดหน้าใบสั่งซื้อ", "ไปหน้า SKU"],
  },
  add_sku: {
    label: "เพิ่ม SKU", icon: "i:plus", group: "product", desc: "ฟังชื่อ สี รหัส ราคา แล้วเตรียม SKU ใหม่ให้",
    modes: ["form", "confirm"], modeLabels: { form: "เปิดฟอร์มให้คนกดบันทึก", confirm: "บันทึกเองหลังกดยืนยัน" },
    examples: ["เพิ่ม SKU ใหม่ กระเป๋าผ้าสีดำ ราคาซื้อ 120"],
  },
  product_detail: {
    label: "ทำรายละเอียดสินค้า", icon: "i:pencil", group: "product", pages: ["/master/parent-skus"],
    desc: "หาสินค้าแม่ (Parent SKU) → เปิดตัวช่วยเขียนรายละเอียดที่ขั้นจุดเด่น (AI ดูรูป)",
    modes: ["form", "confirm"], modeLabels: { form: "เปิดตัวช่วยให้คนกด AI เอง", confirm: "AI ร่างให้เลย แล้วกดแทรกและบันทึก" },
    examples: ["ทำรายละเอียดกระเป๋า Ma tote", "เขียนจุดเด่นสินค้า CVRT001"],
  },
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  commands: Object.fromEntries(VOICE_COMMANDS.map((k) => [k, { enabled: true, mode: "form", examples: [...VOICE_COMMAND_INFO[k].examples] }])) as Record<VoiceCommandKey, VoiceCommandSetting>,
};

/** คำสั่งที่โชว์เป็นปุ่มลัดในหน้านี้ (ชั้น 2) — เปิดอยู่ + หน้าตรง + มีตัวทำงานจากหน้า (ถ้าคำสั่งนั้นต้องใช้) */
export function pageCommandsFor(path: string, settings: Pick<VoiceSettings, "commands">, handlers: readonly string[] = []): VoiceCommandKey[] {
  return VOICE_COMMANDS.filter((k) => {
    const info = VOICE_COMMAND_INFO[k];
    if (!settings.commands[k]?.enabled) return false;
    if (info.needsHandler) return handlers.includes(k);
    return !!info.pages?.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
  });
}

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
export const VOICE_LIMITS = { textChars: 400, historyTurns: 6, turnChars: 300, sayChars: 240, pages: 400, values: 8 } as const;

function str(v: unknown, max: number): string { return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
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

/** ตัวทำงานจากหน้าที่ฝั่งหน้าจอบอกว่ามี (เช่น "search_here") — รับเฉพาะคำสั่งที่ต้องใช้ตัวทำงาน */
export function cleanPageCaps(raw: unknown): VoiceCommandKey[] {
  if (!Array.isArray(raw)) return [];
  return VOICE_COMMANDS.filter((k) => VOICE_COMMAND_INFO[k].needsHandler && raw.includes(k));
}

/** สร้างใหม่พร้อมค่า: ชื่อช่อง → ค่า (ข้อความ) · ไม่เกิน VOICE_LIMITS.values ช่อง */
function cleanValues(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const key = str(k, 40);
    const s = typeof val === "number" ? String(val) : str(val, 120);
    if (key && s) out[key] = s;
    if (Object.keys(out).length >= VOICE_LIMITS.values) break;
  }
  return out;
}

/** สิทธิ์ที่ผู้ช่วยต้องรู้ (ฝั่งเซิร์ฟเวอร์เช็กจริงก่อนส่ง) */
export type VoicePerms = { canAddSku: boolean; canEditProducts?: boolean; canPlatforms?: boolean };

const PLATFORM_ACTIONS: VoiceAction[] = ["list_all_shops", "shop_status", "copy_to_shop", "cross_check"];

/**
 * ตรวจคำตอบของ AI ก่อนใช้ — ค่าที่ไม่อยู่ในรายการจริง = ไม่ทำ (action none) พร้อมข้อความภาษาคน
 * pages = หน้าที่คนนี้เห็นได้ · choices = ตัวเลือกที่ระบบส่งไป · pageCaps = ตัวทำงานที่หน้าปัจจุบันมี
 */
export function normalizeVoiceReply(
  raw: Record<string, unknown> | null | undefined,
  opts: VoicePerms & { pages: VoicePageLite[]; choices: VoiceChoice[]; settings?: VoiceSettings; pageCaps?: readonly string[] },
): VoiceReply {
  const r = raw ?? {};
  let say = str(r.say, VOICE_LIMITS.sayChars);
  const action = (VOICE_ACTIONS as readonly string[]).includes(String(r.action)) ? (r.action as VoiceAction) : "none";
  // คำสั่งที่ผู้ดูแลปิดไว้ในหน้าตั้งค่า = ไม่ทำ
  if ((VOICE_COMMANDS as readonly string[]).includes(action) && opts.settings && !opts.settings.commands[action as VoiceCommandKey].enabled)
    return { say: "คำสั่งนี้ผู้ดูแลปิดไว้ในหน้าตั้งค่าผู้ช่วยเสียง", action: "none" };
  const query = str(r.query, 80);
  const needQuery = (ask: string): VoiceReply | null => (query ? null : { say: say || ask, action: "none" });

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
    return needQuery("ทำรายละเอียดสินค้าตัวไหนครับ พูดชื่อหรือรหัสสินค้าได้เลย") ?? { say: say || `กำลังหาสินค้า ${query} ครับ`, action, query };
  }
  if (action === "open_record") {
    return needQuery("เปิดเอกสารเลขอะไรครับ พูดเลขหรือชื่อได้เลย") ?? { say: say || `กำลังหา ${query} ครับ`, action, query };
  }
  if (action === "search_here") {
    if (!opts.pageCaps?.includes("search_here")) return { say: "หน้านี้ยังไม่มีตารางให้ค้น ลองเปิดหน้ารายการก่อนครับ", action: "none" };
    return needQuery("ค้นหาคำว่าอะไรครับ") ?? { say: say || `ค้นหา ${query} ให้แล้วครับ`, action, query };
  }
  if (action === "create_new") {
    const id = str(r.page_id, 80);
    const p = opts.pages.find((x) => x.id === id);
    if (!p) return { say: "ไม่เจอหน้าที่จะสร้างใบใหม่ในเมนูที่คุณเข้าได้ ลองพูดชื่อหน้าอีกครั้ง", action: "none" };
    return { say: say || `เปิดฟอร์มเพิ่มใหม่ของ ${p.label} ให้แล้ว ตรวจแล้วกดบันทึกครับ`, action, page: { id: p.id, label: p.label, href: p.href }, values: cleanValues(r.values) };
  }
  if (PLATFORM_ACTIONS.includes(action)) {
    if (opts.canPlatforms === false) return { say: "บัญชีนี้ยังไม่มีสิทธิ์ดูการลงสินค้าบนแพลตฟอร์ม ให้หัวหน้าหรือแอดมินเปิดสิทธิ์ให้ก่อน", action: "none" };
    if (action === "cross_check") return { say: say || "เปิดหน้าตรวจข้ามร้านให้แล้วครับ", action, page: { id: "cross_check", label: "ตรวจข้ามร้าน", href: CROSS_CHECK_HREF } };
    const miss = needQuery("สินค้าตัวไหนครับ พูดชื่อหรือรหัสสินค้าได้เลย");
    if (miss) return miss;
    const target = action === "copy_to_shop" ? str(r.target, 40) : "";
    return { say: say || `กำลังหาสินค้า ${query} ครับ`, action, query, ...(target ? { target } : {}) };
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

/** กติกาต่อคำสั่ง (ส่วนที่ AI ต้องรู้ · ข้อความเดิมของรอบ 1-2 คงไว้) */
const RULES: Record<VoiceCommandKey, string> = {
  open_page: "open_page = ผู้ใช้อยากเปิด/ไปหน้าใดหน้าหนึ่ง → page_id ต้องเป็น id จากรายการหน้าด้านล่างเท่านั้น เลือกตัวที่ชื่อ/หมวด/คำพ้องใกล้ที่สุด ถ้าไม่มีหน้าที่ตรง ให้ action none แล้วบอกว่าไม่เจอ",
  add_sku: "add_sku = ผู้ใช้อยากเพิ่ม/สร้างสินค้าหรือ SKU ใหม่ → ใส่ค่าใน sku เฉพาะที่ผู้ใช้พูดจริง (name_th = ชื่อสินค้าภาษาไทย ไม่ต้องใส่คำว่า SKU · color = สี · code = รหัสถ้าพูด · standard_price = ราคาซื้อเป็นบาท · rmb_cost = ราคาหยวน) ห้ามเดาค่าที่ไม่ได้พูด",
  product_detail: "product_detail = ผู้ใช้อยากทำ/เขียน/แก้รายละเอียด คำอธิบาย หรือจุดเด่นของสินค้า → query = ชื่อหรือรหัสสินค้าที่พูด (ตัดคำว่า ทำรายละเอียด/สินค้า ออก) ห้ามเดา",
  open_record: "open_record = ผู้ใช้อยากเปิดเอกสาร/รายการตัวใดตัวหนึ่ง (เลขเอกสาร เช่น PO-…, QT-…, ชื่อลูกค้า/ร้าน/สินค้า/พนักงาน) → query = เลขหรือชื่อที่พูด (ถ้าแค่อยากไปหน้ารวม ใช้ open_page)",
  search_here: "search_here = ผู้ใช้อยากค้น/หา/กรองรายการ \"ในหน้าที่เปิดอยู่\" → query = คำค้นสั้น ๆ (ใช้ได้เฉพาะเมื่อ page_caps มี search_here)",
  create_new: "create_new = ผู้ใช้อยากสร้าง/เพิ่มเอกสารหรือรายการใหม่ (ที่ไม่ใช่ SKU) → page_id = หน้ารายการนั้นจากรายการหน้าด้านล่าง · values = {ชื่อช่องตามที่พูด: ค่า} เฉพาะที่พูดจริง เช่น {\"ชื่อ\":\"ร้านเจริญผล\",\"เบอร์โทร\":\"0812345678\"}",
  list_all_shops: "list_all_shops = ผู้ใช้อยากลง/เอาสินค้าขึ้นร้านออนไลน์ทุกร้าน (หรือร้านที่ยังไม่ลง) → query = ชื่อหรือรหัสสินค้า",
  shop_status: "shop_status = ผู้ใช้ถามว่าสินค้านี้ลงร้านไหนแล้ว/อยู่บนร้านไหน → query = ชื่อหรือรหัสสินค้า",
  copy_to_shop: "copy_to_shop = ผู้ใช้อยากก๊อป/ลงสินค้าไปร้านอื่นโดยใช้รายการบนร้านที่ลงแล้วเป็นต้นแบบ → query = ชื่อหรือรหัสสินค้า · target = ชื่อร้านปลายทางที่พูด (เช่น Lazada) ไม่พูด = เว้นว่าง",
  cross_check: "cross_check = ผู้ใช้อยากดูหน้าตรวจข้ามร้าน / ดูว่าสินค้าแต่ละตัวลงร้านไหน ข้อมูลตรงกันไหม (ไม่ระบุสินค้าตัวเดียว)",
};

/** คำสั่งระบบให้ AI — ส่วนที่คงที่ต่อคน (หน้า/สิทธิ์) อยู่ต้น เพื่อให้ OpenAI จำแคชได้ (ถูกลง) */
export function buildVoiceSystemPrompt(
  pages: VoicePageLite[],
  permsOrCanAddSku: boolean | VoicePerms,
  settings: VoiceSettings = DEFAULT_VOICE_SETTINGS,
  canEditProductsArg = true,
): string {
  const perms: VoicePerms = typeof permsOrCanAddSku === "boolean" ? { canAddSku: permsOrCanAddSku, canEditProducts: canEditProductsArg } : permsOrCanAddSku;
  const list = pages.slice(0, VOICE_LIMITS.pages)
    .map((p) => [p.id, p.label, p.where ?? "", (p.keywords ?? []).join(",")].join(" | "))
    .join("\n");
  const on = (k: VoiceCommandKey) => settings.commands[k].enabled;
  const ex = (k: VoiceCommandKey) => (settings.commands[k].examples.length ? ` · ตัวอย่างคำพูด: ${settings.commands[k].examples.map((x) => `"${x}"`).join(", ")}` : "");
  const denied = (k: VoiceCommandKey): string | null => {
    if (k === "add_sku" && !perms.canAddSku) return "ผู้ใช้คนนี้ไม่มีสิทธิ์เพิ่มสินค้า → ถ้าขอเพิ่ม SKU ให้ action none แล้วบอกว่าต้องขอสิทธิ์ก่อน";
    if (k === "product_detail" && perms.canEditProducts === false) return "ผู้ใช้คนนี้ไม่มีสิทธิ์แก้ข้อมูลสินค้า → ถ้าขอทำรายละเอียดสินค้า ให้ action none แล้วบอกว่าต้องขอสิทธิ์ก่อน";
    if (VOICE_COMMAND_INFO[k].group === "platform" && perms.canPlatforms === false) return `ผู้ใช้คนนี้ไม่มีสิทธิ์ดูการลงสินค้าบนแพลตฟอร์ม → ถ้าขอ "${VOICE_COMMAND_INFO[k].label}" ให้ action none แล้วบอกว่าต้องขอสิทธิ์ก่อน`;
    return null;
  };
  const rules = VOICE_COMMANDS.map((k, i) => {
    const n = `${i + 1})`;
    if (!on(k)) return `${n} คำสั่ง${VOICE_COMMAND_INFO[k].label} ถูกปิดอยู่ (${k}) → ถ้าขอ ให้ action none แล้วบอกว่าผู้ดูแลปิดคำสั่งนี้`;
    return `${n} ${denied(k) ?? RULES[k] + ex(k)}`;
  });
  const can = VOICE_COMMANDS.filter(on).map((k) => `"${VOICE_COMMAND_INFO[k].label}"`).join(", ") || "(ยังไม่มีคำสั่งที่เปิด)";
  return [
    "คุณคือผู้ช่วยเสียงในระบบ ERP ของบริษัท (ผู้ใช้เป็นพนักงานไทย พูดภาษาไทยปนอังกฤษ ข้อความมาจากการถอดเสียง อาจสะกดเพี้ยน)",
    "หน้าที่: ฟังคำสั่งแล้วเลือกการกระทำ 1 อย่าง ตอบเป็น JSON เท่านั้น รูปแบบ:",
    `{"say":"ข้อความพูดตอบสั้น ๆ ไม่เกิน 2 ประโยค สุภาพ ลงท้ายครับ","action":"${VOICE_ACTIONS.join("|")}","page_id":"...","sku":{"name_th":"...","color":"...","code":"...","standard_price":0,"rmb_cost":0},"query":"...","values":{},"target":"...","choice_id":"..."}`,
    "กติกา (เลือก action ตามความหมาย):",
    ...rules,
    `${VOICE_COMMANDS.length + 1}) choose = มี "ตัวเลือกที่ค้างอยู่" และผู้ใช้พูดเลือกตัวใดตัวหนึ่ง → choice_id ต้องเป็น id จากตัวเลือกที่ค้างอยู่เท่านั้น`,
    `${VOICE_COMMANDS.length + 2}) none = คุยทั่วไป ถามสิ่งที่ทำไม่ได้ หรือไม่เข้าใจ → บอกสั้น ๆ ว่าตอนนี้ช่วยได้แค่ ${can}`,
    "ห้ามบอกว่าบันทึก/ลงร้านแล้ว — ระบบแค่เปิดหน้า/ฟอร์ม/ตัวช่วยให้ ผู้ใช้กดเอง · ห้ามแต่ง id ที่ไม่มีในรายการ",
    "",
    "รายการหน้าที่ผู้ใช้นี้เข้าได้ (id | ชื่อ | แอป·หมวด | คำพ้อง):",
    list || "(ไม่มี)",
  ].join("\n");
}

/** ข้อความผู้ใช้ส่งให้ AI (ส่วนที่เปลี่ยนทุกครั้ง) · page_caps = ตัวทำงานที่หน้าปัจจุบันมี (เช่น search_here) */
export function buildVoiceUserPayload(input: { text: string; history: VoiceTurn[]; choices: VoiceChoice[]; path?: string; pageCaps?: readonly string[] }): string {
  return JSON.stringify({
    current_page: input.path ?? "",
    page_caps: input.pageCaps ?? [],
    history: input.history,
    pending_choices: input.choices,
    command: input.text,
  });
}

/**
 * สร้างใหม่พร้อมค่า: จับ "ชื่อช่องที่พูด" กับช่องในฟอร์ม (ป้ายชื่อ/คีย์) — ตรงเป๊ะก่อน แล้วค่อยมีคำอยู่ในกัน · ไม่ตรง = ทิ้ง
 * คืน { คีย์ช่อง: ค่า } + รายชื่อที่จับไม่ได้ (บอกผู้ใช้)
 */
export function matchFormFields(values: Record<string, string>, fields: { key: string; label: string }[]): { patch: Record<string, string>; unmatched: string[] } {
  const patch: Record<string, string> = {};
  const unmatched: string[] = [];
  const n = (s: string) => normTh(s);
  for (const [said, val] of Object.entries(values)) {
    const s = n(said);
    if (!s) continue;
    const hit = fields.find((f) => n(f.label) === s || n(f.key) === s)
      ?? fields.find((f) => { const l = n(f.label); return l.length >= 2 && (l.includes(s) || s.includes(l)); });
    if (hit && !(hit.key in patch)) patch[hit.key] = val;
    else unmatched.push(said);
  }
  return { patch, unmatched };
}
