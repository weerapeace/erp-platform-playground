"use client";

/**
 * SkuMultiPickerModal — ของกลาง: เลือกสินค้า (SKU) ได้หลายตัวพร้อมกันด้วย checkbox
 *
 * ใช้เมื่อ: ต้องการ "เพิ่มสินค้าหลายตัวรวดเดียว" (สะดวกกว่า SkuPicker แบบเลือกทีละตัว)
 * - ค้นหาผ่าน /api/pickers/skus (ของกลาง)
 * - excludeIds: ซ่อน/กันเลือกซ้ำกับที่มีอยู่แล้ว
 * - onConfirm คืน SkuPickerValue[] ที่เลือก
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import type { SkuPickerValue } from "@/components/pickers";

const imgUrl = (key: string | null | undefined) =>
  key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null;

const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// มิติ sort/group/filter กลาง (นิยามครั้งเดียว ใช้ทุกที่ที่เรียก picker — ไม่ hardcode รายหน้า)
type DimKey = "name" | "code" | "list_price" | "category" | "color" | "uom_name" | "sale_ok";
const SORT_DIMS: { k: DimKey; label: string }[] = [
  { k: "code", label: "รหัส" }, { k: "name", label: "ชื่อ" }, { k: "list_price", label: "ราคา" },
];
const GROUP_DIMS: { k: DimKey; label: string }[] = [
  { k: "category", label: "หมวด" }, { k: "color", label: "สี" }, { k: "uom_name", label: "หน่วย" }, { k: "sale_ok", label: "สถานะขาย" },
];
const FILTER_DIMS = GROUP_DIMS;
// ค่าของมิติ (ใช้ทั้ง group/filter/sort) — null → ป้าย "ไม่ระบุ"
const dimVal = (s: SkuPickerValue, k: DimKey): string => {
  if (k === "category") return s.category ?? "(ไม่มีหมวด)";
  if (k === "color")    return s.color ?? "(ไม่ระบุสี)";
  if (k === "uom_name") return s.uom_name ?? "(ไม่มีหน่วย)";
  if (k === "sale_ok")  return s.sale_ok ? "ขายได้" : "ไม่ขาย";
  if (k === "list_price") return String(s.list_price ?? 0);
  return String((s as Record<string, unknown>)[k] ?? "");
};

export function SkuMultiPickerModal({
  open, onClose, onConfirm, excludeIds = [], salesOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (skus: SkuPickerValue[]) => void;
  excludeIds?: string[];
  salesOnly?: boolean;
}) {
  const PAGE = 40;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuPickerValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);   // จำนวนทั้งหมดที่ตรงเงื่อนไข (จาก server)
  // sort / group / filter (ทำบนรายการที่โหลดมา — มิตินิยามกลางในตัวนี้ ไม่ hardcode รายหน้า)
  const [sortKey, setSortKey] = useState<DimKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupKey, setGroupKey] = useState<DimKey | "">("");
  const [filterField, setFilterField] = useState<DimKey | "">("");
  const [filterValue, setFilterValue] = useState("");
  // เก็บ object เต็มของตัวที่เลือก (ค้นหาแล้วเปลี่ยนคำ ผลลัพธ์หาย แต่ยังจำที่เลือกไว้)
  const [picked, setPicked] = useState<Map<string, SkuPickerValue>>(new Map());

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  // ค่าที่เลือกได้ในตัวกรอง (โหลดจากทั้งฐานข้อมูล ครั้งเดียวตอนเปิด)
  const [facets, setFacets] = useState<{ categories: string[]; colors: string[]; uoms: string[] }>({ categories: [], colors: [], uoms: [] });

  // map sort/filter ของ UI → query params ของ API (server-side)
  const buildParams = useCallback((q: string, off: number) => {
    const params = new URLSearchParams({ search: q, limit: String(PAGE), offset: String(off) });
    if (salesOnly) params.set("sales_only", "true");
    params.set("sort", sortKey === "list_price" ? "price" : sortKey === "name" ? "name" : "code");
    params.set("dir", sortDir);
    if (filterField && filterValue) {
      if (filterField === "sale_ok") params.set("sale_ok", filterValue === "ขายได้" ? "true" : "false");
      else if (filterField === "category") params.set("category", filterValue);
      else if (filterField === "color") params.set("color", filterValue);
      else if (filterField === "uom_name") params.set("uom", filterValue);
    }
    return params;
  }, [salesOnly, sortKey, sortDir, filterField, filterValue]);

  // off=0 → โหลดใหม่ (แทนที่) · off>0 → โหลดเพิ่ม (ต่อท้าย)
  const fetchPage = useCallback(async (q: string, off: number) => {
    if (off > 0) setLoadingMore(true); else setLoading(true);
    try {
      const res = await apiFetch(`/api/pickers/skus?${buildParams(q, off)}`);
      const j = await res.json();
      const rows = (j.data ?? []) as SkuPickerValue[];
      setResults((prev) => (off > 0 ? [...prev, ...rows] : rows));
      setTotal(Number(j.total ?? rows.length));
      setHasMore(rows.length === PAGE);
      setOffset(off + rows.length);
    } catch { if (off === 0) setResults([]); }
    finally { if (off > 0) setLoadingMore(false); else setLoading(false); }
  }, [buildParams]);

  // โหลด/รีโหลด (offset 0) เมื่อ เปิด / คำค้น / เรียง / กรอง เปลี่ยน — server จัดการให้ทั้งฐาน
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchPage(query, 0), 250);
    return () => clearTimeout(t);
  }, [open, query, fetchPage]);

  // โหลด facets ครั้งเดียวตอนเปิด (ค่าตัวกรองจากทั้งฐานข้อมูล)
  useEffect(() => {
    if (!open) return;
    apiFetch("/api/pickers/skus?facets=1").then((r) => r.json())
      .then((j) => { if (!j.error) setFacets({ categories: j.categories ?? [], colors: j.colors ?? [], uoms: j.uoms ?? [] }); })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) { setQuery(""); setPicked(new Map()); setSortKey("name"); setSortDir("asc"); setGroupKey(""); setFilterField(""); setFilterValue(""); }
  }, [open]);

  const toggle = (sku: SkuPickerValue) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(sku.id)) next.delete(sku.id); else next.set(sku.id, sku);
      return next;
    });
  };

  // ตัวที่เลือกได้ในหน้านี้ (ไม่นับตัวที่เพิ่มแล้ว) + สถานะ "เลือกครบหน้า"
  const selectable = results.filter((s) => !excluded.has(s.id));
  const allOnPagePicked = selectable.length > 0 && selectable.every((s) => picked.has(s.id));
  const toggleAll = () => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (allOnPagePicked) selectable.forEach((s) => next.delete(s.id));
      else selectable.forEach((s) => next.set(s.id, s));
      return next;
    });
  };

  // server กรอง/เรียงมาแล้ว — ฝั่ง client แค่ตัดตัวที่เพิ่มแล้วออก แล้วจัดกลุ่ม
  const processed = selectable;

  // ค่าให้เลือกในตัวกรอง — มาจาก facets (ทั้งฐานข้อมูล) ไม่ใช่แค่ที่โหลด
  const filterValues = useMemo(() => {
    if (filterField === "category") return facets.categories;
    if (filterField === "color") return facets.colors;
    if (filterField === "uom_name") return facets.uoms;
    if (filterField === "sale_ok") return ["ขายได้", "ไม่ขาย"];
    return [];
  }, [filterField, facets]);

  // จัดกลุ่ม → [ป้ายกลุ่ม, รายการ][]  (ไม่จัดกลุ่ม = กลุ่มเดียวป้ายว่าง)
  const groups = useMemo<[string, SkuPickerValue[]][]>(() => {
    if (!groupKey) return [["", processed]];
    const m = new Map<string, SkuPickerValue[]>();
    for (const s of processed) { const k = dimVal(s, groupKey); (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    return [...m.entries()];
  }, [processed, groupKey]);

  const toggleGroupPick = (items: SkuPickerValue[]) => {
    const allPicked = items.length > 0 && items.every((s) => picked.has(s.id));
    setPicked((prev) => {
      const next = new Map(prev);
      if (allPicked) items.forEach((s) => next.delete(s.id)); else items.forEach((s) => next.set(s.id, s));
      return next;
    });
  };

  const confirm = () => {
    if (picked.size === 0) return;
    onConfirm(Array.from(picked.values()));
    onClose();
  };

  const renderItem = (sku: SkuPickerValue) => {
    const isExcluded = excluded.has(sku.id);
    const checked = picked.has(sku.id);
    return (
      <li key={sku.id}>
        <button type="button" disabled={isExcluded} onClick={() => toggle(sku)}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left ${isExcluded ? "opacity-40 cursor-not-allowed" : checked ? "bg-pink-50" : "hover:bg-pink-50/50"}`}>
          <input type="checkbox" checked={checked} readOnly disabled={isExcluded}
            className="rounded border-pink-300 text-pink-500 pointer-events-none flex-shrink-0" />
          {imgUrl(sku.image_key)
            ? <img src={imgUrl(sku.image_key)!} alt="" className="w-9 h-9 rounded-lg object-cover border border-pink-100 flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            : <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center text-pink-200 text-sm flex-shrink-0">🖼️</div>}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-700 truncate">{sku.name}</div>
            <div className="font-mono text-xs text-slate-400">{sku.code}{isExcluded ? " · เพิ่มแล้ว" : ""}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-semibold text-rose-600">฿{money(sku.list_price)}</div>
            <div className="text-[11px] text-slate-400">{sku.uom_name ?? ""}</div>
          </div>
        </button>
      </li>
    );
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="เลือกสินค้า"
      description="ติ๊กเลือกได้หลายรายการ แล้วกดเพิ่ม"
      footer={
        <>
          <span className="mr-auto text-xs text-rose-500">เลือกแล้ว {picked.size} รายการ</span>
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={confirm} disabled={picked.size === 0}
            className="h-9 px-5 text-sm font-medium bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 disabled:opacity-50">
            เพิ่ม {picked.size > 0 ? `${picked.size} ` : ""}รายการ
          </button>
        </>
      }>
      <div className="space-y-3">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 ค้นหา SKU / ชื่อสินค้า..."
          className="h-10 w-full rounded-lg border border-pink-200 px-3 text-sm outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-100" />

        {/* แถบ จัดกลุ่ม / เรียง / กรอง (ทำบนรายการที่โหลดมา) */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400">🗂</span>
          <select value={groupKey} onChange={(e) => setGroupKey(e.target.value as DimKey | "")}
            className="h-8 rounded-lg border border-slate-200 px-2 bg-white" title="จัดกลุ่มตาม">
            <option value="">ไม่จัดกลุ่ม</option>
            {GROUP_DIMS.map((d) => <option key={d.k} value={d.k}>กลุ่ม: {d.label}</option>)}
          </select>
          <span className="ml-1 text-slate-400">🔃</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as DimKey)}
            className="h-8 rounded-lg border border-slate-200 px-2 bg-white" title="เรียงตาม">
            {SORT_DIMS.map((d) => <option key={d.k} value={d.k}>เรียง: {d.label}</option>)}
          </select>
          <button type="button" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50" title="สลับลำดับ">{sortDir === "asc" ? "▲" : "▼"}</button>
          <span className="ml-1 text-slate-400">🔎</span>
          <select value={filterField} onChange={(e) => { setFilterField(e.target.value as DimKey | ""); setFilterValue(""); }}
            className="h-8 rounded-lg border border-slate-200 px-2 bg-white" title="กรองตาม">
            <option value="">— ไม่กรอง —</option>
            {FILTER_DIMS.map((d) => <option key={d.k} value={d.k}>กรอง: {d.label}</option>)}
          </select>
          {filterField && (
            <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 px-2 bg-white max-w-[160px]" title="ค่าที่กรอง">
              <option value="">ทั้งหมด</option>
              {filterValues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
        </div>

        {selectable.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-1">
            <label className="flex items-center gap-2 text-sm text-rose-500 cursor-pointer select-none">
              <input type="checkbox" checked={allOnPagePicked} onChange={toggleAll}
                className="rounded border-pink-300 text-pink-500" />
              เลือกที่โหลดแล้ว ({processed.length} รายการ)
            </label>
            <span className="text-[11px] text-slate-400">
              พบทั้งหมด {total.toLocaleString("th-TH")} · แสดง {results.length}
            </span>
          </div>
        )}
        {total > results.length && (
          <p className="px-1 text-[11px] text-amber-600">
            ⚠ มี {total.toLocaleString("th-TH")} รายการ — พิมพ์ให้เจาะจงขึ้น (เช่น รหัส/สี) หรือกด “ดูเพิ่มเติม” ด้านล่างให้ครบ
          </p>
        )}

        <div className="max-h-[55vh] overflow-auto rounded-lg border border-pink-100">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-pink-300">กำลังโหลด...</div>
          ) : processed.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-pink-300">ไม่พบสินค้า</div>
          ) : (
            groups.map(([label, items]) => (
              <div key={label || "_"}>
                {groupKey && (
                  <label className="sticky top-0 z-10 flex items-center gap-2 bg-pink-50/90 px-3 py-1.5 text-xs font-medium text-rose-600 border-b border-pink-100 cursor-pointer select-none backdrop-blur">
                    <input type="checkbox" checked={items.length > 0 && items.every((s) => picked.has(s.id))}
                      onChange={() => toggleGroupPick(items)} className="rounded border-pink-300 text-pink-500" />
                    {label} <span className="text-pink-300 font-normal">({items.length})</span>
                  </label>
                )}
                <ul className="divide-y divide-pink-50">{items.map(renderItem)}</ul>
              </div>
            ))
          )}
          {hasMore && !loading && (
            <button type="button" onClick={() => fetchPage(query, offset)} disabled={loadingMore}
              className="w-full py-2.5 text-sm font-medium text-rose-500 hover:bg-pink-50 disabled:opacity-50 border-t border-pink-50">
              {loadingMore ? "กำลังโหลด..." : "ดูเพิ่มเติม ↓"}
            </button>
          )}
        </div>
      </div>
    </ERPModal>
  );
}
