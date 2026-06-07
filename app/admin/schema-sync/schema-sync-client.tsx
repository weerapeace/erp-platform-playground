"use client";

/**
 * Admin Schema Sync — Sprint 1 + Sprint 11
 *
 * URL: /admin/schema-sync
 *
 * Sprint 1:
 * - เลือก module
 * - ปุ่ม "Sync from Supabase" — ดึง column ใหม่จาก DB
 * - ตาราง field — แก้ visible/filterable/sortable/required/label/group/width
 *
 * Sprint 11:
 * - ✋ Drag-drop reorder fields → PATCH bulk display_order
 * - ☑ Checkbox + bulk action bar → set visible/filter/sort หลาย row พร้อมกัน
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useBackdropDismiss } from "@/components/modal";
import { FieldCreatorModal } from "@/components/field-creator";
import { SearchableSelect } from "@/components/searchable-select";
import { IconPicker } from "@/components/icon-picker";
import { apiFetch } from "@/lib/api";
import { useRoleOptions } from "@/lib/use-roles";
import type { SchemaSyncResponse, RegistryField } from "@/app/api/admin/schema-sync/route";
import {
  DndContext, DragEndEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// fallback ถ้าโหลดจากทะเบียนไม่ได้
const FALLBACK_MODULES = [
  { key: "parent-skus-v2", label: "Parent SKUs (v2)" },
  { key: "skus-v2",        label: "SKUs (v2)" },
  { key: "partners-v2",    label: "Partners (v2)" },
  { key: "brands",         label: "Brands" },
  { key: "collections",    label: "Collections" },
];

const GROUP_OPTIONS = [
  { value: "core",      label: "ข้อมูลหลัก" },
  { value: "relations", label: "ความสัมพันธ์" },
  { value: "pricing",   label: "ราคา" },
  { value: "specs",     label: "ขนาด/สเปก" },
  { value: "content",   label: "เนื้อหา" },
  { value: "status",    label: "สถานะ" },
  { value: "system",    label: "ระบบ" },
  { value: "other",     label: "อื่นๆ" },
];

const UI_TYPE_OPTIONS = ["text", "number", "boolean", "date", "select", "relation", "json", "textarea"];

// 15 columns — ต้อง match กับ FieldRow + thead ด้านล่าง (sprint 13: +🎯 Condition col)
const COLUMN_COUNT = 15;

// Sprint 13: ลำดับ + label ของ group สำหรับ collapsible header
const GROUP_META: Record<string, { icon: string; label: string; order: number }> = {
  core:      { icon: "📋", label: "ข้อมูลหลัก",     order: 10 },
  relations: { icon: "🔗", label: "ความสัมพันธ์",  order: 20 },
  product:   { icon: "✨", label: "คุณสมบัติ",      order: 25 },
  specs:     { icon: "📐", label: "ขนาด/สเปก",     order: 30 },
  supplier:  { icon: "🏭", label: "ผู้จำหน่าย",     order: 35 },
  content:   { icon: "📝", label: "เนื้อหา",        order: 40 },
  pricing:   { icon: "💰", label: "ราคา",           order: 50 },
  media:     { icon: "🖼️", label: "รูปภาพ/ไฟล์",    order: 55 },
  status:    { icon: "🟢", label: "สถานะ",          order: 60 },
  other:     { icon: "📦", label: "อื่น ๆ",         order: 80 },
  system:    { icon: "⚙️", label: "ระบบ",           order: 90 },
};
function groupMeta(key: string) {
  return GROUP_META[key] ?? { icon: "📁", label: key, order: 99 };
}

export function SchemaSyncClient({ initialModule, lockModule, embedded }: {
  initialModule?: string;   // เปิดมาที่โมดูลนี้เลย (deep-link)
  lockModule?: boolean;     // ซ่อน dropdown เลือกโมดูล (ใช้ตอนฝังในหน้าตั้งค่าของโมดูล)
  embedded?: boolean;       // ฝังในหน้าอื่น → ไม่ครอบ PlaygroundShell ซ้ำ
} = {}) {
  const [moduleKey, setModuleKey] = useState(initialModule ?? "parent-skus-v2");
  // โหลดรายชื่อโมดูลทั้งหมดจากทะเบียน (ไม่ hardcode) — fallback ถ้าโหลดไม่ได้
  const [modules, setModules] = useState<{ key: string; label: string; table?: string }[]>(FALLBACK_MODULES);
  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      if (Array.isArray(j.data) && j.data.length) setModules(j.data as { key: string; label: string; table?: string }[]);
    }).catch(() => {});
  }, []);
  const [data,      setData]      = useState<SchemaSyncResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [savingId,  setSavingId]  = useState<string | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [fieldCreatorOpen, setFieldCreatorOpen] = useState(false);   // เพิ่ม field จากหน้านี้
  // ลบ field (+ ลบคอลัมน์ใน Supabase)
  const [deleteTarget, setDeleteTarget] = useState<RegistryField | null>(null);
  const [deleteDropCol, setDeleteDropCol] = useState(true);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const isVirtualField = (f: RegistryField | null) =>
    !f?.column_name || ["computed", "one2many", "many2many", "related"].includes(String(f?.ui_field_type ?? ""));
  const doDeleteField = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch("/api/admin/schema/delete-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey, field_key: deleteTarget.field_key, drop_column: deleteDropCol && !isVirtualField(deleteTarget) }),
      });
      const j = await res.json();
      if (j.error) { flash("❌ " + j.error); return; }
      setDeleteTarget(null); setDeleteText(""); setDeleteDropCol(true);
      flash("✓ ลบ field แล้ว");
      load();
    } catch (e) { flash("❌ " + (e instanceof Error ? e.message : "ลบไม่สำเร็จ")); }
    finally { setDeleting(false); }
  };

  // เปลี่ยนประเภท field (เตือน + ยืนยัน 2 ชั้น + ตั้งค่า select/relation)
  const [typeChange, setTypeChange] = useState<{ field: RegistryField; newType: string } | null>(null);
  const [tcStats, setTcStats] = useState<{ total: number; filled: number } | null>(null);
  const [tcAck, setTcAck] = useState(false);
  const [tcOptions, setTcOptions] = useState("");
  const [tcTargetTable, setTcTargetTable] = useState("");
  const [tcTargetLabel, setTcTargetLabel] = useState("name");
  const [tcApplying, setTcApplying] = useState(false);

  const openTypeChange = (f: RegistryField, newType: string) => {
    setTypeChange({ field: f, newType });
    setTcStats(null); setTcAck(false); setTcApplying(false);
    setTcOptions(((f.options as { options?: string[] })?.options ?? []).join("\n"));
    setTcTargetTable(""); setTcTargetLabel("name");
    apiFetch(`/api/admin/schema/field-stats?module=${encodeURIComponent(moduleKey)}&field=${encodeURIComponent(f.column_name ?? f.field_key)}`)
      .then((r) => r.json()).then((j) => { if (!j.error) setTcStats({ total: j.total, filled: j.filled }); }).catch(() => {});
  };

  const applyTypeChange = async () => {
    if (!typeChange) return;
    const { field, newType } = typeChange;
    const patch: Record<string, unknown> = { ui_field_type: newType };
    if (newType === "select") {
      const opts = tcOptions.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      patch.options = { options: opts };
    }
    if (newType === "relation") {
      if (!tcTargetTable) { flash("เลือกตารางปลายทางก่อน"); return; }
      const tgt = modules.find((m) => m.table === tcTargetTable);
      patch.relation_config = {
        allow_create: false, target_table: tcTargetTable,
        target_module_key: tgt?.key ?? tcTargetTable,
        target_label_field: tcTargetLabel || "name",
        target_search_fields: [tcTargetLabel || "name"],
      };
      patch.is_editable = true;
    }
    setTcApplying(true);
    try { await updateField(field.id, patch); setTypeChange(null); flash("✓ เปลี่ยนประเภทแล้ว"); }
    finally { setTcApplying(false); }
  };
  const tcCanApply = !!typeChange && tcAck && !tcApplying
    && (typeChange.newType !== "select" || tcOptions.split(/[\n,]/).some((s) => s.trim()))
    && (typeChange.newType !== "relation" || !!tcTargetTable);

  // Sprint 11
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkSaving,  setBulkSaving]  = useState(false);
  const [reordering,  setReordering]  = useState(false);

  // Sprint 13: collapsible groups + condition editor modal
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [conditionEditing, setConditionEditing] = useState<RegistryField | null>(null);

  // ฟิลด์ "ชื่อหลัก (display)" ของโมดูล — sync จาก module.primary_field
  const [displayField, setDisplayField] = useState<string>("");

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/schema-sync?module=${moduleKey}`);
      const json: SchemaSyncResponse = await res.json();
      setData(json);
      setSelected(new Set());  // เคลียร์ selection เมื่อเปลี่ยน module
    } finally { setLoading(false); }
  }, [moduleKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDisplayField(String(data?.module?.primary_field ?? "")); }, [data?.module]);

  // ตั้ง/ยกเลิก "ชื่อหลัก (display)" — บันทึก primary_field + propagate ไป relation ที่ชี้มาที่โมดูลนี้
  const setDisplay = async (colName: string) => {
    const prev = displayField;
    const next = displayField === colName ? "" : colName;   // กดซ้ำ = ยกเลิก
    setDisplayField(next);
    try {
      const res = await apiFetch("/api/admin/module-display-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey, field: next }),
      });
      const j = await res.json();
      if (j.error) { flash("❌ " + j.error); setDisplayField(prev); return; }
      flash(next
        ? `✓ ตั้ง “${colName}” เป็นชื่อหลัก${j.relations_updated ? ` · อัปเดต dropdown ${j.relations_updated} จุด` : ""}`
        : "✓ ยกเลิกชื่อหลักแล้ว");
    } catch (e) { flash("❌ " + (e instanceof Error ? e.message : "ไม่สำเร็จ")); setDisplayField(prev); }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch(`/api/admin/schema-sync?module=${moduleKey}`, { method: "POST" });
      const json = await res.json();
      if (json.error) flash("❌ " + json.error);
      else {
        const r = json.data;
        flash(`✓ Sync เสร็จ — ใหม่ ${r.inserted} fields | DB ${r.db_column_count} | Registry ${r.registry_count}`);
        await load();
      }
    } finally { setSyncing(false); }
  };

  const updateField = async (id: string, patch: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const res = await apiFetch(`/api/admin/field-registry-v2/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.error) {
        flash("❌ " + json.error);
        return;
      }
      setData((prev) => prev ? {
        ...prev,
        registry: prev.registry.map((f) => f.id === id ? { ...f, ...patch } : f),
      } : prev);
    } finally { setSavingId(null); }
  };

  // ========== Sprint 11: Bulk update ==========
  const bulkUpdate = async (patch: Record<string, unknown>) => {
    if (selected.size === 0) return;
    setBulkSaving(true);
    try {
      const ids = [...selected];
      const res = await apiFetch("/api/admin/field-registry-v2/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      const json = await res.json();
      if (json.error) flash("❌ " + json.error);
      else {
        flash(`✓ อัปเดต ${json.success} field (${Object.keys(patch).join(", ")})`);
        // optimistic update local
        setData((prev) => prev ? {
          ...prev,
          registry: prev.registry.map((f) => selected.has(f.id) ? { ...f, ...patch } : f),
        } : prev);
        setSelected(new Set());
      }
    } finally { setBulkSaving(false); }
  };

  // ========== Sprint 11: Drag-drop reorder ==========
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;

    const oldIdx = data.registry.findIndex((f) => f.id === active.id);
    const newIdx = data.registry.findIndex((f) => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(data.registry, oldIdx, newIdx);
    // คำนวณ display_order ใหม่ — รักษา gap step 10 เพื่อแทรกง่าย
    const updates = reordered.map((f, i) => ({ id: f.id, display_order: (i + 1) * 10 }));

    // optimistic update
    setData((prev) => prev ? {
      ...prev,
      registry: reordered.map((f, i) => ({ ...f, display_order: (i + 1) * 10 })),
    } : prev);

    setReordering(true);
    try {
      const res = await apiFetch("/api/admin/field-registry-v2/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: updates }),
      });
      const json = await res.json();
      if (json.error) flash("❌ reorder failed: " + json.error);
      else flash(`✓ เรียงลำดับใหม่ ${json.success} field`);
    } finally { setReordering(false); }
  };

  // filter rows
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.registry.filter((f) => {
      if (groupFilter && f.group_key !== groupFilter) return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        f.field_label.toLowerCase().includes(q) ||
        (f.column_name ?? "").toLowerCase().includes(q) ||
        f.field_key.toLowerCase().includes(q)
      );
    });
  }, [data, filter, groupFilter]);

  // meta (label/icon) ของกลุ่มฟิลด์ที่ตั้งเอง — เก็บใน erp_modules.config.field_groups
  const fieldGroups = useMemo(
    () => ((data?.module?.config?.field_groups ?? {}) as Record<string, { label?: string; icon?: string }>),
    [data],
  );
  // resolve icon/label ของกลุ่ม: config.field_groups ก่อน → GROUP_META → fallback
  const gMeta = (key: string): { icon: string; label: string; order: number } => {
    const fg = fieldGroups[key];
    if (fg) return { icon: fg.icon ?? "📁", label: fg.label ?? key, order: GROUP_META[key]?.order ?? 70 };
    return groupMeta(key);
  };

  // กลุ่มฟิลด์ที่ผู้ใช้เพิ่มเองในหน้านี้ (รวมกับ GROUP_OPTIONS + กลุ่มที่มีอยู่ในข้อมูล)
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const groupOptions = useMemo(() => {
    const seen = new Set(GROUP_OPTIONS.map((g) => g.value));
    const out = [...GROUP_OPTIONS];
    for (const f of data?.registry ?? []) {
      if (f.group_key && !seen.has(f.group_key)) { seen.add(f.group_key); out.push({ value: f.group_key, label: gMeta(f.group_key).label }); }
    }
    for (const k of Object.keys(fieldGroups)) if (!seen.has(k)) { seen.add(k); out.push({ value: k, label: gMeta(k).label }); }
    for (const g of customGroups) if (!seen.has(g)) { seen.add(g); out.push({ value: g, label: gMeta(g).label }); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, customGroups, fieldGroups]);

  // popup สร้าง/แก้ไขกลุ่มฟิลด์ + จัดการกลุ่ม
  const [groupModal, setGroupModal] = useState<{ mode: "create" | "edit"; origKey: string; name: string; icon: string } | null>(null);
  const [groupMgr, setGroupMgr] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);

  const saveGroupModal = async () => {
    if (!groupModal) return;
    const name = groupModal.name.trim();
    if (!name) return;
    setGroupSaving(true);
    try {
      if (groupModal.mode === "create") {
        await apiFetch("/api/admin/field-groups", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module_key: moduleKey, action: "upsert", key: name, label: name, icon: groupModal.icon }),
        });
        setCustomGroups((p) => (p.includes(name) ? p : [...p, name]));
        if (selected.size > 0) await bulkUpdate({ group_key: name });
      } else {
        const res = await apiFetch("/api/admin/field-groups", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module_key: moduleKey, action: "rename", key: groupModal.origKey, new: name, label: name, icon: groupModal.icon }),
        });
        const j = await res.json(); if (j.error) { flash("❌ " + j.error); return; }
      }
      setGroupModal(null);
      flash("✓ บันทึกกลุ่มแล้ว");
      await load();
    } catch (e) { flash("❌ " + (e instanceof Error ? e.message : "ไม่สำเร็จ")); }
    finally { setGroupSaving(false); }
  };

  // เลือกกลุ่มของฟิลด์ — เลือก "เพิ่มกลุ่มใหม่" จะถามชื่อกลุ่มแล้วตั้งให้
  const pickGroup = (id: string, value: string) => {
    if (value === "__new__") {
      const name = (typeof window !== "undefined" ? window.prompt("ชื่อกลุ่มใหม่ (เช่น สเปกเข็มขัด)") : "")?.trim();
      if (!name) return;
      setCustomGroups((p) => (p.includes(name) ? p : [...p, name]));
      updateField(id, { group_key: name });
    } else {
      updateField(id, { group_key: value });
    }
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, visible: 0, filterable: 0, sortable: 0, searchable: 0, sensitive: 0, newDB: 0 };
    return {
      total: data.registry.length,
      visible: data.registry.filter((f) => f.is_visible).length,
      filterable: data.registry.filter((f) => f.is_filterable).length,
      sortable: data.registry.filter((f) => f.is_sortable).length,
      searchable: data.registry.filter((f) => f.is_searchable).length,
      sensitive: data.registry.filter((f) => f.is_sensitive).length,
      newDB: data.diff.new_in_db.length,
    };
  }, [data]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id));
  const someSelected = filtered.some((f) => selected.has(f.id));

  // Sprint 13: group filtered fields by group_key — keep stable group order
  const grouped = useMemo(() => {
    const map = new Map<string, RegistryField[]>();
    for (const f of filtered) {
      const k = f.group_key ?? "other";
      const list = map.get(k) ?? [];
      list.push(f);
      map.set(k, list);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => groupMeta(a).order - groupMeta(b).order
    );
  }, [filtered]);

  const allCollapsed = grouped.length > 0 && grouped.every(([k]) => collapsedGroups.has(k));
  const toggleAllGroups = () => {
    if (allCollapsed) setCollapsedGroups(new Set());
    else setCollapsedGroups(new Set(grouped.map(([k]) => k)));
  };

  const toggleGroupSelect = (groupFields: RegistryField[]) => {
    const allInGroupSelected = groupFields.every((f) => selected.has(f.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allInGroupSelected) groupFields.forEach((f) => next.delete(f.id));
      else                    groupFields.forEach((f) => next.add(f.id));
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((f) => next.delete(f.id));
      } else {
        filtered.forEach((f) => next.add(f.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // เปิด popup สร้างกลุ่มฟิลด์ใหม่ (ใส่ชื่อ + เลือกไอคอน) — ถ้าเลือกฟิลด์ไว้จะย้ายเข้ากลุ่มนี้ตอนบันทึก
  const addGroup = () => setGroupModal({ mode: "create", origKey: "", name: "", icon: "📁" });

  const inner = (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-[1600px] mx-auto px-6 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  🗂️ Schema Sync + Field Registry
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  อ่าน fields จริงจาก Supabase + admin tick visible/filterable/sortable/required • ✋ลากเรียงลำดับ • ☑ เลือกหลายเพื่อแก้พร้อมกัน
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addGroup}
                  title="เพิ่มกลุ่มฟิลด์ (หมวดในฟอร์ม) — ถ้าเลือกฟิลด์ไว้จะย้ายเข้ากลุ่มนี้เลย"
                  className="h-10 px-4 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  📁 เพิ่มกลุ่ม
                </button>
                <button
                  onClick={() => setGroupMgr(true)}
                  title="จัดการกลุ่ม — เปลี่ยนชื่อ/ไอคอน"
                  className="h-10 px-4 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  🗂️ จัดการกลุ่ม
                </button>
                <button
                  onClick={() => setFieldCreatorOpen(true)}
                  className="h-10 px-4 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  ➕ เพิ่ม field
                </button>
                <button
                  onClick={sync}
                  disabled={syncing}
                  className="h-10 px-5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 shadow-sm"
                >
                  {syncing ? "กำลัง sync..." : "🔄 Sync from Supabase"}
                </button>
              </div>
            </div>

            {/* controls */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!lockModule && <>
                <label className="text-xs text-slate-600">Module:</label>
                <select
                  value={moduleKey}
                  onChange={(e) => setModuleKey(e.target.value)}
                  className="h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </>}

              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="ค้นหา field..."
                className="h-9 px-3 text-sm border border-slate-300 rounded-md w-48"
              />

              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">ทุก group</option>
                {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>

              {grouped.length > 0 && (
                <button
                  onClick={toggleAllGroups}
                  className="h-9 px-3 text-xs text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50"
                  title="ยุบ/ขยายทุก group"
                >
                  {allCollapsed ? "▶ ขยายทั้งหมด" : "▼ ยุบทั้งหมด"}
                </button>
              )}
            </div>

            {/* stats */}
            {data && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md">
                  ทั้งหมด <strong>{stats.total}</strong>
                </span>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md">
                  Visible: {stats.visible}
                </span>
                <span className="px-2.5 py-1 bg-violet-50 text-violet-700 rounded-md">
                  Filterable: {stats.filterable}
                </span>
                <span className="px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-md">
                  Sortable: {stats.sortable}
                </span>
                <span className="px-2.5 py-1 bg-pink-50 text-pink-700 rounded-md">
                  Searchable: {stats.searchable}
                </span>
                {stats.sensitive > 0 && (
                  <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-md" title="ซ่อนจากคนไม่มี permission">
                    🔒 Sensitive: {stats.sensitive}
                  </span>
                )}
                {stats.newDB > 0 && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-semibold" title="DB columns ที่ยังไม่อยู่ใน registry — กด Sync เพื่อเพิ่ม">
                    ✨ มี {stats.newDB} field ใหม่ใน DB — กด Sync
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sprint 11: Bulk action bar */}
          {selected.size > 0 && (
            <div className="border-t border-orange-200 bg-orange-50">
              <div className="max-w-[1600px] mx-auto px-6 py-2.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-orange-900">
                  ☑ เลือก {selected.size} field
                </span>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={() => bulkUpdate({ is_visible: true })}  disabled={bulkSaving} variant="success">👁 แสดง</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_visible: false })} disabled={bulkSaving} variant="muted">👁 ซ่อน</BulkBtn>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={() => bulkUpdate({ is_filterable: true })}  disabled={bulkSaving}>🔍 เปิด filter</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_filterable: false })} disabled={bulkSaving} variant="muted">🔍 ปิด filter</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_sortable: true })}    disabled={bulkSaving}>↕ เปิด sort</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_sortable: false })}   disabled={bulkSaving} variant="muted">↕ ปิด sort</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_searchable: true })}  disabled={bulkSaving}>🔎 เปิด search</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_searchable: false })} disabled={bulkSaving} variant="muted">🔎 ปิด search</BulkBtn>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={() => bulkUpdate({ is_inline_editable: true })}  disabled={bulkSaving}>✎ เปิด inline edit</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_inline_editable: false })} disabled={bulkSaving} variant="muted">✎ ปิด inline edit</BulkBtn>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={addGroup} disabled={bulkSaving}>📁 ย้าย/สร้างกลุ่ม</BulkBtn>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-orange-700 hover:text-orange-900 underline"
                  >ล้างการเลือก</button>
                </div>
              </div>
            </div>
          )}

          {reordering && (
            <div className="border-t border-blue-200 bg-blue-50 text-center text-xs text-blue-700 py-1">
              ⏳ กำลังบันทึกลำดับใหม่...
            </div>
          )}
        </header>

        <main className="max-w-[1600px] mx-auto px-6 py-6">
          {loading ? (
            <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          ) : !data?.module ? (
            <div className="py-20 text-center text-red-500">{data?.error ?? "ไม่พบ module"}</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th className="w-8 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allFilteredSelected; }}
                          onChange={toggleAll}
                          className="rounded"
                          title="เลือกทั้งหมด"
                        />
                      </th>
                      <th className="w-6 px-1 py-2" title="ลากเรียง">✋</th>
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Column</th>
                      <th className="px-3 py-2 text-left font-medium">Label</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Group</th>
                      <th className="px-3 py-2 text-center font-medium" title="แสดงในตาราง">👁 Vis</th>
                      <th className="px-3 py-2 text-center font-medium" title="กรองได้">🔍 Filt</th>
                      <th className="px-3 py-2 text-center font-medium" title="ค้นหาเจอ (รวมในช่อง search)">🔎 Search</th>
                      <th className="px-3 py-2 text-center font-medium" title="เรียงได้">↕ Sort</th>
                      <th className="px-3 py-2 text-center font-medium" title="บังคับกรอก">⚠ Req</th>
                      <th className="px-3 py-2 text-center font-medium" title="ซ่อนจากคนไม่มี permission">🔒 Sensitive</th>
                      <th className="px-3 py-2 text-center font-medium" title="ใครเห็น/แก้ฟิลด์นี้ได้ (ตามตำแหน่ง)">🔐 สิทธิ์</th>
                      <th className="px-3 py-2 text-center font-medium" title="ดับเบิ้ลคลิก cell แก้ในตาราง">✎ Inline</th>
                      <th className="px-3 py-2 text-left font-medium" title="Default ตอน Create — รองรับ now() today() current_user() uuid()">Default</th>
                      <th className="px-3 py-2 text-center font-medium" title="เงื่อนไขแสดงในฟอร์ม (show_if)">🎯 Cond</th>
                      <th className="px-3 py-2 text-center font-medium">Width</th>
                      <th className="px-3 py-2 text-left font-medium" title="หมายเหตุภายในของแอดมิน (ไม่โชว์ให้ผู้ใช้)">📝 หมายเหตุ</th>
                      <th className="px-3 py-2 text-center font-medium" title="ลบ field">🗑️</th>
                    </tr>
                  </thead>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={filtered.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                      <tbody className="divide-y divide-slate-100">
                        {grouped.map(([groupKey, groupFields]) => {
                          const meta = gMeta(groupKey);
                          const isCollapsed = collapsedGroups.has(groupKey);
                          const allGroupSelected = groupFields.every((f) => selected.has(f.id));
                          const someGroupSelected = groupFields.some((f) => selected.has(f.id));
                          return (
                            <React.Fragment key={groupKey}>
                              <tr className="bg-slate-100/60 hover:bg-slate-100 border-y border-slate-200">
                                <td className="px-2 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={allGroupSelected}
                                    ref={(el) => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected; }}
                                    onChange={() => toggleGroupSelect(groupFields)}
                                    className="rounded"
                                    title="เลือกทั้งกลุ่ม"
                                  />
                                </td>
                                <td colSpan={COLUMN_COUNT - 1} className="px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCollapsedGroups((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                                      return next;
                                    })}
                                    className="flex items-center gap-2 w-full text-left text-sm font-semibold text-slate-700 hover:text-orange-600"
                                  >
                                    <span className={`inline-block w-3 text-slate-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▶</span>
                                    <span>{meta.icon}</span>
                                    <span>{meta.label}</span>
                                    <span className="text-xs text-slate-400 font-normal">({groupFields.length})</span>
                                  </button>
                                </td>
                              </tr>
                              {!isCollapsed && groupFields.map((f) => (
                                <SortableFieldRow
                                  key={f.id}
                                  field={f}
                                  saving={savingId === f.id}
                                  selected={selected.has(f.id)}
                                  isDisplay={!!f.column_name && displayField === f.column_name}
                                  onSetDisplay={f.column_name ? () => setDisplay(String(f.column_name)) : undefined}
                                  groupOptions={groupOptions}
                                  onPickGroup={(v) => pickGroup(f.id, v)}
                                  onToggle={() => toggleOne(f.id)}
                                  onUpdate={(patch) => updateField(f.id, patch)}
                                  onEditCondition={() => setConditionEditing(f)}
                                  onDelete={() => setDeleteTarget(f)}
                                  onChangeType={(nt) => openTypeChange(f, nt)}
                                />
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </SortableContext>
                  </DndContext>
                </table>
              </div>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">ไม่พบ field</div>
              )}
            </div>
          )}
        </main>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 bg-slate-900 text-white rounded-lg shadow-lg text-sm max-w-md z-50">
            {toast}
          </div>
        )}

        {/* Sprint 13: Condition editor modal */}
        {conditionEditing && (
          <ConditionEditorModal
            field={conditionEditing}
            allFields={data?.registry ?? []}
            onClose={() => setConditionEditing(null)}
            onSave={async (rules) => {
              await updateField(conditionEditing.id, { condition_rules: rules });
              setConditionEditing(null);
            }}
          />
        )}

        {/* เพิ่ม field ใหม่ (column จริงใน Supabase) จากหน้านี้ */}
        {fieldCreatorOpen && (
          <FieldCreatorModal
            moduleKey={moduleKey}
            moduleTitle={modules.find((m) => m.key === moduleKey)?.label ?? moduleKey}
            onClose={() => setFieldCreatorOpen(false)}
            onCreated={() => { setFieldCreatorOpen(false); load(); }}
          />
        )}

        {/* ลบ field — ยืนยันแบบพิมพ์คำ (ข้อมูลหายถาวรถ้าลบคอลัมน์) */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <span className="text-xl">🗑️</span>
                <h3 className="text-sm font-semibold text-red-700">ลบ field: {deleteTarget.field_label}</h3>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm">
                <div className="text-slate-600">
                  field <code className="text-xs bg-slate-100 px-1 rounded">{deleteTarget.column_name ?? deleteTarget.field_key}</code> จะถูกลบออกจากทะเบียน
                </div>
                {isVirtualField(deleteTarget) ? (
                  <div className="text-xs text-slate-500">(field นี้เป็นแบบ virtual — ไม่มีคอลัมน์จริงให้ลบ)</div>
                ) : (
                  <label className="flex items-start gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50">
                    <input type="checkbox" checked={deleteDropCol} onChange={(e) => setDeleteDropCol(e.target.checked)} className="mt-0.5 accent-red-600" />
                    <span className="text-xs text-red-700">
                      ลบ <b>คอลัมน์จริงใน Supabase</b> ด้วย — <b>ข้อมูลทุกแถวในคอลัมน์นี้จะหายถาวร กู้คืนไม่ได้</b><br />
                      <span className="text-red-500">(ถ้าไม่ติ๊ก = ลบแค่จากทะเบียน ข้อมูลยังอยู่)</span>
                    </span>
                  </label>
                )}
                <div>
                  <div className="text-xs text-slate-500 mb-1">พิมพ์ <code className="px-1 bg-slate-100 rounded text-red-600 font-mono">ลบ</code> เพื่อยืนยัน</div>
                  <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoFocus
                    className="w-full h-9 px-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500" />
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
                <button onClick={() => { setDeleteTarget(null); setDeleteText(""); }} disabled={deleting}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button onClick={doDeleteField} disabled={deleting || deleteText.trim() !== "ลบ"}
                  className="h-9 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
                  {deleting ? "กำลังลบ..." : "ลบถาวร"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* เปลี่ยนประเภท field — เตือนผลกระทบ + ตั้งค่า select/relation + ยืนยัน 2 ชั้น */}
        {typeChange && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => !tcApplying && setTypeChange(null)}>
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">เปลี่ยนประเภท: {typeChange.field.field_label}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  <code className="bg-slate-100 px-1 rounded">{typeChange.field.ui_field_type}</code> → <code className="bg-amber-100 px-1 rounded text-amber-700">{typeChange.newType}</code>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm">
                {/* ผลกระทบ + จำนวนข้อมูล */}
                <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
                  {tcStats === null
                    ? "กำลังตรวจจำนวนข้อมูล…"
                    : <>field นี้มีข้อมูลอยู่ <b>{tcStats.filled.toLocaleString()}</b> แถว (จากทั้งหมด {tcStats.total.toLocaleString()})</>}
                  <div className="mt-1 text-amber-700">
                    เปลี่ยนประเภทไม่ลบข้อมูลใน Supabase — แต่ถ้าข้อมูลเดิมไม่เข้ากับประเภทใหม่ อาจแสดงเพี้ยน/ว่าง
                  </div>
                </div>

                {/* select → ตัวเลือก */}
                {typeChange.newType === "select" && (
                  <div>
                    <div className="text-xs text-slate-600 mb-1">ตัวเลือก (บรรทัดละ 1 ค่า)</div>
                    <textarea value={tcOptions} onChange={(e) => setTcOptions(e.target.value)} rows={4}
                      placeholder={"ตัวเลือก 1\nตัวเลือก 2"} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md" />
                  </div>
                )}

                {/* relation → ตารางปลายทาง + field ชื่อ */}
                {typeChange.newType === "relation" && (
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-slate-600 mb-1">ตารางปลายทาง</div>
                      <SearchableSelect value={tcTargetTable} onChange={setTcTargetTable} placeholder="— เลือก —"
                        options={modules.filter((m) => m.table).map((m) => ({ value: String(m.table), label: m.label, sub: String(m.table) }))} />

                    </div>
                    <div>
                      <div className="text-xs text-slate-600 mb-1">field ที่ใช้แสดงชื่อ</div>
                      <input value={tcTargetLabel} onChange={(e) => setTcTargetLabel(e.target.value)} placeholder="name"
                        className="w-full h-9 px-2 text-sm border border-slate-300 rounded-md" />
                    </div>
                    <div className="text-[11px] text-slate-400">หมายเหตุ: ตั้งค่าเพื่อแสดง/เลือกค่า (ไม่บังคับสร้าง FK) — ถ้าต้องการ relation เต็มควรสร้าง field ใหม่</div>
                  </div>
                )}

                {/* ยืนยันชั้นที่ 2 */}
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={tcAck} onChange={(e) => setTcAck(e.target.checked)} className="mt-0.5" />
                  เข้าใจว่าข้อมูลเดิมอาจแสดงไม่ตรงกับประเภทใหม่
                </label>
              </div>
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
                <button onClick={() => setTypeChange(null)} disabled={tcApplying}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button onClick={applyTypeChange} disabled={!tcCanApply}
                  className="h-9 px-4 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-40">
                  {tcApplying ? "กำลังเปลี่ยน..." : "เปลี่ยนประเภท"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* สร้าง/แก้ไขกลุ่มฟิลด์ (ชื่อ + ไอคอน) */}
        {groupModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => !groupSaving && setGroupModal(null)}>
            <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">{groupModal.mode === "create" ? "➕ เพิ่มกลุ่มฟิลด์" : "✏️ แก้ไขกลุ่ม"}</h3>
              <div className="flex items-end gap-3">
                <div>
                  <div className="text-[11px] text-slate-500 mb-1">ไอคอน</div>
                  <IconPicker value={groupModal.icon} onChange={(v) => setGroupModal((m) => (m ? { ...m, icon: v } : m))} />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] text-slate-500 mb-1">ชื่อกลุ่ม</div>
                  <input autoFocus value={groupModal.name} onChange={(e) => setGroupModal((m) => (m ? { ...m, name: e.target.value } : m))}
                    onKeyDown={(e) => { if (e.key === "Enter") saveGroupModal(); }}
                    placeholder="เช่น สเปกเข็มขัด" className="w-full h-10 px-3 text-sm border border-slate-200 rounded-md" />
                </div>
              </div>
              {groupModal.mode === "edit" && groupModal.name.trim() !== groupModal.origKey && (
                <p className="text-[11px] text-amber-600 mt-2">เปลี่ยนชื่อ = ย้ายทุกฟิลด์ในกลุ่มนี้ไปชื่อใหม่</p>
              )}
              {groupModal.mode === "create" && selected.size > 0 && (
                <p className="text-[11px] text-blue-600 mt-2">จะย้ายฟิลด์ที่เลือก {selected.size} ช่อง เข้ากลุ่มนี้</p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setGroupModal(null)} disabled={groupSaving}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button onClick={saveGroupModal} disabled={groupSaving || !groupModal.name.trim()}
                  className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40">
                  {groupSaving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* จัดการกลุ่ม — รายการกลุ่ม + แก้ไข */}
        {groupMgr && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => setGroupMgr(false)}>
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">🗂️ จัดการกลุ่มฟิลด์</h3>
                <button onClick={() => { setGroupMgr(false); addGroup(); }} className="text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">➕ เพิ่มกลุ่ม</button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {groupOptions.map((g) => (
                  <div key={g.value} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="text-lg">{gMeta(g.value).icon}</span>
                    <span className="flex-1 min-w-0 truncate">{gMeta(g.value).label} <code className="text-[10px] text-slate-400">{g.value}</code></span>
                    <button onClick={() => { setGroupMgr(false); setGroupModal({ mode: "edit", origKey: g.value, name: gMeta(g.value).label, icon: gMeta(g.value).icon }); }}
                      className="text-xs text-blue-600 hover:underline">แก้ไข</button>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-200 text-right">
                <button onClick={() => setGroupMgr(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
  return embedded ? inner : <PlaygroundShell>{inner}</PlaygroundShell>;
}

// ============================================================
// RolePermissionCell — ตั้งสิทธิ์ "เห็น/แก้" ฟิลด์นี้ ตามตำแหน่ง (role)
// ว่าง = ทุกคน · admin เห็น/แก้ได้เสมอ (จึงไม่ต้องโชว์ในรายการ)
// ============================================================

function RoleChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
        on ? "border-indigo-400 bg-indigo-100 text-indigo-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}>
      {label}
    </button>
  );
}

function RolePermissionCell({ field, onUpdate }: { field: RegistryField; onUpdate: (p: Record<string, unknown>) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const roleOptions = useRoleOptions();   // ดึงจากระบบ role กลาง (ไม่ hardcode)
  const view = field.view_roles ?? [];
  const edit = field.edit_roles ?? [];
  const restricted = view.length > 0 || edit.length > 0;

  const toggle = (kind: "view_roles" | "edit_roles", role: string) => {
    const cur = (kind === "view_roles" ? view : edit);
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    onUpdate({ [kind]: next.length ? next : null });
  };

  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} title="ใครเห็น/แก้ฟิลด์นี้ได้"
        className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
          restricted ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"
        }`}>
        {restricted ? `👁${view.length || "ทุก"} ✏${edit.length || "ทุก"}` : "ทุกคน"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-left">
            <div className="text-[11px] text-slate-400 mb-2 leading-tight">ว่าง = ทุกคนเห็น/แก้ได้ · admin ได้เสมอ</div>
            {roleOptions.length === 0 ? (
              <div className="text-[11px] text-slate-400">กำลังโหลดรายชื่อตำแหน่ง…</div>
            ) : (
              <>
                <div className="mb-3">
                  <div className="text-xs font-medium text-slate-600 mb-1">👁 เห็นได้</div>
                  <div className="flex flex-wrap gap-1">
                    {roleOptions.map((r) => <RoleChip key={r.key} on={view.includes(r.key)} label={r.label} onClick={() => toggle("view_roles", r.key)} />)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1">✏ แก้ได้</div>
                  <div className="flex flex-wrap gap-1">
                    {roleOptions.map((r) => <RoleChip key={r.key} on={edit.includes(r.key)} label={r.label} onClick={() => toggle("edit_roles", r.key)} />)}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// SortableFieldRow — แถวที่ลากเรียงได้
// ============================================================

function SortableFieldRow({
  field, saving, selected, isDisplay, onSetDisplay, groupOptions, onPickGroup, onToggle, onUpdate, onEditCondition, onDelete, onChangeType,
}: {
  field:    RegistryField;
  saving:   boolean;
  selected: boolean;
  isDisplay?: boolean;
  onSetDisplay?: () => void;
  groupOptions?: { value: string; label: string }[];
  onPickGroup?: (value: string) => void;
  onToggle: () => void;
  onUpdate: (patch: Record<string, unknown>) => void | Promise<void>;
  onEditCondition?: () => void;
  onDelete?: () => void;
  onChangeType?: (newType: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.5 : 1,
    background: isDragging ? "#fef3c7" : undefined,
  };

  const [label, setLabel] = useState(field.field_label);
  const [width, setWidth] = useState(field.width);
  const [note, setNote]   = useState(field.description ?? "");

  useEffect(() => { setLabel(field.field_label); }, [field.field_label]);
  useEffect(() => { setWidth(field.width); }, [field.width]);
  useEffect(() => { setNote(field.description ?? ""); }, [field.description]);

  const onBlurLabel = () => { if (label !== field.field_label) onUpdate({ field_label: label }); };
  const onBlurWidth = () => { if (width !== field.width)       onUpdate({ width });            };
  const onBlurNote  = () => { if (note !== (field.description ?? "")) onUpdate({ description: note || null }); };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-slate-50 ${saving ? "opacity-60" : ""} ${selected ? "bg-orange-50" : ""}`}
    >
      <td className="w-8 px-2 py-1.5 text-center">
        <input type="checkbox" checked={selected} onChange={onToggle} className="rounded" />
      </td>
      <td
        className="w-6 px-1 py-1.5 text-center text-slate-400 cursor-grab active:cursor-grabbing select-none"
        {...attributes}
        {...listeners}
        title="ลากเพื่อเรียงลำดับ"
      >⋮⋮</td>
      <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums">{field.display_order}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {onSetDisplay && (
            <button type="button" onClick={onSetDisplay}
              title={isDisplay ? "ฟิลด์ชื่อหลัก (display) — กดเพื่อยกเลิก" : "ตั้งเป็นฟิลด์ชื่อหลัก (display) — โมดูลอื่นจะโชว์ฟิลด์นี้เวลาอ้างถึง"}
              className={`text-sm leading-none ${isDisplay ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
              {isDisplay ? "🎯" : "◎"}
            </button>
          )}
          <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{field.column_name ?? field.field_key}</code>
        </div>
      </td>
      <td className="px-3 py-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={onBlurLabel}
          className="w-full px-2 py-1 text-sm border border-transparent hover:border-slate-200 focus:border-orange-400 rounded outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          value={field.ui_field_type}
          onChange={(e) => { if (e.target.value !== field.ui_field_type) onChangeType?.(e.target.value); }}
          className="text-xs px-1.5 py-1 border border-slate-200 rounded bg-white"
        >
          {UI_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <select
          value={field.group_key}
          onChange={(e) => (onPickGroup ? onPickGroup(e.target.value) : onUpdate({ group_key: e.target.value }))}
          className="text-xs px-1.5 py-1 border border-slate-200 rounded bg-white"
        >
          {(groupOptions ?? GROUP_OPTIONS).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          <option value="__new__">➕ เพิ่มกลุ่มใหม่…</option>
        </select>
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_visible}    onChange={(e) => onUpdate({ is_visible:    e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_filterable} onChange={(e) => onUpdate({ is_filterable: e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_searchable} onChange={(e) => onUpdate({ is_searchable: e.target.checked })} className="rounded accent-pink-500" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_sortable}   onChange={(e) => onUpdate({ is_sortable:   e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_required}   onChange={(e) => onUpdate({ is_required:   e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <input
            type="checkbox"
            checked={field.is_sensitive}
            onChange={(e) => onUpdate({
              is_sensitive: e.target.checked,
              sensitive_permission: e.target.checked ? (field.sensitive_permission ?? "products.cost.view") : null,
            })}
            className="rounded accent-red-500"
            title="ซ่อน field จากคนที่ไม่มี permission"
          />
          {field.is_sensitive && (
            <input
              type="text"
              value={field.sensitive_permission ?? ""}
              onChange={(e) => onUpdate({ sensitive_permission: e.target.value })}
              placeholder="products.cost.view"
              className="w-32 text-[10px] px-1.5 py-0.5 border border-slate-200 rounded"
              title="permission key"
            />
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-center">
        <RolePermissionCell field={field} onUpdate={onUpdate} />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={field.is_inline_editable}
          onChange={(e) => onUpdate({ is_inline_editable: e.target.checked })}
          className="rounded accent-amber-500"
          title="ดับเบิ้ลคลิก cell ในตารางเพื่อแก้"
        />
      </td>
      <td className="px-3 py-1.5">
        <DefaultValueCell field={field} onUpdate={onUpdate} />
      </td>
      <td className="px-3 py-1.5 text-center">
        <ConditionCell rules={field.condition_rules} onClick={onEditCondition} />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="number"
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          onBlur={onBlurWidth}
          className="w-16 text-xs px-1.5 py-1 border border-slate-200 rounded text-right tabular-nums"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={onBlurNote}
          placeholder="หมายเหตุภายใน…"
          title="หมายเหตุภายในของแอดมิน (ไม่โชว์ให้ผู้ใช้)"
          className="w-40 px-2 py-1 text-xs border border-transparent hover:border-slate-200 focus:border-orange-400 rounded outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-center">
        <button type="button" onClick={onDelete} title="ลบ field"
          className="text-slate-300 hover:text-red-600 text-sm">🗑️</button>
      </td>
    </tr>
  );
}

// ============================================================
// DefaultValueCell — Sprint 12: textbox + expression dropdown
// ============================================================

const EXPRESSION_PRESETS = [
  { value: "",                label: "— static value —" },
  { value: "now()",           label: "🕓 now() — เวลาปัจจุบัน" },
  { value: "today()",         label: "📅 today() — วันที่วันนี้" },
  { value: "current_user()",  label: "👤 current_user() — email ผู้ใช้" },
  { value: "uuid()",          label: "🆔 uuid() — สุ่ม UUID" },
];

function DefaultValueCell({
  field, onUpdate,
}: {
  field:    RegistryField;
  onUpdate: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const [val, setVal] = useState(field.default_value ?? "");
  const [expr, setExpr] = useState(field.default_expression ?? "");

  useEffect(() => { setVal(field.default_value ?? ""); }, [field.default_value]);
  useEffect(() => { setExpr(field.default_expression ?? ""); }, [field.default_expression]);

  const onBlurVal = () => {
    if (val !== (field.default_value ?? "")) onUpdate({ default_value: val === "" ? null : val });
  };
  const onChangeExpr = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setExpr(next);
    onUpdate({ default_expression: next === "" ? null : next });
  };

  return (
    <div className="flex items-center gap-1 min-w-[200px]">
      <select
        value={expr}
        onChange={onChangeExpr}
        className="text-[10px] px-1 py-0.5 border border-slate-200 rounded bg-white w-[110px]"
        title="dynamic expression — ชนะ static value"
      >
        {EXPRESSION_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={onBlurVal}
        disabled={!!expr}
        placeholder={expr ? "expression ชนะ" : "—"}
        className="flex-1 text-xs px-1.5 py-1 border border-slate-200 rounded disabled:bg-slate-50 disabled:text-slate-400"
      />
    </div>
  );
}

// ============================================================
// BulkBtn — ปุ่มเล็กในแถบ bulk action
// ============================================================

function BulkBtn({
  children, onClick, disabled, variant = "default",
}: {
  children: React.ReactNode;
  onClick:  () => void;
  disabled?: boolean;
  variant?: "default" | "success" | "muted";
}) {
  const cls = variant === "success"
    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
    : variant === "muted"
    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
    : "bg-white text-orange-900 hover:bg-orange-100 border border-orange-200";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2.5 text-xs font-medium rounded-md disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

// ============================================================
// ConditionCell — Sprint 13: show summary + click to edit
// ============================================================

type ShowIfRule = {
  field?:    string;
  operator?: "=" | "!=" | "in" | "not_in" | "is_set" | "is_empty";
  value?:    unknown;
};

function ConditionCell({
  rules, onClick,
}: {
  rules:    Record<string, unknown> | null;
  onClick?: () => void;
}) {
  const showIf = (rules as { show_if?: ShowIfRule } | null)?.show_if;
  const hasRule = !!(showIf && showIf.field);
  const summary = hasRule
    ? `${showIf!.field} ${showIf!.operator ?? "="} ${
        Array.isArray(showIf!.value) ? `[${(showIf!.value as unknown[]).length}]` : String(showIf!.value ?? "")
      }`
    : "—";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[10px] px-2 py-1 rounded whitespace-nowrap ${
        hasRule
          ? "bg-amber-100 text-amber-800 hover:bg-amber-200 font-mono"
          : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
      }`}
      title={hasRule ? `แสดงเมื่อ: ${summary}` : "ไม่มีเงื่อนไข — คลิกเพื่อตั้ง"}
    >
      {hasRule ? `🎯 ${summary}` : "—"}
    </button>
  );
}

// ============================================================
// ConditionEditorModal — Sprint 13
// ============================================================

const COND_OPERATORS = [
  { value: "=",        label: "เท่ากับ (=)" },
  { value: "!=",       label: "ไม่เท่ากับ (≠)" },
  { value: "in",       label: "อยู่ในรายการ (in)" },
  { value: "not_in",   label: "ไม่อยู่ในรายการ" },
  { value: "is_set",   label: "มีค่า (is set)" },
  { value: "is_empty", label: "ว่างเปล่า (is empty)" },
];

function ConditionEditorModal({
  field, allFields, onClose, onSave,
}: {
  field:     RegistryField;
  allFields: RegistryField[];
  onClose:   () => void;
  onSave:    (rules: Record<string, unknown>) => void | Promise<void>;
}) {
  const current = (field.condition_rules as { show_if?: ShowIfRule } | null)?.show_if ?? {};
  const [hasRule,  setHasRule]  = useState<boolean>(!!current.field);
  const [triggerField, setTriggerField] = useState<string>(current.field ?? "");
  const [operator, setOperator] = useState<string>(current.operator ?? "=");
  const [value,    setValue]    = useState<string>(
    current.value == null ? "" : Array.isArray(current.value) ? (current.value as unknown[]).join(", ") : String(current.value)
  );
  const [saving, setSaving] = useState(false);

  // exclude self + non-form fields
  const candidates = allFields.filter((f) => f.id !== field.id && f.column_name);

  const needsValue = operator !== "is_set" && operator !== "is_empty";
  const isListOp   = operator === "in" || operator === "not_in";

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!hasRule || !triggerField) {
        await onSave({});
        return;
      }
      const rule: ShowIfRule = { field: triggerField, operator: operator as ShowIfRule["operator"] };
      if (needsValue) {
        if (isListOp) rule.value = value.split(",").map((s) => s.trim()).filter(Boolean);
        else          rule.value = value;
      }
      await onSave({ show_if: rule });
    } finally { setSaving(false); }
  };

  const dismiss = useBackdropDismiss(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...dismiss}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">🎯 เงื่อนไขแสดง field</h3>
        <p className="text-xs text-slate-500 mb-4">
          field <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{field.column_name ?? field.field_key}</code> จะแสดงในฟอร์มเมื่อ...
        </p>

        <label className="flex items-center gap-2 mb-3 text-sm">
          <input
            type="checkbox"
            checked={hasRule}
            onChange={(e) => setHasRule(e.target.checked)}
            className="rounded"
          />
          <span className="text-slate-700">เปิดเงื่อนไข (ปิดไว้ = แสดงเสมอ)</span>
        </label>

        {hasRule && (
          <div className="space-y-3 border-l-2 border-amber-200 pl-3">
            <div>
              <label className="text-xs text-slate-600 block mb-1">เมื่อ field</label>
              <select
                value={triggerField}
                onChange={(e) => setTriggerField(e.target.value)}
                className="w-full h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">— เลือก field —</option>
                {candidates.map((f) => (
                  <option key={f.id} value={f.column_name ?? f.field_key}>
                    {f.field_label} ({f.column_name ?? f.field_key})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-600 block mb-1">เงื่อนไข</label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {COND_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {needsValue && (
              <div>
                <label className="text-xs text-slate-600 block mb-1">
                  ค่า {isListOp && <span className="text-slate-400">(คั่นด้วย comma เช่น  a, b, c)</span>}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={isListOp ? "a, b, c" : "value"}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
          >ยกเลิก</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}
