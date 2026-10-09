"use client";

/**
 * 🎯 SKU การตลาด (ตัวหน้าจอ) — รายการ "รุ่น" (Parent SKU) ที่ทีมการตลาดเลือกทำตลาด
 *   - แยกแท็บตามแบรนด์ (แบรนด์อ่านจาก Parent SKU)
 *   - ติดป้ายได้ 1 ป้ายต่อรุ่น (Hero / Clearance / Accessories … ตั้งค่าเพิ่มได้)
 *   - ครั้งแรกหน้าว่าง → ปุ่ม "เลือกสินค้าที่จะทำการตลาด"
 * ของกลางที่ใช้: MiniTable · ParentSkuMultiPickerModal · ERPModal/ConfirmDialog · SearchableSelect · HoverImage · Toast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ParentSkuMultiPickerModal, type ParentSkuPick } from "@/components/parent-sku-multi-picker";
import { SearchableSelect } from "@/components/searchable-select";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useViewPref } from "@/lib/use-view-pref";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import {
  BRAND_ALL, BRAND_NONE, LABEL_ALL, LABEL_NONE, countBy,
  variantSummary, type MarketingSkuItem, type MarketingSkuLabel, type MarketingSkuListData,
} from "@/lib/marketing/sku-list";
import { LabelBadge, LabelManagerModal } from "./label-manager";
import { MarketingSkuGrid } from "./grid-view";
import { VariantCount } from "./variant-count";

const VIEWS = ["table", "grid"] as const;
type View = (typeof VIEWS)[number];

const TAB_KEY = "marketing-skus:brand-tab";
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || BRAND_ALL; } catch { return BRAND_ALL; } };
const saveTab = (v: string) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* ignore */ } };

function thaiDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** ตัวหน้าจอ (ไม่มีเชลล์) — สิทธิ์ส่งเข้ามาจาก page.tsx */
export function MarketingSkusView({ canManage, canLabels }: { canManage: boolean; canLabels: boolean }) {
  const toast = useToast();

  const [data, setData] = useState<MarketingSkuListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [brandTab, setBrandTab] = useState<string>(BRAND_ALL);
  const [labelFilter, setLabelFilter] = useState<string>(LABEL_ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPicks, setPendingPicks] = useState<ParentSkuPick[] | null>(null);   // เลือกจาก picker แล้ว รอเลือกป้าย
  const [pendingLabel, setPendingLabel] = useState<string>("");
  const [removeIds, setRemoveIds] = useState<string[] | null>(null);
  const [noteEdit, setNoteEdit] = useState<{ item: MarketingSkuItem; text: string } | null>(null);
  const [labelMgrOpen, setLabelMgrOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");                                   // คำค้นใช้ร่วมกันทั้งตาราง/การ์ด
  const [gridSort, setGridSort] = useState<"recent" | "code">("recent");
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
  const brandKey = useCallback((it: MarketingSkuItem) => (it.brand_id && brandMap.has(it.brand_id) ? it.brand_id : BRAND_NONE), [brandMap]);
  const labelKey = (it: MarketingSkuItem) => (it.label_id && labelMap.has(it.label_id) ? it.label_id : LABEL_NONE);

  // แท็บแบรนด์ = เฉพาะแบรนด์ที่มีสินค้าในรายการ (+ แท็บที่เลือกค้างไว้ แม้ยังว่าง)
  const brandCounts = useMemo(() => countBy(items, brandKey), [items, brandKey]);
  const brandTabs = useMemo(() => {
    const ids = [...brandCounts.keys()].filter((k) => k !== BRAND_NONE);
    if (brandTab !== BRAND_ALL && brandTab !== BRAND_NONE && brandMap.has(brandTab) && !ids.includes(brandTab)) ids.push(brandTab);
    const tabs = ids.map((id) => ({ key: id, label: brandMap.get(id)?.name ?? "?", color: brandMap.get(id)?.color ?? null }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
    if (brandCounts.has(BRAND_NONE) || brandTab === BRAND_NONE) tabs.push({ key: BRAND_NONE, label: "ไม่มีแบรนด์", color: null });
    return tabs;
  }, [brandCounts, brandMap, brandTab]);

  const inBrand = useMemo(() => (brandTab === BRAND_ALL ? items : items.filter((it) => brandKey(it) === brandTab)), [items, brandTab, brandKey]);
  const labelCounts = useMemo(() => countBy(inBrand, labelKey), [inBrand, labelMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (labelFilter === LABEL_ALL ? inBrand : inBrand.filter((it) => labelKey(it) === labelFilter)), [inBrand, labelFilter, labelMap]); // eslint-disable-line react-hooks/exhaustive-deps
  // มุมมองการ์ด: กรองด้วยคำค้น + เรียงเอง (ตารางทำในตัว MiniTable)
  const gridRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = t ? rows.filter((it) => `${it.code} ${it.name} ${it.note ?? ""}`.toLowerCase().includes(t)) : rows;
    return gridSort === "code" ? [...hit].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true })) : hit;
  }, [rows, q, gridSort]);

  // เปลี่ยนแท็บ/ตัวกรอง → ล้างที่ติ๊กไว้ (กันเผลอทำกับแถวที่มองไม่เห็น)
  useEffect(() => { setSelected(new Set()); }, [brandTab, labelFilter]);
  const pickTab = (k: string) => { setBrandTab(k); saveTab(k); };

  // ── actions ──
  const call = async (method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return null; }
      return j.data ?? {};
    } catch { toast.error("เชื่อมต่อไม่ได้ กรุณาลองใหม่"); return null; }
    finally { setBusy(false); }
  };

  const confirmAdd = async () => {
    if (!pendingPicks?.length) return;
    const res = await call("POST", "/api/marketing/skus", { parent_sku_ids: pendingPicks.map((p) => p.id), label_id: pendingLabel || null });
    if (!res) return;
    toast.success(`เพิ่ม ${res.added} รุ่นเข้ารายการแล้ว${res.skipped ? ` (มีอยู่แล้ว ${res.skipped})` : ""}`);
    setPendingPicks(null);
    void load(true);
  };

  const setLabel = async (ids: string[], label_id: string | null) => {
    const res = await call("PATCH", "/api/marketing/skus", { ids, label_id });
    if (!res) return;
    // อัปเดตบนจอทันที ไม่ต้องรอโหลดใหม่
    setData((d) => d && { ...d, items: d.items.map((it) => (ids.includes(it.id) ? { ...it, label_id } : it)) });
    if (ids.length > 1) { toast.success(`เปลี่ยนป้าย ${ids.length} รายการแล้ว`); setSelected(new Set()); }
    void load(true);
  };

  const saveNote = async () => {
    if (!noteEdit) return;
    const res = await call("PATCH", "/api/marketing/skus", { ids: [noteEdit.item.id], note: noteEdit.text });
    if (!res) return;
    toast.success("บันทึกหมายเหตุแล้ว");
    setNoteEdit(null);
    void load(true);
  };

  const doRemove = async () => {
    if (!removeIds?.length) return;
    const res = await call("DELETE", `/api/marketing/skus?ids=${removeIds.join(",")}`);
    if (!res) return;
    toast.success(`เอาออก ${res.removed} รายการแล้ว`);
    setRemoveIds(null);
    setSelected(new Set());
    void load(true);
  };

  const openPicker = () => setPickerOpen(true);
  const onPicked = (picks: ParentSkuPick[]) => {
    setPickerOpen(false);
    if (!picks.length) return;
    setPendingLabel(labelFilter !== LABEL_ALL && labelFilter !== LABEL_NONE ? labelFilter : "");
    setPendingPicks(picks);
  };
  const pickerBrand = brandTab === BRAND_ALL ? null : brandTab === BRAND_NONE ? "none" : brandTab;
  const pickerTitle = brandTab === BRAND_ALL ? "เลือกรุ่นที่จะทำการตลาด"
    : `เลือกรุ่นที่จะทำการตลาด — ${brandTab === BRAND_NONE ? "ไม่มีแบรนด์" : brandMap.get(brandTab)?.name ?? ""}`;

  // จัดกลุ่มตามลำดับป้าย (ตั้งในหน้าตั้งค่าป้าย) · "ยังไม่มีป้าย" ไว้ท้าย
  const groupOrder = useCallback((name: string) => labels.find((l) => l.name === name)?.sort_order ?? Number.MAX_SAFE_INTEGER, [labels]);

  const labelOptions = useMemo(() => [
    { value: "", label: "— ไม่มีป้าย —" },
    ...labels.filter((l) => l.is_active).map((l) => ({ value: l.id, label: l.name, badge: l.icon ?? undefined })),
  ], [labels]);

  // ── columns ──
  const columns: MiniColumn<MarketingSkuItem>[] = [
    {
      key: "img", header: "", width: "3.25rem",
      cell: (it) => <HoverImage url={r2ImageUrl(it.image_key, 96)} size={40} previewSize={320} rounded="rounded-lg" />,
    },
    {
      key: "model", header: "รุ่น", width: "minmax(12rem,2fr)", sortValue: (it) => it.code,
      cell: (it) => (
        <div className="min-w-0">
          <Link href={`/master/parent-skus?open=${encodeURIComponent(it.parent_sku_id)}`} target="_blank"
            className="text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline">{it.code || "(ไม่มีรหัส)"}</Link>
          {!it.is_active && <span className="ml-1.5 rounded bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px]">ปิดใช้งาน</span>}
          <div className="text-xs text-slate-500 truncate" title={it.name}>{it.name}</div>
        </div>
      ),
    },
    ...(brandTab === BRAND_ALL ? [{
      key: "brand", header: "แบรนด์", width: "minmax(7rem,1fr)",
      sortValue: (it: MarketingSkuItem) => brandMap.get(it.brand_id ?? "")?.name ?? "",
      cell: (it: MarketingSkuItem) => {
        const b = it.brand_id ? brandMap.get(it.brand_id) : undefined;
        return b ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color || "#94a3b8" }} />{b.name}
          </span>
        ) : <span className="text-xs text-slate-400">ไม่มีแบรนด์</span>;
      },
    }] : []),
    {
      key: "variants", header: "SKU ที่เหลือ", width: "7.5rem", sortLabel: "SKU ที่เหลือ (น้อย→มาก)",
      sortValue: (it) => { const s = variantSummary(it.variants); return s.active * 1000 + s.total; },
      cell: (it) => <VariantCount variants={it.variants} />,
    },
    {
      key: "label", header: "ป้าย", width: "minmax(10rem,1.3fr)",
      sortValue: (it) => labelMap.get(it.label_id ?? "")?.sort_order ?? 99999,
      cell: (it) => canManage ? (
        <div onClick={(e) => e.stopPropagation()}>
          <SearchableSelect value={it.label_id && labelMap.has(it.label_id) ? it.label_id : ""} options={labelOptions}
            onChange={(v) => { if ((v || null) !== it.label_id) void setLabel([it.id], v || null); }}
            disabled={busy} className="w-full" />
        </div>
      ) : <LabelBadge label={it.label_id ? labelMap.get(it.label_id) : undefined} />,
    },
    {
      key: "note", header: "หมายเหตุ", width: "minmax(8rem,1.5fr)", sortValue: (it) => it.note ?? "",
      cell: (it) => (
        <button type="button" disabled={!canManage} onClick={(e) => { e.stopPropagation(); setNoteEdit({ item: it, text: it.note ?? "" }); }}
          className="w-full text-left text-xs text-slate-600 truncate rounded px-1 py-0.5 enabled:hover:bg-slate-100" title={it.note ?? (canManage ? "เพิ่มหมายเหตุ" : "")}>
          {it.note || (canManage ? <span className="text-slate-300">✏️ เพิ่มหมายเหตุ</span> : "-")}
        </button>
      ),
    },
    { key: "added", header: "เพิ่มเมื่อ", width: "6.5rem", align: "right", sortValue: (it) => it.created_at, cell: (it) => <span className="text-xs text-slate-500">{thaiDate(it.created_at)}</span> },
    ...(canManage ? [{
      key: "act", header: "", width: "2.75rem", align: "center" as const,
      cell: (it: MarketingSkuItem) => (
        <button type="button" title="เอาออกจากรายการการตลาด" onClick={(e) => { e.stopPropagation(); setRemoveIds([it.id]); }}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">🗑</button>
      ),
    }] : []),
  ];

  const selIds = [...selected];
  const hasItems = items.length > 0;

  return (
    <>
      {/* หัวหน้า */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">🎯 SKU การตลาด</h1>
            <p className="text-sm text-slate-500 mt-1">รุ่นสินค้าที่เลือกทำการตลาด แยกตามแบรนด์ · ติดป้ายกลุ่มได้ 1 ป้ายต่อรุ่น</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLabelMgrOpen(true)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">🏷️ {canLabels ? "ตั้งค่าป้าย" : "ดูป้าย"}</button>
            {canManage && hasItems && (
              <button type="button" onClick={openPicker}
                className="h-9 rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700">＋ เลือกสินค้า</button>
            )}
          </div>
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
        ) : !hasItems ? (
          // ── ครั้งแรก: ยังไม่ได้เลือกสินค้า ──
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-5xl mb-3">🎯</div>
            <h2 className="text-lg font-semibold text-slate-800">ยังไม่ได้เลือกสินค้าที่จะทำการตลาด</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              เลือก &quot;รุ่น&quot; สินค้าที่ทีมจะดันขาย ระบบจะแยกให้ตามแบรนด์อัตโนมัติ แล้วติดป้ายเช่น Hero / Clearance / Accessories ได้
            </p>
            {canManage ? (
              <button type="button" onClick={openPicker}
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">＋ เลือกสินค้าที่จะทำการตลาด</button>
            ) : (
              <p className="mt-4 text-xs text-slate-400">คุณไม่มีสิทธิ์เพิ่มสินค้าในรายการ ติดต่อผู้ดูแลระบบ</p>
            )}
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
                    <span className={`rounded-full px-1.5 text-[11px] ${on ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{n}</span>
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
                    <span className={on ? "text-slate-300" : "text-slate-400"}>{c.n}</span>
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

            {/* แถบทำหลายรายการ */}
            {canManage && selIds.length > 0 && (
              <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm">
                <span className="text-sm font-medium text-blue-800">เลือกไว้ {selIds.length} รายการ</span>
                <span className="text-xs text-blue-700/70">เปลี่ยนป้ายเป็น</span>
                <div className="w-52">
                  <SearchableSelect value="__pick" options={[{ value: "__pick", label: "— เลือกป้าย —" }, ...labelOptions]}
                    onChange={(v) => { if (v !== "__pick") void setLabel(selIds, v || null); }} disabled={busy} />
                </div>
                <button type="button" onClick={() => setRemoveIds(selIds)} disabled={busy}
                  className="h-8 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-600 hover:bg-red-50">🗑 เอาออก</button>
                <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-700 hover:underline">ล้างที่เลือก</button>
              </div>
            )}

            {view === "grid" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหารหัส / ชื่อรุ่น / หมายเหตุ…"
                    className="h-9 w-full sm:w-72 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <select value={gridSort} onChange={(e) => setGridSort(e.target.value as "recent" | "code")}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
                    <option value="recent">เรียง: เพิ่มล่าสุดก่อน</option>
                    <option value="code">เรียง: รหัส A→Z</option>
                  </select>
                  <span className="text-xs text-slate-400">{gridRows.length} รุ่น</span>
                  <GalleryColumnsControl cols={cols} onChange={setCols} className="ml-auto hidden sm:inline-flex" />
                </div>
                <MarketingSkuGrid
                  rows={gridRows} cols={cols} labels={labels} labelMap={labelMap} brandMap={brandMap} showBrand={brandTab === BRAND_ALL}
                  canManage={canManage} busy={busy} labelOptions={labelOptions} selected={selected} onSelectedChange={setSelected}
                  onSetLabel={(ids, lb) => void setLabel(ids, lb)} onEditNote={(it) => setNoteEdit({ item: it, text: it.note ?? "" })}
                  onRemove={(ids) => setRemoveIds(ids)}
                  emptyText={
                    <div className="py-8 text-center">
                      <div className="text-sm text-slate-500">{q.trim() ? `ไม่พบรุ่นที่ตรงกับ "${q.trim()}" ลองเปลี่ยนคำค้นหา` : "ยังไม่มีสินค้าในกลุ่มนี้"}</div>
                      {canManage && !q.trim() && <button type="button" onClick={openPicker} className="mt-2 text-sm text-blue-600 hover:underline">＋ เลือกสินค้าเพิ่ม</button>}
                    </div>
                  } />
              </>
            ) : (
            <MiniTable<MarketingSkuItem>
              rows={rows}
              searchValue={q}
              onSearchChange={setQ}
              columns={columns}
              rowKey={(it) => it.id}
              searchText={(it) => `${it.code} ${it.name} ${it.note ?? ""} ${labelMap.get(it.label_id ?? "")?.name ?? ""}`}
              searchPlaceholder="ค้นหารหัส / ชื่อรุ่น / หมายเหตุ…"
              groupBy={(it) => labelMap.get(it.label_id ?? "")?.name ?? "ยังไม่มีป้าย"}
              groupLabel="ป้าย"
              groupOrder={groupOrder}
              selectable={canManage}
              selected={selected}
              onSelectedChange={setSelected}
              countUnit="รุ่น"
              storageKey="marketing-skus"
              resizable
              emptyText={
                <div className="py-8 text-center">
                  <div className="text-sm text-slate-500">ยังไม่มีสินค้าในกลุ่มนี้</div>
                  {canManage && <button type="button" onClick={openPicker} className="mt-2 text-sm text-blue-600 hover:underline">＋ เลือกสินค้าเพิ่ม</button>}
                </div>
              }
              noMatchText={(t) => `ไม่พบรุ่นที่ตรงกับ "${t}" ลองเปลี่ยนคำค้นหา`}
            />
            )}
          </>
        )}
      </div>

      {/* เลือกรุ่น (ของกลาง) */}
      <ParentSkuMultiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onConfirm={onPicked}
        excludeCodes={items.map((it) => it.code)} title={pickerTitle} brandId={pickerBrand} />

      {/* หลังเลือกรุ่น → เลือกป้ายก่อนเพิ่ม */}
      <ERPModal open={!!pendingPicks} onClose={() => !busy && setPendingPicks(null)} title={`เพิ่ม ${pendingPicks?.length ?? 0} รุ่นเข้ารายการการตลาด`} size="sm"
        description="เลือกป้ายให้รุ่นที่เพิ่มรอบนี้ (เปลี่ยนทีหลังได้)"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={() => setPendingPicks(null)} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={confirmAdd} disabled={busy} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังเพิ่ม…" : "เพิ่มเข้ารายการ"}</button>
          </div>
        }>
        <div className="space-y-1.5">
          {[{ id: "", name: "ยังไม่ติดป้าย", icon: null, color: "#cbd5e1" } as Pick<MarketingSkuLabel, "id" | "name" | "icon" | "color">,
            ...labels.filter((l) => l.is_active)].map((l) => (
            <label key={l.id || "none"} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${pendingLabel === l.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <input type="radio" name="pending-label" checked={pendingLabel === l.id} onChange={() => setPendingLabel(l.id)} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
              <span className="text-sm text-slate-700">{l.icon ? `${l.icon} ` : ""}{l.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {pendingPicks?.map((p) => p.code).join(" · ")}
        </div>
      </ERPModal>

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

      {/* ยืนยันเอาออก */}
      <ConfirmDialog open={!!removeIds} onClose={() => setRemoveIds(null)} onConfirm={doRemove} loading={busy} variant="danger"
        title="เอาออกจากรายการการตลาด?"
        message={`จะเอา ${removeIds?.length ?? 0} รุ่นออกจากรายการการตลาด (ป้ายและหมายเหตุของรุ่นเหล่านี้จะหายไป) — ตัวสินค้าในระบบไม่ถูกลบ เพิ่มกลับเข้ามาใหม่ได้ตลอด`}
        confirmText="เอาออก" />

      <LabelManagerModal open={labelMgrOpen} onClose={() => setLabelMgrOpen(false)} labels={labels} canEdit={canLabels}
        onChanged={() => load(true)} />
    </>
  );
}
