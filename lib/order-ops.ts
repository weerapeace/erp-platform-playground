/**
 * กติกากลาง "งานหลังขาย" — คำสั่งพิเศษออเดอร์ + ซ่อม/คืนสินค้า
 * (ย้ายมาจากแอปเก่า order-instruction-manager / repair-and-return · เจ้าของเลือก 2026-11-24)
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล — มีแค่รายการสถานะ เส้นทางสถานะ ป้าย และตัวช่วยตรวจค่า
 * ใช้ทั้งฝั่งหน้าเว็บและ API (ทะเบียน workflow: lib/workflow-registry.ts key "order-instruction" / "after-sales")
 */

/* ───────────── คำสั่งพิเศษออเดอร์ ───────────── */

export type InstructionStatus = "todo" | "done";

export const INSTRUCTION_STATUS: Record<InstructionStatus, { label: string; tone: "warning" | "success" }> = {
  todo: { label: "ยังไม่ทำ", tone: "warning" },
  done: { label: "เสร็จ", tone: "success" },
};

export const ENGRAVE_TYPES = ["พิมพ์จม", "ฟอยเงิน", "ฟอยทอง"] as const;
export const ENGRAVE_POSITIONS = ["มุมขวา", "ตรงกลาง"] as const;
export type EngraveType = (typeof ENGRAVE_TYPES)[number];
export type EngravePosition = (typeof ENGRAVE_POSITIONS)[number];

export const ENGRAVE_TYPE_EN: Record<EngraveType, string> = { "พิมพ์จม": "Deboss", "ฟอยเงิน": "Silver Foil", "ฟอยทอง": "Gold Foil" };
export const ENGRAVE_POSITION_EN: Record<EngravePosition, string> = { "มุมขวา": "Right", "ตรงกลาง": "Center" };

/** ใบสลักชื่อรับได้สูงสุด 20 ตัว (2 แถว แถวละ 10) — เท่าแอปเก่า */
export const ENGRAVE_MAX_CHARS = 20;

/** แยกตัวอักษรแบบนับอีโมจิ/สระเป็นตัวเดียว (ใช้วาดช่องในใบสลักชื่อ) */
export function splitEngraveChars(name: string): string[] {
  const s = (name || "").trim();
  if (!s) return [];
  type Seg = { segment: string };
  const IntlAny = Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment: (t: string) => Iterable<Seg> } };
  if (IntlAny.Segmenter) {
    const seg = new IntlAny.Segmenter("en", { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment).slice(0, ENGRAVE_MAX_CHARS);
  }
  return Array.from(s).slice(0, ENGRAVE_MAX_CHARS);
}

/** ฟอนต์เริ่มต้นของเครื่องสลัก (เพิ่มได้ในหน้าตั้งค่า · order_ops_options kind engrave_font) */
export const DEFAULT_ENGRAVE_FONT = "Times New Roman";

/** ตัวที่เครื่องสลักทำได้เสมอ: อังกฤษ A-Z a-z ตัวเลข 0-9 เว้นวรรค (ล็อกไว้) — ตัวพิเศษอื่นตั้งเพิ่มได้ */
const ENGRAVE_BASE_RE = /^[A-Za-z0-9 ]$/;

/** ตัวที่สลักไม่ได้ในชื่อนี้ (ไม่ซ้ำ ตามลำดับที่เจอ) — ว่าง = สลักได้ทุกตัว */
export function invalidEngraveChars(text: string, specials: readonly string[]): string[] {
  const allow = new Set(specials);
  const bad: string[] = [];
  for (const ch of splitEngraveChars(text)) {
    if (ENGRAVE_BASE_RE.test(ch) || allow.has(ch)) continue;
    if (!bad.includes(ch)) bad.push(ch);
  }
  return bad;
}

