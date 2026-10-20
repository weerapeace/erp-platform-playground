"use client";

/**
 * ตั้งค่าป้ายการตลาด 2 แท็บ: ป้ายหลัก (Hero / Clearance … 1 ป้าย/รุ่น) · ป้ายเสริม (ชิปบนรูป หลายป้าย/รุ่น)
 *   เพิ่ม · แก้ (ชื่อ/ชื่ออังกฤษ/ไอคอน/สี/คำอธิบาย) · ลากเรียงลำดับ · ลบ (รุ่นที่ติดป้ายนั้นกลายเป็น "ยังไม่มีป้าย")
 * ของกลาง: ERPModal · ConfirmDialog · ColorInput · useDragReorder/DragHandle · Toast
 */
import { useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ColorInput } from "@/components/color-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { labelName, type MarketingSkuLabel } from "@/lib/marketing/sku-list";

export function LabelBadge({ label }: { label?: Pick<MarketingSkuLabel, "name" | "name_en" | "icon" | "color"> }) {
  const t = useT();
  if (!label) return <span className="text-xs text-slate-400">{t("ยังไม่มีป้าย", "No label yet")}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${label.color}1f`, color: label.color, border: `1px solid ${label.color}55` }}>
      {label.icon && <span>{label.icon}</span>}{labelName(label)}
    </span>
  );
}

type Draft = { name: string; name_en: string; icon: string; color: string; description: string };
const toDraft = (l: MarketingSkuLabel): Draft => ({ name: l.name, name_en: l.name_en ?? "", icon: l.icon ?? "", color: l.color, description: l.description ?? "" });
const EMPTY: Draft = { name: "", name_en: "", icon: "", color: "#0ea5e9", description: "" };
const same = (a: Draft, b: Draft) => a.name === b.name && a.name_en === b.name_en && a.icon === b.icon && a.color === b.color && a.description === b.description;

export type LabelKind = "status" | "badge" | "pillar";
type Kind = LabelKind;
/** ชื่อแท็บ/คำอธิบายของป้ายแต่ละชนิด ตามภาษาที่เลือก (เรียกตอน render) */
export const kindText = (t: (th: string, en: string) => string): Record<Kind, { tab: string; desc: string }> => ({
  status: { tab: t("ป้ายหลัก", "Main labels"), desc: t("ป้ายหลัก = 1 ป้ายต่อรุ่น · ลาก ⋮⋮ เพื่อเรียงลำดับ (ลำดับนี้ใช้ทั้งชิปกรองและเมนูเลือกป้าย)", "Main label = 1 per model · drag ⋮⋮ to reorder (the order is used by the filter chips and the label menu)") },
  badge: { tab: t("ป้ายเสริม", "Badges"), desc: t("ป้ายเสริม = ชิปบนรูป ติดได้หลายป้ายต่อรุ่น · ลาก ⋮⋮ เพื่อเรียงลำดับ", "Badge = chip on the image, several per model · drag ⋮⋮ to reorder") },
  pillar: { tab: t("แนวคอนเทนต์", "Content pillars"), desc: t("แนวคอนเทนต์ = ใช้ติดไอเดียในหน้าวางแผนคอนเทนต์ (1 แนว/ชิ้น) · ลาก ⋮⋮ เพื่อเรียงลำดับ", "Content pillar = tag for ideas in the content planner (1 per piece) · drag ⋮⋮ to reorder") },
});

/** ตัวแก้รายการป้าย 1 ชนิด (ไม่มีกรอบ popup) — ฝังในหน้า/ป๊อปอื่นได้ เช่น หน้าตั้งค่าวางแผนคอนเทนต์ */
export function LabelListEditor({ kind, items, canEdit, onChanged, onDirtyChange }: {
  kind: Kind;
  items: MarketingSkuLabel[];
  canEdit: boolean;
  onChanged: () => void;
  /** แจ้งว่ามีการแก้ที่ยังไม่บันทึก (ให้กรอบนอกเตือนก่อนปิด/สลับแท็บ) */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const t = useT();
  const [list, setList] = useState<MarketingSkuLabel[]>(items);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(items.map((l) => [l.id, toDraft(l)])));
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [delTarget, setDelTarget] = useState<MarketingSkuLabel | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setList(items);
    setDrafts(Object.fromEntries(items.map((l) => [l.id, toDraft(l)])));
  }, [items]);

  const send = async (method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save")); return null; }
      return j.data ?? {};
    } catch { toast.error(t("เชื่อมต่อไม่ได้ กรุณาลองใหม่", "Can't connect. Please try again.")); return null; }
    finally { setBusy(false); }
  };

  const saveRow = async (l: MarketingSkuLabel) => {
    const d = drafts[l.id];
    if (!d?.name.trim()) { toast.warning(t("ต้องใส่ชื่อป้าย", "Label name is required")); return; }
    if (await send("PATCH", "/api/marketing/sku-labels", { id: l.id, ...d })) { toast.success(t("บันทึกป้ายแล้ว", "Label saved")); onChanged(); }
  };

  const addRow = async () => {
    if (!adding.name.trim()) { toast.warning(t("ต้องใส่ชื่อป้าย", "Label name is required")); return; }
    if (await send("POST", "/api/marketing/sku-labels", { ...adding, kind })) { toast.success(t("เพิ่มป้ายแล้ว", "Label added")); setAdding(EMPTY); onChanged(); }
  };

  const doDelete = async () => {
    if (!delTarget) return;
    const res = await send("DELETE", `/api/marketing/sku-labels?id=${delTarget.id}`);
    if (res) { toast.success(t(`ลบป้าย "${delTarget.name}" แล้ว`, `Label "${labelName(delTarget)}" deleted`)); setDelTarget(null); onChanged(); }
  };
  const usage = delTarget?.usage_count ?? 0;

  const { rowProps, handleProps, dragIdx } = useDragReorder(async (from, to) => {
    const next = moveItem(list, from, to);
    setList(next);
    if (!(await send("PATCH", "/api/marketing/sku-labels", { order: next.map((l) => l.id) }))) setList(list);
    else onChanged();
  });

  const dirty = list.some((l) => drafts[l.id] && !same(drafts[l.id], toDraft(l))) || !same(adding, EMPTY);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const input = "h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";

  return (
    <>
        <div className="space-y-2">
          {list.length === 0 && <div className="py-6 text-center text-sm text-slate-400">{t("ยังไม่มีป้าย เพิ่มป้ายแรกด้านล่าง", "No labels yet — add the first one below")}</div>}
          {list.map((l, i) => {
            const d = drafts[l.id] ?? toDraft(l);
            const changed = !same(d, toDraft(l));
            const set = (patch: Partial<Draft>) => setDrafts((m) => ({ ...m, [l.id]: { ...d, ...patch } }));
            return (
              <div key={l.id} {...(canEdit ? rowProps(i) : {})}
                className={`rounded-xl border p-2.5 data-[drag-over=true]:border-blue-500 data-[drag-over=true]:bg-blue-50 ${dragIdx === i ? "opacity-50" : ""} ${changed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && <DragHandle {...handleProps(i)} title={t("ลากเพื่อเรียงลำดับ", "Drag to reorder")} />}
                  <input value={d.icon} onChange={(e) => set({ icon: e.target.value })} disabled={!canEdit} maxLength={8} placeholder="🔥"
                    className={`${input} w-12 text-center`} title={t("ไอคอน (อีโมจิ)", "Icon (emoji)")} />
                  <input value={d.name} onChange={(e) => set({ name: e.target.value })} disabled={!canEdit} maxLength={60} placeholder={t("ชื่อป้าย (ไทย)", "Label name (Thai)")}
                    className={`${input} flex-1 min-w-[10rem]`} title={t("ชื่อป้าย (ภาษาไทย)", "Label name (Thai)")} />
                  <input value={d.name_en} onChange={(e) => set({ name_en: e.target.value })} disabled={!canEdit} maxLength={60} placeholder={t("English (ไม่บังคับ)", "English (optional)")}
                    className={`${input} flex-1 min-w-[8rem]`} title={t("ชื่ออังกฤษ — โชว์ตอนกด EN · ว่าง = ใช้ชื่อไทย", "English name — shown in EN mode · empty = use the Thai name")} />
                  <div className="w-36">{canEdit ? <ColorInput value={d.color} onChange={(c) => set({ color: c })} /> : <span className="inline-block w-6 h-6 rounded-md border border-slate-200" style={{ background: d.color }} />}</div>
                  <span className="text-xs text-slate-400 w-16 text-right">{l.usage_count ?? 0} {kind === "pillar" ? t("ชิ้น", "pcs") : t("รุ่น", "models")}</span>
                  {canEdit && (
                    <>
                      <button type="button" onClick={() => saveRow(l)} disabled={!changed || busy}
                        className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-30">{t("บันทึก", "Save")}</button>
                      <button type="button" onClick={() => setDelTarget(l)} disabled={busy} title={t("ลบป้าย", "Delete label")}
                        className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">🗑</button>
                    </>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 pl-0 sm:pl-8">
                  <input value={d.description} onChange={(e) => set({ description: e.target.value })} disabled={!canEdit} maxLength={200}
                    placeholder={t("คำอธิบาย (ไม่บังคับ) เช่น สินค้าตัวชูโรง ดันขายเต็มที่", "Description (optional) e.g. hero product, push hard")} className={`${input} flex-1 text-xs h-8`} />
                  <LabelBadge label={{ name: d.name || t("ตัวอย่าง", "Preview"), name_en: d.name_en, icon: d.icon || null, color: d.color }} />
                </div>
              </div>
            );
          })}

          {canEdit && (
            <div className="rounded-xl border border-dashed border-slate-300 p-2.5">
              <div className="text-xs font-medium text-slate-500 mb-2">＋ {t("เพิ่มป้ายใหม่", "Add a new label")}</div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={adding.icon} onChange={(e) => setAdding({ ...adding, icon: e.target.value })} maxLength={8} placeholder="⭐"
                  className={`${input} w-12 text-center`} />
                <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} maxLength={60} placeholder={t("ชื่อป้าย (ไทย) เช่น สินค้าใหม่", "Label name (Thai) e.g. สินค้าใหม่")}
                  onKeyDown={(e) => { if (e.key === "Enter") void addRow(); }} className={`${input} flex-1 min-w-[10rem]`} />
                <input value={adding.name_en} onChange={(e) => setAdding({ ...adding, name_en: e.target.value })} maxLength={60} placeholder={t("English เช่น New Arrival", "English e.g. New Arrival")}
                  onKeyDown={(e) => { if (e.key === "Enter") void addRow(); }} className={`${input} flex-1 min-w-[8rem]`} />
                <div className="w-36"><ColorInput value={adding.color} onChange={(c) => setAdding({ ...adding, color: c })} /></div>
                <button type="button" onClick={addRow} disabled={busy || !adding.name.trim()}
                  className="h-9 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-30">{t("เพิ่มป้าย", "Add label")}</button>
              </div>
              <input value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} maxLength={200}
                placeholder={t("คำอธิบาย (ไม่บังคับ)", "Description (optional)")} className={`${input} w-full mt-2 text-xs h-8`} />
            </div>
          )}
        </div>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={doDelete} loading={busy} variant="danger"
        title={t(`ลบป้าย "${delTarget?.name ?? ""}"?`, `Delete label "${labelName(delTarget)}"?`)}
        message={usage > 0
          ? (delTarget?.kind === "pillar"
            ? t(`มี ${usage} ชิ้นคอนเทนต์ที่ใช้แนวนี้ — จะกลายเป็น "ไม่ระบุแนว" (ตัวคอนเทนต์ไม่ถูกลบ)`, `${usage} content pieces use this pillar — they'll become "no pillar" (the content isn't deleted)`)
            : delTarget?.kind === "badge"
            ? t(`มี ${usage} รุ่นที่ติดป้ายเสริมนี้อยู่ — ป้ายนี้จะหลุดออกจากรุ่นเหล่านั้น (ตัวสินค้าไม่ถูกแตะ)`, `${usage} models have this badge — it will be removed from them (the products aren't touched)`)
            : t(`มี ${usage} รุ่นที่ติดป้ายนี้อยู่ — รุ่นเหล่านั้นจะยังอยู่ในรายการ แต่จะกลายเป็น "ยังไม่มีป้าย"`, `${usage} models have this label — they stay in the list but become "No label yet"`))
          : t("ยังไม่มีรุ่นไหนใช้ป้ายนี้ ลบได้เลย", "No model uses this label — safe to delete")}
        confirmText={t("ลบป้าย", "Delete label")} />
    </>
  );
}

