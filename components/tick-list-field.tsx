"use client";

/**
 * TickListField (ของกลาง) — ช่อง "ติ๊กเลือกจากรายการกลาง" + ป๊อปเลือก
 *   ใช้กับ: Parent SKU "ใส่อะไรได้บ้าง" (product_fit_items · มีขนาด) · "รายละเอียดเพิ่ม (ติ๊ก)" (product_highlight_items)
 *   เพิ่มชนิดใหม่ = สร้างตารางกลาง (name, name_en, sort_order, is_active [, sizes]) + ลงทะเบียน erp_modules + ส่ง config ใหม่
 *
 *   TickListField  = ในฟอร์ม/หน้าดู: สรุปที่เลือก + ปุ่ม "＋/✏️ เลือก" → ป๊อป (ERPModal ขนาดกลาง ไม่เต็มจอ)
 *                    หน้า "ดู" = บันทึกทันที (PATCH) แล้ว onSaved แจ้งฟอร์ม · หน้า "แก้ไข" = ใส่ค่าในฟอร์ม
 *   TickListPicker = เนื้อในป๊อป: แถวติ๊ก (เลือกขนาดในแถวได้ถ้ารายการมี sizes) · เพิ่มรายการกลางได้ · ลิงก์แก้/ลบ
 * ค่าเก็บเป็น [{ id, size? }] · ข้อมูลผ่าน /api/master-v2/* (guardApi + audit) · ตัวช่วย pure: lib/product-fits
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useSWRLite } from "@/lib/swr-lite";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { parseFits, fitSizeOptions, fitLabels, type FitItem, type FitPick } from "@/lib/product-fits";
import { resolvePhrase, variantsOf } from "@/lib/phrase-variants";

export type TickListConfig = {
  /** ตารางกลาง = module key ใน /api/master-v2 (เช่น product_fit_items) */
  catalog: string;
  /** คอลัมน์ของระเบียนที่เก็บค่า (เช่น fits) — ใช้ตอนบันทึกจากหน้าดู */
  field: string;
  title: string;
  description: string;
  /** รายการมีตัวเลือกขนาด (คอลัมน์ sizes) */
  withSizes?: boolean;
  /** สรุปในฟอร์ม: ชิป (สั้น) หรือ บรรทัด "- ข้อความ" (ข้อความยาว) */
  summary?: "chips" | "lines";
  /** แถวในป๊อป 1 หรือ 2 คอลัมน์ */
  columns?: 1 | 2;
  addPlaceholder: string;
  emptyHint: string;
  /** ซ่อนบางรายการจากป๊อปติ๊ก (เช่น ตุ๊กตา = ระบบคำนวณจากช่องใส่ของเอง ไม่ต้องติ๊ก) */
  hide?: (item: Record<string, unknown>) => boolean;
};

const keyOf = (catalog: string) => `tick-catalog:${catalog}`;

/** รายการกลาง (แคชข้ามฟอร์ม) */
export function useTickCatalog(catalog: string) {
  return useSWRLite<FitItem[]>(keyOf(catalog), async () => {
    const j = await apiFetch(`/api/master-v2/${catalog}?limit=500&sort_by=sort_order`).then((r) => r.json());
    return ((j.data ?? []) as FitItem[]).filter((x) => x.is_active !== false);
  }, { dedupeMs: 60000 });
}

