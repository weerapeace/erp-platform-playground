"use client";

/**
 * LineItemsGrid — ตารางรายการบรรทัดกลาง (ของกลางตาม CLAUDE.md)
 *
 * ใช้ซ้ำได้กับทุกโมดูลที่มี "หัวเอกสาร + หลายบรรทัด" (BOM · PR · SO · PO · ใบรับของ)
 *
 * ความสามารถ:
 *   - คอลัมน์จัดแถวตรง (grid template เดียวทั้งหัว/แถว) + เลื่อนแนวนอน + ชื่อยาว truncate ไม่เพี้ยน
 *   - Sort คลิกหัวคอลัมน์ (none → ▲ → ▼)
 *   - Group by + [เฟส 2] หัวกลุ่ม "พับ/ขยายได้" + บอกจำนวน + "รวมยอด" คอลัมน์ที่ summable
 *   - [เฟส 2] แก้ค่าที่หัวกลุ่ม → ทุกบรรทัดในกลุ่มเปลี่ยนตาม (คอลัมน์ที่มี setValue)
 *   - [เฟส 2] ปรับขนาดคอลัมน์ (ลากขอบหัวคอลัมน์) + จำค่าไว้ (localStorage ถ้ามี storageKey)
 *   - ลากเรียงลำดับ (dnd-kit) เมื่อไม่ sort/group · เพิ่ม/ลบบรรทัด · readonly
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext, type DragEndEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type LineColumn<T> = {
  key:       string;
  header:    string;
  width?:    number;
  minWidth?: number;
  align?:    "left" | "right" | "center";
  sortable?: boolean;
  /** รวมยอดคอลัมน์นี้ต่อกลุ่ม (ใช้ getValue เป็นตัวเลข) */
  summable?: boolean;
  getValue?: (row: T) => string | number | null | undefined;
  groupLabel?: (row: T) => string;
  /** แก้ค่าที่ "หัวกลุ่ม" → ทุกบรรทัดในกลุ่มใช้ patch นี้ (เปิด cascade edit เมื่อ group ด้วยคอลัมน์นี้) */
  setValue?: (row: T, value: string) => Partial<T>;
  /** ตัวแก้ที่หัวกลุ่มแบบ custom (เช่น picker) — apply(patch) จะใส่ patch ให้ทุกบรรทัดในกลุ่ม */
  groupEditNode?: (apply: (patch: Partial<T>) => void) => React.ReactNode;
  render?:   (row: T, update: (patch: Partial<T>) => void, readonly: boolean) => React.ReactNode;
};

export type LineItemsGridProps<T> = {
  rows:     T[];
  columns:  LineColumn<T>[];
  onChange: (rows: T[]) => void;
  rowId:    (row: T) => string;
  readonly?:      boolean;
  enableReorder?: boolean;
  groupByOptions?: { key: string; label: string }[];
  addLabel?:  string;
  onAdd?:     () => T;
  /** ทำซ้ำบรรทัด — คืน row ใหม่ (ต้องตั้ง id/key ใหม่เอง) แล้วระบบแทรกต่อจากบรรทัดเดิม */
  onDuplicate?: (row: T) => T;
  emptyText?: string;
  footer?:    React.ReactNode;
  /** ปุ่ม/ตัวเลือกเสริม วางข้างปุ่ม "เพิ่มบรรทัด" (เช่น เพิ่มจากรายการที่ใช้บ่อย) */
  addExtra?:  React.ReactNode;
  /** key เก็บความกว้างคอลัมน์ลง localStorage (เฟส 2) */
  storageKey?: string;
  /** ตรึงหัวตาราง + ให้ตารางเลื่อนเองภายในความสูงนี้ (เช่น "55vh") */
  stickyHeader?: boolean;
  maxHeight?:    string;
  /** เรียงเริ่มต้นเมื่อเปิดตาราง (เช่น เรียงตามชื่อวัตถุดิบ) */
  defaultSort?:  { key: string; dir: "asc" | "desc" } | null;
  /** โหมดกะทัดรัด — แถว/ตัวอักษรเล็กลง เหมาะกับตารางอ่านอย่างเดียวรายการเยอะ */
  dense?:        boolean;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

const colValue = <T,>(col: LineColumn<T>, row: T): string | number | null | undefined =>
  col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key] as string | number | null | undefined;

const fmtNum = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