export function LabelManagerModal({ open, onClose, labels = [], badges = [], pillars = [], kinds = ["status", "badge"], title, canEdit, onChanged }: {
  open: boolean;
  onClose: () => void;
  labels?: MarketingSkuLabel[];
  /** ป้ายเสริม (kind = badge) */
  badges?: MarketingSkuLabel[];
  /** แนวคอนเทนต์ (kind = pillar) — หน้าวางแผนคอนเทนต์ */
  pillars?: MarketingSkuLabel[];
  /** แท็บที่จะแสดง (ตามลำดับ) — 1 ชนิด = ไม่โชว์แถบแท็บ */
  kinds?: Kind[];
  title?: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const kt = kindText(t);
  const [tab, setTab] = useState<Kind>(kinds[0]);
  const [dirty, setDirty] = useState(false);
  const itemsOf = (k: Kind) => (k === "badge" ? badges : k === "pillar" ? pillars : labels);
  useEffect(() => { if (!open) setDirty(false); }, [open]);

  return (
    <ERPModal open={open} onClose={onClose} title={title ?? t("🏷️ ป้ายการตลาด", "🏷️ Marketing labels")} size="lg" hasUnsavedChanges={dirty}
      description={!canEdit ? t("คุณดูได้อย่างเดียว — การแก้ต้องมีสิทธิ์ \"ตั้งค่าป้าย SKU การตลาด\"", "View only — editing needs the \"Marketing SKU label settings\" permission") : kt[tab].desc}>
      {kinds.length > 1 && <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist">
        {kinds.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} disabled={dirty && tab !== k} title={dirty && tab !== k ? t("บันทึกหรือยกเลิกการแก้ก่อนสลับแท็บ", "Save or undo your changes before switching tabs") : undefined}
            className={`h-8 rounded-md px-3 text-sm font-medium disabled:opacity-40 ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{kt[k].tab} ({itemsOf(k).length})</button>
        ))}
      </div>}
      <LabelListEditor key={tab} kind={tab} items={itemsOf(tab)} canEdit={canEdit} onChanged={onChanged} onDirtyChange={setDirty} />
    </ERPModal>
  );
}
