"use client";
// คลังไฟล์: ช่องกรอกที่ฟอร์มต่าง ๆ ใช้ร่วม (แท็ก · อัลบั้ม · ชนิดงาน · ขนาด · รายการพิมพ์ · Parent SKU · ที่ใช้งาน) — แยกจาก index.tsx (Y1)
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { withImageWidth } from "@/lib/r2-image";
import { type AssetRow, type AssetUsage, type AssetSize, type PrintItem } from "@/app/api/assets/shared";
import { AssetPicker } from "@/components/asset-picker";
import { ParentSkuMultiPickerModal } from "@/components/parent-sku-multi-picker";
import type { AssetCollection } from "@/app/api/assets/collections/route";
import { type LookupItem, sizeText, SIZE_UNITS } from "./asset-shared";

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-1 text-slate-500">{label}</td>
      <td className="py-1 text-right text-slate-700">{value}</td>
    </tr>
  );
}

export function UsageList({ usages }: { usages: AssetUsage[] }) {
  const t = useT();
  if (usages.length === 0)
    return <p className="text-[12px] text-slate-400 mt-3 pt-3 border-t border-slate-100">{t("ยังไม่ถูกใช้ที่ไหน — ลบได้", "Not used anywhere — can be deleted")}</p>;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-[12px] font-medium text-slate-600 mb-1.5">{t("🔗 ถูกใช้อยู่", "🔗 In use at")} {usages.length} {t("ที่", "places")} <span className="text-[11px] text-slate-400 font-normal">{t("— ลบไม่ได้จนกว่าจะเอาออกจากที่ใช้งาน", "— can't delete until removed from where it's used")}</span></p>
      <div className="flex flex-col gap-1">
        {usages.map((u, i) => (
          <div key={i} className="text-[12px] text-slate-600">
            <span className="text-slate-400">{u.module}</span> · {u.record_label ?? u.record_id}{u.field ? ` (${u.field})` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ตัวเลือกแท็กแบบ chips (m2m) — เลือกของเดิม + เพิ่มใหม่ ──
export function TagChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [all, setAll] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    apiFetch("/api/assets/tags").then((r) => r.json())
      .then((j) => setAll(((j.data ?? []) as { name: string }[]).map((t) => t.name))).catch(() => {});
  }, []);
  const add = (name: string) => { const n = name.trim(); if (n && !value.includes(n)) onChange([...value, n]); setInput(""); };
  const remove = (name: string) => onChange(value.filter((x) => x !== name));
  const suggest = all.filter((t) => !value.includes(t) && (!input || t.toLowerCase().includes(input.toLowerCase()))).slice(0, 12);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {value.map((t) => (
          <span key={t} className="text-[11px] pl-2 pr-1 py-0.5 rounded-full bg-indigo-600 text-white inline-flex items-center gap-1">
            {t}<button type="button" onClick={() => remove(t)} className="hover:bg-white/25 rounded-full w-4 h-4 leading-none flex items-center justify-center">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่มีแท็ก", "No tags yet")}</span>}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
        placeholder={t("พิมพ์แท็ก + Enter / เลือกจากด้านล่าง", "Type a tag + Enter / pick from below")}
        className="w-full h-8 px-2 text-[12px] border border-slate-200 rounded-lg" />
      {suggest.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {suggest.map((t) => (
            <button key={t} type="button" onClick={() => add(t)}
              className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100">+ {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── เลือก Group Album หลายอัน (m2m) + สร้างอัลบั้มใหม่ inline ──
export function CollectionMultiSelect({ value, collections, onChange, onCreated }: {
  value: string[]; collections: AssetCollection[]; onChange: (v: string[]) => void; onCreated: (c: AssetCollection) => void;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useT();
  const nameOf = (id: string) => collections.find((c) => c.id === id)?.name ?? id;
  const add = (id: string) => { if (id && !value.includes(id)) onChange([...value, id]); };
  const remaining = collections.filter((c) => !value.includes(c.id));
  const create = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
      const j = await r.json(); if (!r.ok || j.error || !j.data) throw new Error(j.error || t("สร้างอัลบั้มไม่สำเร็จ", "Failed to create album"));
      const col = j.data as AssetCollection;
      onCreated(col); onChange([...value, col.id]); setNewName(""); setCreating(false);
      toast.success(`${t("สร้างอัลบั้ม", "Created album")} "${n}"`);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สร้างอัลบั้มไม่สำเร็จ", "Failed to create album")); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded">
            {nameOf(id)}<button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="text-emerald-300 hover:text-rose-500 leading-none">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("— ไม่ระบุ —", "— None —")}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ""; }}
          className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white max-w-[150px]">
          <option value="">{t("＋ เลือกอัลบั้ม…", "＋ Choose album…")}</option>
          {remaining.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="text-[11px] px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50">{t("＋ อัลบั้มใหม่", "＋ New album")}</button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder={t("ชื่ออัลบั้มใหม่", "New album name")} className="h-8 w-32 px-2 text-[12px] border border-emerald-300 rounded-lg" />
            <button type="button" onClick={() => void create()} disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          </span>
        )}
      </div>
    </div>
  );
}

// ── เลือกชนิด Artwork หลายอัน (m2m) + เพิ่มชนิดใหม่ inline (lookup กลาง) ──
export function ArtTypeMultiSelect({ value, types, onChange, onCreated, disabled }: {
  value: string[]; types: LookupItem[]; onChange: (v: string[]) => void; onCreated: (t: LookupItem) => void; disabled?: boolean;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const add = (name: string) => { const n = name.trim(); if (n && !value.includes(n)) onChange([...value, n]); };
  const t = useT();
  const remaining = types.filter((t) => !value.includes(t.name));
  const create = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/lookups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookup_type: "artwork_type", name: n }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || t("เพิ่มชนิดไม่สำเร็จ", "Failed to add type"));
      const item: LookupItem = j.data ? { id: String(j.data.id ?? n), name: String(j.data.name ?? n) } : { id: n, name: n };
      onCreated(item); add(item.name); setNewName(""); setCreating(false);
      toast.success(`${t("เพิ่มชนิด", "Added type")} "${n}"`);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มชนิดไม่สำเร็จ", "Failed to add type")); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 rounded">
            {n}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== n))} className="text-indigo-300 hover:text-rose-500 leading-none">✕</button>}
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("— ไม่ระบุ —", "— None —")}</span>}
      </div>
      {!disabled && <div className="flex items-center gap-1.5 mt-1">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ""; }}
          className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white max-w-[150px]">
          <option value="">{t("＋ เลือกชนิด…", "＋ Choose type…")}</option>
          {remaining.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="text-[11px] px-2 py-1 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50">{t("＋ ชนิดใหม่", "＋ New type")}</button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder={t("ชื่อชนิดใหม่", "New type name")} className="h-8 w-28 px-2 text-[12px] border border-indigo-300 rounded-lg" />
            <button type="button" onClick={() => void create()} disabled={busy}
              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          </span>
        )}
      </div>}
    </div>
  );
}

