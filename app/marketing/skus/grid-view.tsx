"use client";

/**
 * มุมมองการ์ด (grid) ของ SKU การตลาด — รูปใหญ่ + รหัส/ชื่อ + ป้าย + หมายเหตุ
 *   จัดกลุ่มตามป้าย (ตามลำดับป้าย, "ยังไม่มีป้าย" ไว้ท้าย) · ติ๊กเลือกได้ทั้งรายใบ/ทั้งกลุ่ม (ใช้แถบทำหลายรายการเดียวกับตาราง)
 *   จำนวนการ์ดต่อแถว = ของกลาง GalleryColumns (จำรายคน) · มือถือบังคับ 2 ใบ/แถว
 */
import { type CSSProperties } from "react";
import Link from "next/link";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { r2ImageUrl } from "@/lib/r2-image";
import type { MarketingBrand, MarketingSkuItem, MarketingSkuLabel } from "@/lib/marketing/sku-list";
import { LabelBadge } from "./label-manager";

export function MarketingSkuGrid({
  rows, cols, labels, labelMap, brandMap, showBrand, canManage, busy, labelOptions,
  selected, onSelectedChange, onSetLabel, onEditNote, onRemove, emptyText,
}: {
  rows: MarketingSkuItem[];
  cols: number;
  labels: MarketingSkuLabel[];
  labelMap: Map<string, MarketingSkuLabel>;
  brandMap: Map<string, MarketingBrand>;
  showBrand: boolean;
  canManage: boolean;
  busy: boolean;
  labelOptions: SelectOption[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onSetLabel: (ids: string[], labelId: string | null) => void;
  onEditNote: (item: MarketingSkuItem) => void;
  onRemove: (ids: string[]) => void;
  emptyText: React.ReactNode;
}) {
  if (rows.length === 0) return <div className="rounded-xl border border-slate-200 bg-white">{emptyText}</div>;

  // จัดกลุ่มตามป้าย ตามลำดับป้าย · ไม่มีป้ายไว้ท้าย
  const groups: { key: string; label?: MarketingSkuLabel; rows: MarketingSkuItem[] }[] = [
    ...labels.map((l) => ({ key: l.id, label: l, rows: rows.filter((r) => r.label_id === l.id) })),
    { key: "__none", label: undefined, rows: rows.filter((r) => !r.label_id || !labelMap.has(r.label_id)) },
  ].filter((g) => g.rows.length > 0);

  const toggle = (ids: string[], on: boolean) => {
    const n = new Set(selected);
    ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
    onSelectedChange(n);
  };
  const gridStyle = { "--mk-cols": `repeat(${cols}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const ids = g.rows.map((r) => r.id);
        const allOn = ids.every((id) => selected.has(id));
        return (
          <section key={g.key}>
            <div className="mb-2 flex items-center gap-2">
              {canManage && (
                <input type="checkbox" checked={allOn} onChange={(e) => toggle(ids, e.target.checked)} title="เลือกทั้งกลุ่ม"
                  className="h-4 w-4 rounded border-slate-300" />
              )}
              <LabelBadge label={g.label} />
              <span className="text-xs text-slate-400">{g.rows.length} รุ่น</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:var(--mk-cols)]" style={gridStyle}>
              {g.rows.map((it) => {
                const on = selected.has(it.id);
                const img = r2ImageUrl(it.image_key, 480);
                const brand = it.brand_id ? brandMap.get(it.brand_id) : undefined;
                return (
                  <div key={it.id}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md ${on ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"}`}>
                    {/* รูป */}
                    <div className="relative aspect-square bg-slate-50">
                      {img
                        ? <img src={img} alt={it.code} loading="lazy" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                        : <div className="flex h-full w-full items-center justify-center text-4xl text-slate-300">📦</div>}
                      {canManage && (
                        <label className={`absolute left-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm transition-opacity ${on ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}>
                          <input type="checkbox" checked={on} onChange={(e) => toggle([it.id], e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                        </label>
                      )}
                      {canManage && (
                        <button type="button" title="เอาออกจากรายการการตลาด" onClick={() => onRemove([it.id])}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-sm text-slate-500 shadow-sm transition-opacity hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100">🗑</button>
                      )}
                      {!it.is_active && <span className="absolute bottom-2 left-2 rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-white">ปิดใช้งาน</span>}
                    </div>

                    {/* ข้อมูล */}
                    <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/master/parent-skus?open=${encodeURIComponent(it.parent_sku_id)}`} target="_blank"
                          className="truncate text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline">{it.code || "(ไม่มีรหัส)"}</Link>
                        {showBrand && (
                          <span className="ml-auto inline-flex min-w-0 items-center gap-1 text-[11px] text-slate-500" title={brand?.name ?? "ไม่มีแบรนด์"}>
                            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: brand?.color || "#cbd5e1" }} />
                            <span className="truncate">{brand?.name ?? "ไม่มีแบรนด์"}</span>
                          </span>
                        )}
                      </div>
                      <div className="line-clamp-2 min-h-[2rem] text-xs leading-4 text-slate-500" title={it.name}>{it.name}</div>
                      <div className="mt-auto">
                        {canManage ? (
                          <SearchableSelect value={it.label_id && labelMap.has(it.label_id) ? it.label_id : ""} options={labelOptions}
                            onChange={(v) => { if ((v || null) !== it.label_id) onSetLabel([it.id], v || null); }} disabled={busy} className="w-full" />
                        ) : <LabelBadge label={it.label_id ? labelMap.get(it.label_id) : undefined} />}
                      </div>
                      <button type="button" disabled={!canManage} onClick={() => onEditNote(it)} title={it.note ?? ""}
                        className="truncate rounded px-1 py-0.5 text-left text-[11px] text-slate-600 enabled:hover:bg-slate-100">
                        {it.note || (canManage ? <span className="text-slate-300">✏️ เพิ่มหมายเหตุ</span> : <span className="text-slate-300">-</span>)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
