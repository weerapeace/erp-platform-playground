/**
 * 👜 ตัวประกอบสินค้า (Product Configurator) — กฎกลาง (pure · ไม่มี React/DB)
 *
 * ลูกค้าเลือกตัวเลือกทีละช่อง (วัสดุ สี ซิป สาย ซับใน ปั๊มชื่อ …) แล้วเห็นรูปสินค้าที่ "ประกอบจากรูปถ่ายพื้นใสหลายชั้น"
 * ทุกอย่างเป็นข้อมูลที่แอดมินตั้งเองในหลังบ้าน (/admin/product-configurator) ไม่มีชนิดชิ้นส่วนเขียนตายในโค้ด
 *
 *   ทรง (model)       = สินค้า 1 แบบ เช่น กระเป๋าโท้ท · มีมุมที่เปิด (หน้า/หลัง/ใน/ข้าง) + ผืนผ้าใบ 3000×3000
 *   ช่อง (slot)        = คำถาม 1 ข้อ เช่น "วัสดุ" · single (เลือก 1) / multi (เลือกหลายอย่าง) / text (พิมพ์ข้อความ)
 *   ตัวเลือก (option) = คำตอบในช่อง เช่น "หนังวัวลายเม็ด" + ราคาเพิ่ม + วันผลิตเพิ่ม
 *   ชั้นรูป (layer)    = รูป 1 ชั้นต่อมุม · "เปลี่ยนตาม" ช่องไหน (depends_on) → 1 ไฟล์ต่อคอมโบตัวเลือก
 *   รูป (image)        = ไฟล์ของชั้นนั้นตามคอมโบ (combo_key เช่น "PEBBLE_NOIR")
 *   กติกา (rule)       = ถ้าเลือก A ในช่อง X → ช่อง Y เลือก B ไม่ได้ (block) / เลือกได้เฉพาะ B (only)
 *
 * ชื่อไฟล์รูป = {ทรง}_{มุม}_{ชั้น}_{ตัวเลือก...}.png เช่น TOTE_FRONT_BODY_PEBBLE_NOIR.png → ระบบจับคู่ให้เอง
 * ทุกรูปต้องกว้าง×สูงเท่าผืนผ้าใบของทรง (พื้นใส) จึงวางซ้อนตรงกันโดยไม่ต้องตั้งจุดยึด
 *
 * ใช้ที่: API app/api/configurator/* (ตรวจค่า) · สตูดิโอ components/product-configurator/* · เว็บร้าน (ก้อนถัดไป · ต้องมิเรอร์)
 * เอกสาร: docs/product-configurator.md
 */

// ─── ค่าคงที่ ────────────────────────────────────────────────────────────────
export const CONFIG_VIEWS = ["front", "back", "inside", "side"] as const;
export type ConfigView = (typeof CONFIG_VIEWS)[number];
export const VIEW_LABEL: Record<ConfigView, { th: string; en: string; code: string }> = {
  front:  { th: "ด้านหน้า", en: "Front",  code: "FRONT" },
  back:   { th: "ด้านหลัง", en: "Back",   code: "BACK" },
  inside: { th: "ด้านใน",   en: "Inside", code: "INSIDE" },
  side:   { th: "ด้านข้าง", en: "Side",   code: "SIDE" },
};
export const viewByCode = (code: string): ConfigView | null => CONFIG_VIEWS.find((v) => VIEW_LABEL[v].code === code.toUpperCase()) ?? null;

export const SLOT_KINDS = ["single", "multi", "text"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export const SLOT_KIND_LABEL: Record<SlotKind, string> = { single: "เลือก 1 อย่าง", multi: "เลือกได้หลายอย่าง", text: "พิมพ์ข้อความ" };

export const RULE_KINDS = ["block", "only"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const RULE_KIND_LABEL: Record<RuleKind, string> = { block: "เลือกไม่ได้", only: "เลือกได้เฉพาะ" };

export const TEXT_STYLES = ["deboss", "gold", "silver", "ink"] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];
export const TEXT_STYLE_LABEL: Record<TextStyle, string> = { deboss: "ปั๊มจม", gold: "ฟอยล์ทอง", silver: "ฟอยล์เงิน", ink: "พิมพ์สี" };

export const DESIGN_STATUSES = ["saved", "in_cart", "ordered"] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DEFAULT_CANVAS = { w: 3000, h: 3000 } as const;
export const CONFIG_IMAGE_FOLDER = "configurator-parts";
/** รหัสทรง/ช่อง/ตัวเลือก/ชั้น: ตัวใหญ่ A-Z ตัวเลข และ "-" (ห้าม "_" เพราะใช้คั่นในชื่อไฟล์) */
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,39}$/;
/** จำกัดคอมโบต่อชั้นตอนไล่ "รายการรูปที่ต้องถ่าย" (กันเบราว์เซอร์ค้าง) */
export const MAX_COMBOS_PER_LAYER = 5000;