export function PrintItemsField({ value, onChange, disabled }: { value: PrintItem[]; onChange: (v: PrintItem[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const [availById, setAvailById] = useState<Record<string, AssetSize[]>>({});   // ไซส์ที่ artwork แต่ละลายมี (ไว้ทำ dropdown)
  const totalQty = value.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  // โหลดไซส์ของลายที่ยังไม่รู้ (ตอนเปิดของเดิมมาแก้)
  useEffect(() => {
    const missing = [...new Set(value.map((i) => i.asset_id))].filter((id) => !(id in availById));
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((id) => apiFetch(`/api/assets/${id}`).then((r) => r.json()).then((j) => [id, (j.data?.sizes ?? []) as AssetSize[]] as const).catch(() => [id, [] as AssetSize[]] as const)))
      .then((pairs) => { if (alive) setAvailById((m) => ({ ...m, ...Object.fromEntries(pairs) })); });
    return () => { alive = false; };
  }, [value, availById]);

  const addPicked = (rows: AssetRow[]) => {
    const have = new Set(value.map((i) => i.asset_id));
    const fresh = rows.filter((r) => !have.has(r.id));
    setAvailById((m) => ({ ...m, ...Object.fromEntries(rows.map((r) => [r.id, r.sizes ?? []])) }));
    const added: PrintItem[] = fresh.map((r) => ({
      asset_id: r.id, title: r.title || r.file_name, url: r.url ?? null,
      size: (r.sizes ?? []).length === 1 ? r.sizes[0] : null,   // มีไซส์เดียว → เลือกให้เลย
      qty: 1,
    }));
    if (added.length) onChange([...value, ...added]);
    setOpen(false);
  };

  const patchAt = (idx: number, p: Partial<PrintItem>) => onChange(value.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const dupAt = (idx: number) => onChange([...value.slice(0, idx + 1), { ...value[idx], size: null, qty: 1 }, ...value.slice(idx + 1)]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-slate-500">{t("🎨 Artwork ในแผ่นนี้", "🎨 Artwork on this sheet")} {value.length > 0 && <span className="text-slate-400">({value.length} {t("รายการ · รวม", "items · total")} {totalQty} {t("ชิ้น", "pcs")})</span>}</span>
        {!disabled && <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50">{t("＋ เลือก Artwork", "＋ Select Artwork")}</button>}
      </div>

      {value.length === 0 ? (
        <p className="text-[11px] text-slate-400">{t("ยังไม่ได้เลือก Artwork", "No Artwork selected")}</p>
      ) : (
        <div className="space-y-1">
          {value.map((it, idx) => {
            const avail = availById[it.asset_id] ?? [];
            const curKey = it.size ? sizeText(it.size) : "";
            const needSize = avail.length > 1 && !it.size;   // มีหลายไซส์แต่ยังไม่เลือก → เตือน
            return (
              <div key={`${it.asset_id}-${idx}`} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${needSize ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                {it.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={withImageWidth(it.url, 80) ?? it.url} alt="" className="w-8 h-8 rounded object-contain border border-slate-200 bg-slate-50 shrink-0" />
                  : <span className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs shrink-0">🎨</span>}
                <span className="flex-1 min-w-0 text-[12px] text-slate-700 truncate" title={it.title}>{it.title}</span>

                {/* ไซส์ที่ใช้ (เหมือนเลือก SKU ของลายนี้) */}
                {avail.length > 0 ? (
                  <select value={curKey} disabled={disabled}
                    onChange={(e) => patchAt(idx, { size: avail.find((s) => sizeText(s) === e.target.value) ?? null })}
                    className={`h-7 px-1.5 text-[11px] border rounded-lg bg-white max-w-[9.5rem] ${needSize ? "border-amber-400 text-amber-700" : "border-slate-200"}`}>
                    <option value="">{t("— เลือกไซส์ —", "— Select size —")}</option>
                    {avail.map((s) => <option key={sizeText(s)} value={sizeText(s)}>{sizeText(s)}</option>)}
                  </select>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0">{it.size ? sizeText(it.size) : t("ลายนี้ยังไม่ใส่ไซส์", "no size set for this design")}</span>
                )}

                <input type="number" min={1} value={it.qty} disabled={disabled}
                  onChange={(e) => patchAt(idx, { qty: Math.max(1, Math.round(Number(e.target.value)) || 1) })}
                  className="w-14 h-7 px-2 text-[12px] text-center border border-slate-200 rounded-lg disabled:bg-slate-50" />
                <span className="text-[10px] text-slate-400 shrink-0">{t("ชิ้น", "pcs")}</span>
                {!disabled && <>
                  <button type="button" onClick={() => dupAt(idx)} className="text-slate-400 hover:text-indigo-600 shrink-0 text-xs" title={t("เพิ่มลายนี้อีกไซส์", "Add another size for this design")}>⧉</button>
                  <button type="button" onClick={() => removeAt(idx)} className="text-slate-400 hover:text-red-500 shrink-0 text-sm" title={t("เอาออก", "Remove")}>✕</button>
                </>}
              </div>
            );
          })}
        </div>
      )}

      <AssetPicker open={open} onClose={() => setOpen(false)} onSelect={addPicked} multiple typeFilter="image"
        defaultSource="artwork" title={t("เลือก Artwork ที่อยู่ในแผ่นนี้", "Select the Artwork on this sheet")} />
    </div>
  );
}

export function SizesEditor({ value, onChange, disabled }: { value: AssetSize[]; onChange: (v: AssetSize[]) => void; disabled?: boolean }) {
  const t = useT();
  const set = (i: number, patch: Partial<AssetSize>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled}
            placeholder={t("ชื่อไซส์ เช่น ป้ายใหญ่", "size name, e.g. large label")} className="flex-1 min-w-0 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <input type="number" value={s.w ?? ""} onChange={(e) => set(i, { w: numOrNull(e.target.value) })} disabled={disabled}
            placeholder={t("กว้าง", "Width")} className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <span className="text-slate-400 text-xs">×</span>
          <input type="number" value={s.h ?? ""} onChange={(e) => set(i, { h: numOrNull(e.target.value) })} disabled={disabled}
            placeholder={t("สูง", "Height")} className="w-16 h-8 px-2 text-[12px] border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <select value={s.unit} onChange={(e) => set(i, { unit: e.target.value as AssetSize["unit"] })} disabled={disabled}
            className="h-8 px-1 text-[12px] border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
            {SIZE_UNITS.map((u) => <option key={u.v} value={u.v}>{t(u.label, u.en)}</option>)}
          </select>
          {!disabled && <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500 text-sm px-1">✕</button>}
        </div>
      ))}
      {disabled && value.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
      {!disabled && <button type="button" onClick={() => onChange([...value, { label: `ขนาด #${value.length + 1}`, w: null, h: null, unit: "cm" }])}
        className="self-start text-[12px] text-indigo-600 hover:underline">{t("＋ เพิ่มไซส์", "＋ Add size")}</button>}
    </div>
  );
}

// ── เลือก Parent SKU ที่ใช้ (multi) — ค้นจาก /api/sku-browser?entity=parent-skus ──
export function ParentSkuField({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded">
            {c}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-violet-300 hover:text-rose-500 leading-none">✕</button>}
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่ผูก Parent SKU", "No Parent SKU linked")}</span>}
        {!disabled && <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50">{t("＋ เลือก Parent SKU", "＋ Select Parent SKU")}</button>}
      </div>
      {/* ของกลาง: ค้น + ไล่ดูทั้งหมด + แบ่งหน้า (Pager) — เลิกใช้ picker เขียนเองที่ตัดแค่ 40 รายการ */}
      <ParentSkuMultiPickerModal open={open} onClose={() => setOpen(false)} excludeCodes={value}
        title={t("เลือก Parent SKU ที่ใช้ artwork นี้", "Select Parent SKUs that use this artwork")}
        onConfirm={(items) => { onChange([...new Set([...value, ...items.map((x) => x.code)])]); setOpen(false); }} />
    </div>
  );
}

// ── เลือกแท็กแบบ "ปุ่มกด" (เก็บความรกของชิป/ตัวช่วยไว้ในป๊อปอัป) ──
export function TagPickerField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-indigo-600 text-white">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="hover:bg-white/25 rounded-full w-3.5 h-3.5 leading-none flex items-center justify-center">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-400">{t("ยังไม่มีแท็ก", "No tags yet")}</span>}
        <button type="button" onClick={() => setOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50">{t("🏷️ เลือกแท็ก", "🏷️ Select tags")}</button>
      </div>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} title={t("เลือก / เพิ่มแท็ก", "Select / add tags")} size="sm"
          footer={<div className="flex justify-end w-full"><button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t("เสร็จ", "Done")}</button></div>}>
          <TagChips value={value} onChange={onChange} />
        </ERPModal>
      )}
    </div>
  );
}