/** ตรวจชื่อสลักก่อนบันทึก — คืนข้อความผิดพลาดภาษาคน หรือ null */
export function engraveTextError(text: string, specials: readonly string[]): string | null {
  const s = (text || "").trim();
  if (!s) return "กรุณาใส่ชื่อที่ต้องสลัก";
  if (splitEngraveChars(s).join("").length < s.length) return `ชื่อยาวเกิน ${ENGRAVE_MAX_CHARS} ตัว`;
  const bad = invalidEngraveChars(s, specials);
  if (bad.length) return `เครื่องสลักทำไม่ได้: ${bad.map((c) => `“${c}”`).join(" ")} — ใช้ได้แค่ A-Z a-z 0-9 และตัวพิเศษที่ตั้งไว้`;
  return null;
}

/**
 * เดาชื่อสลัก/รูปแบบ/ตำแหน่ง จากหมายเหตุที่ลูกค้าเขียน (ให้คนกดรับเอง ไม่บันทึกอัตโนมัติ)
 * เช่น "สลักชื่อ Thaninnut ฟอยทอง ห่อของขวัญด้วยค่ะ" → { text: "Thaninnut", type: "ฟอยทอง" }
 */
export function guessEngraveFromNote(note: string | null | undefined): { text: string | null; type: EngraveType | null; position: EngravePosition | null } {
  const s = (note || "").trim();
  if (!s) return { text: null, type: null, position: null };
  const type: EngraveType | null = /ฟอยทอง|ฟอย\s*ทอง|สีทอง|gold/i.test(s) ? "ฟอยทอง"
    : /ฟอยเงิน|ฟอย\s*เงิน|สีเงิน|silver/i.test(s) ? "ฟอยเงิน"
    : /พิมพ์จม|ปั๊มจม|จม|deboss/i.test(s) ? "พิมพ์จม" : null;
  const position: EngravePosition | null = /ตรงกลาง|กลาง|center/i.test(s) ? "ตรงกลาง" : /มุมขวา|ขวา|right/i.test(s) ? "มุมขวา" : null;
  const skip = /^(gold|silver|deboss|center|right|left|ok|thank|thanks|please|name)$/i;
  // ชุดคำอังกฤษ/ตัวเลขติดกัน (มีเว้นวรรค/&/./- คั่นได้) — เลือกชุดที่ตามหลังคำว่า "ชื่อ/สลัก" ก่อน ไม่งั้นเอาชุดยาวสุด
  const runs = [...s.matchAll(/[A-Za-z0-9][A-Za-z0-9&.\- ]*[A-Za-z0-9]|[A-Za-z]/g)]
    .map((m) => ({ text: m[0].trim(), at: m.index ?? 0 }))
    .filter((r) => !skip.test(r.text) && /[A-Za-z]/.test(r.text) && r.text.length <= ENGRAVE_MAX_CHARS);
  if (!runs.length) return { text: null, type, position };
  const kw = s.search(/ชื่อ|สลัก|name/i);
  const after = kw >= 0 ? runs.find((r) => r.at > kw) : undefined;
  const best = after ?? runs.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  return { text: best.text, type, position };
}

/**
 * รหัสท้าย SKU บอกรูปแบบ/ตำแหน่งสลัก เช่น WK45-05G/2 = ฟอยทอง · ตรงกลาง
 * ตัวอักษรก่อน "/" = รูปแบบ · ตัวเลขหลัง "/" = ตำแหน่ง
 * ค่าเริ่มต้นตรวจกับข้อมูลแอปเก่า 70 ออเดอร์ (2026-11-24): D=พิมพ์จม G=ฟอยทอง N=ฟอยเงิน · 1=มุมขวา 2=ตรงกลาง
 * ตั้งเพิ่ม/แก้ได้ในหน้าตั้งค่าเครื่องสลัก (order_ops_options kind engrave_sku_type / engrave_sku_pos · label=รหัส value=ความหมาย)
 */
export const DEFAULT_ENGRAVE_SKU_TYPES: Record<string, EngraveType> = { D: "พิมพ์จม", G: "ฟอยทอง", N: "ฟอยเงิน" };
export const DEFAULT_ENGRAVE_SKU_POSITIONS: Record<string, EngravePosition> = { "1": "มุมขวา", "2": "ตรงกลาง" };

