/**
 * 📝 คำสั่งประจำของ AI เขียนแคปชั่น (ป๊อป "ให้ AI เขียนแคปชั่น") — ของกลาง pure (มีเทสต์)
 *   เจ้าของสั่ง 2026-11-20: "ตั้งค่า prompt ได้ บางทีมี prompt ประจำ (เลือกจาก draft ได้) แต่มี default"
 *   ที่เก็บ = ui_config key CAPTION_PRESETS_KEY (ไม่มีตารางใหม่):
 *     { [scope]: Preset[] }   scope = brand_id หรือ "*" = ทุกแบรนด์
 *   ใช้ร่วมทั้งทีม · แก้ชื่อ/ข้อความ/ลบ/ตั้งค่าเริ่มต้นได้ (ค่าเริ่มต้น 1 ตัวต่อ scope)
 *   ต่างจาก prompt หลักของแพลตฟอร์ม (erp_caption_prompts · ตั้งค่าแพลตฟอร์ม) — คำสั่งประจำ = "คำสั่งเพิ่ม" ที่ใช้บ่อย ต่อท้าย prompt หลัก
 * API = /api/ai/caption-presets · ใช้ใน /api/ai/caption-options (ผ่านข้อความ extra ที่ผู้ใช้ส่ง)
 */

export const CAPTION_PRESETS_KEY = "caption_prompt_presets";
export const ALL_SCOPE = "*";
export type CaptionPreset = { id: string; name: string; text: string; is_default?: boolean; by?: string | null; by_name?: string | null; at?: string | null };
export type PresetStore = Record<string, CaptionPreset[]>;

const MAX_PER_SCOPE = 50;
const SCOPE_RE = /^(\*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

export function normalizePresets(raw: unknown): PresetStore {
  const out: PresetStore = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [scope, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!SCOPE_RE.test(scope) || !Array.isArray(list)) continue;
    const items: CaptionPreset[] = [];
    for (const r of list as Record<string, unknown>[]) {
      const id = clean(r?.id, 40), name = clean(r?.name, 60), text = clean(r?.text, 1000);
      if (!id || !name || !text) continue;
      items.push({ id, name, text, is_default: r?.is_default === true, by: (r?.by as string) ?? null, by_name: (r?.by_name as string) ?? null, at: (r?.at as string) ?? null });
    }
    // ค่าเริ่มต้นได้ตัวเดียว (ตัวแรกที่ติดไว้)
    let seen = false;
    for (const it of items) { if (it.is_default && !seen) seen = true; else it.is_default = false; }
    if (items.length) out[scope.toLowerCase()] = items.slice(0, MAX_PER_SCOPE);
  }
  return out;
}

/** คำสั่งประจำที่ใช้ได้กับแบรนด์นี้ (แบรนด์นี้ก่อน แล้วทุกแบรนด์) · default = ของแบรนด์ก่อน → ทุกแบรนด์ */
export function presetsFor(store: PresetStore, brandId: string | null | undefined): { items: (CaptionPreset & { scope: string })[]; defaultId: string | null } {
  const b = brandId ? store[brandId.toLowerCase()] ?? [] : [];
  const all = store[ALL_SCOPE] ?? [];
  const items = [...b.map((p) => ({ ...p, scope: brandId!.toLowerCase() })), ...all.map((p) => ({ ...p, scope: ALL_SCOPE }))];
  const def = b.find((p) => p.is_default) ?? all.find((p) => p.is_default) ?? null;
  return { items, defaultId: def?.id ?? null };
}

/** เพิ่ม/แก้ (id เดิม = แก้) · isDefault = ตั้งเป็นค่าเริ่มต้นของ scope นั้น (ตัวอื่นเลิกเป็น) */
export function upsertPreset(store: PresetStore, scope: string, p: { id: string; name: string; text: string; isDefault?: boolean }, meta: { by?: string | null; by_name?: string | null; at?: string | null } = {}): PresetStore {
  const sc = scope.toLowerCase();
  if (!SCOPE_RE.test(sc)) return store;
  const name = clean(p.name, 60), text = clean(p.text, 1000), id = clean(p.id, 40);
  if (!id || !name || !text) return store;
  const list = [...(store[sc] ?? [])];
  const i = list.findIndex((x) => x.id === id);
  const prev = i >= 0 ? list[i] : null;
  const item: CaptionPreset = { id, name, text, is_default: p.isDefault ?? prev?.is_default ?? false, by: prev?.by ?? meta.by ?? null, by_name: prev?.by_name ?? meta.by_name ?? null, at: meta.at ?? prev?.at ?? null };
  if (i >= 0) list[i] = item; else list.push(item);
  const next = item.is_default ? list.map((x) => (x.id === id ? x : { ...x, is_default: false })) : list;
  return { ...store, [sc]: next.slice(0, MAX_PER_SCOPE) };
}

export function removePreset(store: PresetStore, scope: string, id: string): { store: PresetStore; removed: CaptionPreset | null } {
  const sc = scope.toLowerCase();
  const list = store[sc] ?? [];
  const removed = list.find((x) => x.id === id) ?? null;
  if (!removed) return { store, removed: null };
  const rest = list.filter((x) => x.id !== id);
  const next = { ...store };
  if (rest.length) next[sc] = rest; else delete next[sc];
  return { store: next, removed };
}

/** ตั้ง/เลิกค่าเริ่มต้น (on=false = ไม่มีค่าเริ่มต้นใน scope นี้) */
export function setDefaultPreset(store: PresetStore, scope: string, id: string, on: boolean): PresetStore {
  const sc = scope.toLowerCase();
  const list = store[sc];
  if (!list?.some((x) => x.id === id)) return store;
  return { ...store, [sc]: list.map((x) => ({ ...x, is_default: on ? x.id === id : x.id === id ? false : x.is_default })) };
}