export function LineItemsGrid<T>({
  rows, columns, onChange, rowId, readonly = false, enableReorder = true,
  groupByOptions = [], addLabel = "＋ เพิ่มบรรทัด", onAdd, onDuplicate, emptyText = "ยังไม่มีรายการ", footer, addExtra, storageKey,
  stickyHeader = false, maxHeight, defaultSort = null, dense = false,
}: LineItemsGridProps<T>) {
  const [sort, setSort]       = useState<SortState>(defaultSort);
  const [groupBy, setGroupBy] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [widths, setWidths]   = useState<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement>(null);

  // โหลด/จำความกว้างคอลัมน์ (localStorage)
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try { const raw = window.localStorage.getItem(`lig:${storageKey}`); if (raw) setWidths(JSON.parse(raw)); } catch { /* ignore */ }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try { window.localStorage.setItem(`lig:${storageKey}`, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [widths, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canDrag = enableReorder && !readonly && !sort && !groupBy;

  const baseWidth = (c: LineColumn<T>) => widths[c.key] ?? c.width ?? Math.max(c.minWidth ?? 120, 140);

  const template = useMemo(() => {
    const parts: string[] = [];
    if (canDrag) parts.push("28px");
    for (const c of columns) parts.push(widths[c.key] ? `${widths[c.key]}px` : (c.width ? `${c.width}px` : `minmax(${c.minWidth ?? 120}px, 1fr)`));
    if (!readonly) parts.push(onDuplicate ? "64px" : "36px");
    return parts.join(" ");
  }, [columns, canDrag, readonly, widths, onDuplicate]);

  const minWidth = useMemo(() => {
    let w = (canDrag ? 28 : 0) + (readonly ? 0 : (onDuplicate ? 64 : 36));
    for (const c of columns) w += baseWidth(c);
    return w;
  }, [columns, canDrag, readonly, widths]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id: string, patch: Partial<T>) => onChange(rows.map((r) => (rowId(r) === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => rowId(r) !== id));
  // ทำซ้ำบรรทัด → แทรกต่อจากบรรทัดเดิมทันที (parent เป็นคนตั้ง id/key ใหม่ผ่าน onDuplicate)
  const duplicate = (id: string) => {
    if (!onDuplicate) return;
    const idx = rows.findIndex((r) => rowId(r) === id);
    if (idx < 0) return;
    onChange([...rows.slice(0, idx + 1), onDuplicate(rows[idx]), ...rows.slice(idx + 1)]);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => rowId(r) === active.id);
    const to   = rows.findIndex((r) => rowId(r) === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(rows, from, to));
  };

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  // ---- column resize ----
  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const col = columns.find((c) => c.key === key);
    const startX = e.clientX;
    const startW = widths[key] ?? col?.width ?? Math.max(col?.minWidth ?? 120, 140);
    const move = (ev: MouseEvent) => setWidths((w) => ({ ...w, [key]: Math.max(50, startW + ev.clientX - startX) }));
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };

  // ดับเบิลคลิกขอบคอลัมน์ → ขยายให้พอดีกับเนื้อหากว้างสุด (เหมือน Excel) · ความกว้างเป็นของกลาง (จำผ่าน storageKey)
  const autoFit = (key: string) => {
    const root = gridRef.current; if (!root) return;
    const col = columns.find((c) => c.key === key);
    const minW = Math.max(col?.minWidth ?? 60, 60);
    let max = 0;
    root.querySelectorAll<HTMLElement>(`[data-col="${key}"]`).forEach((cell) => {
      const span = cell.querySelector<HTMLElement>(":scope > span");
      const w = span ? span.scrollWidth : cell.scrollWidth;
      if (w > max) max = w;
    });
    const head = root.querySelector<HTMLElement>(`[data-colhead="${key}"]`);
    if (head && head.scrollWidth > max) max = head.scrollWidth;
    if (max > 0) setWidths((w) => ({ ...w, [key]: Math.min(600, Math.max(minW, Math.ceil(max) + 28)) }));
  };

  const toggleCollapse = (g: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  // ---- มุมมอง group + sort ----
  const sortRows = useCallback((list: T[]): T[] => {
    if (!sort) return list;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return list;
    const sorted = [...list].sort((a, b) => {
      const av = colValue(col, a), bv = colValue(col, b);
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "th");
    });
    return sort.dir === "asc" ? sorted : sorted.reverse();
  }, [sort, columns]);

  const groupCol = groupBy ? columns.find((c) => c.key === groupBy) : null;
  const summableCols = columns.filter((c) => c.summable);

  type Display =
    | { type: "group"; label: string; count: number; sums: { header: string; total: number }[] }
    | { type: "row"; row: T };
  const display: Display[] = useMemo(() => {
    if (!groupCol) return sortRows(rows).map((row) => ({ type: "row" as const, row }));
    const keyOf = (r: T) => (groupCol.groupLabel ? groupCol.groupLabel(r) : String(colValue(groupCol, r) ?? "— ไม่ระบุ —")) || "— ไม่ระบุ —";
    const groups = new Map<string, T[]>();
    for (const r of rows) { const k = keyOf(r); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
    const out: Display[] = [];
    [...groups.keys()].sort((a, b) => a.localeCompare(b, "th")).forEach((g) => {
      const list = sortRows(groups.get(g)!);
      const sums = summableCols.map((c) => ({
        header: c.header,
        total: list.reduce((s, r) => s + (Number(colValue(c, r)) || 0), 0),
      }));
      out.push({ type: "group", label: g, count: list.length, sums });
      if (!collapsed.has(g)) list.forEach((row) => out.push({ type: "row", row }));
    });
    return out;
  }, [rows, sortRows, groupCol, collapsed, summableCols]);

  const colCount = (canDrag ? 1 : 0) + columns.length + (readonly ? 0 : 1);

  // cascade edit ที่หัวกลุ่ม (เมื่อ group ด้วยคอลัมน์ที่มี setValue)
  const groupKeyOf = (r: T) => (groupCol?.groupLabel ? groupCol.groupLabel(r) : String(colValue(groupCol!, r) ?? "— ไม่ระบุ —")) || "— ไม่ระบุ —";
  const applyGroupEdit = (groupLabel: string, value: string) => {
    if (!groupCol?.setValue) return;
    onChange(rows.map((r) => (groupKeyOf(r) === groupLabel ? { ...r, ...groupCol.setValue!(r, value) } : r)));
  };
  // ใส่ patch ให้ทุกบรรทัดในกลุ่ม (ใช้กับ groupEditNode เช่น เปลี่ยนวัตถุดิบทั้งกลุ่ม)
  const applyGroupPatch = (groupLabel: string, patch: Partial<T>) =>
    onChange(rows.map((r) => (groupKeyOf(r) === groupLabel ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {(groupByOptions.length > 0 || sort) && (
        <div className="flex items-center gap-3 text-xs">
          {groupByOptions.length > 0 && (
            <label className="flex items-center gap-1.5 text-slate-500">
              จัดกลุ่มตาม:
              <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setCollapsed(new Set()); }}
                className="h-7 px-2 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— ไม่จัดกลุ่ม —</option>
                {groupByOptions.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </label>
          )}
          {groupBy && (
            <>
              <button type="button" onClick={() => setCollapsed(new Set())} className="text-blue-600 hover:underline">ขยายทั้งหมด</button>
              <button type="button" onClick={() => {
                const keyOf = (r: T) => (groupCol!.groupLabel ? groupCol!.groupLabel(r) : String(colValue(groupCol!, r) ?? "— ไม่ระบุ —")) || "— ไม่ระบุ —";
                setCollapsed(new Set(rows.map(keyOf)));
              }} className="text-blue-600 hover:underline">พับทั้งหมด</button>
            </>
          )}
          {sort && <button type="button" onClick={() => setSort(null)} className="text-blue-600 hover:underline">ล้างการเรียง</button>}
          {(sort || groupBy) && <span className="text-slate-400">(ลากเรียงลำดับได้เมื่อไม่ sort/group)</span>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-400 mb-2">{emptyText}</p>
          {onAdd && !readonly && (
            <button type="button" onClick={() => onChange([...rows, onAdd()])} className="text-sm text-blue-600 hover:text-blue-800 font-medium">{addLabel}</button>
          )}
        </div>
      ) : (
        <div className={`${stickyHeader ? "overflow-auto" : "overflow-x-auto"} border border-slate-200 rounded-lg`}
          style={stickyHeader && maxHeight ? { maxHeight } : undefined}>
          <div ref={gridRef} style={{ minWidth }}>
            {/* header */}
            <div style={{ gridTemplateColumns: template }}
              className={`grid bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 ${stickyHeader ? "sticky top-0 z-20" : ""}`}>
              {canDrag && <span />}
              {columns.map((c) => (
                <div key={c.key} className="relative border-r border-slate-100 last:border-r-0">
                  <button type="button" disabled={!c.sortable} onClick={() => c.sortable && toggleSort(c.key)}
                    className={`w-full px-2 ${dense ? "py-1" : "py-2"} flex items-center gap-1 ${c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : ""} ${c.sortable ? "hover:text-slate-800 cursor-pointer" : "cursor-default"}`}>
                    <span className="truncate" data-colhead={c.key}>{c.header}</span>
                    {sort?.key === c.key && <span className="text-blue-600">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                  {/* resize handle — ลากปรับ / ดับเบิลคลิกขยายพอดี */}
                  <span onMouseDown={(e) => startResize(c.key, e)} onDoubleClick={() => autoFit(c.key)}
                    title="ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อขยายพอดี — ความกว้างจะใช้กับทุก SKU"
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300/60" />
                </div>
              ))}
              {!readonly && <span />}
            </div>

            {/* rows */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map(rowId)} strategy={verticalListSortingStrategy}>
                {display.map((d, i) =>
                  d.type === "group" ? (
                    <div key={`g${i}`} className="flex items-center gap-2 bg-slate-100/70 border-b border-slate-200 px-2 py-1.5 text-xs">
                      <button type="button" onClick={() => toggleCollapse(d.label)} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-200 rounded">
                        {collapsed.has(d.label) ? "▸" : "▾"}
                      </button>
                      {groupCol?.setValue && !readonly ? (
                        <input defaultValue={d.label} onBlur={(e) => { if (e.target.value !== d.label) applyGroupEdit(d.label, e.target.value); }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          title="แก้ที่นี่ → ทุกบรรทัดในกลุ่มเปลี่ยนตาม"
                          className="h-7 px-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      ) : (
                        <span className="font-semibold text-slate-700">{d.label}</span>
                      )}
                      <span className="text-slate-400">· {d.count} รายการ</span>
                      {groupCol?.groupEditNode && !readonly && groupCol.groupEditNode((patch) => applyGroupPatch(d.label, patch))}
                      {d.sums.filter((s) => s.total).map((s) => (
                        <span key={s.header} className="text-slate-500">· รวม{s.header} <span className="font-semibold text-slate-700 tabular-nums">{fmtNum(s.total)}</span></span>
                      ))}
                    </div>
                  ) : (
                    <GridRow key={rowId(d.row)} id={rowId(d.row)} template={template} canDrag={canDrag} readonly={readonly}
                      columns={columns} row={d.row} dense={dense}
                      onUpdate={(patch) => update(rowId(d.row), patch)} onRemove={() => remove(rowId(d.row))}
                      onDuplicate={onDuplicate ? () => duplicate(rowId(d.row)) : undefined} />
                  ),
                )}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {(onAdd || footer || addExtra) && rows.length > 0 && !readonly && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            {onAdd && (
              <button type="button" onClick={() => onChange([...rows, onAdd()])} className="text-sm text-blue-600 hover:text-blue-800 font-medium">{addLabel}</button>
            )}
            {addExtra}
          </div>
          {footer}
        </div>
      )}
      {footer && (rows.length === 0 || readonly) && <div className="flex justify-end pt-1">{footer}</div>}
    </div>
  );
}

// ---- single sortable row ----
function GridRow<T>({
  id, template, canDrag, readonly, columns, row, onUpdate, onRemove, onDuplicate, dense = false,
}: {
  id: string; template: string; canDrag: boolean; readonly: boolean;
  columns: LineColumn<T>[]; row: T;
  onUpdate: (patch: Partial<T>) => void; onRemove: () => void; onDuplicate?: () => void; dense?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  const style: React.CSSProperties = {
    gridTemplateColumns: template,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="grid items-center border-b border-slate-100 bg-white hover:bg-slate-50/60">
      {canDrag && (
        <button type="button" {...attributes} {...listeners}
          className="h-9 flex items-center justify-center text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing" title="ลากเพื่อเรียงลำดับ">⠿</button>
      )}
      {columns.map((c) => (
        <div key={c.key} data-col={c.key} className={`px-1.5 min-w-0 ${dense ? "py-1" : ""} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
          {c.render
            ? c.render(row, onUpdate, readonly)
            : <span className={`block truncate ${dense ? "text-xs" : "text-sm"} text-slate-700`} title={String(colValue(c, row) ?? "")}>{String(colValue(c, row) ?? "")}</span>}
        </div>
      ))}
      {!readonly && (
        <div className="flex items-center justify-center">
          {onDuplicate && (
            <button type="button" onClick={onDuplicate} title="ทำซ้ำบรรทัด"
              className="h-9 w-7 flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">⧉</button>
          )}
          <button type="button" onClick={onRemove} title="ลบบรรทัด"
            className="h-9 w-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}
