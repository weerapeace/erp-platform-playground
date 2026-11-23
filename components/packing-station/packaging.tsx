"use client";

/**
 * 🎁 Set บรรจุภัณฑ์ตอนแพ็ค (รอบ 7 · เจ้าของเลือก 2026-11-23: แบบตามตัวอย่าง + ข้อเสนอ 1-4)
 *   PackagingChip      ป้ายบรรจุภัณฑ์ (รูป SKU เล็ก + ชื่อ + จำนวน) · ใช้ในสถานี/Set/ลิ้นชัก
 *   PackagingTab       แท็บ "บรรจุภัณฑ์" ในหน้าแพ็ค: จัดการ Set · ตั้ง Set ให้หลายรุ่น (ตารางกลาง MiniTable) · รายงานที่ใช้ไป
 *   ParentPackingTab   แท็บ "แพ็ค" ในลิ้นชัก Parent SKU: Set + SKU เสริม + ป้ายเตือน + โน้ตตอนแพ็ค
 * เลือก SKU = ของกลาง SkuMultiPickerModal (กรองแท็ก Packaging) · ข้อมูล/สิทธิ์/ประวัติ: /api/packing/packaging (กติกา lib/packaging)
 * ทุกการเปลี่ยนมีปุ่มย้อนกลับในแจ้งผล · ลบ Set = เข้าถัง กู้คืนได้
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import { ErrorState, LoadingState } from "@/components/state-views";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import { PACK_FLAG_PRESETS, PACK_NOTE_MAX, SET_QTY_MAX } from "@/lib/packaging";

const API = "/api/packing/packaging";
const post = async (body: Record<string, unknown>): Promise<{ ok: boolean; j: Record<string, unknown> }> => {
  const r = await apiFetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, j };
};

type Item = { sku_id: string; qty: number; code: string; name: string; image_key: string | null };
type SetRow = { id: string; name: string; items: Item[]; category_ids: string[]; sort: number; is_active: boolean; used?: number };
type Tag = { id: string; label: string } | null;
type Cat = { id: string; name: string };

export function PackagingChip({ name, imageKey, qty, size = "sm" }: { name: string; imageKey?: string | null; qty?: number; size?: "sm" | "md" }) {
  const img = r2ImageUrl(imageKey ?? null, 64);
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 text-violet-800 ${size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-[11px]"}`}>
      {img ? <img src={img} alt="" className={`${size === "md" ? "h-5 w-5" : "h-4 w-4"} shrink-0 rounded-full object-cover`} /> : <Icon value="i:gift" />}
      <span className="truncate">{name}{qty && qty > 1 ? ` ×${qty}` : ""}</span>
    </span>
  );
}

/** แถว SKU ในรายการ (รูป · รหัส · ชื่อ · จำนวน −/+ · เอาออก) */
function ItemRows({ items, edit, onChange }: { items: Item[]; edit: boolean; onChange: (next: Item[]) => void }) {
  if (!items.length) return <p className="py-3 text-center text-sm text-slate-400">ยังไม่มี SKU</p>;
  const setQty = (id: string, q: number) => onChange(items.map((i) => (i.sku_id === id ? { ...i, qty: Math.min(SET_QTY_MAX, Math.max(1, q)) } : i)));
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((i) => (
        <li key={i.sku_id} className="flex items-center gap-2 py-1.5">
          <HoverImage url={r2ImageUrl(i.image_key, 320)} size={34} previewSize={220} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{i.code}</p><p className="truncate text-xs text-slate-500">{i.name}</p></div>
          {edit ? (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => setQty(i.sku_id, i.qty - 1)} disabled={i.qty <= 1} aria-label={`ลดจำนวน ${i.code}`} className="h-7 w-7 rounded-lg border border-slate-200 text-sm disabled:opacity-30">−</button>
              <span className="w-7 text-center text-sm tabular-nums">{i.qty}</span>
              <button type="button" onClick={() => setQty(i.sku_id, i.qty + 1)} aria-label={`เพิ่มจำนวน ${i.code}`} className="h-7 w-7 rounded-lg border border-slate-200 text-sm">+</button>
              <button type="button" onClick={() => onChange(items.filter((x) => x.sku_id !== i.sku_id))} aria-label={`เอา ${i.code} ออก`} className="ml-1 h-7 w-7 rounded-lg text-red-500 hover:bg-red-50"><Icon name="delete" /></button>
            </div>
          ) : <span className="shrink-0 text-sm text-slate-600">×{i.qty}</span>}
        </li>
      ))}
    </ul>
  );
}

