"use client";

/**
 * ตั้งค่าป้ายกลุ่มสินค้าการตลาด (Hero / Clearance / Accessories …)
 *   เพิ่ม · แก้ (ชื่อ/ไอคอน/สี/คำอธิบาย) · ลากเรียงลำดับ · ลบ (รุ่นที่ติดป้ายนั้นกลายเป็น "ยังไม่มีป้าย")
 * ของกลาง: ERPModal · ConfirmDialog · ColorInput · useDragReorder/DragHandle · Toast
 */
import { useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ColorInput } from "@/components/color-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";

export function LabelBadge({ label }: { label?: Pick<MarketingSkuLabel, "name" | "icon" | "color"> }) {
  if (!label) return <span className="text-xs text-slate-400">ยังไม่มีป้าย</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${label.color}1f`, color: label.color, border: `1px solid ${label.color}55` }}>
      {label.icon && <span>{label.icon}</span>}{label.name}
    </span>
  );
}

type Draft = { name: string; icon: string; color: string; description: string };
const toDraft = (l: MarketingSkuLabel): Draft => ({ name: l.name, icon: l.icon ?? "", color: l.color, description: l.description ?? "" });
const EMPTY: Draft = { name: "", icon: "", color: "#0ea5e9", description: "" };
const same = (a: Draft, b: Draft) => a.name === b.name && a.icon === b.icon && a.color === b.color && a.description === b.description;

export function LabelManagerModal({ open, onClose, labels, canEdit, onChanged }: {
  open: boolean;
  onClose: () => void;
  labels: MarketingSkuLabel[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [list, setList] = useState<MarketingSkuLabel[]>(labels);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [delTarget, setDelTarget] = useState<MarketingSkuLabel | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(labels);
    setDrafts(Object.fromEntries(labels.map((l) => [l.id, toDraft(l)])));
  }, [open, labels]);
  useEffect(() => { if (!open) setAdding(EMPTY); }, [open]);

  const send = async (method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return null; }
      return j.data ?? {};
    } catch { toast.error("เชื่อมต่อไม่ได้ กรุณาลองใหม่"); return null; }
    finally { setBusy(false); }
  };

  const saveRow = async (l: MarketingSkuLabel) => {
    const d = drafts[l.id];
    if (!d?.name.trim()) { toast.warning("ต้องใส่ชื่อป้าย"); return; }
    if (await send("PATCH", "/api/marketing/sku-labels", { id: l.id, ...d })) { toast.success("บันทึกป้ายแล้ว"); onChanged(); }
  };

  const addRow = async () => {
    if (!adding.name.trim()) { toast.warning("ต้องใส่ชื่อป้าย"); return; }
    if (await send("POST", "/api/marketing/sku-labels", adding)) { toast.success("เพิ่มป้ายแล้ว"); setAdding(EMPTY); onChanged(); }
  };

  const doDelete = async () => {
    if (!delTarget) return;
    const res = await send("DELETE", `/api/marketing/sku-labels?id=${delTarget.id}`);
    if (res) { toast.success(`ลบป้าย "${delTarget.name}" แล้ว`); setDelTarget(null); onChanged(); }
  };

  const { rowProps, handleProps, dragIdx } = useDragReorder(async (from, to) => {
    const next = moveItem(list, from, to);
    setList(next);
    if (!(await send("PATCH", "/api/marketing/sku-labels", { order: next.map((l) => l.id) }))) setList(list);
    else onChanged();
  });

  const dirty = list.some((l) => drafts[l.id] && !same(drafts[l.id], toDraft(l))) || !same(adding, EMPTY);
  const input = "h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="🏷️ ป้ายกลุ่มสินค้าการตลาด" size="lg" hasUnsavedChanges={dirty}
        description={canEdit ? "1 รุ่นติดได้ 1 ป้าย · ลาก ⋮⋮ เพื่อเรียงลำดับ (ลำดับนี้ใช้ทั้งชิปกรองและเมนูเลือกป้าย)" : "คุณดูได้อย่างเดียว — การแก้ป้ายต้องมีสิทธิ์ \"ตั้งค่าป้าย SKU การตลาด\""}>
        <div className="space-y-2">
          {list.length === 0 && <div className="py-6 text-center text-sm text-slate-400">ยังไม่มีป้าย เพิ่มป้ายแรกด้านล่าง</div>}
          {list.map((l, i) => {
            const d = drafts[l.id] ?? toDraft(l);
            const changed = !same(d, toDraft(l));
            const set = (patch: Partial<Draft>) => setDrafts((m) => ({ ...m, [l.id]: { ...d, ...patch } }));
            return (
              <div key={l.id} {...(canEdit ? rowProps(i) : {})}
                className={`rounded-xl border p-2.5 data-[drag-over=true]:border-blue-500 data-[drag-over=true]:bg-blue-50 ${dragIdx === i ? "opacity-50" : ""} ${changed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && <DragHandle {...handleProps(i)} title="ลากเพื่อเรียงลำดับ" />}
                  <input value={d.icon} onChange={(e) => set({ icon: e.target.value })} disabled={!canEdit} maxLength={8} placeholder="🔥"
                    className={`${input} w-12 text-center`} title="ไอคอน (อีโมจิ)" />
                  <input value={d.name} onChange={(e) => set({ name: e.target.value })} disabled={!canEdit} maxLength={60} placeholder="ชื่อป้าย"
                    className={`${input} flex-1 min-w-[10rem]`} />
                  <div className="w-36">{canEdit ? <ColorInput value={d.color} onChange={(c) => set({ color: c })} /> : <span className="inline-block w-6 h-6 rounded-md border border-slate-200" style={{ background: d.color }} />}</div>
                  <span className="text-xs text-slate-400 w-16 text-right">{l.usage_count ?? 0} รุ่น</span>
                  {canEdit && (
                    <>
                      <button type="button" onClick={() => saveRow(l)} disabled={!changed || busy}
                        className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-30">บันทึก</button>
                      <button type="button" onClick={() => setDelTarget(l)} disabled={busy} title="ลบป้าย"
                        className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">🗑</button>
                    </>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 pl-0 sm:pl-8">
                  <input value={d.description} onChange={(e) => set({ description: e.target.value })} disabled={!canEdit} maxLength={200}
                    placeholder="คำอธิบาย (ไม่บังคับ) เช่น สินค้าตัวชูโรง ดันขายเต็มที่" className={`${input} flex-1 text-xs h-8`} />
                  <LabelBadge label={{ name: d.name || "ตัวอย่าง", icon: d.icon || null, color: d.color }} />
                </div>
              </div>
            );
          })}

          {canEdit && (
            <div className="rounded-xl border border-dashed border-slate-300 p-2.5">
              <div className="text-xs font-medium text-slate-500 mb-2">＋ เพิ่มป้ายใหม่</div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={adding.icon} onChange={(e) => setAdding({ ...adding, icon: e.target.value })} maxLength={8} placeholder="⭐"
                  className={`${input} w-12 text-center`} />
                <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} maxLength={60} placeholder="ชื่อป้าย เช่น New Arrival"
                  onKeyDown={(e) => { if (e.key === "Enter") void addRow(); }} className={`${input} flex-1 min-w-[10rem]`} />
                <div className="w-36"><ColorInput value={adding.color} onChange={(c) => setAdding({ ...adding, color: c })} /></div>
                <button type="button" onClick={addRow} disabled={busy || !adding.name.trim()}
                  className="h-9 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-30">เพิ่มป้าย</button>
              </div>
              <input value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} maxLength={200}
                placeholder="คำอธิบาย (ไม่บังคับ)" className={`${input} w-full mt-2 text-xs h-8`} />
            </div>
          )}
        </div>
      </ERPModal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={doDelete} loading={busy} variant="danger"
        title={`ลบป้าย "${delTarget?.name ?? ""}"?`}
        message={(delTarget?.usage_count ?? 0) > 0
          ? `มี ${delTarget?.usage_count} รุ่นที่ติดป้ายนี้อยู่ — รุ่นเหล่านั้นจะยังอยู่ในรายการ แต่จะกลายเป็น "ยังไม่มีป้าย"`
          : "ยังไม่มีรุ่นไหนใช้ป้ายนี้ ลบได้เลย"}
        confirmText="ลบป้าย" />
    </>
  );
}
