"use client";

/**
 * LineItemsGrid — ตารางรายการบรรทัดกลาง (ของกลางตาม CLAUDE.md)
 *
 * ใช้ซ้ำได้กับทุกโมดูลที่มี "หัวเอกสาร + หลายบรรทัด":
 *   BOM (วัตถุดิบ) · Purchase Request · Sales Order · Purchase Order · Goods Receipt
 *
 * ความสามารถ:
 *   - คอลัมน์จัดแถวตรงเป๊ะ (grid template เดียวกันทั้งหัว/แถว) + เลื่อนแนวนอนเมื่อคอลัมน์เยอะ
 *   - ชื่อยาวไม่ดันคอลัมน์เพี้ยน (คอลัมน์ความกว้างคงที่ + truncate + tooltip)
 *   - Sort: คลิกหัวคอลัมน์ (none → ก→ฮ → ฮ→ก) — เป็นมุมมอง ไม่แก้ข้อมูลจริง
 *   - Group by: เลือก field จัดกลุ่ม + หัวกลุ่มบอกจำนวน
 *   - ลากเรียงลำดับ (dnd-kit) เมื่อไม่ได้ sort/group
 *   - เพิ่ม/ลบบรรทัด, โหมด readonly
 *
 * แก้ค่าอ้างอิงด้วย rowId เสมอ → sort/group ไม่ทำข้อมูลสลับ
 */
import React, { useMemo, useState } from "react";
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
  /** ความกว้างคอลัมน์ (px) — ถ้าไม่ระบุใช้ 1fr (ยืดได้) */
  width?:    number;
  minWidth?: number;
  align?:    "left" | "right" | "center";
  sortable?: boolean;
  /** ค่าใช้ sort/group (default = row[key]) */
  getValue?: (row: T) => string | number | null | undefined;
  /** label หัวกลุ่มเวลา group ด้วย field นี้ (default = getValue) */
  groupLabel?: (row: T) => string;
  /** เซลล์แก้ไขได้ — ถ้าไม่ระบุจะโชว์ getValue เป็น read-only */
  render?:   (row: T, update: (patch: Partial<T>) => void, readonly: boolean) => React.ReactNode;
};

export type LineItemsGridProps<T> = {
  rows:     T[];
  columns:  LineColumn<T>[];
  onChange: (rows: T[]) => void;
  rowId:    (row: T) => string;
  readonly?:      boolean;
  enableReorder?: boolean;
  /** ตัวเลือกจัดกลุ่ม (dropdown) — key ต้องตรงกับ column.key */
  groupByOptions?: { key: string; label: string }[];
  addLabel?:  string;
  /** สร้างบรรทัดว่างใหม่ — ถ้าไม่ระบุจะไม่มีปุ่มเพิ่ม */
  onAdd?:     () => T;
  emptyText?: string;
  /** แถวสรุปท้ายตาราง (เช่น ยอดรวม) */
  footer?:    React.ReactNode;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

const colValue = <T,>(col: LineColumn<T>, row: T): string | number | null | undefined =>
  col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key] as string | number | null | undefined;