/** ทำข้อความให้เป็นรหัสที่ใช้ได้: ตัวใหญ่ · ช่องว่าง/_ → "-" · ตัดตัวอื่นทิ้ง */
export function normCode(v: unknown): string {
  return String(v ?? "").trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// ─── ชนิดข้อมูล (ตรงกับตาราง configurator_*) ───────────────────────────────
export type ViewConfig = {
  /** เส้นพื้น (ก้นสินค้าแตะ) เป็นสัดส่วนความสูงผืนผ้าใบ 0–1 */
  ground_y?: number;
  /** พิกเซลต่อ 1 ซม. (ไว้วาดไม้บรรทัด 10 ซม. ในแม่แบบ) */
  cm_px?: number;
  /** จุดวางชิ้นส่วนในแม่แบบ (สัดส่วน 0–1) */
  markers?: { label: string; x: number; y: number }[];
  /** คำแนะนำการถ่ายของมุมนี้ */
  camera_note?: string;
};
export type CfgModel = {
  id: string; shop_id: string; code: string; name_th: string; name_en: string | null; description: string | null; size_text: string | null;
  base_price: number; lead_days: number; views: ConfigView[]; canvas: { w: number; h: number }; view_config: Partial<Record<ConfigView, ViewConfig>>;
  cover_image_key: string | null; sort_order: number; is_active: boolean;
};
export type TextSlotConfig = { max_chars?: number; charset?: "latin" | "latin_thai"; auto_upper?: boolean; placeholder?: string };
export type CfgSlot = {
  id: string; model_id: string; code: string; name_th: string; name_en: string | null; help_th: string | null;
  kind: SlotKind; required: boolean; step_view: ConfigView | null; config: TextSlotConfig & Record<string, unknown>; sort_order: number; is_active: boolean;
};
export type CfgOption = {
  id: string; model_id: string; slot_id: string; code: string; name_th: string; name_en: string | null; note_th: string | null;
  price_delta: number; lead_days: number; swatch_hex: string | null; swatch_image_key: string | null;
  attrs: { text_style?: TextStyle } & Record<string, unknown>; is_default: boolean; sort_order: number; is_active: boolean;
};
/** เงื่อนไขโชว์ชั้น: ช่อง slot ต้องเลือกตัวใดตัวหนึ่งใน options · options ว่าง = ขอแค่มีการเลือก/มีข้อความ */
export type Condition = { slot: string; options: string[] };
export type TextLayerConfig = { x: number; y: number; size: number; style_slot?: string; letter_spacing?: number; font?: string };
export type CfgLayer = {
  id: string; model_id: string; view: ConfigView; code: string; name_th: string; z_index: number;
  depends_on: string[]; show_when: Condition[]; recolor_slot: string | null; text_slot: string | null;
  config: { text?: TextLayerConfig } & Record<string, unknown>; is_active: boolean;
};
export type CfgImage = { id: string; layer_id: string; combo_key: string; image_key: string; width: number | null; height: number | null; file_name: string | null };
export type CfgRule = {
  id: string; model_id: string; kind: RuleKind; if_slot: string; if_options: string[]; then_slot: string; then_options: string[];
  reason_th: string | null; sort_order: number; is_active: boolean;
};
export type ConfigData = { model: CfgModel; slots: CfgSlot[]; options: CfgOption[]; layers: CfgLayer[]; images: CfgImage[]; rules: CfgRule[] };
/** การเลือกของลูกค้า: single = รหัสตัวเลือก · multi = รายการรหัส · text = ข้อความ */
export type Selection = Record<string, string | string[]>;

const bySort = <T extends { sort_order?: number; code?: string }>(a: T, b: T) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.code ?? "").localeCompare(String(b.code ?? ""));

// ─── ตัวช่วยอ่านข้อมูล ───────────────────────────────────────────────────────
export const activeSlots = (d: ConfigData): CfgSlot[] => d.slots.filter((s) => s.is_active).sort(bySort);
export const slotByCode = (d: ConfigData, code: string): CfgSlot | undefined => d.slots.find((s) => s.code === code && s.is_active);
export const optionsOf = (d: ConfigData, slot: CfgSlot | undefined): CfgOption[] =>
  slot ? d.options.filter((o) => o.slot_id === slot.id && o.is_active).sort(bySort) : [];
export const optionByCode = (d: ConfigData, slotCode: string, code: string): CfgOption | undefined =>
  optionsOf(d, slotByCode(d, slotCode)).find((o) => o.code === code);

/** รหัสที่เลือกในช่อง (text = ["*"] เมื่อมีข้อความ) */
export function selectedCodes(d: ConfigData, sel: Selection, slotCode: string): string[] {
  const slot = slotByCode(d, slotCode);
  const v = sel[slotCode];
  if (!slot || v == null) return [];
  if (slot.kind === "text") return typeof v === "string" && v.trim() ? ["*"] : [];
  if (slot.kind === "multi") return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
  return typeof v === "string" && v ? [v] : Array.isArray(v) && v[0] ? [v[0]] : [];
}

const meets = (d: ConfigData, sel: Selection, c: Condition) => {
  const got = selectedCodes(d, sel, c.slot);
  return c.options.length === 0 ? got.length > 0 : got.some((x) => c.options.includes(x));
};

