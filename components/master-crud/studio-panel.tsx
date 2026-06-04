"use client";

/**
 * StudioPanel — F11B + F23 (Studio v2)
 *
 * Layout builder บนหน้าจริง (Odoo Studio style) — full-screen, 2 tab:
 *   📊 ตาราง (List)  — toggle column show/hide + เรียงลำดับ + preview ตาราง
 *   📝 ฟอร์ม (Form)  — toggle show_in_form + ลาก field ข้าม section + preview ฟอร์ม
 *
 * บันทึกลง Field Registry:
 *   - display_order  (PATCH bulk reorder)
 *   - group_key      (POST bulk)
 *   - is_visible     (POST bulk) — column show ในตาราง
 *   - show_in_form   (POST bulk) — field show ในฟอร์ม
 */

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import type { FormLayout } from "@/app/api/admin/field-registry-v2/route";
import {
  DndContext, type DragEndEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// แท็บ Field Registry (ฝัง) — โหลดเฉพาะตอนเปิดแท็บ
const SchemaSyncClient = dynamic(
  () => import("@/app/admin/schema-sync/schema-sync-client").then((m) => m.SchemaSyncClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

export type StudioField = {
  fieldId?:    string;
  key:         string;
  label:       string;
  groupKey:    string;
  order:       number;
  type:        string;
  isVisible?:  boolean;   // column show ในตาราง
  showInForm?: boolean;   // field show ในฟอร์ม
  inlineEditable?: boolean; // แก้ไขเร็ว (quick edit) ในหน้า detail
  bulkEditable?: boolean;   // แก้แบบ bulk (หลายรายการ) ได้
  // ตั้งค่า field (เฟส Studio styling)
  formSpan?:     number;            // 1 = ครึ่งแถว, 2 = เต็มแถว
  helpText?:     string;
  placeholder?:  string;
  required?:     boolean;
  editable?:     boolean;           // false = อ่านอย่างเดียว
  defaultValue?: string | null;
  uiStyle?:      Record<string, unknown>;   // {size,bold,italic,underline,color,font,align,highlight}
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

type Tab = "table" | "form" | "registry";

export function StudioPanel({
  fields, moduleLabel, moduleKey, layout, onClose, onSaved, sampleRows = [],
}: {
  fields:      StudioField[];
  moduleLabel: string;
  moduleKey?:  string;
  layout?:     FormLayout;
  onClose:     () => void;
  onSaved:     () => void;
  sampleRows?: Record<string, unknown>[];
}) {
  const [tab, setTab] = useState<Tab>("table");
  // จำนวนคอลัมน์ต่อหมวด (section) — init จาก layout เดิม ไม่งั้น default 2
  const [sectionCols, setSectionCols] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    (layout?.tabs ?? []).forEach((t) => t.sections.forEach((s) => { out[s.key] = s.columns || 2; }));
    return out;
  });
  const setCols = (group: string, n: number) => { setSectionCols((p) => ({ ...p, [group]: n })); setDirty(true); };
  const [previewIdx, setPreviewIdx] = useState(0);
  const [items, setItems] = useState<StudioField[]>(() =>
    [...fields].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [msg,    setMsg]    = useState<string | null>(null);
  const [settingsKey, setSettingsKey] = useState<string | null>(null);   // field ที่กำลังเปิด ⚙️ ตั้งค่า

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---- helpers ----
  const patchItem = (key: string, patch: Partial<StudioField>) => {
    setItems((prev) => prev.map((i) => i.key === key ? { ...i, ...patch } : i));
    setDirty(true);
  };

  const toggleVisible = (key: string) =>
    setItems((prev) => { setDirty(true); return prev.map((i) => i.key === key ? { ...i, isVisible: !i.isVisible } : i); });
  const toggleForm = (key: string) =>
    setItems((prev) => { setDirty(true); return prev.map((i) => i.key === key ? { ...i, showInForm: !i.showInForm } : i); });
  const toggleInline = (key: string) =>
    setItems((prev) => { setDirty(true); return prev.map((i) => i.key === key ? { ...i, inlineEditable: !i.inlineEditable } : i); });
  const toggleBulk = (key: string) =>
    setItems((prev) => { setDirty(true); return prev.map((i) => i.key === key ? { ...i, bulkEditable: !i.bulkEditable } : i); });

  // ---- save ----
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const withId = items.filter((i) => i.fieldId);

      // 1. reorder (display_order — global, step 10)
      //    แบ่งเป็นก้อนละ 30 — กัน Cloudflare Worker (แผนฟรี) จำกัด 50 subrequest/คำขอ
      const reorder = withId.map((i, idx) => ({ id: i.fieldId!, display_order: (idx + 1) * 10 }));
      for (let s = 0; s < reorder.length; s += 30) {
        const chunk = reorder.slice(s, s + 30);
        const r1 = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reorder: chunk }),
        });
        const j1 = await r1.json();
        if (j1.error) throw new Error("reorder: " + j1.error);
      }

      // 2. group_key (ทีละ value)
      const byGroup = new Map<string, string[]>();
      for (const i of withId) {
        const g = byGroup.get(i.groupKey) ?? []; g.push(i.fieldId!); byGroup.set(i.groupKey, g);
      }
      for (const [group, ids] of byGroup) {
        const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: { group_key: group } }),
        });
        if ((await r.json()).error) throw new Error("group_key failed");
      }

      // 3. is_visible (column show) — แยก 2 กลุ่ม true/false
      const visTrue  = withId.filter((i) => i.isVisible).map((i) => i.fieldId!);
      const visFalse = withId.filter((i) => !i.isVisible).map((i) => i.fieldId!);
      for (const [ids, val] of [[visTrue, true], [visFalse, false]] as [string[], boolean][]) {
        if (ids.length === 0) continue;
        const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: { is_visible: val } }),
        });
        if ((await r.json()).error) throw new Error("is_visible failed");
      }

      // 4. show_in_form (field ในฟอร์ม)
      const formTrue  = withId.filter((i) => i.showInForm).map((i) => i.fieldId!);
      const formFalse = withId.filter((i) => !i.showInForm).map((i) => i.fieldId!);
      for (const [ids, val] of [[formTrue, true], [formFalse, false]] as [string[], boolean][]) {
        if (ids.length === 0) continue;
        const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: { show_in_form: val } }),
        });
        if ((await r.json()).error) throw new Error("show_in_form failed");
      }

      // 5. is_inline_editable (แก้ไขเร็วในหน้า detail)
      const inlineTrue  = withId.filter((i) => i.inlineEditable).map((i) => i.fieldId!);
      const inlineFalse = withId.filter((i) => !i.inlineEditable).map((i) => i.fieldId!);
      for (const [ids, val] of [[inlineTrue, true], [inlineFalse, false]] as [string[], boolean][]) {
        if (ids.length === 0) continue;
        const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: { is_inline_editable: val } }),
        });
        if ((await r.json()).error) throw new Error("is_inline_editable failed");
      }

      // 6. is_bulk_editable (แก้หลายรายการพร้อมกัน)
      const bulkTrue  = withId.filter((i) => i.bulkEditable).map((i) => i.fieldId!);
      const bulkFalse = withId.filter((i) => !i.bulkEditable).map((i) => i.fieldId!);
      for (const [ids, val] of [[bulkTrue, true], [bulkFalse, false]] as [string[], boolean][]) {
        if (ids.length === 0) continue;
        const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch: { is_bulk_editable: val } }),
        });
        if ((await r.json()).error) throw new Error("is_bulk_editable failed");
      }

      // 7. ตั้งค่า field รายตัว (ความกว้าง/help/placeholder/required/readonly/default/สไตล์) — PATCH ทีละ field
      await Promise.all(withId.map((i) =>
        apiFetch(`/api/admin/field-registry-v2/${i.fieldId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            form_column_span: i.formSpan ?? 1,
            help_text: i.helpText || null,
            placeholder: i.placeholder || null,
            is_required: !!i.required,
            is_editable: i.editable !== false,
            default_value: (i.defaultValue ?? "") || null,
            ui_style: i.uiStyle ?? {},
          }),
        })
      ));

      // 8. layout ฟอร์ม (จำนวนคอลัมน์ต่อ section) → erp_modules.config.layout
      if (moduleKey) {
        const order: string[] = [];
        for (const i of items) { const g = i.groupKey ?? "other"; if (!order.includes(g)) order.push(g); }
        const tabs = order.map((g) => ({
          key: g, label: gmeta(g).label, icon: gmeta(g).icon,
          sections: [{ key: g, label: gmeta(g).label, columns: sectionCols[g] ?? 2 }],
        }));
        const r = await apiFetch("/api/admin/module-layout", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module_key: moduleKey, layout: { tabs } }),
        });
        if ((await r.json()).error) throw new Error("layout failed");
      }

      setMsg("✓ บันทึก layout สำเร็จ");
      setDirty(false);
      setTimeout(() => onSaved(), 600);
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  // ---- drag (form tab — group + reorder) ----
  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id), overId = String(over.id);
    setItems((prev) => {
      const ai = prev.findIndex((i) => i.key === activeKey);
      if (ai < 0) return prev;
      if (overId.startsWith("group:")) {
        const g = overId.slice(6); const next = [...prev];
        next[ai] = { ...next[ai], groupKey: g }; setDirty(true); return next;
      }
      const oi = prev.findIndex((i) => i.key === overId);
      if (oi < 0) return prev;
      const next = [...prev];
      if (next[ai].groupKey !== next[oi].groupKey) next[ai] = { ...next[ai], groupKey: next[oi].groupKey };
      setDirty(true);
      return arrayMove(next, ai, oi);
    });
  }, []);

  // ---- group สำหรับ form tab ----
  const grouped = useMemo(() => {
    const map = new Map<string, StudioField[]>();
    for (const it of items) { const k = it.groupKey ?? "other"; const l = map.get(k) ?? []; l.push(it); map.set(k, l); }
    return Array.from(map.entries()).sort(([a], [b]) => gmeta(a).order - gmeta(b).order);
  }, [items]);

  // preview data
  const visibleCols = items.filter((i) => i.isVisible);
  const formFields  = items.filter((i) => i.showInForm);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🎨</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">ออกแบบหน้า — {moduleLabel}</h2>
            <p className="text-xs text-slate-500">เลือก field ที่โชว์ + เรียงลำดับ + ดู preview สด → กดบันทึก</p>
          </div>
          {/* Tabs */}
          <div className="ml-4 flex bg-slate-100 rounded-lg p-0.5">
            {([["table","📊 ตาราง"],["form","📝 ฟอร์ม"], ...(moduleKey ? [["registry","🗂️ Field Registry"] as [Tab,string]] : [])] as [Tab,string][]).map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab===t?"bg-white shadow-sm font-medium text-slate-900":"text-slate-500 hover:text-slate-700"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.startsWith("✓")?"text-emerald-600":"text-red-600"}`}>{msg}</span>}
          <button onClick={onClose} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">ปิด</button>
          <button onClick={save} disabled={saving || !dirty}
            className="h-9 px-4 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
          </button>
        </div>
      </header>

      {/* แท็บ Field Registry — ฝังหน้าตั้งค่า field เต็มความกว้าง */}
      {tab === "registry" && moduleKey && (
        <div className="flex-1 overflow-y-auto">
          <SchemaSyncClient initialModule={moduleKey} lockModule embedded />
        </div>
      )}

      {/* Body: ซ้าย = editor / ขวา = preview */}
      {tab !== "registry" && (
      <div className="flex-1 overflow-hidden flex">
        {/* ---- LEFT: editor ---- */}
        <div className="w-1/2 overflow-y-auto border-r border-slate-200 p-5">
          {tab === "table" ? (
            <TableEditor
              items={items} sensors={sensors}
              onReorder={(a,b)=>{ setItems((p)=>arrayMove(p,a,b)); setDirty(true); }}
              onToggleVisible={toggleVisible}
            />
          ) : (
            <FormEditor
              grouped={grouped} sensors={sensors} onDragEnd={onDragEnd}
              items={items} onToggleForm={toggleForm} onToggleInline={toggleInline} onToggleBulk={toggleBulk} onMoveGroup={(k,g)=>patchItem(k,{groupKey:g})}
              settingsKey={settingsKey} onToggleSettings={(k)=>setSettingsKey(s=>s===k?null:k)} onPatch={patchItem}
              sectionCols={sectionCols} onSetCols={setCols}
            />
          )}
        </div>

        {/* ---- RIGHT: live preview ---- */}
        <div className="w-1/2 overflow-y-auto bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-slate-400 uppercase">👁 Preview สด {tab==="form" && sampleRows.length>0 ? "(ข้อมูลจริง)" : ""}</div>
            {tab==="form" && sampleRows.length>0 && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 mr-1">ตัวอย่างรายการ:</span>
                {sampleRows.map((_,i)=>(
                  <button key={i} onClick={()=>setPreviewIdx(i)}
                    className={`w-6 h-6 rounded text-xs ${previewIdx===i?"bg-orange-500 text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{i+1}</button>
                ))}
              </div>
            )}
          </div>
          {tab === "table" ? (
            <TablePreview cols={visibleCols} />
          ) : (
            <FormPreview
              grouped={grouped.map(([g,fs])=>[g,fs.filter(f=>f.showInForm)] as [string,StudioField[]]).filter(([,fs])=>fs.length>0)}
              row={sampleRows[previewIdx]} moduleLabel={moduleLabel} />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ============================================================
// TABLE TAB — toggle visible + reorder (sortable list)
// ============================================================

function TableEditor({
  items, sensors, onReorder, onToggleVisible,
}: {
  items: StudioField[];
  sensors: ReturnType<typeof useSensors>;
  onReorder: (from: number, to: number) => void;
  onToggleVisible: (key: string) => void;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">ติ๊ก = โชว์ใน column ตาราง • ลาก ⋮⋮ เรียงลำดับ column</p>
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragEnd={(e: DragEndEvent)=>{ const {active,over}=e; if(!over||active.id===over.id)return;
          const a=items.findIndex(i=>i.key===active.id), b=items.findIndex(i=>i.key===over.id);
          if(a>=0&&b>=0) onReorder(a,b); }}>
        <SortableContext items={items.map(i=>i.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((f)=>(
              <ColRow key={f.key} field={f} onToggle={()=>onToggleVisible(f.key)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function ColRow({ field, onToggle }: { field: StudioField; onToggle: ()=>void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.4:1 };
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${field.isVisible?"border-emerald-200 bg-emerald-50/40":"border-slate-200 bg-white"} ${isDragging?"shadow-lg":""}`}>
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 select-none px-1">⋮⋮</span>
      <input type="checkbox" checked={!!field.isVisible} onChange={onToggle} className="rounded accent-emerald-500" />
      <span className="flex-1 text-sm text-slate-700 truncate">{field.label}
        <code className="ml-1.5 text-[10px] text-slate-400">{field.key}</code></span>
      <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">{field.type}</span>
    </div>
  );
}

function TablePreview({ cols }: { cols: StudioField[] }) {
  if (cols.length === 0) return <div className="text-sm text-slate-300 py-8 text-center">ยังไม่เลือก column — ติ๊กด้านซ้าย</div>;
  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>{cols.map(c=>(
            <th key={c.key} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {[1,2,3].map(r=>(
            <tr key={r} className="border-b border-slate-100">
              {cols.map(c=>(
                <td key={c.key} className="px-3 py-2 text-slate-400 whitespace-nowrap">
                  {c.type==="boolean"?"✓":c.type==="number"?"123":c.type==="image"?"🖼":"ตัวอย่าง"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// FORM TAB — toggle show_in_form + drag ข้าม section
// ============================================================

function FormEditor({
  grouped, sensors, onDragEnd, onToggleForm, onToggleInline, onToggleBulk, onMoveGroup, settingsKey, onToggleSettings, onPatch, sectionCols, onSetCols,
}: {
  grouped: [string, StudioField[]][];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (e: DragEndEvent)=>void;
  items: StudioField[];
  onToggleForm: (key: string)=>void;
  onToggleInline: (key: string)=>void;
  onToggleBulk: (key: string)=>void;
  onMoveGroup: (key: string, group: string)=>void;
  sectionCols: Record<string, number>;
  onSetCols: (group: string, n: number)=>void;
  settingsKey: string | null;
  onToggleSettings: (key: string)=>void;
  onPatch: (key: string, patch: Partial<StudioField>)=>void;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">☑ = โชว์ในฟอร์ม • ⚡ = แก้ไขเร็ว • ∑ = bulk • ⚙️ = ตั้งค่า/สไตล์ • ลาก ⋮⋮ เรียง/ย้ายหมวด</p>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={grouped.flatMap(([,fs])=>fs.map(f=>f.key))} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {grouped.map(([gk, fs])=>{
              const m = gmeta(gk);
              return (
                <FormSectionZone key={gk} groupKey={gk} label={m.label} icon={m.icon} count={fs.length}
                  cols={sectionCols[gk] ?? 2} onSetCols={(n)=>onSetCols(gk,n)}>
                  {fs.map(f=>(
                    <div key={f.key}>
                      <FormFieldRow field={f} onToggle={()=>onToggleForm(f.key)} onToggleInline={()=>onToggleInline(f.key)} onToggleBulk={()=>onToggleBulk(f.key)} onMoveGroup={(g)=>onMoveGroup(f.key,g)}
                        settingsOpen={settingsKey===f.key} onToggleSettings={()=>onToggleSettings(f.key)} />
                      {settingsKey===f.key && <FieldSettings field={f} onPatch={(patch)=>onPatch(f.key,patch)} />}
                    </div>
                  ))}
                </FormSectionZone>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ⚙️ แผงตั้งค่า field (ความกว้าง/help/required/readonly/default + สไตล์ presets)
const STYLE_COLORS = ["", "#0f172a", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#64748b"];
function FieldSettings({ field, onPatch }: { field: StudioField; onPatch: (patch: Partial<StudioField>)=>void }) {
  const us = (field.uiStyle ?? {}) as Record<string, unknown>;
  const setUi = (k: string, v: unknown) => onPatch({ uiStyle: { ...us, [k]: v } });
  const Toggle = ({ on, label, onClick }: { on: boolean; label: string; onClick: ()=>void }) => (
    <button type="button" onClick={onClick} className={`px-2 py-1 rounded border text-xs ${on?"bg-orange-100 border-orange-300 text-orange-700":"bg-white border-slate-200 text-slate-500"}`}>{label}</button>
  );
  return (
    <div className="mt-1 mb-1 ml-7 mr-1 p-3 rounded-lg border border-orange-200 bg-orange-50/40 space-y-2.5 text-xs">
      {/* แถว 1: ความกว้าง + required + readonly */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">ความกว้าง:</span>
        <Toggle on={(field.formSpan??1)!==2} label="ครึ่งแถว" onClick={()=>onPatch({formSpan:1})} />
        <Toggle on={(field.formSpan??1)===2} label="เต็มแถว" onClick={()=>onPatch({formSpan:2})} />
        <span className="ml-2 text-slate-300">|</span>
        <Toggle on={!!field.required} label="บังคับกรอก" onClick={()=>onPatch({required:!field.required})} />
        <Toggle on={field.editable===false} label="อ่านอย่างเดียว" onClick={()=>onPatch({editable:field.editable===false?true:false})} />
      </div>
      {/* แถว 2: help/placeholder/default */}
      <div className="grid grid-cols-1 gap-1.5">
        <input value={field.helpText ?? ""} onChange={(e)=>onPatch({helpText:e.target.value})} placeholder="ข้อความช่วย (help text)" className="h-8 px-2 border border-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-1.5">
          <input value={field.placeholder ?? ""} onChange={(e)=>onPatch({placeholder:e.target.value})} placeholder="placeholder" className="h-8 px-2 border border-slate-200 rounded" />
          <input value={String(field.defaultValue ?? "")} onChange={(e)=>onPatch({defaultValue:e.target.value})} placeholder="ค่าเริ่มต้น" className="h-8 px-2 border border-slate-200 rounded" />
        </div>
      </div>
      {/* แถว 3: สไตล์ตัวอักษร */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-orange-100">
        <span className="text-slate-500">สไตล์:</span>
        {(["sm","base","lg","xl"] as const).map(s=>(
          <Toggle key={s} on={String(us.size??"base")===s} label={s==="sm"?"เล็ก":s==="base"?"ปกติ":s==="lg"?"ใหญ่":"ใหญ่มาก"} onClick={()=>setUi("size",s)} />
        ))}
        <Toggle on={!!us.bold} label="B" onClick={()=>setUi("bold",!us.bold)} />
        <Toggle on={!!us.italic} label="I" onClick={()=>setUi("italic",!us.italic)} />
        <Toggle on={!!us.underline} label="U" onClick={()=>setUi("underline",!us.underline)} />
      </div>
      {/* แถว 4: ฟอนต์ + จัดชิด + ไฮไลต์ */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-500">ฟอนต์:</span>
        {(["","serif","mono"] as const).map(ff=>(
          <Toggle key={ff||"sans"} on={String(us.font??"")===ff} label={ff===""?"ปกติ":ff==="serif"?"มีหัว":"monospace"} onClick={()=>setUi("font",ff)} />
        ))}
        <span className="ml-1 text-slate-300">|</span>
        {(["left","center","right"] as const).map(al=>(
          <Toggle key={al} on={String(us.align??"left")===al} label={al==="left"?"⬅":al==="center"?"↔":"➡"} onClick={()=>setUi("align",al)} />
        ))}
        <span className="ml-1 text-slate-300">|</span>
        <Toggle on={!!us.highlight} label="ไฮไลต์" onClick={()=>setUi("highlight",!us.highlight)} />
        <Toggle on={!!us.copyable} label="📋 คัดลอกค่า" onClick={()=>setUi("copyable",!us.copyable)} />
      </div>
      {/* แถว 5: สี */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-500">สี:</span>
        {STYLE_COLORS.map(c=>(
          <button key={c||"default"} type="button" onClick={()=>setUi("color",c)}
            className={`w-6 h-6 rounded-full border-2 ${String(us.color??"")===c?"border-orange-500":"border-slate-200"} ${c===""?"bg-white text-[9px] text-slate-400 flex items-center justify-center":""}`}
            style={c?{background:c}:undefined} title={c||"ค่าเริ่มต้น"}>{c===""?"—":""}</button>
        ))}
      </div>
    </div>
  );
}

function FormSectionZone({ groupKey, label, icon, count, cols, onSetCols, children }: { groupKey: string; label: string; icon: string; count: number; cols: number; onSetCols: (n: number)=>void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useSortable({ id: `group:${groupKey}` });
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div ref={setNodeRef} className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100 ${isOver?"bg-orange-50":"bg-slate-50"}`}>
        <span>{icon}</span><span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-xs text-slate-400">({count})</span>
        <div className="ml-auto flex items-center gap-1" title="จำนวนคอลัมน์ของหมวดนี้">
          <span className="text-[11px] text-slate-400">คอลัมน์:</span>
          {[1,2,3].map((n)=>(
            <button key={n} type="button" onClick={()=>onSetCols(n)}
              className={`w-6 h-6 text-xs rounded border ${cols===n?"bg-orange-100 border-orange-300 text-orange-700 font-semibold":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{n}</button>
          ))}
        </div>
      </div>
      <div className="p-2 space-y-1">{children}</div>
    </div>
  );
}

function FormFieldRow({ field, onToggle, onToggleInline, onToggleBulk, onMoveGroup, settingsOpen, onToggleSettings }: { field: StudioField; onToggle: ()=>void; onToggleInline: ()=>void; onToggleBulk: ()=>void; onMoveGroup: (g:string)=>void; settingsOpen: boolean; onToggleSettings: ()=>void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.4:1 };
  // ชนิดที่ quick-edit ได้ (text/number/boolean/select)
  const inlineable = ["text","number","boolean","select"].includes(field.type);
  // ชนิดที่ bulk-edit ได้ (รวม relation ด้วย — เลือกค่าเดียวให้ทุกแถว)
  const bulkable = inlineable || field.type === "relation";
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${field.showInForm?"border-blue-200 bg-blue-50/40":"border-slate-200 bg-white"} ${isDragging?"shadow-lg":""}`}>
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 select-none px-1">⋮⋮</span>
      <input type="checkbox" checked={!!field.showInForm} onChange={onToggle} className="rounded accent-blue-500" title="โชว์ในฟอร์ม" />
      <span className="flex-1 text-sm text-slate-700 truncate">{field.label}
        <code className="ml-1.5 text-[10px] text-slate-400">{field.key}</code></span>
      {inlineable && (
        <button type="button" onClick={(e)=>{ e.stopPropagation(); onToggleInline(); }}
          title="แก้ไขเร็ว (กดแก้ในหน้า detail ได้เลย)"
          className={`text-xs px-1.5 py-0.5 rounded border ${field.inlineEditable?"bg-amber-100 border-amber-300 text-amber-700":"bg-white border-slate-200 text-slate-400"}`}>⚡</button>
      )}
      {bulkable && (
        <button type="button" onClick={(e)=>{ e.stopPropagation(); onToggleBulk(); }}
          title="แก้แบบ bulk (หลายรายการพร้อมกัน)"
          className={`text-xs px-1.5 py-0.5 rounded border ${field.bulkEditable?"bg-violet-100 border-violet-300 text-violet-700":"bg-white border-slate-200 text-slate-400"}`}>∑</button>
      )}
      <select value={field.groupKey} onChange={(e)=>onMoveGroup(e.target.value)} onClick={(e)=>e.stopPropagation()}
        className="text-[10px] px-1 py-0.5 border border-slate-200 rounded bg-white" title="ย้ายหมวด">
        {ALL_GROUPS.map(g=><option key={g} value={g}>{gmeta(g).label}</option>)}
      </select>
      <button type="button" onClick={(e)=>{ e.stopPropagation(); onToggleSettings(); }}
        title="ตั้งค่า/สไตล์ field"
        className={`text-xs px-1.5 py-0.5 rounded border ${settingsOpen?"bg-orange-100 border-orange-300 text-orange-700":"bg-white border-slate-200 text-slate-400"}`}>⚙️</button>
    </div>
  );
}

// preset → CSS (ให้ตรงกับฝั่ง form จริงใน MasterCRUD)
function uiStyleCss(us: Record<string, unknown>): React.CSSProperties {
  const SZ: Record<string, string> = { sm: "12px", base: "14px", lg: "16px", xl: "20px" };
  const FF: Record<string, string> = { serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, 'Courier New', monospace" };
  return {
    fontSize: SZ[String(us.size ?? "")] || undefined,
    fontWeight: us.bold ? 700 : undefined,
    fontStyle: us.italic ? "italic" : undefined,
    textDecoration: us.underline ? "underline" : undefined,
    color: typeof us.color === "string" && us.color ? us.color : undefined,
    fontFamily: FF[String(us.font ?? "")] || undefined,
    textAlign: (["left", "center", "right"].includes(String(us.align)) ? (us.align as "left" | "center" | "right") : undefined),
  };
}
function previewVal(row: Record<string, unknown> | undefined, f: StudioField): string {
  if (!row) return "";
  if (f.type === "relation" || f.type === "many2many" || f.type === "one2many")
    return String(row[`${f.key}_label`] ?? row[f.key] ?? "");
  const v = row[f.key];
  if (v == null || v === "") return "";
  if (f.type === "boolean") return v ? "✓ เปิด" : "✗ ปิด";
  if (f.type === "image") return "🖼 (รูป)";
  return String(v);
}

function FormPreview({ grouped, row, moduleLabel }: { grouped: [string, StudioField[]][]; row?: Record<string, unknown>; moduleLabel: string }) {
  if (grouped.length === 0) return <div className="text-sm text-slate-300 py-8 text-center">ยังไม่เลือก field — ติ๊กด้านซ้าย</div>;
  return (
    <div className="space-y-4 max-w-lg">
      <div className="text-sm font-semibold text-slate-800">📄 {moduleLabel} — รายละเอียด {row ? "" : <span className="text-xs font-normal text-slate-300">(ไม่มีข้อมูลตัวอย่าง)</span>}</div>
      {grouped.map(([gk, fs])=>{
        const m = gmeta(gk);
        return (
          <div key={gk} className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <span>{m.icon}</span>{m.label}
            </div>
            <div className="p-3 grid grid-cols-2 gap-3">
              {fs.map(f=>{
                const us = (f.uiStyle ?? {}) as Record<string, unknown>;
                const css = uiStyleCss(us);
                const hl = !!us.highlight;
                const val = previewVal(row, f);
                return (
                  <div key={f.key} className={`space-y-0.5 ${f.formSpan===2?"col-span-2":""} ${hl?"bg-amber-50 border border-amber-200 rounded p-1.5":""}`}>
                    <div className="text-[11px] text-slate-500" style={css}>{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</div>
                    <div className="text-sm text-slate-800 min-h-[1.25rem] break-words" style={css}>{val || <span className="text-slate-300">—</span>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
