"use client";
/**
 * ⚙ ตั้งค่าโหมดลงรายละเอียด (ของกลาง) — เพิ่ม/แก้/ลบ/เรียงโหมด · เลือกช่อง · ต้องมี/แนะนำ · คำแนะนำต่อช่อง · ใครเห็น · ใช้กับประเภทสินค้า
 * ใช้ 2 ที่: แท็บ "📝 โหมดลงข้อมูล" ในตัวออกแบบหน้า (ปุ่ม 🎨 ออกแบบฟิลด์) + ป๊อปจากปุ่มโหมดในป๊อปรายการ
 * บันทึก POST /api/admin/entry-modes (สิทธิ์ admin.module_layout.edit + audit) · docs/entry-modes.md
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cachedJson } from "@/lib/client-cache";
import { tr } from "@/lib/lang";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { SaveBar } from "@/components/save-bar";
import { ENTRY_MODE_DEFAULTS, normalizeEntryModes, type EntryMode, type EntryModeItem, type EntryModeLevel } from "@/lib/entry-modes";
import type { EntryModeField } from "./index";

const ROLE_OPTS: { key: string; label: string }[] = [
  { key: "manager", label: tr("ผู้จัดการ", "Manager") },
  { key: "staff", label: tr("พนักงาน", "Staff") },
  { key: "viewer", label: tr("ดูอย่างเดียว", "Viewer") },
];
const NOT_PICKABLE = new Set(["one2many", "computed", "image"]);

export function EntryModeSettings({
  moduleKey, modes, isDefault, fields, familyFilter = false, canEdit, actor, onSaved, onDirtyChange,
}: {
  moduleKey: string;
  /** โหมดที่ใช้อยู่ตอนนี้ (resolve แล้ว) */
  modes: EntryMode[];
  /** ยังใช้ชุดตั้งต้นในโค้ด (ไม่เคยบันทึก) */
  isDefault: boolean;
  fields: EntryModeField[];
  /** โมดูลสินค้า → ตั้ง "ใช้กับประเภทสินค้า (Product Family)" ได้ */
  familyFilter?: boolean;
  canEdit: boolean;
  actor?: string;
  onSaved: () => void;
  /** แจ้งตัวห่อ (ป๊อป) ว่ามีที่ยังไม่บันทึก → ถามก่อนปิด */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<EntryMode[]>(() => structuredClone(modes));
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [families, setFamilies] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (!dirty) { setDraft(structuredClone(modes)); setSel((s) => Math.min(s, Math.max(0, modes.length - 1))); } }, [modes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!familyFilter) return;
    cachedJson<{ data?: Record<string, unknown>[]; rows?: Record<string, unknown>[] }>(`/api/master-v2/product_families?limit=500&include_inactive=true`)
      .then((j) => setFamilies(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }))))
      .catch(() => {});
  }, [familyFilter]);

  const fieldMap = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);
  const cur = draft[sel] ?? null;
  const patchMode = (p: Partial<EntryMode>) => { setDraft((d) => d.map((m, i) => (i === sel ? { ...m, ...p } : m))); setDirty(true); };
  const patchItem = (idx: number, p: Partial<EntryModeItem>) => cur && patchMode({ items: cur.items.map((it, i) => (i === idx ? { ...it, ...p } : it)) });
  const itemDrag = useDragReorder((from, to) => cur && patchMode({ items: moveItem(cur.items, from, to) }), { group: "em-items" });
  const modeDrag = useDragReorder((from, to) => { setDraft((d) => moveItem(d, from, to)); setSel(to); setDirty(true); }, { group: "em-modes" });

  const addMode = () => {
    const n: EntryMode = { key: `m${Date.now().toString(36)}`, label: tr("โหมดใหม่", "New mode"), icon: "📝", items: [] };
    setDraft((d) => [...d, n]); setSel(draft.length); setDirty(true);
  };
  const pickable = fields.filter((f) => !NOT_PICKABLE.has(f.type ?? "") && !(cur?.items ?? []).some((it) => it.field === f.key)
    && (!addQ.trim() || `${f.label} ${f.key}`.toLowerCase().includes(addQ.trim().toLowerCase())));

  const save = async (reset = false) => {
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/admin/entry-modes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { module: moduleKey, reset: true, actor } : { module: moduleKey, modes: normalizeEntryModes(draft), actor }),
      });
      const j = await res.json().catch(() => ({})) as { error?: string | null };
      if (!res.ok || j.error) { setErr(j.error || tr(`บันทึกไม่สำเร็จ (${res.status})`, `Save failed (${res.status})`)); return; }
      setDirty(false);
      toast.show(reset ? tr("คืนค่าโหมดตั้งต้นแล้ว", "Default modes restored") : tr("บันทึกโหมดแล้ว", "Modes saved"), "success");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("บันทึกไม่สำเร็จ", "Save failed"));
    } finally { setSaving(false); }
  };

  const inputCls = "w-full h-8 px-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50";
  const ro = !canEdit;

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      {ro && <div className="mb-3 px-3 py-2 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800">{tr("ดูได้อย่างเดียว — การตั้งค่าโหมดต้องเป็นแอดมิน (สิทธิ์ จัดหน้าฟอร์ม)", "View only — editing modes needs admin (form layout permission)")}</div>}
      {isDefault && !dirty && <div className="mb-3 px-3 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-600">{tr("ตอนนี้ใช้ชุดโหมดตั้งต้นของระบบ — แก้แล้วกดบันทึก ระบบจะใช้ชุดของคุณแทน", "Using the built-in default modes — edit and save to use your own set")}</div>}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-4 min-h-0">
        {/* ซ้าย: รายการโหมด */}
        <div className="space-y-1">
          <div className="text-[11px] text-slate-400 px-1 pb-1">{tr("โหมดของหน้านี้ (ลากเรียงได้)", "Modes on this page (drag to sort)")}</div>
          {draft.map((m, i) => (
            <div key={m.key} {...modeDrag.rowProps(i)} onClick={() => setSel(i)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer ${i === sel ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700 hover:bg-slate-50"} ${modeDrag.rowCls(i)}`}>
              {!ro && <DragHandle {...modeDrag.handleProps(i)} />}
              <span className="w-5 text-center">{m.icon || "📝"}</span>
              <span className="flex-1 min-w-0 truncate">{m.label}</span>
              <span className="text-[10.5px] text-slate-400 tabular-nums">{m.items.length}</span>
            </div>
          ))}
          {!ro && <button type="button" onClick={addMode} className="w-full text-left px-2 py-1.5 rounded-md text-sm text-blue-700 hover:bg-blue-50">＋ {tr("เพิ่มโหมด", "Add mode")}</button>}
        </div>

        {/* ขวา: แก้โหมดที่เลือก */}
        {!cur ? (
          <div className="text-sm text-slate-400 py-10 text-center">{tr("ยังไม่มีโหมด — กด ＋ เพิ่มโหมด", "No modes yet — press ＋ Add mode")}</div>
        ) : (
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <label className="block"><span className="text-[11px] text-slate-500">{tr("ไอคอน", "Icon")}</span>
                <input disabled={ro} value={cur.icon ?? ""} onChange={(e) => patchMode({ icon: e.target.value.slice(0, 4) })} className={`${inputCls} text-center`} /></label>
              <label className="block"><span className="text-[11px] text-slate-500">{tr("ชื่อโหมด", "Mode name")}</span>
                <input disabled={ro} value={cur.label} onChange={(e) => patchMode({ label: e.target.value })} className={inputCls} placeholder={tr("เช่น ลงขายเว็บไซต์", "e.g. List on website")} /></label>
              <div className="col-span-2 sm:col-span-1"><span className="text-[11px] text-slate-500">{tr("ใครเห็นโหมดนี้ (ไม่เลือก = ทุกคน)", "Who sees it (none = everyone)")}</span>
                <div className="flex gap-1 flex-wrap mt-0.5">
                  {ROLE_OPTS.map((r) => {
                    const on = (cur.roles ?? []).includes(r.key);
                    return <button key={r.key} type="button" disabled={ro}
                      onClick={() => patchMode({ roles: on ? (cur.roles ?? []).filter((x) => x !== r.key) : [...(cur.roles ?? []), r.key] })}
                      className={`h-7 px-2 text-xs rounded-full border ${on ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{r.label}</button>;
                  })}
                </div>
              </div>
            </div>

            {familyFilter && (
              <div>
                <span className="text-[11px] text-slate-500">{tr("ใช้กับประเภทสินค้า (ไม่เลือก = ทุกประเภท · ช่องที่ประเภทนั้นซ่อนไว้จะไม่นับอยู่แล้ว)", "Applies to product families (none = all · fields a family hides are never counted)")}</span>
                <div className="flex gap-1 flex-wrap mt-0.5">
                  {(cur.families ?? []).map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                      {families.find((f) => f.id === id)?.name ?? id}
                      {!ro && <button type="button" onClick={() => patchMode({ families: (cur.families ?? []).filter((x) => x !== id) })} className="text-emerald-500 hover:text-rose-600">✕</button>}
                    </span>
                  ))}
                  {!ro && (
                    <select value="" onChange={(e) => { if (e.target.value) patchMode({ families: [...(cur.families ?? []), e.target.value] }); }}
                      className="h-7 px-2 text-xs border border-dashed border-slate-300 rounded-full text-slate-500 bg-white">
                      <option value="">{(cur.families ?? []).length ? tr("＋ เพิ่มประเภท", "＋ add family") : tr("ทุกประเภท · ＋ จำกัดเฉพาะ…", "All families · ＋ limit to…")}</option>
                      {families.filter((f) => !(cur.families ?? []).includes(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1">{tr("ช่องที่ต้องลงในโหมดนี้", "Fields in this mode")} <span className="font-normal text-slate-400">({cur.items.length})</span></div>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                {cur.items.length === 0 && <div className="px-3 py-4 text-xs text-slate-400 text-center">{tr("ยังไม่มีช่อง — เลือกจากรายการด้านล่าง", "No fields yet — pick from the list below")}</div>}
                {cur.items.map((it, i) => {
                  const f = fieldMap[it.field];
                  return (
                    <div key={it.field} {...itemDrag.rowProps(i)} className={`px-2.5 py-2 grid grid-cols-[16px_minmax(0,1fr)] sm:grid-cols-[16px_minmax(0,1fr)_auto] gap-2 items-start ${itemDrag.rowCls(i)}`}>
                      {!ro ? <DragHandle {...itemDrag.handleProps(i)} className="mt-1.5" /> : <span />}
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-800 truncate">
                          {f?.label ?? it.field}
                          {!f && <span className="ml-1.5 text-[11px] font-normal text-rose-600">{tr("⚠ ไม่พบช่องนี้ในทะเบียน (จะไม่โชว์)", "⚠ field not in registry (hidden)")}</span>}
                        </div>
                        <input disabled={ro} value={it.hint ?? ""} onChange={(e) => patchItem(i, { hint: e.target.value })}
                          placeholder={f?.helpText ? `${tr("ใช้คำอธิบายเดิม:", "Default:")} ${f.helpText}` : tr("คำแนะนำ / ตัวอย่างที่ควรกรอก", "Tip / example of what to enter")}
                          className="mt-1 w-full h-7 px-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50" />
                      </div>
                      <div className="col-start-2 sm:col-start-auto flex items-center gap-1 sm:mt-0.5">
                        <LevelSeg value={it.level} disabled={ro} onChange={(lv) => patchItem(i, { level: lv })} />
                        {!ro && <button type="button" onClick={() => patchMode({ items: cur.items.filter((_, j) => j !== i) })}
                          title={tr("เอาออกจากโหมด", "Remove from mode")} className="w-6 h-6 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">✕</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!ro && (
              <div className="rounded-lg border border-dashed border-slate-300 p-2.5 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-slate-600">＋ {tr("เพิ่มช่องจากทะเบียนฟิลด์", "Add a field from the registry")}</span>
                  <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder={tr("ค้นหาช่อง…", "Search fields…")} className="flex-1 h-7 px-2 text-xs border border-slate-200 rounded-md bg-white" />
                </div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {pickable.slice(0, 80).map((f) => (
                    <button key={f.key} type="button" onClick={() => patchMode({ items: [...cur.items, { field: f.key, level: "required" }] })}
                      className="h-6 px-2 text-[11.5px] rounded-full border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700">{f.label}</button>
                  ))}
                  {pickable.length === 0 && <span className="text-xs text-slate-400">{tr("ไม่มีช่องให้เพิ่ม", "No more fields")}</span>}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 p-2.5 bg-white">
              <div className="text-xs font-semibold text-slate-700 mb-1.5">🖼 {tr("เงื่อนไขพิเศษ: จำนวนรูปสินค้า", "Special check: number of product images")}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">{tr("อย่างน้อย", "At least")}</span>
                <input disabled={ro} type="number" min={0} max={50} value={cur.imagesMin ?? 0}
                  onChange={(e) => patchMode({ imagesMin: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) })}
                  className="w-16 h-7 px-2 text-xs border border-slate-200 rounded-md tabular-nums disabled:bg-slate-50" />
                <span className="text-xs text-slate-500">{tr("รูป (0 = ไม่เช็ก)", "images (0 = don't check)")}</span>
                {(cur.imagesMin ?? 0) > 0 && <LevelSeg value={cur.imagesLevel ?? "required"} disabled={ro} onChange={(lv) => patchMode({ imagesLevel: lv })} />}
              </div>
              {(cur.imagesMin ?? 0) > 0 && (
                <input disabled={ro} value={cur.imagesHint ?? ""} onChange={(e) => patchMode({ imagesHint: e.target.value })}
                  placeholder={tr("คำแนะนำ เช่น รูปหน้า / หลัง / ข้าง + รูปใช้งานจริง", "Tip e.g. front / back / side + in-use photo")}
                  className="mt-1.5 w-full h-7 px-2 text-xs border border-slate-200 rounded-md disabled:bg-slate-50" />
              )}
            </div>

            {!ro && (
              <button type="button" onClick={() => setConfirmDel(true)} className="text-xs text-rose-600 hover:underline">🗑 {tr("ลบโหมดนี้", "Delete this mode")}</button>
            )}
          </div>
        )}
      </div>

      {!ro && (
        <div className="mt-4 sticky bottom-0">
          <SaveBar dirty={dirty} saving={saving} error={err} onSave={() => save(false)}
            onDiscard={() => { setDraft(structuredClone(modes)); setDirty(false); setErr(null); }}
            note={tr("บันทึกแล้วทุกคนเห็นทันที", "Saved modes apply to everyone right away")}
            extra={ENTRY_MODE_DEFAULTS[moduleKey] && !isDefault ? (
              <button type="button" onClick={() => setConfirmReset(true)} disabled={saving}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">↺ {tr("คืนค่าตั้งต้น", "Restore defaults")}</button>
            ) : undefined} />
        </div>
      )}

      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); setDraft((d) => d.filter((_, i) => i !== sel)); setSel(0); setDirty(true); }}
        title={tr("ลบโหมดนี้?", "Delete this mode?")}
        message={tr(`ลบโหมด "${cur?.label ?? ""}" (ยังไม่หายจริงจนกว่าจะกดบันทึก)`, `Delete mode "${cur?.label ?? ""}" (not final until you save)`)}
        confirmText={tr("ลบ", "Delete")} variant="danger" />
      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); void save(true); }}
        title={tr("คืนค่าโหมดตั้งต้น?", "Restore default modes?")}
        message={tr("โหมดที่ตั้งเองทั้งหมดของหน้านี้จะถูกแทนด้วยชุดตั้งต้นของระบบ", "All custom modes on this page will be replaced by the built-in set")}
        confirmText={tr("คืนค่าตั้งต้น", "Restore")} variant="danger" />
    </div>
  );
}

function LevelSeg({ value, onChange, disabled }: { value: EntryModeLevel; onChange: (v: EntryModeLevel) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex rounded-md border border-slate-200 overflow-hidden shrink-0">
      {(["required", "recommended"] as const).map((lv) => (
        <button key={lv} type="button" disabled={disabled} onClick={() => onChange(lv)}
          className={`h-6 px-2 text-[11px] ${value === lv
            ? (lv === "required" ? "bg-rose-50 text-rose-700 font-medium" : "bg-amber-50 text-amber-700 font-medium")
            : "bg-white text-slate-400 hover:bg-slate-50"} ${lv === "recommended" ? "border-l border-slate-200" : ""}`}>
          {lv === "required" ? tr("ต้องมี", "Required") : tr("แนะนำ", "Recommended")}
        </button>
      ))}
    </span>
  );
}
