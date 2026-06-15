"use client";

// ============================================================
// CanvasBoard — กระดาน Section + การ์ด (ของกลาง)
//
// กระดานแบบ miro: แบ่งเป็นโซน (section) · ลากการ์ดข้ามโซน = ย้ายหมวด (onMove)
// + ลากสลับ/เรียงลำดับการ์ดได้ (ในโซนเดียวกัน + ข้ามโซน) → onReorder คืนลำดับ id ทั้งหมด
//
// ใช้: Design Sheets (โซน=สถานะ) · อนาคต: work-board (โซน=แผนก), kanban
// ห้าม: สร้างบอร์ดลาก-วางเองในแต่ละโมดูล — ใช้ตัวนี้แล้วส่ง renderCard เอง
// doc: docs/canvas-board.md
// ============================================================

import { useState, useEffect, type ReactNode } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type CanvasZone = {
  id: string;
  title: string;
  color?: string | null;
  hint?: string;
};

type CanvasBoardProps<T> = {
  zones: CanvasZone[];
  items: T[];
  getItemId: (item: T) => string;
  getZoneId: (item: T) => string;
  renderCard: (item: T, dragging: boolean) => ReactNode;
  onMove?: (item: T, toZoneId: string) => void;          // ย้ายโซน (เปลี่ยนหมวด/สถานะ)
  onReorder?: (orderedIds: string[]) => void;            // ลำดับ id ทั้งหมดหลังลากสลับ
  onCardClick?: (item: T) => void;
  canDrag?: boolean;
  cardWidth?: number;
  hideEmptyZones?: boolean;
  emptyText?: string;
};

// ---- การ์ดที่ลากเรียงได้ ----
function SortableCard({ id, disabled, onClick, children }: { id: string; disabled: boolean; onClick?: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      {...listeners} {...attributes} onClick={onClick}
      className={`${disabled ? "" : "cursor-grab active:cursor-grabbing"} touch-none ${isDragging ? "opacity-40" : ""}`}>
      {children}
    </div>
  );
}

function ZoneBox({ zone, count, children, innerRef, isOver }: { zone: CanvasZone; count: number; children: ReactNode; innerRef?: (el: HTMLElement | null) => void; isOver?: boolean }) {
  const accent = zone.color || "#cbd5e1";
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100" style={{ borderTop: `3px solid ${accent}` }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: accent }} />
        <span className="text-sm font-semibold text-slate-700">{zone.title}</span>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{count}</span>
        {zone.hint && <span className="text-[11px] text-slate-300 ml-auto hidden sm:inline">{zone.hint}</span>}
      </div>
      {/* min-h ให้พื้นที่วางพอแม้โซนว่าง · ไฮไลต์ตอนลากทับ */}
      <div ref={innerRef} className={`flex flex-wrap gap-2 p-3 min-h-[96px] transition-colors ${isOver ? "bg-blue-50 ring-2 ring-inset ring-blue-300" : "bg-slate-50/50"}`}>{children}</div>
    </section>
  );
}