// ─── กติกา ───────────────────────────────────────────────────────────────────
/** ตัวเลือกนี้ "ใช้ไม่ได้" เพราะกติกาไหน (คืนเหตุผลภาษาคน · null = ใช้ได้) */
export function blockReason(d: ConfigData, sel: Selection, slotCode: string, optionCode: string): string | null {
  for (const r of d.rules) {
    if (!r.is_active || r.then_slot !== slotCode || r.if_slot === slotCode) continue;
    if (!meets(d, sel, { slot: r.if_slot, options: r.if_options })) continue;
    const listed = r.then_options.includes(optionCode);
    if ((r.kind === "block" && listed) || (r.kind === "only" && !listed)) return r.reason_th?.trim() || defaultReason(d, r);
  }
  return null;
}
function defaultReason(d: ConfigData, r: CfgRule): string {
  const ifSlot = slotByCode(d, r.if_slot);
  const names = r.if_options.map((c) => optionByCode(d, r.if_slot, c)?.name_th ?? c).join(" / ");
  return `ใช้กับ${ifSlot?.name_th ?? r.if_slot}${names ? ` "${names}"` : ""} ไม่ได้`;
}

/** ตัดข้อความปั๊มให้ตรงกติกาของช่อง · คืนตัวที่ตัดทิ้งด้วย (ไว้บอกลูกค้า) */
export function cleanText(slot: Pick<CfgSlot, "config">, raw: string): { text: string; dropped: string[] } {
  const cfg = slot.config ?? {};
  const max = Math.max(1, Math.min(40, Number(cfg.max_chars) || 10));
  const re = cfg.charset === "latin_thai" ? /[A-Za-z0-9.&' ฀-๿-]/ : /[A-Za-z0-9.&' -]/;
  const src = cfg.auto_upper === false ? raw : raw.toUpperCase();
  const keep: string[] = [], dropped: string[] = [];
  for (const ch of Array.from(src)) (re.test(ch) ? keep : dropped).push(ch);
  return { text: keep.join("").replace(/\s{2,}/g, " ").slice(0, max), dropped };
}

/**
 * ทำให้การเลือก "ถูกกติกา" ครบทุกช่อง: ตัวเลือกที่ไม่มี/ถูกห้าม → เปลี่ยนเป็นตัวเริ่มต้น/ตัวแรกที่ใช้ได้ + บอกเหตุผล
 * ไล่ตามลำดับช่อง (ช่องก่อนหน้ากำหนดช่องถัดไป) และวนซ้ำจนนิ่ง (สูงสุด 3 รอบ)
 */