export function LineItemsGrid<T>({
  rows, columns, onChange, rowId, readonly = false, enableReorder = true,
  groupByOptions = [], addLabel = "＋ เพิ่มบรรทัด", onAdd, emptyText = "ยังไม่มีรายการ", footer,
}: LineItemsGridProps<T>) {
  const [sort, setSort]       = useState<SortState>(null);
  const [groupBy, setGroupBy] = useState<string>("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canDrag = enableReorder && !readonly && !sort && !groupBy;

  // grid template: [drag][cols...][delete]
  const template = useMemo(() => {
    const parts: string[] = [];
    if (canDrag) parts.push("28px");
    for (const c of columns) parts.push(c.width ? `${c.width}px` : `minmax(${c.minWidth ?? 120}px, 1fr)`);
    if (!readonly) parts.push("36px");
    return parts.join(" ");
  }, [columns, canDrag, readonly]);

  const minWidth = useMemo(() => {
    let w = (canDrag ? 28 : 0) + (readonly ? 0 : 36);
    for (const c of columns) w += c.width ?? Math.max(c.minWidth ?? 120, 140);
    return w;
  }, [columns, canDrag, readonly]);

  const update = (id: string, patch: Partial<T>) =>
    onChange(rows.map((r) => (rowId(r) === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => rowId(r) !== id));

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

  // ---- มุมมอง: group + sort (ไม่แตะ rows จริง) ----
  type Display = { type: "group"; label: string; count: number } | { type: "row"; row: T };
  const display: Display[] = useMemo(() => {
    const sortRows = (list: T[]): T[] => {
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
    };

    if (!groupBy) return sortRows(rows).map((row) => ({ type: "row" as const, row }));

    const col = columns.find((c) => c.key === groupBy);
    const keyOf = (r: T) => (col?.groupLabel ? col.groupLabel(r) : String(colValue(col!, r) ?? "— ไม่ระบุ —")) || "— ไม่ระบุ —";
    const groups = new Map<string, T[]>();
    for (const r of rows) { const k = keyOf(r); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
    const out: Display[] = [];
    [...groups.keys()].sort((a, b) => a.localeCompare(b, "th")).forEach((g) => {
      const list = sortRows(groups.get(g)!);
      out.push({ type: "group", label: g, count: list.length });
      list.forEach((row) => out.push({ type: "row", row }));
    });
    return out;
  }, [rows, sort, groupBy, columns]);

  const colCount = (canDrag ? 1 : 0) + columns.length + (readonly ? 0 : 1);

  return (
    <div className="space-y-2">
      {/* toolbar: group + ตัวช่วย */}
      {(groupByOptions.length > 0 || sort) && (
        <div className="flex items-center gap-3 text-xs">
          {groupByOptions.length > 0 && (
            <label className="flex items-center gap-1.5 text-slate-500">
              จัดกลุ่มตาม:
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
                className="h-7 px-2 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— ไม่จัดกลุ่ม —</option>
                {groupByOptions.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </label>
          )}
          {sort && <button type="button" onClick={() => setSort(null)} className="text-blue-600 hover:underline">ล้างการเรียง</button>}
          {(sort || groupBy) && <span className="text-slate-400">(ลากเรียงลำดับได้เมื่อไม่ sort/group)</span>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-400 mb-2">{emptyText}</p>
          {onAdd && !readonly && (
            <button type="button" onClick={() => onChange([...rows, onAdd()])}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">{addLabel}</button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <div style={{ minWidth }}>
            {/* header */}
            <div style={{ gridTemplateColumns: template }}
              className="grid gap-px bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
              {canDrag && <span />}
              {columns.map((c) => (
                <button key={c.key} type="button" disabled={!c.sortable} onClick={() => c.sortable && toggleSort(c.key)}
                  className={`px-2 py-2 flex items-center gap-1 ${c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : ""} ${c.sortable ? "hover:text-slate-800 cursor-pointer" : "cursor-default"}`}>
                  <span className="truncate">{c.header}</span>
                  {sort?.key === c.key && <span className="text-blue-600">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                </button>
              ))}
              {!readonly && <span />}
            </div>

            {/* rows */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map(rowId)} strategy={verticalListSortingStrategy}>
                {display.map((d, i) =>
                  d.type === "group" ? (
                    <div key={`g${i}`} style={{ gridColumn: `1 / ${colCount + 1}` }}
                      className="grid bg-slate-100/70 border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
                      {d.label} <span className="font-normal text-slate-400">· {d.count} รายการ</span>
                    </div>
                  ) : (
                    <GridRow key={rowId(d.row)} id={rowId(d.row)} template={template} canDrag={canDrag} readonly={readonly}
                      columns={columns} row={d.row}
                      onUpdate={(patch) => update(rowId(d.row), patch)} onRemove={() => remove(rowId(d.row))} />
                  ),
                )}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {(onAdd || footer) && rows.length > 0 && !readonly && (
        <div className="flex items-center justify-between pt-1">
          {onAdd ? (
            <button type="button" onClick={() => onChange([...rows, onAdd()])}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">{addLabel}</button>
          ) : <span />}
          {footer}
        </div>
      )}
      {footer && (rows.length === 0 || readonly) && <div className="flex justify-end pt-1">{footer}</div>}
    </div>
  );
}

// ---- single sortable row ----
function GridRow<T>({
  id, template, canDrag, readonly, columns, row, onUpdate, onRemove,
}: {
  id: string; template: string; canDrag: boolean; readonly: boolean;
  columns: LineColumn<T>[]; row: T;
  onUpdate: (patch: Partial<T>) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  const style: React.CSSProperties = {
    gridTemplateColumns: template,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className="grid gap-px items-center border-b border-slate-100 bg-white hover:bg-slate-50/60">
      {canDrag && (
        <button type="button" {...attributes} {...listeners}
          className="h-9 flex items-center justify-center text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing" title="ลากเพื่อเรียงลำดับ">⠿</button>
      )}
      {columns.map((c) => (
        <div key={c.key} className={`px-1.5 min-w-0 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
          {c.render
            ? c.render(row, onUpdate, readonly)
            : <span className="block truncate text-sm text-slate-700" title={String(colValue(c, row) ?? "")}>{String(colValue(c, row) ?? "")}</span>}
        </div>
      ))}
      {!readonly && (
        <button type="button" onClick={onRemove}
          className="h-9 w-9 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">✕</button>
      )}
    </div>
  );
}