export type EngraveSkuDecoded = { type: EngraveType | null; position: EngravePosition | null; typeCode: string; posCode: string };

/** ถอดรหัสท้าย SKU → รูปแบบ/ตำแหน่ง (ไม่ใช่ SKU สลัก = null) */
export function decodeEngraveSku(
  sku: string | null | undefined,
  types: Record<string, string> = DEFAULT_ENGRAVE_SKU_TYPES,
  positions: Record<string, string> = DEFAULT_ENGRAVE_SKU_POSITIONS,
): EngraveSkuDecoded | null {
  const m = /([A-Z])\/(\d+)\s*$/i.exec((sku || "").trim());
  if (!m) return null;
  const typeCode = m[1].toUpperCase();
  const posCode = m[2];
  const t = types[typeCode];
  const p = positions[posCode];
  if (!t && !p) return null;
  return {
    type: (ENGRAVE_TYPES as readonly string[]).includes(t ?? "") ? (t as EngraveType) : null,
    position: (ENGRAVE_POSITIONS as readonly string[]).includes(p ?? "") ? (p as EngravePosition) : null,
    typeCode,
    posCode,
  };
}

/* ───────────── สินค้าสลักชื่อในออเดอร์ (เจ้าของเลือก widget รอบ 2 แบบ B · 2026-11-25) ─────────────
 * รู้ได้ 3 ทาง: รหัสท้าย SKU (decodeEngraveSku) · รุ่นสินค้าตั้ง "สินค้าสลักชื่อ" (parent_skus_v2.engrave_mode) · หมายเหตุลูกค้า (classifyNote)
 *   optional = สลักได้ ไม่บังคับ → นับเป็นงานสลักเมื่อมีรหัสท้าย/หมายเหตุเท่านั้น · ไม่เตือน
 *   required = ต้องสลักทุกชิ้น → นับเป็นงานสลักเสมอ · เตือนเมื่อไม่มีหมายเหตุ
 */
export type EngraveMode = "none" | "optional" | "required";
export const ENGRAVE_MODE_LABEL: Record<EngraveMode, string> = { none: "ไม่ใช่สินค้าสลักชื่อ", optional: "สลักได้ ไม่บังคับ", required: "ต้องสลักทุกชิ้น" };
export const isEngraveMode = (v: unknown): v is EngraveMode => v === "none" || v === "optional" || v === "required";

export type EngraveSource = "sku_code" | "required" | "note";
export const ENGRAVE_SOURCE_LABEL: Record<EngraveSource, string> = { sku_code: "รหัสท้าย SKU", required: "รุ่นต้องสลักทุกชิ้น", note: "หมายเหตุลูกค้า" };

export type EngraveItemIn = { sku_code: string | null; name?: string | null; qty?: number | null; parent_id?: string | null; parent_code?: string | null };
export type EngraveItemOut = { sku_code: string | null; name: string | null; qty: number; parent_id: string | null; parent_code: string | null; mode: EngraveMode | null; decoded: EngraveSkuDecoded | null; engrave: boolean };

/** ส่งไปแล้ว/ยกเลิกแล้ว = ไม่ต้องเตือนให้ทักลูกค้า (สถานะกลาง lib/platform-order-status) */
export const ENGRAVE_NO_WARN_STATUSES = ["shipped", "cancelled"] as const;

/**
 * ตัดสินว่าออเดอร์นี้เป็นงานสลักชื่อไหม + ต้องเตือน "ลูกค้าไม่บอกชื่อ" ไหม
 * modes = รุ่นสินค้า (parent id) → engrave_mode · noteEngrave = classifyNote(note).engrave
 */