export function normalizeSelection(d: ConfigData, input: Selection): { selection: Selection; messages: string[] } {
  const sel: Selection = { ...input };
  const messages: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const slot of activeSlots(d)) {
      const opts = optionsOf(d, slot);
      if (slot.kind === "text") {
        const raw = typeof sel[slot.code] === "string" ? (sel[slot.code] as string) : "";
        const { text } = cleanText(slot, raw);
        if (text !== raw) { sel[slot.code] = text; changed = true; }
        continue;
      }
      if (slot.kind === "multi") {
        const cur = selectedCodes(d, sel, slot.code);
        const keep = cur.filter((c) => {
          const o = opts.find((x) => x.code === c);
          if (!o) return false;
          const why = blockReason(d, sel, slot.code, c);
          if (why) { messages.push(`เอา "${o.name_th}" ออก เพราะ${why}`); return false; }
          return true;
        });
        if (keep.length !== cur.length || !Array.isArray(sel[slot.code])) { sel[slot.code] = keep; changed = changed || keep.length !== cur.length; }
        continue;
      }
      const cur = selectedCodes(d, sel, slot.code)[0];
      const curOpt = cur ? opts.find((o) => o.code === cur) : undefined;
      const why = curOpt ? blockReason(d, sel, slot.code, curOpt.code) : null;
      if (curOpt && !why) continue;
      const usable = opts.filter((o) => !blockReason(d, sel, slot.code, o.code));
      const next = usable.find((o) => o.is_default) ?? (slot.required ? usable[0] : undefined);
      const nextCode = next?.code ?? "";
      if (nextCode !== (cur ?? "")) {
        if (curOpt && why) messages.push(next ? `${slot.name_th}: เปลี่ยนจาก "${curOpt.name_th}" เป็น "${next.name_th}" เพราะ${why}` : `${slot.name_th}: เอา "${curOpt.name_th}" ออก เพราะ${why}`);
        sel[slot.code] = nextCode;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { selection: sel, messages: Array.from(new Set(messages)) };
}
export const defaultSelection = (d: ConfigData): Selection => normalizeSelection(d, {}).selection;

// ─── ราคา / วันผลิต ──────────────────────────────────────────────────────────
export type PriceLine = { slot: string; slotName: string; option: string; optionName: string; amount: number };
export function priceOf(d: ConfigData, sel: Selection): { base: number; lines: PriceLine[]; total: number; leadDays: number } {
  const base = Number(d.model.base_price) || 0;
  let lead = Number(d.model.lead_days) || 0;
  const lines: PriceLine[] = [];
  for (const slot of activeSlots(d)) {
    if (slot.kind === "text") continue;
    for (const code of selectedCodes(d, sel, slot.code)) {
      const o = optionByCode(d, slot.code, code);
      if (!o) continue;
      lines.push({ slot: slot.code, slotName: slot.name_th, option: o.code, optionName: o.name_th, amount: Number(o.price_delta) || 0 });
      lead += Number(o.lead_days) || 0;
    }
  }
  return { base, lines, total: Math.round(base + lines.reduce((a, l) => a + l.amount, 0)), leadDays: lead };
}

// ─── ชั้นรูป ─────────────────────────────────────────────────────────────────
export const layerVisible = (d: ConfigData, layer: CfgLayer, sel: Selection): boolean =>
  layer.is_active && (layer.show_when ?? []).every((c) => meets(d, sel, c)) && (!layer.text_slot || selectedCodes(d, sel, layer.text_slot).length > 0);

/** คีย์คอมโบของชั้นตามการเลือก ("" = ชั้นรูปเดียว) · null = ช่องที่ขึ้นกับยังไม่ได้เลือก */
export function comboKeyFor(d: ConfigData, layer: CfgLayer, sel: Selection): string | null {
  const parts: string[] = [];
  for (const slotCode of layer.depends_on ?? []) {
    const c = selectedCodes(d, sel, slotCode)[0];
    if (!c || c === "*") return null;
    parts.push(c);
  }
  return parts.join("_");
}

export type ResolvedLayer = {
  layer: CfgLayer; comboKey: string | null; image: CfgImage | null;
  /** สีที่ใช้ลงทับรูปกลาง (ชั้นที่ติ๊ก "ลงสีจากรูปกลาง") */
  tint: string | null;
  /** ชั้นตัวอักษร (พิมพ์สด) */
  text: { value: string; style: TextStyle; color: string | null; box: TextLayerConfig } | null;
  /** สีแทนรูป (ยังไม่ได้อัปโหลด) จากตัวเลือกที่ชั้นนี้ขึ้นกับ */
  placeholderHex: string | null;
};
/** ชั้นที่ต้องวาดของมุมนี้ เรียงล่าง → บน */
export function resolveLayers(d: ConfigData, view: ConfigView, sel: Selection): ResolvedLayer[] {
  const out: ResolvedLayer[] = [];
  for (const layer of d.layers.filter((l) => l.view === view && l.is_active).sort((a, b) => a.z_index - b.z_index || a.code.localeCompare(b.code))) {
    if (!layerVisible(d, layer, sel)) continue;
    if (layer.text_slot) {
      const value = typeof sel[layer.text_slot] === "string" ? String(sel[layer.text_slot]) : "";
      const box = layer.config?.text ?? { x: 0.5, y: 0.7, size: 0.04 };
      const styleOpt = box.style_slot ? optionByCode(d, box.style_slot, selectedCodes(d, sel, box.style_slot)[0] ?? "") : undefined;
      const style: TextStyle = TEXT_STYLES.includes(styleOpt?.attrs?.text_style as TextStyle) ? (styleOpt!.attrs.text_style as TextStyle) : "deboss";
      out.push({ layer, comboKey: "", image: null, tint: null, placeholderHex: null, text: { value, style, color: styleOpt?.swatch_hex ?? null, box } });
      continue;
    }
    const comboKey = comboKeyFor(d, layer, sel);
    const image = comboKey == null ? null : d.images.find((im) => im.layer_id === layer.id && im.combo_key === comboKey) ?? null;
    const tintOpt = layer.recolor_slot ? optionByCode(d, layer.recolor_slot, selectedCodes(d, sel, layer.recolor_slot)[0] ?? "") : undefined;
    let placeholderHex: string | null = tintOpt?.swatch_hex ?? null;
    if (!placeholderHex) for (const s of layer.depends_on ?? []) { const o = optionByCode(d, s, selectedCodes(d, sel, s)[0] ?? ""); if (o?.swatch_hex) { placeholderHex = o.swatch_hex; break; } }
    out.push({ layer, comboKey, image, tint: tintOpt?.swatch_hex ?? null, text: null, placeholderHex });
  }
  return out;
}

// ─── ชื่อไฟล์รูป ↔ ชั้น + คอมโบ ───────────────────────────────────────────────
export function imageFileName(modelCode: string, view: ConfigView, layerCode: string, comboKey: string): string {
  return `${modelCode}_${VIEW_LABEL[view].code}_${layerCode}${comboKey ? `_${comboKey}` : ""}.png`;
}
/** แยกชื่อไฟล์ TOTE_FRONT_BODY_PEBBLE_NOIR.png → ส่วนประกอบ (ยอมท้าย (1) / -copy / -final) */
export function parseImageFileName(fileName: string): { model: string; view: ConfigView; layer: string; combo: string[] } | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "").trim()
    .replace(/\s*\(\d+\)$/, "").replace(/[-\s](copy|final|new)$/i, "").toUpperCase().replace(/\s+/g, "-");
  const parts = base.split("_").filter(Boolean);
  if (parts.length < 3) return null;
  const view = viewByCode(parts[1]);
  if (!view) return null;
  return { model: parts[0], view, layer: parts[2], combo: parts.slice(3) };
}
export type FileMatch = { ok: true; layer: CfgLayer; comboKey: string } | { ok: false; reason: string };
export function matchImageFile(d: ConfigData, fileName: string): FileMatch {
  const p = parseImageFileName(fileName);
  if (!p) return { ok: false, reason: "ชื่อไฟล์ไม่ตรงรูปแบบ ทรง_มุม_ชั้น_ตัวเลือก.png" };
  if (p.model !== d.model.code) return { ok: false, reason: `ชื่อไฟล์เป็นของทรง ${p.model} ไม่ใช่ ${d.model.code}` };
  const layer = d.layers.find((l) => l.view === p.view && l.code === p.layer && !l.text_slot);
  if (!layer) return { ok: false, reason: `ไม่มีชั้น ${p.layer} ใน${VIEW_LABEL[p.view].th}` };
  const deps = layer.depends_on ?? [];
  if (p.combo.length !== deps.length) {
    return { ok: false, reason: deps.length ? `ชั้น ${layer.code} ต้องต่อท้ายด้วย ${deps.join(" + ")} (${deps.length} ส่วน)` : `ชั้น ${layer.code} เป็นรูปเดียว ไม่ต้องต่อท้ายชื่อตัวเลือก` };
  }
  for (let i = 0; i < deps.length; i++) {
    if (!optionByCode(d, deps[i], p.combo[i])) return { ok: false, reason: `ไม่มีตัวเลือก ${p.combo[i]} ในช่อง ${slotByCode(d, deps[i])?.name_th ?? deps[i]}` };
  }
  return { ok: true, layer, comboKey: p.combo.join("_") };
}

