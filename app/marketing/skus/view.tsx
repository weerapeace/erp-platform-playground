"use client";

/**
 * 🎯 SKU การตลาด (ตัวหน้าจอ) — ทุก "รุ่น" (Parent SKU ที่เปิดใช้งาน) แยกแท็บตามแบรนด์
 *   - ติดป้ายได้ 1 ป้ายต่อรุ่น (Hero / Clearance / Accessories … ตั้งค่าเพิ่มได้) + หมายเหตุ
 *   - 🎨 SKU ที่เหลือ = สี/แบบที่ยังเปิดขาย / ทั้งหมด
 *   - 2 มุมมอง ตาราง/การ์ด ใช้ ค้นหา·เรียง·แบ่งหน้า ร่วมกัน (รุ่นเยอะ ~1,500 → แบ่งหน้าเสมอ)
 * ของกลางที่ใช้: MiniTable · Pager · ERPModal/ConfirmDialog · SearchableSelect · HoverImage · Popover · useViewPref · GalleryColumns · Toast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { HoverImage } from "@/components/hover-image";
import { Pager } from "@/components/pager";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useViewPref } from "@/lib/use-view-pref";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import {
  BRAND_ALL, BRAND_NONE, LABEL_ALL, LABEL_NONE, countBy, sortMarketingSkus,
  type MarketingSkuItem, type MarketingSkuLabel, type MarketingSkuListData, type MarketingSkuSort,
} from "@/lib/marketing/sku-list";
import { LabelBadge, LabelManagerModal } from "./label-manager";
import { MarketingSkuGrid } from "./grid-view";
import { VariantCount } from "./variant-count";

const VIEWS = ["table", "grid"] as const;
type View = (typeof VIEWS)[number];
const SORTS: { value: MarketingSkuSort; label: string }[] = [
  { value: "label", label: "เรียง: ตามป้าย" },
  { value: "code", label: "เรียง: รหัส A→Z" },
  { value: "sku_low", label: "เรียง: SKU ที่เหลือน้อยก่อน" },
  { value: "updated", label: "เรียง: แก้ป้าย/หมายเหตุล่าสุด" },
];
const PAGE_SIZES = [50, 100, 200];
const BULK_CONFIRM_AT = 20;     // เปลี่ยนป้ายเกินนี้ → ถามยืนยัน
const BULK_TYPED_AT = 200;      // เกินนี้ → ต้องพิมพ์ CONFIRM
const CHUNK = 500;              // API รับได้ครั้งละ 500 รุ่น

const TAB_KEY = "marketing-skus:brand-tab";
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || BRAND_ALL; } catch { return BRAND_ALL; } };
const saveTab = (v: string) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* ignore */ } };

