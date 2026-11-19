"use client";

/**
 * 🎁 บรรจุภัณฑ์ตอนแพ็ค (เจ้าของเลือก 2026-11-19 รอบ 6: ตารางติ๊กแบบ A + ข้อเสนอ 1, 2, 3, 6)
 *   PackagingChip      ป้ายบรรจุภัณฑ์ (มีรูปเล็กถ้าอัปไว้ — ข้อ 6) · ใช้ในสถานี/ตาราง/ลิ้นชัก
 *   PackagingTab       แท็บ "บรรจุภัณฑ์" ในหน้าแพ็ค: จัดการรายการ (เพิ่ม/แก้ชื่อ/รูป/ลบเข้าถัง/กู้คืน) + ตารางติ๊กทีละรุ่น
 *   ParentPackingTab   แท็บ "แพ็ค" ในลิ้นชัก Parent SKU: บรรจุภัณฑ์ + ป้ายเตือน + โน้ตตอนแพ็ค (ข้อ 2)
 * ข้อมูล/สิทธิ์/ประวัติ: /api/packing/packaging (กติกา lib/packaging) · ทุกการเปลี่ยนมีปุ่มย้อนกลับในแจ้งผล
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import { ErrorState, LoadingState } from "@/components/state-views";
import { uploadResizedImage } from "@/components/image-attach";
import { PACK_FLAG_PRESETS, PACK_NOTE_MAX, type PackagingItem } from "@/lib/packaging";

const API = "/api/packing/packaging";
const post = async (body: Record<string, unknown>): Promise<{ ok: boolean; j: Record<string, unknown> }> => {
  const r = await apiFetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, j };
};

export function PackagingChip({ name, imageKey, size = "sm" }: { name: string; imageKey?: string | null; size?: "sm" | "md" }) {
  const img = r2ImageUrl(imageKey ?? null, 64);
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 text-violet-800 ${size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-[11px]"}`}>
      {img ? <img src={img} alt="" className={`${size === "md" ? "h-5 w-5" : "h-4 w-4"} shrink-0 rounded-full object-cover`} /> : <Icon value="i:gift" />}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** รายการบรรจุภัณฑ์ + สิทธิ์ */