// ─── รายการรูปที่ต้องถ่าย + จำนวนแบบที่ประกอบได้ ──────────────────────────────
export type ExpectedImage = { view: ConfigView; layer: CfgLayer; comboKey: string; fileName: string; label: string; image: CfgImage | null };
/** คอมโบที่เป็นไปได้ของชั้น (ตัดคอมโบที่กติการะหว่างช่องที่ขึ้นกับห้ามไว้) */
export function layerCombos(d: ConfigData, layer: CfgLayer): { key: string; label: string }[] {
  const deps = (layer.depends_on ?? []).map((c) => slotByCode(d, c)).filter((s): s is CfgSlot => !!s);
  if (deps.length !== (layer.depends_on ?? []).length) return [];
  let combos: { sel: Selection; codes: string[]; names: string[] }[] = [{ sel: {}, codes: [], names: [] }];
  for (const slot of deps) {
    const next: typeof combos = [];
    for (const c of combos) {
      for (const o of optionsOf(d, slot)) {
        const sel = { ...c.sel, [slot.code]: slot.kind === "multi" ? [o.code] : o.code };
        if (blockReason(d, sel, slot.code, o.code)) continue;
        if (deps.some((s) => s.code !== slot.code && sel[s.code] != null && blockReason(d, sel, s.code, selectedCodes(d, sel, s.code)[0] ?? ""))) continue;
        next.push({ sel, codes: [...c.codes, o.code], names: [...c.names, o.name_th] });
        if (next.length >= MAX_COMBOS_PER_LAYER) break;
      }
      if (next.length >= MAX_COMBOS_PER_LAYER) break;
    }
    combos = next;
  }
  return combos.map((c) => ({ key: c.codes.join("_"), label: c.names.join(" · ") }));
}
export function expectedImages(d: ConfigData, view?: ConfigView): ExpectedImage[] {
  const out: ExpectedImage[] = [];
  const views = d.model.views.filter((v) => !view || v === view);
  for (const v of views) {
    for (const layer of d.layers.filter((l) => l.view === v && l.is_active && !l.text_slot).sort((a, b) => a.z_index - b.z_index)) {
      for (const c of layerCombos(d, layer)) {
        out.push({ view: v, layer, comboKey: c.key, fileName: imageFileName(d.model.code, v, layer.code, c.key), label: c.label || "รูปเดียว", image: d.images.find((im) => im.layer_id === layer.id && im.combo_key === c.key) ?? null });
      }
    }
  }
  return out;
}

/** จำนวนแบบที่ประกอบได้ (ไล่ช่องแบบเลือก 1 ตามกติกา × ชุดของช่องแบบเลือกหลายอย่าง) · ไม่นับข้อความ */
export function countDesigns(d: ConfigData, cap = 200_000): { count: number; capped: boolean } {
  const singles = activeSlots(d).filter((s) => s.kind === "single");
  const multis = activeSlots(d).filter((s) => s.kind === "multi");
  let count = 0, visits = 0, capped = false;
  const walk = (i: number, sel: Selection) => {
    if (capped) return;
    if (i === singles.length) {
      let mult = 1;
      for (const m of multis) mult *= 2 ** optionsOf(d, m).filter((o) => !blockReason(d, sel, m.code, o.code)).length;
      count += mult;
      if (++visits >= cap) capped = true;
      return;
    }
    const slot = singles[i];
    const opts = optionsOf(d, slot).filter((o) => !blockReason(d, sel, slot.code, o.code));
    if (opts.length === 0) { walk(i + 1, sel); return; }
    for (const o of opts) walk(i + 1, { ...sel, [slot.code]: o.code });
  };
  walk(0, {});
  return { count, capped };
}