/** ตัวหน้าจอ (ไม่มีเชลล์) — สิทธิ์ส่งเข้ามาจาก page.tsx */
export function MarketingSkusView({ canManage, canLabels }: { canManage: boolean; canLabels: boolean }) {
  const toast = useToast();

  const [data, setData] = useState<MarketingSkuListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [brandTab, setBrandTab] = useState<string>(BRAND_ALL);
  const [labelFilter, setLabelFilter] = useState<string>(LABEL_ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noteEdit, setNoteEdit] = useState<{ item: MarketingSkuItem; text: string } | null>(null);
  const [bulkAsk, setBulkAsk] = useState<{ ids: string[]; labelId: string | null } | null>(null);
  const [labelMgrOpen, setLabelMgrOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<MarketingSkuSort>("label");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  // มุมมอง ตาราง/การ์ด — สลับแล้วจำเป็นค่าเริ่มต้นของฉัน (ของกลาง useViewPref)
  const { view, setView, saveDefault } = useViewPref<View>("marketing_skus_view", VIEWS, "table");
  const pickView = (v: View) => { setView(v); void saveDefault(v); };
  const { cols, setCols } = useGalleryColumns("marketing-skus", 5);

  useEffect(() => { setBrandTab(readTab()); }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/marketing/skus");
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || "โหลดข้อมูลไม่สำเร็จ"); if (!silent) setData(null); }
      else setData(j.data as MarketingSkuListData);
    } catch {
      setErr("เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const labels = useMemo(() => data?.labels ?? [], [data]);
  const brandMap = useMemo(() => new Map((data?.brands ?? []).map((b) => [b.id, b])), [data]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const labelOrder = useMemo(() => new Map(labels.map((l) => [l.id, l.sort_order])), [labels]);
  const brandKey = useCallback((it: MarketingSkuItem) => (it.brand_id && brandMap.has(it.brand_id) ? it.brand_id : BRAND_NONE), [brandMap]);
  const labelKey = useCallback((it: MarketingSkuItem) => (it.label_id && labelMap.has(it.label_id) ? it.label_id : LABEL_NONE), [labelMap]);

  // แท็บแบรนด์ (เรียงตามจำนวนรุ่นมาก→น้อย) + "ไม่มีแบรนด์" ไว้ท้าย
  const brandCounts = useMemo(() => countBy(items, brandKey), [items, brandKey]);
  const brandTabs = useMemo(() => {
    const tabs = [...brandCounts.keys()].filter((k) => k !== BRAND_NONE)
      .map((id) => ({ key: id, label: brandMap.get(id)?.name ?? "?", color: brandMap.get(id)?.color ?? null }))
      .sort((a, b) => (brandCounts.get(b.key) ?? 0) - (brandCounts.get(a.key) ?? 0) || a.label.localeCompare(b.label, "th"));
    if (brandCounts.has(BRAND_NONE)) tabs.push({ key: BRAND_NONE, label: "ไม่มีแบรนด์", color: null });
    return tabs;
  }, [brandCounts, brandMap]);
  // แท็บที่จำไว้หายไป (เช่น แบรนด์ถูกปิด) → กลับทุกแบรนด์
  useEffect(() => { if (data && brandTab !== BRAND_ALL && !brandCounts.has(brandTab)) setBrandTab(BRAND_ALL); }, [data, brandTab, brandCounts]);

  const inBrand = useMemo(() => (brandTab === BRAND_ALL ? items : items.filter((it) => brandKey(it) === brandTab)), [items, brandTab, brandKey]);
  const labelCounts = useMemo(() => countBy(inBrand, labelKey), [inBrand, labelKey]);
  const filtered = useMemo(() => {
    const byLabel = labelFilter === LABEL_ALL ? inBrand : inBrand.filter((it) => labelKey(it) === labelFilter);
    const t = q.trim().toLowerCase();
    const hit = t ? byLabel.filter((it) => `${it.code} ${it.name} ${it.note ?? ""}`.toLowerCase().includes(t)) : byLabel;
    return sortMarketingSkus(hit, sort, labelOrder);
  }, [inBrand, labelFilter, labelKey, q, sort, labelOrder]);
  const pageRows = useMemo(() => filtered.slice(page * pageSize, (page + 1) * pageSize), [filtered, page, pageSize]);

  // เปลี่ยนแท็บ/ตัวกรอง → ล้างที่ติ๊ก (กันเผลอทำกับแถวที่มองไม่เห็น) · กลับหน้าแรก
  useEffect(() => { setSelected(new Set()); setPage(0); }, [brandTab, labelFilter]);
  useEffect(() => { setPage(0); }, [q, sort, pageSize]);
  const pickTab = (k: string) => { setBrandTab(k); saveTab(k); };

  // ── actions ──
  const patch = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/marketing/skus", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return j.data ?? {};
  };

  const applyLabel = async (ids: string[], label_id: string | null) => {
    setBusy(true);
    let done = 0;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const res = await patch({ parent_sku_ids: ids.slice(i, i + CHUNK), label_id });
        done += Number(res.updated) || 0;
      }
      const set = new Set(ids);
      setData((d) => d && { ...d, items: d.items.map((it) => (set.has(it.parent_sku_id) ? { ...it, label_id, updated_at: new Date().toISOString() } : it)) });
      if (ids.length > 1) { toast.success(`เปลี่ยนป้าย ${done} รุ่นแล้ว`); setSelected(new Set()); }
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}${done ? ` (สำเร็จไปแล้ว ${done} รุ่น)` : ""}`);
    } finally {
      setBusy(false);
      void load(true);
    }
  };
  // รายตัว = ทำเลย · หลายตัวเกินเกณฑ์ = ถามยืนยันก่อน
  const setLabel = (ids: string[], labelId: string | null) => {
    if (ids.length >= BULK_CONFIRM_AT) setBulkAsk({ ids, labelId });
    else void applyLabel(ids, labelId);
  };

  // เปิด/ปิดสี (เฉพาะการตลาด) ในป๊อป → อัปเดตตัวเลข "SKU ที่เหลือ" ของรุ่นนั้นบนจอทันที
  const onActiveChange = useCallback((parentId: string, active: number) => {
    setData((d) => d && { ...d, items: d.items.map((it) => (it.parent_sku_id === parentId ? { ...it, sku_active: active } : it)) });
  }, []);

  const saveNote = async () => {
    if (!noteEdit) return;
    setBusy(true);
    try {
      await patch({ parent_sku_ids: [noteEdit.item.parent_sku_id], note: noteEdit.text });
      toast.success("บันทึกหมายเหตุแล้ว");
      setNoteEdit(null);
      void load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const labelOptions = useMemo(() => [
    { value: "", label: "— ไม่มีป้าย —" },
    ...labels.filter((l) => l.is_active).map((l) => ({ value: l.id, label: l.name, badge: l.icon ?? undefined })),
  ], [labels]);
  const groupOrder = useCallback((name: string) => labels.find((l) => l.name === name)?.sort_order ?? Number.MAX_SAFE_INTEGER, [labels]);

  // ── columns ── (เรียงด้วยเมนู "เรียง" ด้านบน — ใช้ร่วมทุกหน้า/ทั้งการ์ด)
  const columns: MiniColumn<MarketingSkuItem>[] = [
    { key: "img", header: "", width: "3.25rem", cell: (it) => <HoverImage url={r2ImageUrl(it.image_key, 96)} size={40} previewSize={320} rounded="rounded-lg" /> },
    {
      key: "model", header: "รุ่น", width: "minmax(12rem,2fr)",
      cell: (it) => (
        <div className="min-w-0">
          <Link href={`/master/parent-skus?open=${encodeURIComponent(it.parent_sku_id)}`} target="_blank"
            className="text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline">{it.code || "(ไม่มีรหัส)"}</Link>
          <div className="text-xs text-slate-500 truncate" title={it.name}>{it.name}</div>
        </div>
      ),
    },
    ...(brandTab === BRAND_ALL ? [{
      key: "brand", header: "แบรนด์", width: "minmax(7rem,1fr)",
      cell: (it: MarketingSkuItem) => {
        const b = it.brand_id ? brandMap.get(it.brand_id) : undefined;
        return b ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color || "#94a3b8" }} />{b.name}
          </span>
        ) : <span className="text-xs text-slate-400">ไม่มีแบรนด์</span>;
      },
    }] : []),
    { key: "variants", header: "SKU ที่เหลือ", width: "8rem", cell: (it) => <VariantCount parentId={it.parent_sku_id} active={it.sku_active} total={it.sku_total} canManage={canManage} onActiveChange={onActiveChange} /> },
    {
      key: "label", header: "ป้าย", width: "minmax(10rem,1.3fr)",
      cell: (it) => canManage ? (
        <div onClick={(e) => e.stopPropagation()}>
          <SearchableSelect value={it.label_id && labelMap.has(it.label_id) ? it.label_id : ""} options={labelOptions}
            onChange={(v) => { if ((v || null) !== it.label_id) setLabel([it.parent_sku_id], v || null); }}
            disabled={busy} className="w-full" />
        </div>
      ) : <LabelBadge label={it.label_id ? labelMap.get(it.label_id) : undefined} />,
    },
    {
      key: "note", header: "หมายเหตุ", width: "minmax(8rem,1.5fr)",
      cell: (it) => (
        <button type="button" disabled={!canManage} onClick={(e) => { e.stopPropagation(); setNoteEdit({ item: it, text: it.note ?? "" }); }}
          className="w-full text-left text-xs text-slate-600 truncate rounded px-1 py-0.5 enabled:hover:bg-slate-100" title={it.note ?? (canManage ? "เพิ่มหมายเหตุ" : "")}>
          {it.note || (canManage ? <span className="text-slate-300">✏️ เพิ่มหมายเหตุ</span> : "-")}
        </button>
      ),
    },
  ];

  const selIds = [...selected];
  const allFilteredSelected = filtered.length > 0 && filtered.every((it) => selected.has(it.parent_sku_id));
  const emptyText = (
    <div className="py-10 text-center text-sm text-slate-500">
      {q.trim() ? `ไม่พบรุ่นที่ตรงกับ "${q.trim()}" ลองเปลี่ยนคำค้นหา` : "ไม่มีรุ่นในกลุ่มนี้"}
    </div>
  );
  const bulkLabelName = bulkAsk ? (bulkAsk.labelId ? labelMap.get(bulkAsk.labelId)?.name ?? "?" : "ไม่มีป้าย (ล้างป้าย)") : "";

  return (
    <>
      {/* หัวหน้า */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">🎯 SKU การตลาด</h1>
            <p className="text-sm text-slate-500 mt-1">ทุกรุ่นสินค้า แยกตามแบรนด์ · ติดป้ายกลุ่มได้ 1 ป้ายต่อรุ่น</p>
          </div>
          <button type="button" onClick={() => setLabelMgrOpen(true)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">🏷️ {canLabels ? "ตั้งค่าป้าย" : "ดูป้าย"}</button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-4 max-w-6xl mx-auto">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : err && !data ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="text-sm text-red-700">{err}</div>
            <button onClick={() => load()} className="mt-3 rounded-lg border border-red-200 bg-white text-red-700 px-4 py-1.5 text-sm font-medium hover:bg-red-50">ลองใหม่</button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-5xl mb-3">📦</div>
            <h2 className="text-lg font-semibold text-slate-800">ยังไม่มีรุ่นสินค้าที่เปิดใช้งาน</h2>
            <p className="text-sm text-slate-500 mt-1">เพิ่ม/เปิดใช้งาน Parent SKU ที่หน้าสินค้าก่อน แล้วรุ่นจะขึ้นที่นี่อัตโนมัติ</p>
          </div>
        ) : (
          <>
            {/* แท็บแบรนด์ */}
            <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 -mx-4 px-4 sm:mx-0 sm:px-0">
              {[{ key: BRAND_ALL, label: "ทุกแบรนด์", color: null as string | null }, ...brandTabs].map((t) => {
                const on = brandTab === t.key;
                const n = t.key === BRAND_ALL ? items.length : brandCounts.get(t.key) ?? 0;
                return (
                  <button key={t.key} type="button" onClick={() => pickTab(t.key)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-sm border-b-2 -mb-px transition-colors ${on ? "border-blue-600 text-blue-700 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                    {t.color && <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />}
                    {t.label}
                    <span className={`rounded-full px-1.5 text-[11px] ${on ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{n.toLocaleString("th-TH")}</span>
                  </button>
                );
              })}
            </div>

            {/* ชิปกรองป้าย + สลับมุมมอง */}
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {[{ key: LABEL_ALL, l: undefined as MarketingSkuLabel | undefined, text: "ทั้งหมด", n: inBrand.length },
                  ...labels.map((l) => ({ key: l.id, l, text: l.name, n: labelCounts.get(l.id) ?? 0 })),
                  { key: LABEL_NONE, l: undefined, text: "ยังไม่มีป้าย", n: labelCounts.get(LABEL_NONE) ?? 0 },
                ].filter((c) => c.key === LABEL_ALL || c.n > 0 || labelFilter === c.key || (c.l && c.l.is_active)).map((c) => {
                  const on = labelFilter === c.key;
                  return (
                    <button key={c.key} type="button" onClick={() => setLabelFilter(c.key)}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
                      {c.l && <span className="w-2 h-2 rounded-full" style={{ background: c.l.color }} />}
                      {c.l?.icon && <span>{c.l.icon}</span>}
                      {c.text}
                      <span className={on ? "text-slate-300" : "text-slate-400"}>{c.n.toLocaleString("th-TH")}</span>
                    </button>
                  );
                })}
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="มุมมอง">
                {([["table", "☰ ตาราง"], ["grid", "▦ การ์ด"]] as const).map(([v, text]) => (
                  <button key={v} type="button" onClick={() => pickView(v)} aria-pressed={view === v}
                    className={`h-7 rounded-md px-2.5 text-xs font-medium transition ${view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{text}</button>
                ))}
              </div>
            </div>

            {/* ค้นหา / เรียง (ใช้ร่วมตาราง+การ์ด) */}
            <div className="flex flex-wrap items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหารหัส / ชื่อรุ่น / หมายเหตุ…"
                className="h-9 w-full sm:w-72 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={sort} onChange={(e) => setSort(e.target.value as MarketingSkuSort)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="text-xs text-slate-400">{filtered.length.toLocaleString("th-TH")} รุ่น</span>
              {view === "grid" && <GalleryColumnsControl cols={cols} onChange={setCols} className="ml-auto hidden sm:inline-flex" />}
            </div>

            {view === "grid" ? (
              <MarketingSkuGrid
                rows={pageRows} cols={cols} grouped={sort === "label"} labels={labels} labelMap={labelMap} brandMap={brandMap} showBrand={brandTab === BRAND_ALL}
                canManage={canManage} busy={busy} labelOptions={labelOptions} selected={selected} onSelectedChange={setSelected}
                onSetLabel={setLabel} onEditNote={(it) => setNoteEdit({ item: it, text: it.note ?? "" })} onActiveChange={onActiveChange} emptyText={emptyText} />
            ) : (
              <MiniTable<MarketingSkuItem>
                rows={pageRows}
                columns={columns}
                rowKey={(it) => it.parent_sku_id}
                groupBy={sort === "label" ? (it) => labelMap.get(it.label_id ?? "")?.name ?? "ยังไม่มีป้าย" : undefined}
                groupLabel="ป้าย"
                groupOrder={groupOrder}
                selectable={canManage}
                selected={selected}
                onSelectedChange={setSelected}
                countUnit="รุ่น"
                storageKey="marketing-skus"
                resizable
                emptyText={emptyText}
              />
            )}

            {filtered.length > PAGE_SIZES[0] && (
              <Pager page={page} pageSize={pageSize} total={filtered.length} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                unitLabel="รุ่น" onPageSize={setPageSize} pageSizes={PAGE_SIZES} />
            )}

            {/* แถบคำสั่งหลายรายการ — ลอยติดขอบล่างจอ (ของกลาง) */}
            {canManage && (
              <BulkActionBar count={selIds.length} unit="รุ่น" onClear={() => setSelected(new Set())}
                extra={!allFilteredSelected && filtered.length > selIds.length ? (
                  <button type="button" onClick={() => setSelected(new Set(filtered.map((it) => it.parent_sku_id)))}
                    className="underline underline-offset-2 hover:text-white">เลือกทั้งหมด {filtered.length.toLocaleString("th-TH")} รุ่นที่กรองอยู่</button>
                ) : null}>
                <span className="text-xs text-slate-300">เปลี่ยนป้ายเป็น</span>
                <div className="w-52 text-slate-800">
                  <SearchableSelect value="__pick" options={[{ value: "__pick", label: "— เลือกป้าย —" }, ...labelOptions]}
                    onChange={(v) => { if (v !== "__pick") setLabel(selIds, v || null); }} disabled={busy} />
                </div>
              </BulkActionBar>
            )}
          </>
        )}
      </div>

      {/* หมายเหตุ */}
      <ERPModal open={!!noteEdit} onClose={() => !busy && setNoteEdit(null)} title={`หมายเหตุ — ${noteEdit?.item.code ?? ""}`} size="sm"
        hasUnsavedChanges={!!noteEdit && (noteEdit.text ?? "") !== (noteEdit.item.note ?? "")}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={() => setNoteEdit(null)} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={saveNote} disabled={busy} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        }>
        <textarea value={noteEdit?.text ?? ""} onChange={(e) => setNoteEdit((n) => n && { ...n, text: e.target.value })} rows={4} maxLength={500} autoFocus
          placeholder="เช่น ดันช่วง 11.11, รอรูปใหม่, ราคาโปร ฿590"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="text-right text-[11px] text-slate-400">{(noteEdit?.text ?? "").length}/500 · ลบข้อความทั้งหมดแล้วบันทึก = ลบหมายเหตุ</div>
      </ERPModal>

      {/* ยืนยันเปลี่ยนป้ายหลายรุ่น */}
      <ConfirmDialog open={!!bulkAsk} onClose={() => setBulkAsk(null)} loading={busy}
        onConfirm={async () => { if (bulkAsk) { await applyLabel(bulkAsk.ids, bulkAsk.labelId); setBulkAsk(null); } }}
        variant={bulkAsk && bulkAsk.ids.length >= BULK_TYPED_AT ? "danger" : "default"}
        requireTyped={bulkAsk && bulkAsk.ids.length >= BULK_TYPED_AT ? "CONFIRM" : undefined}
        title={`เปลี่ยนป้าย ${bulkAsk?.ids.length.toLocaleString("th-TH") ?? 0} รุ่น?`}
        message={`ทุกรุ่นที่เลือกจะถูกตั้งป้ายเป็น "${bulkLabelName}" (ป้ายเดิมจะถูกแทนที่ · มีประวัติให้ย้อนดูได้)`}
        confirmText="เปลี่ยนป้าย" />

      <LabelManagerModal open={labelMgrOpen} onClose={() => setLabelMgrOpen(false)} labels={labels} canEdit={canLabels}
        onChanged={() => load(true)} />
    </>
  );
}