/** ปุ่ม + ตัวเลือก SKU กลาง (กรองแท็ก Packaging) */
function AddSkuButton({ tag, exclude, onAdd, label = "เพิ่ม SKU" }: { tag: Tag; exclude: string[]; onAdd: (items: Item[]) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:border-slate-500"><Icon name="add" /> {label}{tag ? ` (แท็ก ${tag.label})` : ""}</button>
      <SkuMultiPickerModal open={open} onClose={() => setOpen(false)} excludeIds={exclude} tag={tag} title="เลือก SKU บรรจุภัณฑ์"
        tagHint="ไม่เจอ? เอาติ๊กออกแล้วค้นทุก SKU — บันทึกแล้วระบบติดแท็กให้"
        onConfirm={(skus) => { setOpen(false); onAdd(skus.map((s) => ({ sku_id: s.id, qty: 1, code: s.code ?? "", name: s.name ?? s.code ?? "", image_key: s.image_key ?? null }))); }} />
    </>
  );
}

function useSets() {
  const [data, setData] = useState<{ sets: SetRow[]; categories: Cat[]; tag: Tag; can_manage: boolean; can_edit_parent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await apiFetch(API);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลด Set ไม่สำเร็จ"); return; }
      setData(j); setError(null);
    } catch { setError("เน็ตหลุด — โหลดไม่ได้"); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

// ── แท็บ "บรรจุภัณฑ์" ในหน้าแพ็ค ──
export function PackagingTab() {
  const s = useSets();
  if (s.error) return <ErrorState title="โหลด Set บรรจุภัณฑ์ไม่ได้" hint={s.error} onRetry={() => void s.reload()} />;
  if (!s.data) return <LoadingState label="กำลังโหลด…" />;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <SetsManager data={s.data} reload={s.reload} />
      <ParentSetTable sets={s.data.sets.filter((x) => x.is_active)} canEdit={s.data.can_edit_parent} />
      <UsageReport />
    </div>
  );
}

type Draft = { id: string | null; name: string; items: Item[]; category_ids: string[] };

function SetsManager({ data, reload }: { data: NonNullable<ReturnType<typeof useSets>["data"]>; reload: () => Promise<void> }) {
  const toast = useToast();
  const active = data.sets.filter((x) => x.is_active);
  const trash = data.sets.filter((x) => !x.is_active);
  const [curId, setCurId] = useState<string | null>(active[0]?.id ?? null);
  const cur = data.sets.find((x) => x.id === curId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catQ, setCatQ] = useState("");
  const edit = data.can_manage;

  useEffect(() => { if (!curId && active[0]) setCurId(active[0].id); }, [active, curId]);
  useEffect(() => { setDraft(cur ? { id: cur.id, name: cur.name, items: cur.items, category_ids: cur.category_ids } : null); setCatOpen(false); }, [cur]);

  const dirty = !!draft && (draft.id === null || !cur || draft.name !== cur.name || JSON.stringify(draft.items.map((i) => [i.sku_id, i.qty])) !== JSON.stringify(cur.items.map((i) => [i.sku_id, i.qty])) || JSON.stringify([...draft.category_ids].sort()) !== JSON.stringify([...cur.category_ids].sort()));
  const catName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const catOwner = useMemo(() => { const m = new Map<string, string>(); for (const st of active) for (const c of st.category_ids) if (st.id !== draft?.id) m.set(c, st.name); return m; }, [active, draft?.id]);

  const save = async () => {
    if (!draft) return;
    const before = cur ? { id: cur.id, name: cur.name, items: cur.items.map(({ sku_id, qty }) => ({ sku_id, qty })), category_ids: cur.category_ids } : null;
    setBusy(true);
    const { ok, j } = await post({ action: "set_save", id: draft.id, name: draft.name, items: draft.items.map(({ sku_id, qty }) => ({ sku_id, qty })), category_ids: draft.category_ids });
    setBusy(false);
    if (!ok) { toast.error(String(j.error ?? "บันทึกไม่สำเร็จ")); return; }
    const id = String(j.id ?? draft.id);
    await reload(); setCurId(id);
    const extra = [Number(j.tagged) ? `ติดแท็ก Packaging ให้ ${j.tagged} SKU` : "", (j.moved as string[] | undefined)?.length ? `ย้ายหมวดมาจาก ${(j.moved as string[]).join(", ")}` : ""].filter(Boolean).join(" · ");
    toast.action(`บันทึก "${draft.name}" แล้ว${extra ? ` · ${extra}` : ""}`, "ย้อนกลับ", () => {
      void (before ? post({ action: "set_save", ...before }) : post({ action: "set_archive", id, archived: true })).then(() => reload());
    }, { ms: 10_000 });
  };
  const act = async (body: Record<string, unknown>, msg: string, undo?: Record<string, unknown>) => {
    setBusy(true);
    const { ok, j } = await post(body);
    setBusy(false);
    if (!ok) { toast.error(String(j.error ?? "ไม่สำเร็จ")); return; }
    await reload();
    if (j.id) setCurId(String(j.id));
    if (undo) toast.action(msg, "ย้อนกลับ", () => { void post(undo).then(() => reload()); }, { ms: 10_000 }); else toast.success(msg);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">Set บรรจุภัณฑ์</p>
          <p className="text-xs text-slate-500">รวม SKU บรรจุภัณฑ์เป็นชุด เช่น Set กระเป๋าสตางค์ = กล่อง + Hang tag + Card Care · แก้ Set = ทุกรุ่นที่ใช้ Set นี้เปลี่ยนตาม</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {trash.length > 0 && <button type="button" onClick={() => setShowTrash((v) => !v)} className="text-slate-500 underline">ถังขยะ ({trash.length})</button>}
          {edit && <button type="button" disabled={busy} onClick={() => { setCurId(null); setDraft({ id: null, name: "", items: [], category_ids: [] }); }} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"><Icon name="add" /> สร้าง Set ใหม่</button>}
        </div>
      </div>

      {showTrash && (
        <div className="mb-2 rounded-lg bg-slate-50 p-2 text-sm">
          <p className="text-xs text-slate-500">ในถัง — กู้คืนแล้วรุ่นที่เคยใช้ Set นี้จะกลับมาใช้ต่อ</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {trash.map((t) => (
              <li key={t.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500">
                {t.name}{edit && <button type="button" disabled={busy} onClick={() => void act({ action: "set_archive", id: t.id, archived: false }, `กู้คืน "${t.name}" แล้ว`)} className="text-xs text-sky-700 underline">กู้คืน</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* รายการ Set — มือถือเป็นช่องเลือก */}
        <div>
          <select value={curId ?? ""} onChange={(e) => setCurId(e.target.value || null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lg:hidden">
            {!curId && <option value="">{draft && !draft.id ? "Set ใหม่" : "— เลือก Set —"}</option>}
            {active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <ul className="hidden flex-col gap-1.5 lg:flex">
            {active.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setCurId(x.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${x.id === curId ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-200 hover:border-slate-400"}`}>
                  <span className="block font-medium">{x.name}</span>
                  <span className="text-xs text-slate-500">{x.items.length} รายการ · ตั้งเอง {x.used ?? 0} รุ่น{x.category_ids.length ? ` · ${x.category_ids.length} หมวด` : ""}</span>
                </button>
              </li>
            ))}
            {!active.length && !draft && <li className="py-4 text-center text-sm text-slate-400">ยังไม่มี Set — กด "สร้าง Set ใหม่"</li>}
          </ul>
        </div>

        {draft ? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input value={draft.name} onChange={(e) => { const v = e.target.value.slice(0, 80); setDraft((d) => d && { ...d, name: v }); }} disabled={!edit} placeholder="ชื่อ Set เช่น Set กระเป๋าสตางค์" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium" />
              {edit && draft.id && (
                <>
                  <button type="button" disabled={busy} onClick={() => void act({ action: "set_copy", id: draft.id }, `คัดลอก "${draft.name}" แล้ว`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><Icon value="i:copy" /> คัดลอก</button>
                  <button type="button" disabled={busy} onClick={() => void act({ action: "set_archive", id: draft.id, archived: true }, `ย้าย "${draft.name}" เข้าถังแล้ว`, { action: "set_archive", id: draft.id, archived: false })} aria-label="ลบ Set" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-red-600"><Icon name="delete" /></button>
                </>
              )}
            </div>
            <div className="mt-2"><ItemRows items={draft.items} edit={edit} onChange={(items) => setDraft((d) => d && { ...d, items })} /></div>
            {edit && <div className="mt-2"><AddSkuButton tag={data.tag} exclude={draft.items.map((i) => i.sku_id)} onAdd={(add) => setDraft((d) => d && { ...d, items: [...d.items, ...add.filter((a) => !d.items.some((i) => i.sku_id === a.sku_id))] })} /></div>}

            {/* ข้อ 2: ใช้เป็นค่าเริ่มของหมวด */}
            <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">ใช้อัตโนมัติกับหมวดสินค้า</p>
                {edit && <button type="button" onClick={() => setCatOpen((v) => !v)} className="text-xs text-sky-700 underline">{catOpen ? "เสร็จ" : "เลือกหมวด"}</button>}
              </div>
              <p className="text-xs text-slate-500">รุ่นในหมวดที่เลือกและยังไม่ได้ตั้ง Set เอง จะใช้ Set นี้ · 1 หมวดใช้ได้ 1 Set</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {draft.category_ids.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                    {catName.get(c) ?? "?"}{edit && <button type="button" onClick={() => setDraft((d) => d && { ...d, category_ids: d.category_ids.filter((x) => x !== c) })} aria-label={`เอาหมวด ${catName.get(c) ?? ""} ออก`} className="text-slate-400">×</button>}
                  </span>
                ))}
                {!draft.category_ids.length && <span className="text-xs text-slate-400">ยังไม่ได้เลือก</span>}
              </div>
              {catOpen && (
                <div className="mt-2">
                  <input value={catQ} onChange={(e) => setCatQ(e.target.value)} placeholder="ค้นหมวด" className="mb-1.5 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                  <div className="grid max-h-56 gap-0.5 overflow-auto sm:grid-cols-2">
                    {data.categories.filter((c) => !catQ.trim() || c.name.toLowerCase().includes(catQ.trim().toLowerCase())).map((c) => {
                      const on = draft.category_ids.includes(c.id);
                      const owner = catOwner.get(c.id);
                      return (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-white">
                          <input type="checkbox" checked={on} onChange={(e) => { const v = e.target.checked; setDraft((d) => d && { ...d, category_ids: v ? [...d.category_ids, c.id] : d.category_ids.filter((x) => x !== c.id) }); }} />
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          {owner && !on && <span className="shrink-0 text-[11px] text-amber-700">ใช้ {owner}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {edit && (
              <div className="mt-3 flex items-center justify-end gap-2">
                {dirty && cur && <button type="button" onClick={() => setDraft({ id: cur.id, name: cur.name, items: cur.items, category_ids: cur.category_ids })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">ละทิ้ง</button>}
                {dirty && !cur && <button type="button" onClick={() => { setDraft(null); setCurId(active[0]?.id ?? null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">ยกเลิก</button>}
                <button type="button" disabled={!dirty || busy || !draft.name.trim()} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-40">{busy ? "กำลังบันทึก…" : dirty ? "บันทึก Set" : "บันทึกแล้ว"}</button>
              </div>
            )}
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-400">เลือก Set ทางซ้าย หรือสร้าง Set ใหม่</p>}
      </div>
      {!edit && <p className="mt-2 text-xs text-slate-400">ดูได้อย่างเดียว — หัวหน้าแพ็คเป็นคนแก้ Set</p>}
    </div>
  );
}

type PRow = { id: string; code: string; name: string; image_key: string | null; category_name: string | null; pack_set_id: string | null; auto_set_id: string | null };

/** ตั้ง Set ให้หลายรุ่น — ตารางกลาง (MiniTable ติ๊กเลือก + Shift ช่วง) + แถบคำสั่งกลาง (BulkActionBar) */
function ParentSetTable({ sets, canEdit }: { sets: SetRow[]; canEdit: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<PRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkSet, setBulkSet] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const setName = useMemo(() => new Map(sets.map((s) => [s.id, s.name])), [sets]);

  const load = useCallback(async (offset: number) => {
    const my = ++seq.current;
    const qs = new URLSearchParams({ matrix: "1", offset: String(offset) });
    if (q.trim()) qs.set("q", q.trim());
    if (missing) qs.set("missing", "1");
    try {
      const r = await apiFetch(`${API}?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (my !== seq.current) return;
      if (!r.ok) { setError(j.error || "โหลดไม่สำเร็จ"); return; }
      setError(null); setTotal(j.total ?? 0);
      setRows((prev) => (offset ? [...(prev ?? []), ...(j.rows ?? [])] : j.rows ?? []));
    } catch { if (my === seq.current) setError("เน็ตหลุด — โหลดไม่ได้"); }
  }, [q, missing]);
  useEffect(() => { const t = window.setTimeout(() => { setRows(null); setSel(new Set()); void load(0); }, 300); return () => window.clearTimeout(t); }, [load]);

  const apply = async (items: { parent_id: string; pack_set_id: string | null }[], quiet = false) => {
    setBusy(true);
    const { ok, j } = await post({ action: "parent_bulk", items });
    setBusy(false);
    if (!ok) { toast.error(String(j.error ?? "บันทึกไม่สำเร็จ")); void load(0); return; }
    const m = new Map(items.map((i) => [i.parent_id, i.pack_set_id]));
    setRows((rs) => (rs ?? []).map((r) => (m.has(r.id) ? { ...r, pack_set_id: m.get(r.id) ?? null } : r)));
    const prev = (j.prev as { parent_id: string; pack_set_id: string | null }[] | undefined) ?? [];
    if (!quiet && prev.length) toast.action(`ตั้ง Set ${prev.length} รุ่นแล้ว`, "ย้อนกลับ", () => void apply(prev, true), { ms: 10_000 });
  };

  const columns: MiniColumn<PRow>[] = [
    { key: "model", header: "รุ่น", width: "minmax(12rem,2fr)", locked: true, sortValue: (r) => r.code, cell: (r) => (
      <div className="flex min-w-0 items-center gap-2">
        <HoverImage url={r2ImageUrl(r.image_key, 320)} size={32} previewSize={240} />
        <div className="min-w-0"><p className="font-medium text-slate-900">{r.code}</p><p className="truncate text-xs text-slate-500">{r.name}</p></div>
      </div>
    ) },
    { key: "cat", header: "หมวด", width: "minmax(7rem,1fr)", sortValue: (r) => r.category_name ?? "", cell: (r) => <span className="text-xs text-slate-600">{r.category_name ?? "-"}</span> },
    { key: "set", header: "Packaging Set", width: "minmax(11rem,1.4fr)", locked: true, cell: (r) => (
      <div onClick={(e) => e.stopPropagation()}>
        <select value={r.pack_set_id ?? ""} disabled={!canEdit || busy} onChange={(e) => { const v = e.target.value || null; void apply([{ parent_id: r.id, pack_set_id: v }]); e.currentTarget.blur(); }} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm">
          <option value="">{r.auto_set_id ? `อัตโนมัติ: ${setName.get(r.auto_set_id) ?? "-"}` : "— ไม่มี Set —"}</option>
          {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    ) },
    { key: "src", header: "ที่มา", width: "5.5rem", cell: (r) => <span className="text-[11px] text-slate-500">{r.pack_set_id ? "ตั้งเอง" : r.auto_set_id ? "จากหมวด" : ""}</span> },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-800">ตั้ง Set ให้หลายรุ่น {rows ? <span className="text-sm font-normal text-slate-500">({total.toLocaleString()} รุ่น)</span> : null}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสรุ่น / ชื่อ" className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> ยังไม่มี Set</label>
      </div>
      {!canEdit && <p className="mb-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">ดูได้อย่างเดียว — หัวหน้าแพ็คหรือคนแก้สินค้าได้เป็นคนตั้ง</p>}
      {error ? <ErrorState title="โหลดไม่ได้" hint={error} onRetry={() => void load(0)} />
        : !rows ? <LoadingState label="กำลังโหลด…" />
        : (
          <>
            <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} selectable={canEdit} selected={sel} onSelectedChange={setSel} countUnit="รุ่น" emptyText="ไม่พบรุ่นตามที่ค้น" maxHeightClass="max-h-[60vh]" dense />
            {rows.length < total && (
              <div className="p-2 text-center">
                <button type="button" onClick={() => void load(rows.length)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">โหลดเพิ่ม (เหลือ {(total - rows.length).toLocaleString()})</button>
              </div>
            )}
          </>
        )}
      <BulkActionBar count={sel.size} unit="รุ่น" onClear={() => setSel(new Set())}>
        <select value={bulkSet} onChange={(e) => setBulkSet(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800">
          <option value="">ใช้ Set ของหมวด (ล้างที่ตั้งเอง)</option>
          {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => { void apply([...sel].map((id) => ({ parent_id: id, pack_set_id: bulkSet || null }))).then(() => setSel(new Set())); }} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900">ตั้ง Set</button>
      </BulkActionBar>
    </div>
  );
}

const RANGES: [string, string, () => [Date, Date]][] = [
  ["today", "วันนี้", () => { const d = bkkStart(0); return [d, new Date(d.getTime() + 864e5)]; }],
  ["7d", "7 วัน", () => [bkkStart(-6), new Date(bkkStart(0).getTime() + 864e5)]],
  ["month", "เดือนนี้", () => { const n = new Date(Date.now() + 7 * 36e5); const s = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1) - 7 * 36e5); return [s, new Date(bkkStart(0).getTime() + 864e5)]; }],
];
/** เที่ยงคืนเวลาไทยของวันนี้ + offset วัน (เป็นเวลา UTC) */
function bkkStart(offsetDays: number): Date {
  const n = new Date(Date.now() + 7 * 36e5);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offsetDays) - 7 * 36e5);
}

/** ข้อ 4: บรรจุภัณฑ์ที่ใช้ไป (จากออเดอร์ที่แพ็คเสร็จ · ไม่ตัดสต๊อก) */
function UsageReport() {
  const [range, setRange] = useState("7d");
  const [res, setRes] = useState<{ rows: { sku_id: string; code: string; name: string; qty: number }[]; orders: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const [from, to] = (RANGES.find((r) => r[0] === range) ?? RANGES[1])[2]();
    setRes(null);
    apiFetch(`${API}?usage=1&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) setError(j.error || "โหลดไม่สำเร็จ"); else { setError(null); setRes(j); } })
      .catch(() => setError("เน็ตหลุด — โหลดไม่ได้"));
  }, [range]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">บรรจุภัณฑ์ที่ใช้ไป</p>
          <p className="text-xs text-slate-500">นับจากออเดอร์ที่แพ็คเสร็จ (เริ่มเก็บตั้งแต่ระบบ Set ขึ้นเว็บ) · ใช้วางแผนสั่งซื้อ · ยังไม่ตัดสต๊อก</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map(([k, label]) => <button key={k} type="button" onClick={() => setRange(k)} className={`rounded-full px-2.5 py-0.5 text-xs ${range === k ? "bg-sky-100 font-medium text-sky-800" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}
        </div>
      </div>
      {error ? <ErrorState title="โหลดไม่ได้" hint={error} />
        : !res ? <LoadingState label="กำลังโหลด…" />
        : !res.rows.length ? <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีข้อมูลช่วงนี้</p>
        : (
          <>
            <p className="mb-1 text-xs text-slate-500">{res.orders.toLocaleString()} ออเดอร์</p>
            <ul className="divide-y divide-slate-100">
              {res.rows.map((r) => (
                <li key={r.sku_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0 truncate"><b className="font-medium">{r.code}</b> <span className="text-slate-500">{r.name}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums">{r.qty.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </>
        )}
    </div>
  );
}

// ── แท็บ "แพ็ค" ในลิ้นชัก Parent SKU ──
type ParentPack = { id: string; code: string; name: string; category_name: string | null; pack_set_id: string | null; pack_extra: Item[]; pack_note: string | null; pack_flags: string[]; category_set: { id: string; name: string } | null };
type PForm = { pack_set_id: string | null; pack_extra: Item[]; pack_note: string; pack_flags: string[] };
const formOf = (p: ParentPack): PForm => ({ pack_set_id: p.pack_set_id, pack_extra: p.pack_extra, pack_note: p.pack_note ?? "", pack_flags: p.pack_flags });
const sig = (f: PForm) => JSON.stringify([f.pack_set_id, f.pack_extra.map((i) => [i.sku_id, i.qty]), f.pack_note.trim(), f.pack_flags]);

export function ParentPackingTab({ parentId }: { parentId: string }) {
  const toast = useToast();
  const [data, setData] = useState<{ parent: ParentPack; sets: SetRow[]; tag: Tag; can_edit_parent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PForm | null>(null);
  const [flagInput, setFlagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}?parent=${encodeURIComponent(parentId)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลดไม่สำเร็จ"); return; }
      setData(j); setError(null); setForm(formOf(j.parent));
    } catch { setError("เน็ตหลุด — โหลดไม่ได้"); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!data && !!form && sig(form) !== sig(formOf(data.parent));
  const save = async () => {
    if (!data || !form) return;
    const before = formOf(data.parent);
    const body = (f: PForm) => ({ action: "parent_set", parent_id: parentId, pack_set_id: f.pack_set_id, pack_extra: f.pack_extra.map(({ sku_id, qty }) => ({ sku_id, qty })), pack_note: f.pack_note, pack_flags: f.pack_flags });
    setSaving(true);
    const { ok, j } = await post(body(form));
    setSaving(false);
    if (!ok) { toast.error(String(j.error ?? "บันทึกไม่สำเร็จ")); return; }
    await load();
    toast.action(`บันทึกการแพ็คแล้ว${Number(j.tagged) ? ` · ติดแท็ก Packaging ให้ ${j.tagged} SKU` : ""}`, "ย้อนกลับ", () => { void post(body(before)).then(() => load()); }, { ms: 10_000 });
  };

  if (error) return <ErrorState title="โหลดไม่ได้" hint={error} onRetry={() => void load()} />;
  if (!data || !form) return <LoadingState label="กำลังโหลด…" />;
  const edit = data.can_edit_parent;
  const active = data.sets.filter((s) => s.is_active || s.id === form.pack_set_id);
  const shown = form.pack_set_id ? data.sets.find((s) => s.id === form.pack_set_id) : data.parent.category_set ? data.sets.find((s) => s.id === data.parent.category_set!.id) : undefined;
  const addFlag = (f: string) => { const v = f.trim().slice(0, 30); if (v) setForm((cur) => (cur && !cur.pack_flags.includes(v) && cur.pack_flags.length < 8 ? { ...cur, pack_flags: [...cur.pack_flags, v] } : cur)); setFlagInput(""); };

  return (
    <div className="grid max-w-3xl gap-4 p-1">
      <section>
        <p className="text-sm font-medium text-slate-800">Packaging Set</p>
        <select value={form.pack_set_id ?? ""} disabled={!edit} onChange={(e) => { const v = e.target.value || null; setForm((f) => f && { ...f, pack_set_id: v }); }} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{data.parent.category_set ? `อัตโนมัติจากหมวด "${data.parent.category_name ?? ""}": ${data.parent.category_set.name}` : "— ไม่มี Set —"}</option>
          {active.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? "" : " (ในถัง)"}</option>)}
        </select>
        {shown && <div className="mt-1.5 flex flex-wrap gap-1">{shown.items.map((i) => <PackagingChip key={i.sku_id} name={i.code || i.name} imageKey={i.image_key} qty={i.qty} />)}</div>}
        <p className="mt-1 text-xs text-slate-400">จัดการ Set ได้ที่หน้าแพ็ค → แท็บ "บรรจุภัณฑ์"</p>
      </section>
      <section>
        <p className="text-sm font-medium text-slate-800">SKU เสริม (นอก Set)</p>
        <p className="text-xs text-slate-500">เช่น รุ่นนี้ต้องใส่ถุงกันชื้นเพิ่ม โดยไม่ต้องทำ Set ใหม่</p>
        <div className="mt-1"><ItemRows items={form.pack_extra} edit={edit} onChange={(items) => setForm((f) => f && { ...f, pack_extra: items })} /></div>
        {edit && <AddSkuButton tag={data.tag} exclude={form.pack_extra.map((i) => i.sku_id)} onAdd={(add) => setForm((f) => f && { ...f, pack_extra: [...f.pack_extra, ...add.filter((a) => !f.pack_extra.some((i) => i.sku_id === a.sku_id))] })} />}
      </section>
      <section>
        <p className="text-sm font-medium text-slate-800">ป้ายเตือนตอนแพ็ค</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {form.pack_flags.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
              {f}{edit && <button type="button" onClick={() => setForm((cur) => cur && { ...cur, pack_flags: cur.pack_flags.filter((x) => x !== f) })} aria-label={`เอาป้าย ${f} ออก`} className="text-amber-700">×</button>}
            </span>
          ))}
          {edit && PACK_FLAG_PRESETS.filter((f) => !form.pack_flags.includes(f)).map((f) => (
            <button key={f} type="button" onClick={() => addFlag(f)} className="rounded-full border border-dashed border-amber-300 px-2.5 py-1 text-xs text-amber-800">+ {f}</button>
          ))}
        </div>
        {edit && (
          <form onSubmit={(e) => { e.preventDefault(); addFlag(flagInput); }} className="mt-2 flex gap-2">
            <input value={flagInput} onChange={(e) => setFlagInput(e.target.value)} placeholder="พิมพ์ป้ายเอง แล้วกด Enter" maxLength={30} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </form>
        )}
      </section>
      <section>
        <p className="text-sm font-medium text-slate-800">โน้ตตอนแพ็ค</p>
        <textarea value={form.pack_note} onChange={(e) => { const v = e.target.value.slice(0, PACK_NOTE_MAX); setForm((f) => f && { ...f, pack_note: v }); }} disabled={!edit} rows={2} placeholder="เช่น พับสายเข็มขัดเข้าด้านใน" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
      </section>
      {edit ? (
        <div className="flex items-center justify-end gap-2">
          {dirty && <button type="button" onClick={() => setForm(formOf(data.parent))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">ละทิ้ง</button>}
          <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-40">{saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}</button>
        </div>
      ) : <p className="text-xs text-slate-400">ดูได้อย่างเดียว — ต้องมีสิทธิ์แก้สินค้าหรือหัวหน้าแพ็ค</p>}
    </div>
  );
}