export function engraveOfOrder(input: {
  items: EngraveItemIn[];
  modes: Record<string, EngraveMode | null | undefined>;
  note: string | null | undefined;
  noteEngrave: boolean;
  status?: string | null;
  maps?: { types: Record<string, string>; positions: Record<string, string> };
}): { engrave: boolean; sources: EngraveSource[]; items: EngraveItemOut[]; needsName: boolean; hasOptional: boolean } {
  const hasNote = !!(input.note ?? "").trim();
  const noteSays = hasNote && input.noteEngrave;
  const sources = new Set<EngraveSource>();
  let hasOptional = false;
  const items: EngraveItemOut[] = input.items.map((it) => {
    const decoded = decodeEngraveSku(it.sku_code, input.maps?.types, input.maps?.positions);
    const raw = it.parent_id ? input.modes[it.parent_id] : null;
    const mode = isEngraveMode(raw) ? raw : null;
    if (decoded) sources.add("sku_code");
    if (mode === "required") sources.add("required");
    if (mode === "optional") hasOptional = true;
    return {
      sku_code: it.sku_code ?? null, name: it.name ?? null, qty: Math.max(1, Number(it.qty) || 1),
      parent_id: it.parent_id ?? null, parent_code: it.parent_code ?? null, mode, decoded,
      engrave: !!decoded || mode === "required" || (mode === "optional" && noteSays),
    };
  });
  if (noteSays) sources.add("note");
  const engrave = sources.size > 0;
  const mustHaveName = sources.has("sku_code") || sources.has("required");
  const done = (ENGRAVE_NO_WARN_STATUSES as readonly string[]).includes(String(input.status ?? ""));
  return { engrave, sources: [...sources], items, needsName: engrave && mustHaveName && !hasNote && !done, hasOptional };
}

/** สร้างตารางรหัสจากตัวเลือกที่ตั้งไว้ (ไม่มีเลย = ใช้ค่าเริ่มต้น) */
export function engraveSkuMaps(options: { kind: string; label: string; value?: string | null; is_active: boolean }[]): { types: Record<string, string>; positions: Record<string, string> } {
  const pick = (kind: string) => {
    const rows = options.filter((o) => o.kind === kind && o.is_active && o.value);
    return rows.length ? Object.fromEntries(rows.map((o) => [o.label.trim().toUpperCase(), String(o.value)])) : null;
  };
  return { types: pick("engrave_sku_type") ?? { ...DEFAULT_ENGRAVE_SKU_TYPES }, positions: pick("engrave_sku_pos") ?? { ...DEFAULT_ENGRAVE_SKU_POSITIONS } };
}

/** คำสั่งเริ่มต้น (ตั้งค่าเพิ่ม/แก้/ปิดได้ในหน้า) — ชุดเดียวกับแอปเก่า */
export const DEFAULT_INSTRUCTION_COMMANDS = [
  "ห่อ",
  "การ์ดธรรมดา",
  "การ์ดพิเศษ",
  "แก้ไซส์เข็มขัด",
  "ตัดชื่อออก",
  "เปลี่ยนสินค้า",
  "อื่นๆ",
];

/* ───────────── กล่องตั้งค่าต่อคำสั่ง (เจ้าของเลือก widget 2026-11-25 ข้อ 2) ─────────────
 * ทะเบียนชนิดกล่องที่เดียว — คำสั่งใหม่เลือกชนิดกล่องได้ (order_ops_options.value ของ instruction_command) · ว่าง = เดาจากชื่อ
 *   choice = เลือกจากรายการ (ตัวเลือก kind command_choice · value "<คำสั่ง>" หรือ "<คำสั่ง>|<กลุ่ม>" เช่น ห่อ|กระดาษ)
 *   card = ข้อความการ์ด + ไปตัวเขียนการ์ด · swap = เปลี่ยนสินค้า (SkuPicker กลาง) · text = ช่องข้อความ · none = ไม่มีกล่อง
 * ค่าที่กรอกเก็บที่ order_instructions.command_details { "<คำสั่ง>": CommandDetail }
 */