// โซนที่เป็น drop target (ใช้เมื่อลากวางได้) — ทำให้โซนว่างก็วางการ์ดได้
function DroppableZoneBox({ zone, count, children }: { zone: CanvasZone; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  return <ZoneBox zone={zone} count={count} innerRef={setNodeRef} isOver={isOver}>{children}</ZoneBox>;
}

export function CanvasBoard<T>({
  zones, items, getItemId, getZoneId, renderCard, onMove, onReorder, onCardClick,
  canDrag = true, cardWidth = 184, hideEmptyZones = false,
  emptyText = "ยังไม่มีการ์ด — ลากมาวางที่นี่ได้",
}: CanvasBoardProps<T>) {
  const itemMap = new Map(items.map((it) => [getItemId(it), it]));
  // containers: zoneId → รายการ id (สถานะระหว่างลาก) — sync จาก props เมื่อไม่ได้ลาก
  const buildContainers = () => {
    const c: Record<string, string[]> = {};
    for (const z of zones) c[z.id] = [];
    for (const it of items) { const z = getZoneId(it); (c[z] ??= []).push(getItemId(it)); }
    return c;
  };
  const [containers, setContainers] = useState<Record<string, string[]>>(buildContainers);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const draggable = canDrag && (!!onReorder || !!onMove);

  // sync containers จาก props เมื่อไม่ได้ลากอยู่
  // สำคัญ: ถ้าเนื้อหาเหมือนเดิม ต้องคืน prev (อย่าสร้าง object ใหม่) — ไม่งั้น parent ที่ส่ง zones/items
  // เป็น reference ใหม่ทุก render จะทำให้ setState วนไม่จบ (React error #185: Maximum update depth)
  useEffect(() => {
    if (activeId) return;
    setContainers((prev) => {
      const next = buildContainers();
      const pk = Object.keys(prev), nk = Object.keys(next);
      const same = pk.length === nk.length && nk.every((k) => {
        const a = prev[k], b = next[k];
        return Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
      });
      return same ? prev : next;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [items, zones]);

  const findZone = (id: string): string | null => {
    if (containers[id]) return id;   // เป็น zone เอง (ตอน over โซนว่าง)
    return Object.keys(containers).find((z) => containers[z].includes(id)) ?? null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const activeIdL = String(e.active.id);
    const overId = e.over?.id != null ? String(e.over.id) : null;
    if (!overId) return;
    const from = findZone(activeIdL); const to = findZone(overId);
    if (!from || !to || from === to) return;
    // ย้ายข้ามโซนระหว่างลาก (วางก่อนการ์ดที่ชี้ หรือท้ายโซนถ้าชี้ที่โซนว่าง)
    setContainers((prev) => {
      const next = { ...prev, [from]: [...prev[from]], [to]: [...prev[to]] };
      next[from] = next[from].filter((x) => x !== activeIdL);
      const overIdx = next[to].indexOf(overId);
      const insertAt = overIdx >= 0 ? overIdx : next[to].length;
      next[to].splice(insertAt, 0, activeIdL);
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeIdL = String(e.active.id);
    const overId = e.over?.id != null ? String(e.over.id) : null;
    setActiveId(null);
    if (!overId) { setContainers(buildContainers()); return; }
    const zone = findZone(activeIdL);
    if (!zone) return;
    // เรียงลำดับในโซนปลายทาง
    let finalContainers = containers;
    const overZone = findZone(overId);
    if (overZone === zone && activeIdL !== overId) {
      const arr = containers[zone];
      const oldI = arr.indexOf(activeIdL); const newI = arr.indexOf(overId);
      if (oldI >= 0 && newI >= 0) {
        finalContainers = { ...containers, [zone]: arrayMove(arr, oldI, newI) };
        setContainers(finalContainers);
      }
    }
    // ย้ายโซน → onMove (เปลี่ยนสถานะ/หมวด)
    const item = itemMap.get(activeIdL);
    if (item && getZoneId(item) !== zone && onMove) onMove(item, zone);
    // ลำดับใหม่ทั้งหมด (เรียงตามโซน) → onReorder
    if (onReorder) {
      const flat = zones.flatMap((z) => finalContainers[z.id] ?? []);
      onReorder(flat);
    }
  };

  const activeItem = activeId != null ? itemMap.get(activeId) ?? null : null;

  // โซนว่างต้องวางการ์ดได้ → ใช้โซนแบบ droppable เมื่อลากได้ (ต้องอยู่ใน DndContext)
  const ZoneComp = draggable ? DroppableZoneBox : ZoneBox;
  const board = (
    <div className="space-y-3">
      {zones.map((z) => {
        const ids = containers[z.id] ?? [];
        if (hideEmptyZones && ids.length === 0) return null;
        return (
          <ZoneComp key={z.id} zone={z} count={ids.length}>
            <SortableContext items={ids} strategy={rectSortingStrategy} disabled={!draggable}>
              {ids.map((id) => {
                const it = itemMap.get(id);
                if (!it) return null;
                return (
                  <div key={id} style={{ width: cardWidth }}>
                    <SortableCard id={id} disabled={!draggable} onClick={onCardClick ? () => onCardClick(it) : undefined}>
                      {renderCard(it, false)}
                    </SortableCard>
                  </div>
                );
              })}
              {ids.length === 0 && (
                <div className="w-full h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg pointer-events-none">{emptyText}</div>
              )}
            </SortableContext>
          </ZoneComp>
        );
      })}
    </div>
  );

  if (!draggable) return board;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      {board}
      <DragOverlay dropAnimation={null}>
        {activeItem ? <div style={{ width: cardWidth }}>{renderCard(activeItem, true)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