// ─── ตรวจค่าก่อนบันทึก (ใช้ทั้ง API + หน้าจอ) ─────────────────────────────────
export type ValidationResult = { ok: true } | { ok: false; errors: string[] };
const done = (errors: string[]): ValidationResult => (errors.length ? { ok: false, errors } : { ok: true });
const hasKey = (input: Record<string, unknown>, k: string, partial?: boolean) => !partial || k in input;
const nonNeg = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) && n >= 0; };
const isCodeList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string" && CODE_RE.test(x));
const HEX_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i;

function checkCode(input: Record<string, unknown>, errors: string[], partial?: boolean, label = "รหัส") {
  if (!hasKey(input, "code", partial)) return;
  const c = String(input.code ?? "");
  if (!CODE_RE.test(c)) errors.push(`${label}ต้องเป็นตัวอักษรอังกฤษตัวใหญ่ ตัวเลข หรือ "-" (ห้ามช่องว่างและ "_") เช่น PEBBLE หรือ STRAP-CHAIN`);
}
function checkName(input: Record<string, unknown>, errors: string[], partial?: boolean) {
  if (hasKey(input, "name_th", partial) && !String(input.name_th ?? "").trim()) errors.push("ต้องใส่ชื่อ (ไทย)");
}

export function validateModel(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  checkCode(input, errors, opts.partial, "รหัสทรง");
  checkName(input, errors, opts.partial);
  if (hasKey(input, "base_price", opts.partial) && !nonNeg(input.base_price)) errors.push("ราคาเริ่มต้นต้องเป็นตัวเลขไม่ติดลบ (ใส่ 0 = ให้ลูกค้าสอบถามราคา)");
  if (hasKey(input, "lead_days", opts.partial) && !nonNeg(input.lead_days)) errors.push("วันผลิตต้องเป็นตัวเลขไม่ติดลบ");
  if (hasKey(input, "views", opts.partial)) {
    const v = input.views;
    if (!Array.isArray(v) || v.length === 0 || !v.every((x) => CONFIG_VIEWS.includes(x as ConfigView))) errors.push("ต้องเปิดอย่างน้อย 1 มุม (ด้านหน้า / ด้านหลัง / ด้านใน / ด้านข้าง)");
  }
  if (hasKey(input, "canvas", opts.partial) && input.canvas != null) {
    const c = input.canvas as { w?: unknown; h?: unknown };
    const w = Number(c?.w), h = Number(c?.h);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 500 || h < 500 || w > 6000 || h > 6000) errors.push("ขนาดผืนผ้าใบต้องเป็นจำนวนเต็ม 500–6000 px");
  }
  return done(errors);
}
export function validateSlot(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  checkCode(input, errors, opts.partial, "รหัสช่อง");
  checkName(input, errors, opts.partial);
  if (hasKey(input, "kind", opts.partial) && !SLOT_KINDS.includes(input.kind as SlotKind)) errors.push(`ชนิดช่องต้องเป็น ${SLOT_KINDS.join(" / ")}`);
  if (hasKey(input, "step_view", opts.partial) && input.step_view != null && !CONFIG_VIEWS.includes(input.step_view as ConfigView)) errors.push("มุมที่โชว์ตอนเลือกช่องนี้ไม่ถูกต้อง");
  return done(errors);
}
export function validateOption(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  checkCode(input, errors, opts.partial, "รหัสตัวเลือก");
  checkName(input, errors, opts.partial);
  if (hasKey(input, "price_delta", opts.partial) && !nonNeg(input.price_delta)) errors.push("ราคาเพิ่มต้องไม่ติดลบ (ใส่ 0 ถ้าไม่บวกราคา)");
  if (hasKey(input, "lead_days", opts.partial) && !nonNeg(input.lead_days)) errors.push("วันผลิตเพิ่มต้องไม่ติดลบ");
  if (hasKey(input, "swatch_hex", opts.partial) && input.swatch_hex != null && input.swatch_hex !== "" && !HEX_RE.test(String(input.swatch_hex))) errors.push("สีตัวอย่างต้องเป็นรหัสสีแบบ #1f1d1c");
  return done(errors);
}
export function validateLayer(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  checkCode(input, errors, opts.partial, "รหัสชั้น");
  checkName(input, errors, opts.partial);
  if (hasKey(input, "view", opts.partial) && !CONFIG_VIEWS.includes(input.view as ConfigView)) errors.push("มุมของชั้นไม่ถูกต้อง");
  if (hasKey(input, "z_index", opts.partial) && !Number.isFinite(Number(input.z_index))) errors.push("ลำดับชั้นต้องเป็นตัวเลข");
  if (hasKey(input, "depends_on", opts.partial) && input.depends_on != null && !isCodeList(input.depends_on)) errors.push("\"เปลี่ยนตาม\" ต้องเป็นรายการรหัสช่อง");
  if (hasKey(input, "show_when", opts.partial) && input.show_when != null) {
    const ok = Array.isArray(input.show_when) && (input.show_when as unknown[]).every((c) => {
      const o = c as Condition;
      return o && typeof o.slot === "string" && CODE_RE.test(o.slot) && isCodeList(o.options ?? []);
    });
    if (!ok) errors.push("เงื่อนไขโชว์ชั้นไม่ถูกต้อง");
  }
  for (const k of ["recolor_slot", "text_slot"] as const) {
    if (hasKey(input, k, opts.partial) && input[k] != null && input[k] !== "" && !CODE_RE.test(String(input[k]))) errors.push("รหัสช่องที่อ้างถึงไม่ถูกต้อง");
  }
  if (Array.isArray(input.depends_on) && input.recolor_slot && (input.depends_on as string[]).includes(String(input.recolor_slot))) errors.push("ช่องที่ใช้ลงสีต้องไม่อยู่ใน \"เปลี่ยนตาม\" (ลงสีแทนการถ่ายทุกสี)");
  return done(errors);
}
export function validateRule(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  if (hasKey(input, "kind", opts.partial) && !RULE_KINDS.includes(input.kind as RuleKind)) errors.push("ชนิดกติกาต้องเป็น เลือกไม่ได้ / เลือกได้เฉพาะ");
  for (const k of ["if_slot", "then_slot"] as const) if (hasKey(input, k, opts.partial) && !CODE_RE.test(String(input[k] ?? ""))) errors.push("ต้องเลือกช่องของกติกาให้ครบ");
  if (hasKey(input, "if_options", opts.partial) && !isCodeList(input.if_options ?? [])) errors.push("ตัวเลือกเงื่อนไขไม่ถูกต้อง");
  if (hasKey(input, "then_options", opts.partial) && (!isCodeList(input.then_options) || (input.then_options as string[]).length === 0)) errors.push("ต้องเลือกตัวเลือกที่ห้าม/อนุญาตอย่างน้อย 1 ตัว");
  if (input.if_slot && input.then_slot && input.if_slot === input.then_slot) errors.push("กติกาต้องโยงคนละช่อง");
  return done(errors);
}
export function validateImage(input: Record<string, unknown>, opts: { partial?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  if (hasKey(input, "image_key", opts.partial) && !String(input.image_key ?? "").trim()) errors.push("ต้องมีไฟล์รูป");
  if (hasKey(input, "combo_key", opts.partial) && input.combo_key != null && !/^([A-Z0-9][A-Z0-9-]*(_[A-Z0-9][A-Z0-9-]*)*)?$/.test(String(input.combo_key))) errors.push("คีย์คอมโบไม่ถูกต้อง");
  return done(errors);
}

// ─── รหัสแบบของลูกค้า ─────────────────────────────────────────────────────────
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newDesignCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// ─── แม่แบบสำหรับถ่ายและซ้อนรูป (SVG · ใช้ทั้งพรีวิวและดาวน์โหลด) ─────────────
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
export function templateSvg(model: Pick<CfgModel, "code" | "name_th" | "canvas" | "view_config">, view: ConfigView, opts: { ghostUrl?: string | null; withSize?: boolean } = {}): string {
  const W = Number(model.canvas?.w) || DEFAULT_CANVAS.w, H = Number(model.canvas?.h) || DEFAULT_CANVAS.h;
  const vc = model.view_config?.[view] ?? {};
  const u = W / 100;                       // หน่วยขนาดตัวอักษร/เส้น (3000px → 30)
  const CY = "#00b2ff", MG = "#ff2bd6", AM = "#ffae00";
  const t = (x: number, y: number, s: number, text: string, color: string, anchor = "start") =>
    `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-size="${s.toFixed(0)}" fill="${color}" text-anchor="${anchor}" font-weight="600" stroke="#000" stroke-opacity=".55" stroke-width="${(s * 0.17).toFixed(1)}" stroke-linejoin="round" paint-order="stroke">${esc(text)}</text>`;
  const m = W * 0.04, gy = H * Math.min(0.98, Math.max(0.5, Number(vc.ground_y) || 0.9));
  let s = "";
  if (opts.ghostUrl) s += `<g id="GHOST"><image href="${esc(opts.ghostUrl)}" x="0" y="0" width="${W}" height="${H}" opacity=".35"/></g>`;
  s += `<g id="SAFE_FRAME"><rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${AM}" stroke-width="${(u * 0.18).toFixed(1)}" stroke-dasharray="${u * 1.2} ${u * 0.8}"/>${t(W - m - u * 0.4, m + u * 1.9, u * 1.2, "ขอบปลอดภัย", AM, "end")}</g>`;
  s += `<g id="CENTER_GROUND"><path d="M${W / 2},${m} V${H - m}" stroke="${CY}" stroke-width="${(u * 0.1).toFixed(1)}" stroke-dasharray="${u * 0.4} ${u * 0.8}"/>`
    + `<path d="M${m},${gy} H${W - m}" stroke="${CY}" stroke-width="${(u * 0.18).toFixed(1)}"/>${t(W - m - u * 0.4, gy - u * 0.8, u * 1.2, "เส้นพื้น · ก้นสินค้าแตะเส้นนี้", CY, "end")}</g>`;
  const markers = (vc.markers ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (markers.length) {
    s += `<g id="ANCHORS">${markers.map((p) => {
      const x = p.x * W, y = p.y * H, r = u;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${MG}" stroke-width="${(u * 0.16).toFixed(1)}"/><path d="M${x - r * 1.8},${y} H${x + r * 1.8} M${x},${y - r * 1.8} V${y + r * 1.8}" stroke="${MG}" stroke-width="${(u * 0.16).toFixed(1)}"/>${t(x + r * 2.2, y + u * 0.45, u * 1.3, p.label, MG)}`;
    }).join("")}</g>`;
  }
  const cm = Number(vc.cm_px);
  if (cm > 0) {
    const x1 = W - m - u, len = cm * 10, x0 = x1 - len, y = H - m - u * 1.4;
    s += `<g id="SCALE"><path d="M${x0},${y} H${x1} M${x0},${y - u * 0.8} V${y + u * 0.8} M${x1},${y - u * 0.8} V${y + u * 0.8} M${x0 + len / 2},${y - u * 0.5} V${y + u * 0.5}" stroke="${MG}" stroke-width="${(u * 0.18).toFixed(1)}"/>${t(x0 + len / 2, y - u * 1.2, u * 1.2, "10 ซม.", MG, "middle")}</g>`;
  }
  const v = VIEW_LABEL[view];
  const lines = [
    [`แม่แบบถ่ายรูป · ${model.code} ${model.name_th} · ${v.th}`, CY, 1.45],
    [`ผืนผ้าใบ ${W} × ${H} px · ส่งออก PNG พื้นใสขนาดเท่านี้ทุกไฟล์`, "#ffffff", 1.2],
    [`ชื่อไฟล์: ${model.code}_${v.code}_ชั้น_ตัวเลือก.png`, "#ffffff", 1.2],
    [vc.camera_note?.trim() || (view === "back" ? "หมุนสินค้า 180° บนจานหมุนที่มาร์กไว้ · ห้ามขยับกล้อง" : view === "inside" ? "กล้องมองลงประมาณ 55° จากด้านหน้า · ดันปากด้วยโครงใส" : "ล็อกขาตั้ง ซูม ระยะ และไฟ ให้เหมือนเดิมทุกรูป"), "#ffffff", 1.2],
    ["ฟ้า = ตำแหน่งสินค้า · ชมพู = จุดวางชิ้นส่วน · ส้ม = ขอบปลอดภัย", "#ffffff", 1.2],
  ] as const;
  s += `<g id="INFO">${lines.map(([text, color, k], i) => t(m + u * 0.6, m + u * (2.4 + i * 1.9), u * k, text, color)).join("")}</g>`;
  const size = opts.withSize === false ? "" : ` width="${W}" height="${H}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${W} ${H}" font-family="Anuphan, 'Leelawadee UI', 'Noto Sans Thai', Tahoma, sans-serif">${s}</svg>`;
}

// ─── แบบพิมพ์เขียว (สำเนาทรง / สร้างทรงตัวอย่าง) ──────────────────────────────
type NoIds<T> = Omit<T, "id" | "model_id" | "slot_id" | "layer_id" | "shop_id">;
export type Blueprint = {
  model: NoIds<CfgModel>;
  slots: (NoIds<CfgSlot> & { options: NoIds<CfgOption>[] })[];
  layers: (NoIds<CfgLayer> & { images: NoIds<CfgImage>[] })[];
  rules: NoIds<CfgRule>[];
};
const strip = <T extends Record<string, unknown>>(row: T): NoIds<T> => {
  const { id: _i, model_id: _m, slot_id: _s, layer_id: _l, shop_id: _sh, created_at: _c, updated_at: _u, deleted_at: _d, ...rest } = row as Record<string, unknown>;
  return rest as NoIds<T>;
};
/** ทั้งทรง → แบบพิมพ์เขียว (ไม่มี id) ไว้สร้างสำเนา · `withImages=false` = ไม่คัดลอกรูป */
export function blueprintFromData(d: ConfigData, opts: { code: string; nameTh: string; withImages?: boolean }): Blueprint {
  return {
    model: { ...strip(d.model), code: opts.code, name_th: opts.nameTh, is_active: false },
    slots: d.slots.map((s) => ({ ...strip(s), options: d.options.filter((o) => o.slot_id === s.id).map(strip) })),
    layers: d.layers.map((l) => ({ ...strip(l), images: opts.withImages === false ? [] : d.images.filter((im) => im.layer_id === l.id).map(strip) })),
    rules: d.rules.map(strip),
  };
}

/** รายการรูปที่ต้องถ่ายเป็น CSV (เปิดใน Excel/Google Sheets ได้) */
export function shotListCsv(d: ConfigData): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = expectedImages(d).map((e) => [VIEW_LABEL[e.view].th, e.layer.name_th, e.label, e.fileName, e.image ? "มีแล้ว" : "ยังไม่มี"].map(q).join(","));
  return "﻿" + ["มุม,ชั้น,ตัวเลือก,ชื่อไฟล์,สถานะ", ...rows].join("\n");
}
