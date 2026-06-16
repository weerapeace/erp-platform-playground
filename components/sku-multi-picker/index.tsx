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
  // เก็บ object เต็มของตัวที่เลือก (ค้นหาแล้วเปลี่ยนคำ ผลลัพธ์หาย แต่ยังจำที่เลือกไว้)
  const [picked, setPicked] = useState<Map<string, SkuPickerValue>>(new Map());

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  // off=0 → โหลดใหม่ (แทนที่) · off>0 → โหลดเพิ่ม (ต่อท้าย)
  const fetchPage = useCallback(async (q: string, off: number) => {
    if (off > 0) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ search: q, limit: String(PAGE), offset: String(off) });
      if (salesOnly) params.set("sales_only", "true");
      const res = await apiFetch(`/api/pickers/skus?${params}`);
      const j = await res.json();
      const rows = (j.data ?? []) as SkuPickerValue[];
      setResults((prev) => (off > 0 ? [...prev, ...rows] : rows));
      setHasMore(rows.length === PAGE);
      setOffset(off + rows.length);
    } catch { if (off === 0) setResults([]); }
    finally { if (off > 0) setLoadingMore(false); else setLoading(false); }
  }, [salesOnly]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchPage(query, 0), 250);
    return () => clearTimeout(t);
  }, [open, query, fetchPage]);

  useEffect(() => {
    if (open) { setQuery(""); setPicked(new Map()); }
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

  const confirm = () => {
    if (picked.size === 0) return;
    onConfirm(Array.from(picked.values()));
    onClose();
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

        {selectable.length > 0 && (
          <label className="flex items-center gap-2 px-1 text-sm text-rose-500 cursor-pointer select-none">
            <input type="checkbox" checked={allOnPagePicked} onChange={toggleAll}
              className="rounded border-pink-300 text-pink-500" />
            เลือกทั้งหมด ({selectable.length} รายการ)
          </label>
        )}

        <div className="max-h-[55vh] overflow-auto rounded-lg border border-pink-100">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-pink-300">กำลังโหลด...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-pink-300">ไม่พบสินค้า</div>
          ) : (
            <ul className="divide-y divide-pink-50">
              {results.map((sku) => {
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
              })}
            </ul>
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