export type CommandBox = "choice" | "card" | "swap" | "phrase" | "text" | "none";
export const COMMAND_BOX_LABEL: Record<CommandBox, string> = { choice: "เลือกจากรายการ", card: "การ์ด (ข้อความ + แม่แบบ)", swap: "เปลี่ยนสินค้า (เลือก SKU)", phrase: "ข้อความลัด (ใส่ตัวเลข)", text: "ช่องข้อความ", none: "ไม่มีกล่อง" };
export const isCommandBox = (v: unknown): v is CommandBox => typeof v === "string" && v in COMMAND_BOX_LABEL;
export function guessCommandBox(label: string): CommandBox {
  const s = label.trim();
  if (/ตัดชื่อ/.test(s)) return "none";
  if (/เปลี่ยนสินค้า|เปลี่ยนรุ่น|เปลี่ยนสี/.test(s)) return "swap";
  if (/แก้ไซส์|แก้ไซซ์|ตัดสาย/.test(s)) return "phrase";
  if (/ห่อ|การ์ดแทรก|สติ[กิ๊]?เกอร์/.test(s)) return "choice";
  if (/การ์ด/.test(s)) return "card";
  return "text";
}
export const commandBoxOf = (label: string, value?: string | null): CommandBox => (isCommandBox(value) ? value : guessCommandBox(label));
/** คำอธิบายสั้นใต้ชื่อคำสั่ง (คำสั่งที่ไม่ต้องกรอกอะไร) */
export function commandHint(label: string): string | null {
  if (/ตัดชื่อ/.test(label)) return "ตัดรายการสินค้าบนใบปะหน้า ไม่ให้โชว์ว่าซื้ออะไร — ไม่ต้องกรอก · เด้งเตือนตอนแพ็ก";
  return null;
}

/* ข้อความลัด (kind command_phrase) — "{n}" = ช่องตัวเลข · "{u}" = เลือกหน่วย (นิ้ว/ซม.) */
export const PHRASE_UNITS = ["นิ้ว", "ซม."] as const;
export type PhraseValues = { n?: string; u?: string };
export const phraseNeeds = (tpl: string) => ({ n: tpl.includes("{n}"), u: tpl.includes("{u}") });
/** แม่แบบ + ค่าที่กรอก → ข้อความจริง เช่น "ตัดสายให้สั้นลง 2 นิ้ว" (ยังไม่กรอก = เว้น "x") */
export function fillPhrase(tpl: string, v: PhraseValues): string {
  const n = String(v.n ?? "").trim().replace(/[^\d.,/]/g, "").slice(0, 8);
  const u = (PHRASE_UNITS as readonly string[]).includes(String(v.u)) ? String(v.u) : PHRASE_UNITS[0];
  return tpl.replace(/\{n\}/g, n || "x").replace(/\{u\}/g, u).replace(/\s+/g, " ").trim();
}
/** ข้อความลัดของคำสั่ง (เปิดใช้ + ที่เลือกไว้) */
export function phrasesOf(options: { kind: string; label: string; value?: string | null; is_active: boolean }[], command: string): string[] {
  return options.filter((o) => o.kind === "command_phrase" && (o.value ?? "").trim() === command && o.is_active).map((o) => o.label);
}

/** ห่อพิเศษ: ออเดอร์มีสินค้าที่รหัสขึ้นต้นด้วยรหัสที่ตั้งไว้ (kind special_wrap เช่น GIFT01) → คืนรหัสที่ตรง */
export function specialWrapCodes(itemCodes: (string | null | undefined)[], wrapCodes: string[]): string[] {
  const keys = wrapCodes.map((c) => c.trim().toUpperCase()).filter(Boolean);
  const out = new Set<string>();
  for (const raw of itemCodes) {
    const c = String(raw ?? "").trim().toUpperCase();
    const k = keys.find((x) => c === x || c.startsWith(`${x}-`) || c.startsWith(x));
    if (k) out.add(String(raw).trim());
  }
  return [...out];
}

