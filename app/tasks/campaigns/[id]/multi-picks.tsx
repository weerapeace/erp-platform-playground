"use client";
// ตัวเลือกหลายตัวสำหรับวางการ์ดบนกระดานแคมเปญ (SKU / Parent SKU / SKU การตลาด / ใบออกแบบ / ตามแท็ก) — แยกจาก page.tsx (Y1)
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { SkuTagBrowser } from "@/components/sku-tag-browser";
import { apiFetch } from "@/lib/api";
import { useViewPref } from "@/lib/use-view-pref";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { SkuPickerValue } from "@/components/pickers";
import { withImageWidth } from "@/lib/r2-image";
import { SearchMultiPick, type SearchPage } from "@/components/search-multi-pick";
import type { ParentSkuVal, MktSkuVal } from "./card-skeletons";

export const PICK_PAGE = 30;   // โหลดทีละ 30 + ปุ่มโหลดเพิ่ม (เดิมตัดที่ 30 แล้วไม่มีทางเห็นตัวที่เหลือ เช่นค้น WK เจอ 40 เห็นแค่ 30)

// ดึงหน้าผลค้นหาของตัวเลือกหลายตัว — เรียกไม่สำเร็จ = โยน error ให้ SearchMultiPick แสดง
export async function pickPage<T>(url: string, map: (r: Record<string, unknown>) => T): Promise<SearchPage<T>> {
  const res = await apiFetch(url);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return { rows: ((j.data ?? []) as Record<string, unknown>[]).map(map), total: Number(j.total ?? 0) };
}

// เลือก Parent SKU หลายอัน (ค้นหา + checkbox + รูป) — ของกลาง SearchMultiPick
export const mapParentRow = (r: Record<string, unknown>): ParentSkuVal => ({ id: String(r.id), code: String(r.code ?? ""), name: String(r.name ?? r.code ?? ""), image_url: r.image_key ? `/api/r2-image?key=${encodeURIComponent(String(r.image_key))}` : null });