export function usePackagingItems() {
  const [items, setItems] = useState<PackagingItem[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canEditParent, setCanEditParent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await apiFetch(API);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลดรายการบรรจุภัณฑ์ไม่สำเร็จ"); return; }
      setItems(j.items ?? []); setCanManage(!!j.can_manage); setCanEditParent(!!j.can_edit_parent); setError(null);
    } catch { setError("เน็ตหลุด — โหลดไม่ได้"); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { items, canManage, canEditParent, error, reload };
}

// ── แท็บ "บรรจุภัณฑ์" ในหน้าแพ็ค ──
export function PackagingTab() {
  const pk = usePackagingItems();
  return (
    <div className="grid gap-3">
      <PackagingManager pk={pk} />
      <PackagingMatrix items={(pk.items ?? []).filter((i) => i.is_active)} canEdit={pk.canEditParent} />
    </div>
  );
}

function PackagingManager({ pk }: { pk: ReturnType<typeof usePackagingItems> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgFor = useRef<PackagingItem | null>(null);

  const act = async (body: Record<string, unknown>, msg: string, undo?: Record<string, unknown>) => {
    setBusy(true);
    const { ok, j } = await post(body);
    setBusy(false);
    if (!ok) { toast.error(String(j.error ?? "บันทึกไม่สำเร็จ")); return false; }
    await pk.reload();
    if (undo) toast.action(msg, "ย้อนกลับ", () => { void post(undo).then(() => pk.reload()); }, { ms: 10_000 });
    else toast.success(msg);
    return true;
  };

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { ok, j } = await post({ action: "item_create", name: n });
    setBusy(false);
    if (!ok) { toast.error(String(j.error ?? "เพิ่มไม่สำเร็จ")); return; }
    setName(""); await pk.reload();
    const id = (j.item as { id?: string } | undefined)?.id;
    toast.action(`เพิ่ม "${n}" แล้ว`, "ย้อนกลับ", () => { if (id) void post({ action: "item_archive", id, archived: true }).then(() => pk.reload()); }, { ms: 10_000 });
  };

  const onImage = async (f: File | undefined) => {
    const it = imgFor.current;
    if (!f || !it) return;
    setBusy(true);
    try {
      const up = await uploadResizedImage(f, { folder: "packaging", max: 400 });
      await act({ action: "item_update", id: it.id, image_r2_key: up.r2_key }, `ใส่รูป "${it.name}" แล้ว`, { action: "item_update", id: it.id, image_r2_key: it.image_r2_key });
    } catch { toast.error("อัปรูปไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const list = (pk.items ?? []).filter((i) => i.is_active);
  const trash = (pk.items ?? []).filter((i) => !i.is_active);
  if (pk.error) return <ErrorState title="โหลดรายการบรรจุภัณฑ์ไม่ได้" hint={pk.error} onRetry={() => void pk.reload()} />;
  if (!pk.items) return <LoadingState label="กำลังโหลด…" />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">รายการบรรจุภัณฑ์</p>
          <p className="text-xs text-slate-500">ของที่ต้องใส่ไปกับสินค้า เช่น กล่อง ถุงผ้า Tags Card Care · ตั้งต่อรุ่นได้ในตารางด้านล่าง หรือแท็บ "แพ็ค" ของ Parent SKU</p>
        </div>
        {trash.length > 0 && <button type="button" onClick={() => setShowTrash((v) => !v)} className="text-xs text-slate-500 underline">ถังขยะ ({trash.length})</button>}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((it) => (
          <li key={it.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5">
            {editing === it.id ? (
              <form onSubmit={(e) => { e.preventDefault(); const n = editName.trim(); setEditing(null); if (n && n !== it.name) void act({ action: "item_update", id: it.id, name: n }, `เปลี่ยนชื่อเป็น "${n}" แล้ว`, { action: "item_update", id: it.id, name: it.name }); }} className="flex items-center gap-1">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus className="w-36 rounded border border-slate-300 px-2 py-0.5 text-sm" />
                <button type="submit" className="text-xs text-sky-700">บันทึก</button>
                <button type="button" onClick={() => setEditing(null)} className="text-xs text-slate-500">ยกเลิก</button>
              </form>
            ) : (
              <>
                <PackagingChip name={it.name} imageKey={it.image_r2_key} size="md" />
                {pk.canManage && (
                  <span className="flex items-center gap-1 text-xs">
                    <button type="button" disabled={busy} onClick={() => { setEditing(it.id); setEditName(it.name); }} aria-label={`แก้ชื่อ ${it.name}`} className="rounded px-1 text-slate-500 hover:bg-slate-100"><Icon name="edit" /></button>
                    <button type="button" disabled={busy} onClick={() => { imgFor.current = it; fileRef.current?.click(); }} aria-label={`ใส่รูป ${it.name}`} className="rounded px-1 text-slate-500 hover:bg-slate-100"><Icon name="upload" /></button>
                    <button type="button" disabled={busy} onClick={() => void act({ action: "item_archive", id: it.id, archived: true }, `ย้าย "${it.name}" เข้าถังแล้ว`, { action: "item_archive", id: it.id, archived: false })} aria-label={`ลบ ${it.name}`} className="rounded px-1 text-red-500 hover:bg-red-50"><Icon name="delete" /></button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
        {!list.length && <li className="text-sm text-slate-400">ยังไม่มีรายการ</li>}
      </ul>
      {pk.canManage && (
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="mt-2 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เพิ่มบรรจุภัณฑ์ เช่น กล่องเข็มขัด" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" maxLength={80} />
          <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">เพิ่ม</button>
        </form>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void onImage(e.target.files?.[0]); e.target.value = ""; }} />
      {showTrash && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2">
          <p className="text-xs text-slate-500">ในถัง — กู้คืนแล้วรุ่นที่เคยตั้งไว้จะกลับมาโชว์</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {trash.map((it) => (
              <li key={it.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-500">
                {it.name}
                {pk.canManage && <button type="button" disabled={busy} onClick={() => void act({ action: "item_archive", id: it.id, archived: false }, `กู้คืน "${it.name}" แล้ว`)} className="text-xs text-sky-700 underline">กู้คืน</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type MatrixRow = { id: string; code: string; name: string; image_key: string | null; pack_items: string[] };

/** ตารางติ๊ก (แบบ A): แถว = รุ่น · คอลัมน์ = บรรจุภัณฑ์ · ติ๊ก = บันทึกทันที (ย้อนกลับได้) */
function PackagingMatrix({ items, canEdit }: { items: PackagingItem[]; canEdit: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const seq = useRef(0);

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
  useEffect(() => { const t = window.setTimeout(() => { setRows(null); void load(0); }, 300); return () => window.clearTimeout(t); }, [load]);

  const toggle = async (row: MatrixRow, itemId: string, on: boolean, quiet = false) => {
    const k = `${row.id}:${itemId}`;
    setSaving((s) => new Set(s).add(k));
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, pack_items: on ? [...new Set([...r.pack_items, itemId])] : r.pack_items.filter((x) => x !== itemId) } : r)));
    const { ok, j } = await post({ action: "parent_toggle", parent_id: row.id, item_id: itemId, on });
    setSaving((s) => { const n = new Set(s); n.delete(k); return n; });
    if (!ok) { toast.error(String(j.error ?? "บันทึกไม่สำเร็จ")); void load(0); return; }
    const saved = (j.pack_items as string[] | undefined) ?? null;
    if (saved) setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, pack_items: saved } : r)));
    if (!quiet) {
      const nm = items.find((i) => i.id === itemId)?.name ?? "";
      toast.action(`${row.code}: ${on ? "ใส่" : "เอาออก"} ${nm}`, "ย้อนกลับ", () => void toggle(row, itemId, !on, true), { ms: 8_000 });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-800">ตั้งบรรจุภัณฑ์ทีละหลายรุ่น {rows ? <span className="text-sm font-normal text-slate-500">({total.toLocaleString()} รุ่น)</span> : null}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสรุ่น / ชื่อ" className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> ยังไม่ตั้ง</label>
      </div>
      {!canEdit && <p className="mb-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">ดูได้อย่างเดียว — หัวหน้าแพ็คหรือคนแก้สินค้าได้เป็นคนตั้ง</p>}
      {!items.length ? <p className="py-6 text-center text-sm text-slate-400">เพิ่มรายการบรรจุภัณฑ์ด้านบนก่อน</p>
        : error ? <ErrorState title="โหลดไม่ได้" hint={error} onRetry={() => void load(0)} />
        : !rows ? <LoadingState label="กำลังโหลด…" />
        : !rows.length ? <p className="py-6 text-center text-sm text-slate-400">ไม่พบรุ่นตามที่ค้น</p>
        : (
          <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-100">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left font-medium">รุ่น</th>
                  {items.map((i) => <th key={i.id} className="px-2 py-2 text-center font-medium"><PackagingChip name={i.name} imageKey={i.image_r2_key} /></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="sticky left-0 bg-white px-2 py-1.5">
                      <div className="flex max-w-[16rem] items-center gap-2">
                        <HoverImage url={r2ImageUrl(r.image_key, 160)} size={32} previewSize={240} />
                        <div className="min-w-0"><p className="font-medium text-slate-900">{r.code}</p><p className="truncate text-xs text-slate-500">{r.name}</p></div>
                      </div>
                    </td>
                    {items.map((i) => {
                      const on = r.pack_items.includes(i.id);
                      return (
                        <td key={i.id} className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={on} disabled={!canEdit || saving.has(`${r.id}:${i.id}`)} onChange={(e) => void toggle(r, i.id, e.target.checked)} className="h-5 w-5 cursor-pointer" aria-label={`${r.code} ${i.name}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length < total && (
              <div className="p-2 text-center">
                <button type="button" disabled={loadingMore} onClick={() => { setLoadingMore(true); void load(rows.length).finally(() => setLoadingMore(false)); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">{loadingMore ? "กำลังโหลด…" : `โหลดเพิ่ม (เหลือ ${(total - rows.length).toLocaleString()})`}</button>
              </div>
            )}
          </div>
        )}
      <p className="mt-2 text-xs text-slate-400">ติ๊ก = บันทึกทันที · แจ้งผลมีปุ่มย้อนกลับ · ทุกการแก้เก็บประวัติ</p>
    </div>
  );
}

// ── แท็บ "แพ็ค" ในลิ้นชัก Parent SKU (ข้อเสนอ 2: บรรจุภัณฑ์ + ป้ายเตือน + โน้ต ในที่เดียว) ──
type ParentPack = { id: string; code: string; name: string; pack_items: string[]; pack_note: string | null; pack_flags: string[] };

export function ParentPackingTab({ parentId }: { parentId: string }) {
  const toast = useToast();
  const [data, setData] = useState<{ parent: ParentPack; items: PackagingItem[]; can_edit_parent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ pack_items: string[]; pack_note: string; pack_flags: string[] } | null>(null);
  const [flagInput, setFlagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}?parent=${encodeURIComponent(parentId)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลดไม่สำเร็จ"); return; }
      setData(j); setError(null);
      setForm({ pack_items: j.parent.pack_items ?? [], pack_note: j.parent.pack_note ?? "", pack_flags: j.parent.pack_flags ?? [] });
    } catch { setError("เน็ตหลุด — โหลดไม่ได้"); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => {
    if (!data || !form) return false;
    const p = data.parent;
    return JSON.stringify([...form.pack_items].sort()) !== JSON.stringify([...p.pack_items].sort()) || form.pack_note.trim() !== (p.pack_note ?? "") || JSON.stringify(form.pack_flags) !== JSON.stringify(p.pack_flags);
  }, [data, form]);

  const save = async () => {
    if (!data || !form) return;
    const before = { pack_items: data.parent.pack_items, pack_note: data.parent.pack_note ?? "", pack_flags: data.parent.pack_flags };
    setSaving(true);
    const { ok, j } = await post({ action: "parent_set", parent_id: parentId, ...form });
    setSaving(false);
    if (!ok) { toast.error(String(j.error ?? "บันทึกไม่สำเร็จ")); return; }
    await load();
    toast.action("บันทึกการแพ็คแล้ว", "ย้อนกลับ", () => { void post({ action: "parent_set", parent_id: parentId, ...before }).then(() => load()); }, { ms: 10_000 });
  };

  if (error) return <ErrorState title="โหลดไม่ได้" hint={error} onRetry={() => void load()} />;
  if (!data || !form) return <LoadingState label="กำลังโหลด…" />;
  const edit = data.can_edit_parent;
  const active = data.items.filter((i) => i.is_active || form.pack_items.includes(i.id));
  const addFlag = (f: string) => { const v = f.trim().slice(0, 30); if (v) setForm((cur) => (cur && !cur.pack_flags.includes(v) && cur.pack_flags.length < 8 ? { ...cur, pack_flags: [...cur.pack_flags, v] } : cur)); setFlagInput(""); };

  return (
    <div className="grid max-w-3xl gap-4 p-1">
      <section>
        <p className="text-sm font-medium text-slate-800">บรรจุภัณฑ์ที่ต้องใส่</p>
        <p className="text-xs text-slate-500">สถานีแพ็คจะโชว์ใต้สินค้ารุ่นนี้ · เพิ่ม/แก้รายการได้ที่หน้าแพ็ค → แท็บ "บรรจุภัณฑ์"</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {active.map((i) => {
            const on = form.pack_items.includes(i.id);
            return (
              <label key={i.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${on ? "border-violet-400 bg-violet-50" : "border-slate-200"} ${!edit ? "cursor-default opacity-80" : ""}`}>
                <input type="checkbox" checked={on} disabled={!edit} onChange={(e) => { const on = e.target.checked; setForm((f) => f && { ...f, pack_items: on ? [...new Set([...f.pack_items, i.id])] : f.pack_items.filter((x) => x !== i.id) }); }} />
                <PackagingChip name={i.name + (i.is_active ? "" : " (ในถัง)")} imageKey={i.image_r2_key} />
              </label>
            );
          })}
          {!active.length && <p className="text-sm text-slate-400">ยังไม่มีรายการบรรจุภัณฑ์</p>}
        </div>
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
        <textarea value={form.pack_note} onChange={(e) => { const v = e.target.value.slice(0, PACK_NOTE_MAX); setForm((f) => f && { ...f, pack_note: v }); }} disabled={!edit} rows={2} placeholder="เช่น ใส่ถุงกันชื้น 1 ซอง · พับสายเข็มขัดเข้าด้านใน" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
      </section>
      {edit ? (
        <div className="flex items-center justify-end gap-2">
          {dirty && <button type="button" onClick={() => setForm({ pack_items: data.parent.pack_items, pack_note: data.parent.pack_note ?? "", pack_flags: data.parent.pack_flags })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">ละทิ้ง</button>}
          <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white disabled:opacity-40">{saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}</button>
        </div>
      ) : <p className="text-xs text-slate-400">ดูได้อย่างเดียว — ต้องมีสิทธิ์แก้สินค้าหรือหัวหน้าแพ็ค</p>}
    </div>
  );
}