export type CommandDetail = { choice?: Record<string, string>; text?: string; sku_id?: string; sku_code?: string; message?: string; card_id?: string; template_id?: string; /** การ์ดสำเร็จรูป (ข้อความพิมพ์มาในตัว ไม่มีช่องกรอก) */ ready?: boolean };

/** ตัวเลือกของคำสั่ง แยกกลุ่ม (ห่อ › กระดาษ / ริบบิ้น) — กลุ่มว่าง = "แบบ" */
export function choiceGroups(options: { kind: string; label: string; value?: string | null; is_active: boolean }[], command: string, keep: Record<string, string> = {}): { group: string; items: string[] }[] {
  const map = new Map<string, string[]>();
  for (const o of options) {
    if (o.kind !== "command_choice") continue;
    const [cmd, grp] = String(o.value ?? "").split("|");
    if ((cmd ?? "").trim() !== command) continue;
    const g = (grp ?? "").trim() || "แบบ";
    if (!o.is_active && keep[g] !== o.label) continue;
    map.set(g, [...(map.get(g) ?? []), o.label]);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

const str300 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);
/** ทำความสะอาดค่ากล่อง — เก็บเฉพาะคำสั่งที่เลือกอยู่ */
export function cleanCommandDetails(raw: unknown, commands: string[]): Record<string, CommandDetail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, CommandDetail> = {};
  for (const c of commands.slice(0, 20)) {
    const d = (r[c] && typeof r[c] === "object" ? r[c] : null) as Record<string, unknown> | null;
    if (!d) continue;
    const x: CommandDetail = {};
    if (d.choice && typeof d.choice === "object") {
      const ch: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.choice as Record<string, unknown>).slice(0, 6)) { const s = str300(v); if (s) ch[k.slice(0, 40)] = s; }
      if (Object.keys(ch).length) x.choice = ch;
    }
    for (const k of ["text", "sku_id", "sku_code", "message", "card_id", "template_id"] as const) { const s = str300(d[k]); if (s) x[k] = s; }
    if (Object.keys(x).length) out[c] = x;
  }
  return out;
}

/** ข้อความสั้นของคำสั่ง 1 ข้อ (ชิปในตาราง/ใบงาน) เช่น "ห่อ: คราฟท์ · แดง" · "เปลี่ยนสินค้า → WK41-03" */
export function commandSummary(command: string, d: CommandDetail | null | undefined): string {
  if (!d) return command;
  const parts: string[] = [];
  if (d.choice) parts.push(Object.values(d.choice).join(" · "));
  if (d.sku_code) return `${command} → ${d.sku_code}`;
  if (d.message) parts.push(`"${d.message.slice(0, 30)}${d.message.length > 30 ? "…" : ""}"`);
  if (d.text) parts.push(d.text.slice(0, 40) + (d.text.length > 40 ? "…" : ""));
  return parts.length ? `${command}: ${parts.join(" · ")}` : command;
}

/** แอปเก่าเก็บคำสั่งรวมเป็นข้อความเดียว เช่น "ห่อ + การ์ดธรรมดา" → แยกเป็นรายการ */
export function splitLegacyCommand(cmd: string | null | undefined): string[] {
  const s = (cmd || "").trim();
  if (!s || s === "-") return [];
  return s.split("+").map((x) => x.trim()).filter(Boolean);
}

/* ───────────── งานซ่อม / ของคืน ───────────── */

export type CaseKind = "repair" | "return";

export type RepairStatus = "waiting_customer" | "repairing" | "remake" | "ready_to_ship" | "shipped_back" | "cancelled";
export type ReturnStatus = "received" | "checked" | "closed" | "cancelled";
export type CaseStatus = RepairStatus | ReturnStatus;

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

