"use client";

/**
 * ParentFitPicker — ช่อง "ใส่อะไรได้บ้าง" ในฟอร์ม Parent SKU (ของกลาง)
 *   กดชิปเลือกจากรายการกลาง (product_fit_items) · ของที่มีขนาด → เลือกขนาดต่อท้ายชิป
 *   "+ เพิ่มรายการ" = เพิ่มเข้ารายการกลางเลย (ใช้ได้ทุกรุ่น) · แก้/ลบรายการกลางที่ /m/product_fit_items
 * ค่าเก็บที่ parent_skus_v2.fits = [{ id, size? }]
 * ข้อมูลผ่าน /api/master-v2/product_fit_items (guardApi + audit ของกลาง) — ไม่ query ตรง
 * ตัวช่วย pure: lib/product-fits
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useSWRLite, invalidateSWR } from "@/lib/swr-lite";
import { useToast } from "@/components/toast";
import { parseFits, fitSizeOptions, fitLabels, type FitItem, type FitPick } from "@/lib/product-fits";

const KEY = "product-fit-items";
const loadItems = async (): Promise<FitItem[]> => {
  const j = await apiFetch("/api/master-v2/product_fit_items?limit=500&sort_by=sort_order").then((r) => r.json());
  return ((j.data ?? []) as FitItem[]).filter((x) => x.is_active !== false);
};

/** รายการกลาง (แคชข้ามฟอร์ม) */
export function useFitItems() {
  return useSWRLite<FitItem[]>(KEY, loadItems, { dedupeMs: 60000 });
}

export function ParentFitPicker({ value, onChange, disabled }: { value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const toast = useToast();
  const { data: items, loading } = useFitItems();
  const picks = parseFits(value);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSizes, setNewSizes] = useState("");
  const [busy, setBusy] = useState(false);

  const emit = (next: FitPick[]) => onChange(next.length ? next : null);
  const toggle = (it: FitItem) => {
    if (disabled) return;
    const has = picks.some((p) => p.id === it.id);
    emit(has ? picks.filter((p) => p.id !== it.id) : [...picks, { id: it.id }]);
  };
  const setSize = (id: string, size: string) => emit(picks.map((p) => (p.id === id ? (size ? { id, size } : { id }) : p)));

  const addItem = async () => {
    const name = newName.trim();
    if (!name) { toast.warning("พิมพ์ชื่อรายการก่อน เช่น ขวดน้ำ"); return; }
    if ((items ?? []).some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) { toast.warning(`มี "${name}" อยู่แล้ว — กดเลือกที่ชิปได้เลย`); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/master-v2/product_fit_items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sizes: newSizes.trim() || null, sort_order: 500, is_active: true }),
      });
      const j = await r.json();
      if (!r.ok || j.error || !j.data?.id) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      invalidateSWR(KEY);
      emit([...picks, { id: String(j.data.id) }]);
      setNewName(""); setNewSizes(""); setAdding(false);
      toast.success(`เพิ่ม "${name}" เข้ารายการกลางแล้ว (ใช้ได้ทุกรุ่น)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  if (loading && !items) return <div className="mt-0.5 h-9 animate-pulse rounded-md bg-slate-100" />;
  const list = items ?? [];
  return (
    <div className="mt-0.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((it) => {
          const on = picks.find((p) => p.id === it.id);
          const sizes = fitSizeOptions(it);
          return (
            <span key={it.id} className="inline-flex items-center gap-1">
              <button type="button" onClick={() => toggle(it)} disabled={disabled}
                className={`rounded-full border px-2.5 py-0.5 text-xs disabled:cursor-not-allowed ${on ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
                {on ? "✓ " : ""}{it.name}
              </button>
              {on && sizes.length > 0 && (
                <select value={on.size ?? ""} disabled={disabled} onChange={(e) => setSize(it.id, e.target.value)}
                  className="h-6 rounded-md border border-orange-200 bg-white px-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
                  <option value="">— ขนาด —</option>
                  {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  {on.size && !sizes.includes(on.size) && <option value={on.size}>{on.size}</option>}
                </select>
              )}
            </span>
          );
        })}
        {/* รายการที่เลือกไว้แต่ถูกปิด/ลบจากรายการกลาง — โชว์ให้เอาออกได้ */}
        {picks.filter((p) => !list.some((x) => x.id === p.id)).map((p) => (
          <button key={p.id} type="button" onClick={() => !disabled && emit(picks.filter((x) => x.id !== p.id))} disabled={disabled}
            title="รายการนี้ถูกปิด/ลบจากรายการกลางแล้ว — กดเพื่อเอาออก"
            className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-400 line-through">ถูกลบแล้ว ✕</button>
        ))}
        {!disabled && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50">＋ เพิ่มรายการ</button>
        )}
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-slate-300 p-1.5">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ เช่น ขวดน้ำ" maxLength={60} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
            className="h-7 w-32 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <input value={newSizes} onChange={(e) => setNewSizes(e.target.value)} placeholder="ขนาด (ถ้ามี) เช่น 500 ml, 750 ml" maxLength={200}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
            className="h-7 min-w-[10rem] flex-1 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <button type="button" onClick={() => void addItem()} disabled={busy} className="h-7 rounded-md bg-slate-800 px-2.5 text-xs text-white disabled:opacity-50">{busy ? "กำลังเพิ่ม…" : "เพิ่ม"}</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(""); setNewSizes(""); }} className="h-7 px-1.5 text-xs text-slate-500">ยกเลิก</button>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        {picks.length ? `เลือกแล้ว ${picks.length} รายการ · ` : ""}
        <a href="/m/product_fit_items" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">แก้/ลบรายการกลาง ↗</a>
      </p>
    </div>
  );
}

/** หน้า "ดู" (ไม่ใช่แก้) — โชว์เป็นข้อความอ่านง่าย */
export function ParentFitView({ value }: { value: unknown }) {
  const { data: items } = useFitItems();
  const labels = fitLabels(value, items ?? []);
  return labels.length ? <span className="text-sm text-slate-700">{labels.join(", ")}</span> : <span className="text-sm text-slate-300">—</span>;
}