export function TickListPicker({ cfg, value, onChange, disabled }: { cfg: TickListConfig; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const toast = useToast();
  const { data: items, loading, revalidate } = useTickCatalog(cfg.catalog);
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
    if (!name) { toast.warning(`พิมพ์ข้อความก่อน ${cfg.addPlaceholder}`); return; }
    if ((items ?? []).some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) { toast.warning(`มี "${name}" อยู่แล้ว — ติ๊กในรายการได้เลย`); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`/api/master-v2/${cfg.catalog}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...(cfg.withSizes ? { sizes: newSizes.trim() || null } : {}), sort_order: 500, is_active: true }),
      });
      const j = await r.json();
      if (!r.ok || j.error || !j.data?.id) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      // โหลดรายการใหม่ทันที (invalidateSWR แค่ล้างแคช ไม่โหลดใหม่ → รายการว่างจนกว่าจะสลับแท็บ)
      await revalidate(true);
      emit([...picks, { id: String(j.data.id) }]);
      setNewName(""); setNewSizes(""); setAdding(false);
      toast.success(`เพิ่ม "${name}" เข้ารายการกลางแล้ว (ใช้ได้ทุกรุ่น)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  if (loading && !items) return <div className="h-40 animate-pulse rounded-lg bg-slate-100" />;
  const list = (items ?? []).filter((x) => !cfg.hide?.(x as unknown as Record<string, unknown>));
  const gone = picks.filter((p) => !list.some((x) => x.id === p.id));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{picks.length ? `เลือกแล้ว ${picks.length} รายการ` : cfg.emptyHint}</span>
        {picks.length > 0 && !disabled && (
          <button type="button" onClick={() => emit([])} className="text-slate-400 hover:text-rose-500">ล้างทั้งหมด</button>
        )}
      </div>

      {/* แถวติ๊ก — แถวที่ติ๊กแล้ว (และมีขนาด) เลือกขนาดได้ในแถวเดียวกัน */}
      <div className={`grid gap-1.5 ${cfg.columns === 1 ? "" : "sm:grid-cols-2"}`}>
        {list.map((it) => {
          const on = picks.find((p) => p.id === it.id);
          const sizes = cfg.withSizes ? fitSizeOptions(it) : [];
          // 📝 ข้อความหลายแบบ (รายละเอียดเพิ่ม): เลือกแบบในแถว · เก็บชื่อแบบใน size (ว่าง = แบบแรก) · บนเว็บขึ้นทั้งประโยคของแบบนั้น
          const v = variantsOf(it);
          const shown = v ? resolvePhrase(it, on?.size) : it;
          return (
            <div key={it.id}
              className={`flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${on ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!on} disabled={disabled} onChange={() => toggle(it)} className="h-4 w-4 shrink-0 accent-orange-500" />
                <span className={`text-sm ${cfg.columns === 1 ? "" : "truncate"} ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{shown.name}</span>
              </label>
              {v && on && (v.mode === "select" ? (
                <select value={on.size || v.variants[0].label} disabled={disabled} onChange={(e) => setSize(it.id, e.target.value === v.variants[0].label ? "" : e.target.value)} aria-label={`เลือกแบบ ${it.name}`}
                  className="h-7 max-w-[8.5rem] shrink-0 rounded-md border border-orange-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
                  {v.variants.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}
                </select>
              ) : (
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs text-slate-700">
                  <input type="checkbox" checked={on.size === v.variants[1].label} disabled={disabled} onChange={(e) => setSize(it.id, e.target.checked ? v.variants[1].label : "")} className="h-3.5 w-3.5 accent-orange-500" />
                  {v.variants[1].label}
                </label>
              ))}
              {v && !on && <span className="shrink-0 text-[11px] text-slate-400">{v.mode === "select" ? `${v.variants.length} แบบ` : "ติ๊กสลับ"}</span>}
              {sizes.length > 0 && (on ? (
                <select value={on.size ?? ""} disabled={disabled} onChange={(e) => setSize(it.id, e.target.value)}
                  className="h-7 max-w-[8.5rem] shrink-0 rounded-md border border-orange-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
                  <option value="">ไม่ระบุขนาด</option>
                  {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  {on.size && !sizes.includes(on.size) && <option value={on.size}>{on.size}</option>}
                </select>
              ) : (
                <span className="shrink-0 text-[11px] text-slate-400">มีขนาด</span>
              ))}
            </div>
          );
        })}
      </div>

      {gone.length > 0 && (
        <button type="button" onClick={() => !disabled && emit(picks.filter((p) => list.some((x) => x.id === p.id)))} disabled={disabled}
          className="text-xs text-slate-400 hover:text-rose-500">มี {gone.length} รายการที่ถูกลบจากรายการกลางแล้ว — กดเพื่อเอาออก</button>
      )}

      <div className="border-t border-slate-100 pt-2.5">
        {adding ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={cfg.addPlaceholder} maxLength={120} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
              className={`h-8 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 ${cfg.withSizes ? "w-36" : "min-w-[12rem] flex-1"}`} />
            {cfg.withSizes && (
              <input value={newSizes} onChange={(e) => setNewSizes(e.target.value)} placeholder="ขนาด (ถ้ามี) เช่น 500 ml, 750 ml" maxLength={200}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
                className="h-8 min-w-[10rem] flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            )}
            <button type="button" onClick={() => void addItem()} disabled={busy} className="h-8 rounded-md bg-slate-800 px-3 text-xs text-white disabled:opacity-50">{busy ? "กำลังเพิ่ม…" : "เพิ่ม"}</button>
            <button type="button" onClick={() => { setAdding(false); setNewName(""); setNewSizes(""); }} className="h-8 px-1.5 text-xs text-slate-500">ยกเลิก</button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs">
            {!disabled ? (
              <button type="button" onClick={() => setAdding(true)} className="text-orange-600 hover:underline">＋ เพิ่มรายการใหม่</button>
            ) : <span />}
            <a href={`/m/${cfg.catalog}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 hover:underline">แก้/ลบรายการกลาง ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}

const samePicks = (a: unknown, b: unknown) => JSON.stringify(parseFits(a)) === JSON.stringify(parseFits(b));

/**
 * ช่องในฟอร์ม/หน้าดู: สรุปที่เลือกไว้ + ปุ่มเปิดป๊อปเลือก
 *   mode="edit" → กดตกลงในป๊อป = onChange (บันทึกพร้อมฟอร์ม)
 *   mode="view" → กดบันทึกในป๊อป = PATCH ทันที แล้ว onSaved แจ้งฟอร์ม · canEdit=false = ดูอย่างเดียว
 */
export function TickListField({ cfg, value, mode, onChange, onSaved, recordId, canEdit = true, apiPath = "parent-skus" }: {
  cfg: TickListConfig;
  value: unknown;
  mode: "edit" | "view";
  onChange?: (v: unknown) => void;
  onSaved?: (v: unknown) => void;
  recordId?: string | null;
  canEdit?: boolean;
  apiPath?: string;
}) {
  const toast = useToast();
  const { data: items } = useTickCatalog(cfg.catalog);
  const [cur, setCur] = useState<unknown>(value);   // หน้า "ดู" เก็บค่าที่เพิ่งบันทึกไว้โชว์ทันที
  useEffect(() => { setCur(value); }, [value]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const labels = fitLabels(cur, items ?? []);
  const dirty = open && !samePicks(draft, cur);
  const openPopup = () => { setDraft(cur); setOpen(true); };

  const confirm = async () => {
    const next = parseFits(draft);
    const v = next.length ? next : null;
    if (mode === "edit") { onChange?.(v); setCur(v); setOpen(false); return; }
    if (!recordId) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/api/master-v2/${apiPath}/${recordId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [cfg.field]: v }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setCur(v); onSaved?.(v); setOpen(false);
      toast.success(`บันทึก "${cfg.title}" แล้ว`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const button = canEdit && (
    <button type="button" onClick={openPopup}
      className="rounded-full border border-orange-300 px-2.5 py-0.5 text-xs text-orange-600 hover:bg-orange-50">
      {labels.length ? "✏️ เลือก" : "＋ เลือก"}
    </button>
  );

  return (
    <div className="mt-0.5">
      {cfg.summary === "lines" && labels.length > 0 ? (
        <div className="space-y-1">
          <ul className="space-y-0.5 text-sm text-slate-700">{labels.map((l) => <li key={l}>- {l}</li>)}</ul>
          {button}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.length
            ? labels.map((l) => <span key={l} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">{l}</span>)
            : <span className="text-sm text-slate-300">—</span>}
          {button}
        </div>
      )}
      {/* ป๊อปขนาดกลาง ไม่เต็มจอ — รายการสั้น เต็มจอแล้วอ่านยาก (เจ้าของขอ compact 2026-10-14) */}
      <ERPModal open={open} onClose={() => setOpen(false)} size="lg" defaultExpanded={false} hasUnsavedChanges={dirty}
        title={cfg.title} description={cfg.description}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void confirm()} disabled={saving}
              className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60">
              {saving ? "กำลังบันทึก…" : mode === "view" ? "บันทึก" : "ตกลง"}
            </button>
          </div>
        }>
        {open && <TickListPicker cfg={cfg} value={draft} onChange={setDraft} />}
        {mode === "edit" && <p className="mt-2 text-[11px] text-slate-400">กด &quot;ตกลง&quot; แล้วอย่าลืมกด &quot;บันทึก&quot; ของฟอร์มสินค้า</p>}
      </ERPModal>
    </div>
  );
}