export function ParentSkuMultiPick({ selected, onChange }: { selected: ParentSkuVal[]; onChange: (v: ParentSkuVal[]) => void }) {
  const t = useT();
  return (
    <SearchMultiPick<ParentSkuVal> selected={selected} onChange={onChange} tone="teal" getId={(s) => s.id} chipLabel={(s) => s.code}
      placeholder={t("🔍 ค้นหา Parent SKU / ชื่อ...", "🔍 Search Parent SKU / name...")} emptyText={t("ไม่พบ Parent SKU", "No Parent SKU found")}
      fetchPage={(q, offset) => pickPage(`/api/pickers/parent-skus?${new URLSearchParams({ search: q, limit: String(PICK_PAGE), offset: String(offset) })}`, mapParentRow)}
      renderRow={(s) => <>
        {s.image_url ? <img src={`${s.image_url}&w=72`} alt="" className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0" /> : <span className="h-8 w-8 rounded bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-300 text-xs">🧬</span>}
        <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
        <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
      </>} />
  );
}

// เลือก "SKU การตลาด" หลายรุ่น — โหลดรายการทั้งหมดครั้งเดียว (API เดียวกับหน้า /marketing/skus) แล้วค้น/กรองแบรนด์/ป้าย ในเครื่อง
export type MktApiLabel = { id: string; name: string; icon: string | null; color: string };

export type MktApiItem = { parent_sku_id: string; code: string; name: string; image_key: string | null; brand_id: string | null; label_id: string | null; note: string | null; sku_total: number; sku_active: number; badge_ids: string[] };

export function MarketingSkuMultiPick({ selected, onChange }: { selected: MktSkuVal[]; onChange: (v: MktSkuVal[]) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [labelId, setLabelId] = useState("");
  const [items, setItems] = useState<(MktSkuVal & { brand_id: string | null; label_id: string | null; badge_ids: string[] })[]>([]);
  const [badgeList, setBadgeList] = useState<MktApiLabel[]>([]);   // ป้ายเสริม (ป้ายเล็ก) ไว้กรอง เช่น Stock เยอะ / ขายดี
  const [badgeIds, setBadgeIds] = useState<string[]>([]);           // กรองป้ายเสริม (เลือกได้หลายป้าย = มีป้ายใดป้ายหนึ่ง)
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [labels, setLabels] = useState<MktApiLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // มุมมอง ☰ รายการ / 🖼️ การ์ด — จำรายคน (ของกลาง useViewPref) · จำนวนการ์ดต่อแถว (ของกลาง gallery-columns)
  const { view, setView, saveDefault } = useViewPref("campaign_mkt_pick_view", ["list", "grid"] as const, "grid");
  const { cols, setCols, gridStyle } = useGalleryColumns("campaign-mkt-pick", 5);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/marketing/skus").then(async (r) => {
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || (r.status === 401 || r.status === 403 ? t("ไม่มีสิทธิ์ดู SKU การตลาด (marketing.sku.view)", "No permission (marketing.sku.view)") : `HTTP ${r.status}`));
      if (!alive) return;
      const d = j.data as { items: MktApiItem[]; labels: MktApiLabel[]; badges: MktApiLabel[]; brands: { id: string; name: string }[] };
      const lab = new Map<string, MktApiLabel>(); for (const l of [...(d.labels ?? []), ...(d.badges ?? [])]) lab.set(l.id, l);
      setLabels(d.labels ?? []); setBrands(d.brands ?? []); setBadgeList(d.badges ?? []);
      setItems((d.items ?? []).map((it) => ({
        id: it.parent_sku_id, code: it.code, name: it.name,
        image_url: it.image_key ? `/api/r2-image?key=${encodeURIComponent(it.image_key)}` : null,
        label: it.label_id ? (lab.get(it.label_id)?.name ?? null) : null,
        label_color: it.label_id ? (lab.get(it.label_id)?.color ?? null) : null,
        badges: (it.badge_ids ?? []).map((b) => lab.get(b)?.name ?? "").filter(Boolean),
        sku_active: it.sku_active, sku_total: it.sku_total, note: it.note,
        brand_id: it.brand_id, label_id: it.label_id, badge_ids: it.badge_ids ?? [],
      })));
    }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [t]);
  const q = query.trim().toLowerCase();
  const shown = items.filter((it) => (!brandId || it.brand_id === brandId) && (!labelId || it.label_id === labelId) && (badgeIds.length === 0 || badgeIds.some((b) => it.badge_ids.includes(b))) && (!q || `${it.code} ${it.name} ${it.label ?? ""} ${it.badges.join(" ")}`.toLowerCase().includes(q))).slice(0, 300);
  const toggle = (s: MktSkuVal) => onChange(selected.some((x) => x.id === s.id) ? selected.filter((x) => x.id !== s.id) : [...selected, s]);
  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("🔍 ค้นหารหัสรุ่น / ชื่อ / ป้าย...", "🔍 Search model / name / label...")} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm" />
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setBrandId("")} className={`h-7 rounded-full border px-2.5 text-[11px] ${!brandId ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{t("ทุกแบรนด์", "All brands")}</button>
        {brands.map((b) => <button key={b.id} type="button" onClick={() => setBrandId(brandId === b.id ? "" : b.id)} className={`h-7 rounded-full border px-2.5 text-[11px] ${brandId === b.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{b.name}</button>)}
      </div>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setLabelId("")} className={`h-7 rounded-full border px-2.5 text-[11px] ${!labelId ? "bg-orange-600 text-white border-orange-600" : "bg-white text-slate-600 border-slate-200"}`}>{t("ทุกป้าย", "All labels")}</button>
          {labels.map((l) => <button key={l.id} type="button" onClick={() => setLabelId(labelId === l.id ? "" : l.id)} className={`h-7 rounded-full border px-2.5 text-[11px] ${labelId === l.id ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={labelId === l.id ? { backgroundColor: l.color, borderColor: l.color } : undefined}>{l.icon ? `${l.icon} ` : ""}{l.name}</button>)}
        </div>
      )}
      {badgeList.length > 0 && (
        /* กรองป้ายเสริม (ป้ายเล็ก) เช่น Stock เยอะ / ขายดี — เลือกได้หลายป้าย (มีป้ายใดป้ายหนึ่ง) · ใช้ร่วมกับป้ายหลักได้ */
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-slate-400">{t("ป้ายเสริม:", "Badges:")}</span>
          {badgeList.map((b) => { const on = badgeIds.includes(b.id); return (
            <button key={b.id} type="button" onClick={() => setBadgeIds((cur) => (on ? cur.filter((x) => x !== b.id) : [...cur, b.id]))}
              className={`h-7 rounded-full border border-dashed px-2.5 text-[11px] ${on ? "text-white border-solid" : "bg-white text-slate-600 border-slate-300"}`}
              style={on ? { backgroundColor: b.color, borderColor: b.color } : undefined}>{b.icon ? `${b.icon} ` : ""}{b.name}</button>
          ); })}
          {badgeIds.length > 0 && <button type="button" onClick={() => setBadgeIds([])} className="h-7 px-2 text-[11px] text-slate-400 hover:text-slate-600">✕ {t("ล้าง", "clear")}</button>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
          {([["grid", "🖼️", t("การ์ด", "Cards")], ["list", "☰", t("รายการ", "List")]] as const).map(([k, icon, label]) => (
            <button key={k} type="button" onClick={() => { setView(k); void saveDefault(k); }} className={`h-7 rounded px-2 text-xs ${view === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{icon} {label}</button>
          ))}
        </div>
        {view === "grid" && <GalleryColumnsControl cols={cols} onChange={setCols} />}
        {selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((s) => <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 rounded-full pl-2 pr-1 py-0.5"><span className="font-mono">{s.code}</span><button onClick={() => toggle(s)} className="hover:text-red-500">✕</button></span>)}</div>}
      </div>
      {view === "grid" ? (
        /* 🖼️ การ์ด: รูปใหญ่ + รหัส/ชื่อ/ป้าย/สีที่เหลือ · ติ๊กที่มุม · กดการ์ด = เลือก */
        <div className="max-h-[62vh] overflow-y-auto rounded-lg border border-slate-100 p-2">
          {loading ? <p className="px-3 py-6 text-sm text-slate-400 text-center">{t("กำลังโหลด...", "Loading...")}</p>
            : error ? <p className="px-3 py-6 text-sm text-rose-600 text-center">⚠️ {error}</p>
            : shown.length === 0 ? <p className="px-3 py-6 text-sm text-slate-400 text-center">{t("ไม่พบรุ่นที่ตรง", "No matching model")}</p>
            : (
              <div style={gridStyle}>
                {shown.map((s) => { const on = selected.some((x) => x.id === s.id); return (
                  <button key={s.id} type="button" onClick={() => toggle(s)} title={`${s.code} · ${s.name}`}
                    className={`relative flex flex-col overflow-hidden rounded-lg border bg-white text-left transition ${on ? "border-orange-500 ring-2 ring-orange-200" : "border-slate-200 hover:border-orange-300"}`}
                    style={s.label_color && on ? { borderColor: s.label_color } : undefined}>
                    <span className={`absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold shadow-sm ${on ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white/90 text-transparent"}`}>✓</span>
                    {s.label && <span className="absolute right-1.5 top-1.5 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm" style={{ backgroundColor: s.label_color || "#ea580c" }}>{s.label}</span>}
                    {s.image_url
                      ? <img src={`${s.image_url}&w=400`} alt="" loading="lazy" className="aspect-square w-full bg-slate-50 object-contain" />
                      : <span className="flex aspect-square w-full items-center justify-center bg-slate-50 text-3xl text-slate-300">🎯</span>}
                    <span className="flex flex-1 flex-col gap-1 p-2">
                      <span className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] text-slate-500">{s.code}</span>
                        <span className="text-[10px] text-slate-500">🎨 {s.sku_active}/{s.sku_total}</span>
                      </span>
                      <span className="line-clamp-2 text-xs font-medium leading-snug text-slate-800">{s.name}</span>
                      {/* ป้ายเสริม (ป้ายเล็ก) เป็นชิป — เห็นครบไม่ต้องชี้ */}
                      {s.badges.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {s.badges.map((b) => <span key={b} className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-tight text-slate-600">{b}</span>)}
                        </span>
                      )}
                      {/* หมายเหตุการตลาด */}
                      {s.note && <span className="line-clamp-2 rounded bg-amber-50 px-1.5 py-1 text-[10px] leading-snug text-amber-800" title={s.note}>📝 {s.note}</span>}
                    </span>
                  </button>
                ); })}
              </div>
            )}
        </div>
      ) : (
      <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {loading ? <p className="px-3 py-3 text-sm text-slate-400 text-center">{t("กำลังโหลด...", "Loading...")}</p>
          : error ? <p className="px-3 py-3 text-sm text-rose-600 text-center">⚠️ {error}</p>
          : shown.length === 0 ? <p className="px-3 py-3 text-sm text-slate-400 text-center">{t("ไม่พบรุ่นที่ตรง", "No matching model")}</p>
          : shown.map((s) => { const on = selected.some((x) => x.id === s.id); return (
            <button key={s.id} onClick={() => toggle(s)} className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 ${on ? "bg-orange-50/40" : ""}`}>
              <input type="checkbox" readOnly checked={on} className="h-4 w-4 rounded border-slate-300 text-orange-600 pointer-events-none" />
              {s.image_url ? <img src={`${s.image_url}&w=72`} alt="" className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0" /> : <span className="h-8 w-8 rounded bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-300 text-xs">🎯</span>}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-700">{s.name}</span>
                {(s.badges.length > 0 || s.note) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {s.badges.map((b) => <span key={b} className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-tight text-slate-600">{b}</span>)}
                    {s.note && <span className="truncate text-[10px] text-amber-800" title={s.note}>📝 {s.note}</span>}
                  </span>
                )}
              </span>
              {s.label && <span className="text-[10px] rounded px-1.5 py-0.5 text-white shrink-0" style={{ backgroundColor: s.label_color || "#ea580c" }}>{s.label}</span>}
              <span className="text-[11px] text-slate-500 shrink-0">🎨 {s.sku_active}/{s.sku_total}</span>
            </button>
          ); })}
      </div>
      )}
      {!loading && !error && <p className="text-[11px] text-slate-400">{t("แสดง", "Showing")} {shown.length}{items.length > shown.length ? ` / ${items.length}` : ""} {t("รุ่น", "models")}{shown.length >= 300 ? ` · ${t("พิมพ์ค้นหาเพื่อกรองเพิ่ม", "type to narrow down")}` : ""}</p>}
    </div>
  );
}

// เลือก SKU หลายอัน (ค้นหา + checkbox) — ของกลาง SearchMultiPick
export const mapSkuRow = (r: Record<string, unknown>): SkuPickerValue => ({ id: String(r.id), code: String(r.code ?? ""), name: String(r.name ?? r.code ?? ""), color: r.color != null ? String(r.color) : null, list_price: r.list_price == null ? null : Number(r.list_price), image_key: r.image_key == null ? null : String(r.image_key), image_url: r.image_key ? `/api/r2-image?key=${encodeURIComponent(String(r.image_key))}` : null });

export function SkuMultiPick({ selected, onChange }: { selected: SkuPickerValue[]; onChange: (v: SkuPickerValue[]) => void }) {
  const t = useT();
  return (
    <SearchMultiPick<SkuPickerValue> selected={selected} onChange={onChange} tone="violet" getId={(s) => s.id} chipLabel={(s) => s.code}
      placeholder={t("🔍 ค้นหา SKU / ชื่อสินค้า...", "🔍 Search SKU / product name...")} emptyText={t("ไม่พบ SKU", "No SKU found")}
      fetchPage={(q, offset) => pickPage(`/api/pickers/skus?${new URLSearchParams({ search: q, limit: String(PICK_PAGE), offset: String(offset), sales_only: "false" })}`, mapSkuRow)}
      renderRow={(s) => <>
        {s.image_url ? <img src={`${s.image_url}&w=72`} alt="" className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0" /> : <span className="h-8 w-8 rounded bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-300 text-xs">📦</span>}
        <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
        <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
        {s.color && <span className="text-[10px] text-slate-400 shrink-0">{s.color}</span>}
        {s.list_price != null && <span className="text-xs text-slate-400 shrink-0">{Number(s.list_price).toLocaleString()}฿</span>}
      </>} />
  );
}

// เลือกใบงานออกแบบหลายใบ (ค้นหา + checkbox + รูปหน้าปก) — ข้อมูลชุดเดียวกับ Design Dashboard · ของกลาง SearchMultiPick
export function DesignSheetMultiPick({ selected, onChange, statusLabel }: {
  selected: DesignSheetListItem[];
  onChange: (v: DesignSheetListItem[]) => void;
  statusLabel: (status?: string | null) => string | null;
}) {
  const t = useT();
  return (
    <SearchMultiPick<DesignSheetListItem> selected={selected} onChange={onChange} tone="indigo" getId={(s) => s.id} chipLabel={(s) => s.code}
      placeholder={t("🔍 ค้นหารหัสใบงาน (DS-...) / ชื่องาน...", "🔍 Search sheet code (DS-...) / name...")} emptyText={t("ไม่พบใบงานออกแบบ", "No design sheet found")}
      fetchPage={(q, offset) => pickPage(`/api/design-sheets?${new URLSearchParams({ search: q, limit: String(PICK_PAGE), offset: String(offset), archived: "0", sort_by: "updated_at", sort_dir: "desc" })}`, (r) => r as unknown as DesignSheetListItem)}
      renderRow={(s) => { const cover = withImageWidth(s.cover_url, 72); return <>
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt="" className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0" />
          : <span className="h-8 w-8 rounded bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-300 text-xs">📐</span>}
        <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
        <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
        {s.brand_name && <span className="text-[10px] text-slate-400 shrink-0">{s.brand_name}</span>}
        <span className="text-[10px] text-indigo-500 shrink-0">{statusLabel(s.status)}</span>
      </>; }} />
  );
}

// เลือกสินค้าแบบ "การ์ดใหญ่ ตามแท็ก" — ห่อของกลาง SkuTagBrowser (mode=pick)
// กดการ์ด = เลือก/เอาออก (สะสมไว้) แล้วค่อยกด "เพิ่มการ์ด" ทีเดียว
export function BigTagPick({ entity, picked, onPick, t }: {
  entity: "skus" | "parent-skus";
  picked: string[];
  onPick: (r: { id: string; code?: string; name?: string; image?: string | null }) => void;
  t: (th: string, en: string) => string;
}) {
  return (
    <div className="-mx-1">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-1 pb-2 mb-1 border-b border-slate-100">
        <p className="text-[11px] text-slate-400">
          🖼️ {t("กดการ์ดเพื่อเลือก/เอาออก · เลือกได้หลายอัน แล้วกด “เพิ่มการ์ด”", "Click a card to select/deselect · pick several, then press “Add card”")}
          {picked.length > 0 && <b className="ml-1 text-teal-700">· {t("เลือกแล้ว", "selected")} {picked.length}</b>}
        </p>
      </div>
      <div className="min-h-[55vh] max-h-[70vh] overflow-y-auto px-1">
        <SkuTagBrowser mode="pick" entity={entity} onPick={onPick} pickedIds={picked} />
      </div>
    </div>
  );
}
