"use client";

// ============================================================
// CanvasBoard — กระดาน Section + การ์ด (ของกลาง)
//
// กระดานแบบ miro อย่างง่าย: แบ่งเป็นโซน (section) ซ้อนกันแนวตั้ง
// การ์ดเรียง grid ในโซน ลากการ์ดข้ามโซนได้ (= ย้ายหมวด/ผู้รับ/แบรนด์ ฯลฯ)
//
// ใช้ที่: Design Sheets (โซน=แบรนด์) · อนาคต: work-board (โซน=แผนก), kanban
// ห้าม: สร้างบอร์ดลาก-วางเองใหม่ในแต่ละโมดูล — ใช้ตัวนี้แล้วส่ง renderCard เอง
// doc: docs/canvas-board.md · ตัวอย่างโค้ด: app/_demos/canvas-board-demo (โฟลเดอร์เดโม่ถูกซ่อนจาก URL)
// ============================================================

import { useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";

export type CanvasZone = {
  id: string;             // ค่าที่ใช้จับคู่กับ getZoneId ของ item (เช่น brand_id)
  title: string;
  color?: string | null;  // สีประจำโซน (จุด + เส้นคาดหัวโซน) เช่นสีแบรนด์
  hint?: string;          // ข้อความเล็กท้ายหัวโซน เช่น "ลากการ์ดมาวางเพื่อย้ายแบรนด์"
};

type CanvasBoardProps<T> = {
  zones: CanvasZone[];
  items: T[];
  getItemId: (item: T) => string;
  getZoneId: (item: T) => string;                       // item อยู่โซนไหน
  renderCard: (item: T, dragging: boolean) => ReactNode; // หน้าตาการ์ด (โมดูลกำหนดเอง)
  onMove?: (item: T, toZoneId: string) => void;          // ปล่อยการ์ดลงโซนใหม่
  onCardClick?: (item: T) => void;
  canDrag?: boolean;                                     // default true (เช็ค permission จากฝั่งผู้ใช้)
  cardWidth?: number;                                    // px ความกว้างการ์ด (default 184)
  hideEmptyZones?: boolean;                              // ซ่อนโซนที่ไม่มีการ์ด (default false — โชว์ไว้ให้ลากลง)
  emptyText?: string;                                    // ข้อความโซนว่าง
};

function DraggableCard({ id, disabled, onClick, children }: { id: string; disabled: boolean; onClick?: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`${disabled ? "" : "cursor-grab active:cursor-grabbing"} touch-none ${isDragging ? "opacity-40" : ""}`}>
      {children}
    </div>
  );
}

function Zone({ zone, count, children }: { zone: CanvasZone; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  const accent = zone.color || "#cbd5e1";
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100" style={{ borderTop: `3px solid ${accent}` }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: accent }} />
        <span className="text-sm font-semibold text-slate-700">{zone.title}</span>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{count}</span>
        {zone.hint && <span className="text-[11px] text-slate-300 ml-auto hidden sm:inline">{zone.hint}</span>}
      </div>
      <div ref={setNodeRef}
        className={`flex flex-wrap gap-2 p-3 min-h-[96px] transition-colors ${isOver ? "bg-blue-50/70" : "bg-slate-50/50"}`}>
        {children}
      </div>
    </section>
  );
}

export function CanvasBoard<T>({
  zones, items, getItemId, getZoneId, renderCard, onMove, onCardClick,
  canDrag = true, cardWidth = 184, hideEmptyZones = false,
  emptyText = "ยังไม่มีการ์ด — ลากมาวางที่นี่ได้",
}: CanvasBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeItem = activeId != null ? items.find((it) => getItemId(it) === activeId) ?? null : null;
  const draggable = canDrag && !!onMove;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const toZone = e.over?.id != null ? String(e.over.id) : null;
    if (!toZone || !onMove) return;
    const item = items.find((it) => getItemId(it) === String(e.active.id));
    if (item && getZoneId(item) !== toZone) onMove(item, toZone);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        {zones.map((z) => {
          const zoneItems = items.filter((it) => getZoneId(it) === z.id);
          if (hideEmptyZones && zoneItems.length === 0) return null;
          return (
            <Zone key={z.id} zone={z} count={zoneItems.length}>
              {zoneItems.map((it) => (
                <div key={getItemId(it)} style={{ width: cardWidth }}>
                  <DraggableCard id={getItemId(it)} disabled={!draggable} onClick={onCardClick ? () => onCardClick(it) : undefined}>
                    {renderCard(it, false)}
                  </DraggableCard>
                </div>
              ))}
              {zoneItems.length === 0 && (
                <div className="w-full h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">
                  {emptyText}
                </div>
              )}
            </Zone>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <div style={{ width: cardWidth }}>{renderCard(activeItem, true)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
