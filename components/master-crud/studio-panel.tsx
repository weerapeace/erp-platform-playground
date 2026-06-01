"use client";

/**
 * StudioPanel — F11 Part B (Studio v1)
 *
 * Drag-drop layout builder บนหน้าจริง (Odoo Studio style)
 * - ลากเรียง field ภายใน section
 * - ย้าย field ข้าม section (เปลี่ยน group_key)
 * - บันทึกลง Field Registry: display_order (PATCH bulk reorder) + group_key (POST bulk)
 *
 * เปิดผ่านปุ่ม "⚙️ ออกแบบหน้า" บน MasterCRUDPage (เฉพาะ admin)
 */

import { useState, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  DndContext, type DragEndEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// field ที่ Studio จัดการ — subset ของ FieldDef
export type StudioField = {
  fieldId?: string;
  key:      string;
  label:    string;
  groupKey: string;
  order:    number;
  type:     string;
};

const GROUP_META: Record<string, { label: string; icon: string; order: number }> = {
  core:      { label: "ข้อมูลหลัก",    icon: "📋", order: 10 },
  relations: { label: "ความสัมพันธ์", icon: "🔗", order: 20 },
  product:   { label: "คุณสมบัติ",     icon: "✨", order: 25 },
  specs:     { label: "ขนาด/สเปก",    icon: "📐", order: 30 },
  supplier:  { label: "ผู้จำหน่าย",    icon: "🏭", order: 35 },
  content:   { label: "เนื้อหา",       icon: "📝", order: 40 },
  pricing:   { label: "ราคา",          icon: "💰", order: 50 },
  media:     { label: "รูปภาพ/ไฟล์",   icon: "🖼️", order: 55 },
  status:    { label: "สถานะ",         icon: "🟢", order: 60 },
  other:     { label: "อื่น ๆ",        icon: "📦", order: 80 },
  system:    { label: "ระบบ",          icon: "⚙️", order: 90 },
};
function gmeta(k: string) { return GROUP_META[k] ?? { label: k, icon: "📁", order: 99 }; }
const ALL_GROUPS = Object.keys(GROUP_META);

export function StudioPanel({
  fields, moduleLabel, onClose, onSaved,
}: {
  fields:      StudioField[];
  moduleLabel: string;
  onClose:     () => void;
  onSaved:     () => void;
}) {
  // working copy — แก้ใน state ก่อน save
  const [items, setItems] = useState<StudioField[]>(() =>
    [...fields].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [msg,    setMsg]    = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // group items → section
  const grouped = useMemo(() => {
    const map = new Map<string, StudioField[]>();
    // เริ่มทุก group ที่ปรากฏ + group ว่างที่อาจ drop ลงได้
    for (const it of items) {
      const k = it.groupKey ?? "other";
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => gmeta(a).order - gmeta(b).order);
  }, [items]);

  // หา field จาก key
  const findField = (key: string) => items.find((i) => i.key === key);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overId    = String(over.id);

    setItems((prev) => {
      const activeIdx = prev.findIndex((i) => i.key === activeKey);
      if (activeIdx < 0) return prev;

      // drop บน section header (id = "group:<key>") → ย้ายเข้า group นั้นต่อท้าย
      if (overId.startsWith("group:")) {
        const targetGroup = overId.slice(6);
        const next = [...prev];
        next[activeIdx] = { ...next[activeIdx], groupKey: targetGroup };
        setDirty(true);
        return next;
      }

      // drop บน field อื่น
      const overIdx = prev.findIndex((i) => i.key === overId);
      if (overIdx < 0) return prev;
      const next = [...prev];
      // ถ้าข้าม group → เปลี่ยน groupKey ของ active เป็นของ over
      if (next[activeIdx].groupKey !== next[overIdx].groupKey) {
        next[activeIdx] = { ...next[activeIdx], groupKey: next[overIdx].groupKey };
      }
      setDirty(true);
      return arrayMove(next, activeIdx, overIdx);
    });
  }, []);

  const moveToGroup = (key: string, group: string) => {
    setItems((prev) => prev.map((i) => i.key === key ? { ...i, groupKey: group } : i));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      // คำนวณ order ใหม่ตามลำดับใน items (global, step 10)
      // + group ใหม่ของแต่ละ field
      const withFieldId = items.filter((i) => i.fieldId);

      // 1. reorder (display_order)
      const reorder = withFieldId.map((i, idx) => ({ id: i.fieldId!, display_order: (idx + 1) * 10 }));
      const r1 = await apiFetch("/api/admin/field-registry-v2/bulk", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder }),
      });
      const j1 = await r1.json();
      if (j1.error) throw new Error(j1.error);

      // 2. group_key — group ทีละ value (bulk POST รับ patch เดียวต่อชุด ids)
      const byGroup = new Map<string, string[]>();
      for (const i of withFieldId) {
        const g = byGroup.get(i.groupKey) ?? [];
        g.push(i.fieldId!);
        byGroup.set(i.groupKey, g);
      }
      for (const [group, ids] of byGroup) {
        const r2 = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: { group_key: group } }),
        });
        const j2 = await r2.json();
        if (j2.error) throw new Error(j2.error);
      }

      setMsg("✓ บันทึก layout สำเร็จ");
      setDirty(false);
      setTimeout(() => { onSaved(); }, 600);
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎨</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">ออกแบบหน้า — {moduleLabel}</h2>
            <p className="text-xs text-slate-500">ลาก field เรียงลำดับ / ย้ายข้ามหมวด → กดบันทึก</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
          <button onClick={onClose} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            ปิด
          </button>
          <button onClick={save} disabled={saving || !dirty}
            className="h-9 px-4 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึก layout"}
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {grouped.map(([groupKey, groupFields]) => {
                  const meta = gmeta(groupKey);
                  return (
                    <SectionDropZone key={groupKey} groupKey={groupKey} label={meta.label} icon={meta.icon} count={groupFields.length}>
                      {groupFields.map((f) => (
                        <StudioFieldCard
                          key={f.key}
                          field={f}
                          onMoveGroup={(g) => moveToGroup(f.key, g)}
                        />
                      ))}
                      {groupFields.length === 0 && (
                        <div className="text-xs text-slate-300 py-3 text-center border-2 border-dashed border-slate-200 rounded-lg">
                          ลาก field มาวางที่นี่
                        </div>
                      )}
                    </SectionDropZone>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SectionDropZone — section header + ที่วาง field
// ============================================================

function SectionDropZone({
  groupKey, label, icon, count, children,
}: {
  groupKey: string;
  label:    string;
  icon:     string;
  count:    number;
  children: React.ReactNode;
}) {
  // ทำ header เป็น droppable ผ่าน useSortable (id = group:<key>)
  const { setNodeRef, isOver } = useSortable({ id: `group:${groupKey}` });
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div
        ref={setNodeRef}
        className={`px-4 py-2.5 flex items-center gap-2 border-b border-slate-100 transition-colors ${
          isOver ? "bg-orange-50" : "bg-slate-50"
        }`}
      >
        <span>{icon}</span>
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-xs text-slate-400">({count})</span>
      </div>
      <div className="p-3 space-y-1.5">
        {children}
      </div>
    </div>
  );
}

// ============================================================
// StudioFieldCard — field ที่ลากได้ + dropdown ย้ายหมวด
// ============================================================

function StudioFieldCard({
  field, onMoveGroup,
}: {
  field:       StudioField;
  onMoveGroup: (group: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isDragging ? "border-orange-300 bg-orange-50 shadow-lg" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {/* drag handle */}
      <span {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-400 select-none px-1">⋮⋮</span>
      <span className="flex-1 text-sm text-slate-700 truncate">
        {field.label}
        <code className="ml-1.5 text-[10px] text-slate-400">{field.key}</code>
      </span>
      <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">{field.type}</span>
      {/* ย้ายหมวด dropdown (สำหรับมือถือ / ไม่อยากลาก) */}
      <select
        value={field.groupKey}
        onChange={(e) => onMoveGroup(e.target.value)}
        className="text-[10px] px-1 py-0.5 border border-slate-200 rounded bg-white"
        title="ย้ายไปหมวด"
        onClick={(e) => e.stopPropagation()}
      >
        {ALL_GROUPS.map((g) => <option key={g} value={g}>{gmeta(g).label}</option>)}
      </select>
    </div>
  );
}