export const REPAIR_STATUS: Record<RepairStatus, { label: string; tone: Tone }> = {
  waiting_customer: { label: "รอของลูกค้าส่งกลับ", tone: "warning" },
  repairing: { label: "กำลังซ่อม", tone: "accent" },
  remake: { label: "รอผลิตใหม่", tone: "accent" },
  ready_to_ship: { label: "รอแพ็กส่งกลับ", tone: "accent" },
  shipped_back: { label: "ส่งคืนลูกค้าแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "danger" },
};

export const RETURN_STATUS: Record<ReturnStatus, { label: string; tone: Tone }> = {
  received: { label: "รอตรวจของ", tone: "warning" },
  checked: { label: "ตรวจแล้ว", tone: "accent" },
  closed: { label: "ปิดงาน", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "danger" },
};

/** เส้นทางสถานะที่อนุญาต (ย้อนกลับได้ทุกขั้นที่ยังไม่ปิด — กันกดพลาดแล้วติด) */
const REPAIR_FLOW: Record<RepairStatus, RepairStatus[]> = {
  waiting_customer: ["repairing", "remake", "ready_to_ship", "cancelled"],
  repairing: ["waiting_customer", "remake", "ready_to_ship", "cancelled"],
  remake: ["repairing", "ready_to_ship", "cancelled"],
  ready_to_ship: ["repairing", "remake", "shipped_back", "cancelled"],
  shipped_back: ["ready_to_ship"],
  cancelled: ["waiting_customer"],
};

const RETURN_FLOW: Record<ReturnStatus, ReturnStatus[]> = {
  received: ["checked", "closed", "cancelled"],
  checked: ["received", "closed", "cancelled"],
  closed: ["checked"],
  cancelled: ["received"],
};

export function caseStatusList(kind: CaseKind): CaseStatus[] {
  return kind === "repair" ? (Object.keys(REPAIR_STATUS) as RepairStatus[]) : (Object.keys(RETURN_STATUS) as ReturnStatus[]);
}

export function caseStatusInfo(kind: CaseKind, status: string): { label: string; tone: Tone } {
  const map = (kind === "repair" ? REPAIR_STATUS : RETURN_STATUS) as Record<string, { label: string; tone: Tone }>;
  return map[status] ?? { label: status || "-", tone: "neutral" };
}

export function defaultCaseStatus(kind: CaseKind): CaseStatus {
  return kind === "repair" ? "waiting_customer" : "received";
}

export function isValidCaseStatus(kind: CaseKind, status: string): boolean {
  return (caseStatusList(kind) as string[]).includes(status);
}

/** เปลี่ยนสถานะได้ไหม (สถานะเดิม = ไม่เปลี่ยน ถือว่าได้) */
export function canMoveCase(kind: CaseKind, from: string, to: string): boolean {
  if (from === to) return true;
  const flow = (kind === "repair" ? REPAIR_FLOW : RETURN_FLOW) as Record<string, string[]>;
  return (flow[from] ?? []).includes(to);
}

export function nextCaseStatuses(kind: CaseKind, from: string): CaseStatus[] {
  const flow = (kind === "repair" ? REPAIR_FLOW : RETURN_FLOW) as Record<string, CaseStatus[]>;
  return flow[from] ?? [];
}

/** งานที่ยังค้าง (ใช้นับการ์ดตัวเลข) */
export function isCaseOpen(kind: CaseKind, status: string): boolean {
  return kind === "repair" ? !["shipped_back", "cancelled"].includes(status) : !["closed", "cancelled"].includes(status);
}

/** หัวข้อซ่อมเริ่มต้น (ตั้งค่าเพิ่ม/แก้ได้) — ชุดเดียวกับแอปเก่า */
export const DEFAULT_REPAIR_TOPICS = [
  "มีตำหนิ",
  "ขาด/ชำรุด",
  "เปลี่ยนรุ่นสินค้า",
  "ปัญหาสาย",
  "ขนาด: สั้นไป",
  "ขนาด: ยาวไป",
  "เปลี่ยนไซส์",
  "หัวเข็มขัดพัง",
  "ส่งผิดสี",
  "ส่งผิดรุ่น",
  "หนัง / PU ลอก / เสื่อม",
  "ซิป / อะไหล่",
  "ของหาย",
  "ของไม่ครบ",
  "อื่น ๆ",
];

/** วิธีแก้ปัญหา (แอปเก่าเอาไปปนกับสถานะ — แยกออกมาเป็นช่องของตัวเอง) */
export const REPAIR_RESOLUTIONS = ["ซ่อม", "เปลี่ยนสินค้าชิ้นใหม่", "เปลี่ยนรุ่นสินค้า", "เปลี่ยนไซส์", "ส่งสินค้าเพิ่ม", "ผลิตใหม่"] as const;

/** แปลงสถานะซ่อมของแอปเก่า → สถานะ + วิธีแก้ ใน ERP (ใช้ตอนนำเข้าข้อมูลเก่า) */
export function mapLegacyRepairStatus(old: string | null | undefined, packed?: boolean): { status: RepairStatus; resolution: string | null } {
  const s = (old || "").trim();
  switch (s) {
    case "รอของลูกค้าส่งกลับ": return { status: "waiting_customer", resolution: null };
    case "กำลังซ่อม": return { status: "repairing", resolution: "ซ่อม" };
    case "ซ่อมเสร็จแล้ว": return { status: "ready_to_ship", resolution: "ซ่อม" };
    case "เปลี่ยนสินค้าชิ้นใหม่": return { status: packed ? "ready_to_ship" : "repairing", resolution: "เปลี่ยนสินค้าชิ้นใหม่" };
    case "เปลี่ยนรุ่นสินค้า": return { status: packed ? "ready_to_ship" : "repairing", resolution: "เปลี่ยนรุ่นสินค้า" };
    case "เปลี่ยนไซส์": return { status: packed ? "ready_to_ship" : "repairing", resolution: "เปลี่ยนไซส์" };
    case "ส่งสินค้าเพิ่ม": return { status: packed ? "ready_to_ship" : "repairing", resolution: "ส่งสินค้าเพิ่ม" };
    case "รอผลิตใหม่": return { status: "remake", resolution: "ผลิตใหม่" };
    case "ส่งคืนแล้ว": return { status: "shipped_back", resolution: null };
    default: return { status: "waiting_customer", resolution: null };
  }
}

/** แปลงสถานะของคืนของแอปเก่า */
export function mapLegacyReturnStatus(old: string | null | undefined, checked?: boolean): ReturnStatus {
  const s = (old || "").trim();
  if (s === "ปิดงาน" || s === "ส่งคืนแล้ว") return "closed";
  return checked ? "checked" : "received";
}

/* ───────────── ตัวช่วยทั่วไป ───────────── */

/** ทำความสะอาดเลขออเดอร์ที่พิมพ์/สแกนมา (ตัดช่องว่าง + ข้อความต่อท้าย) */
export function cleanOrderNo(raw: string | null | undefined): string {
  return (raw || "").trim().split(/\s+/)[0] ?? "";
}

/** ช่องเงินที่พิมพ์มา → ตัวเลข (ว่าง = null · ติดลบไม่ได้) */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[, ฿]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** ไอคอนของปุ่มคำสั่ง (ป๊อปคำสั่งพิเศษ 2 คอลัมน์ · เจ้าของเลือก 2026-11-25 รอบ 5) — ดูจากชื่อคำสั่ง · ไม่ตรงอะไร = ป้าย */
export function commandIconOf(label: string): string {
  const s = label.trim();
  if (/สลัก/.test(s)) return "signature";
  if (/การ์ด.*พิเศษ|พิเศษ.*การ์ด/.test(s)) return "sparkles";
  if (/การ์ด/.test(s)) return "gift-card";
  if (/ห่อ/.test(s)) return "gift";
  if (/ไซส์|ไซซ์|เข็มขัด|ยาว|สั้น/.test(s)) return "ruler";
  if (/ตัด/.test(s)) return "scissors";
  if (/เปลี่ยน|สลับ/.test(s)) return "arrows-exchange";
  if (/สติ๊?ก/.test(s)) return "sticker";
  if (/อื่น/.test(s)) return "dots-vertical";
  return "tag";
}
