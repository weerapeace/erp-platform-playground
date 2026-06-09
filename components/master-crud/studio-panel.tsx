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

import { useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { FieldCreatorModal } from "@/components/field-creator";
import type { FormLayout } from "@/app/api/admin/field-registry-v2/route";
import { Popover } from "@/components/popover";
import {
  DndContext, type DragEndEvent, type CollisionDetection, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners, pointerWithin, useDroppable,
} from "@dnd-kit/core";

// จับจุดวางด้วยตำแหน่งเมาส์ก่อน (หัวแท็บ/คลัง/กล่องเล็กๆ) ไม่งั้นใช้มุมใกล้สุด (เรียงในกล่อง)
const smartCollision: CollisionDetection = (args) => {
  const p = pointerWithin(args);
  return p.length ? p : closestCorners(args);
};
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, rectSortingStrategy, arrayMove,
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
  bom:       { label: "BOM (สูตรผลิต)", icon: "📐", order: 58 },
  status:    { label: "สถานะ",         icon: "🟢", order: 60 },
  other:     { label: "อื่น ๆ",        icon: "📦", order: 80 },
  system:    { label: "ระบบ",          icon: "⚙️", order: 90 },
};
function gmeta(k: string) { return GROUP_META[k] ?? { label: k, icon: "📁", order: 99 }; }

type Tab = "table" | "form" | "registry";
// tab = ชื่อแท็บที่ section นี้อยู่ ("" = แท็บเดี่ยวของตัวเอง) → หลาย section ที่ tab เดียวกันอยู่แท็บเดียวกัน
type SectionDef = { key: string; label: string; icon: string; columns: number; tab?: string };

// ไอคอนพื้นฐานให้เลือก + ตัวเรนเดอร์ (รองรับ emoji หรือรูปอัปโหลด "r2:<key>")
const PRESET_ICONS = ["📋","📦","🔗","📝","📐","🏭","💰","🖼️","🟢","⚙️","🏷️","🧬","🤝","🧩","📊","🗂️","🛒","📍","🧾","🚚","🏗️","✂️","📁","⭐","🔢","🧰","🔀","🧷","📅","🔖","🧮","🏢","🪪","🎨","📒","🔧","📏","🧵","🧑‍💼","🔋"];
function iconNode(icon?: string) {
  if (!icon) return <span>📁</span>;
  if (icon.startsWith("r2:")) return <img src={`/api/r2-image?key=${encodeURIComponent(icon.slice(3))}`} alt="" className="w-4 h-4 object-contain inline-block align-[-2px]" />;
  return <span>{icon}</span>;
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string)=>void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File, close: ()=>void) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "section-icons");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (j.r2_key) onChange(`r2:${j.r2_key}`);
    } catch { /* ignore */ } finally { setUploading(false); close(); }
  };
  return (
    <Popover align="left" panelClassName="w-64 p-2"
      trigger={(toggle)=>(
        <button type="button" onClick={toggle} title="เปลี่ยนไอคอนหมวด"
          className="w-7 h-7 rounded hover:bg-slate-100 inline-flex items-center justify-center">{iconNode(value)}</button>
      )}>
      {(close)=>(<>
        <div className="text-[11px] text-slate-400 mb-1">ไอคอนพื้นฐาน</div>
        <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
          {PRESET_ICONS.map(e=>(
            <button key={e} type="button" onClick={()=>{ onChange(e); close(); }}
              className={`w-7 h-7 rounded hover:bg-slate-100 text-base ${value===e?"bg-orange-100 ring-1 ring-orange-300":""}`}>{e}</button>
          ))}
        </div>
        <div className="border-t border-slate-100 mt-2 pt-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
            onChange={(e)=>{ const f=e.target.files?.[0]; if(f) upload(f, close); }} />
          <button type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}
            className="w-full h-8 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50">
            {uploading ? "กำลังอัปโหลด..." : "⬆ อัปโหลดไอคอนเอง (รูป)"}
          </button>
        </div>
      </>)}
    </Popover>
  );
}

// เลือกรายการจริงมาโชว์ใน preview (ค้นหา code/ชื่อ)
function SamplePicker({ label, searchSample, onPick, onClear }: { label: string; searchSample: (q: string)=>Promise<{id:string;label:string}[]>; onPick: (id: string, label: string)=>void; onClear: ()=>void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{id:string;label:string}[]>([]);
  const [loading, setLoading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = (query: string) => {
    setQ(query);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      setLoading(true);
      try { setOpts(await searchSample(query)); } catch { setOpts([]); } finally { setLoading(false); }
    }, 250);
  };
  return (
    <Popover align="right" panelClassName="w-64 p-2"
      trigger={(toggle)=> label ? (
        <div className="flex items-center gap-1 h-7 px-2 text-xs bg-orange-50 border border-orange-200 rounded">
          <span className="text-orange-700 max-w-[120px] truncate" title={label}>{label}</span>
          <button type="button" onClick={onClear} title="ล้าง" className="text-orange-400 hover:text-red-500">✕</button>
          <button type="button" onClick={()=>{ run(""); toggle(); }} title="เปลี่ยน" className="text-orange-500 hover:text-orange-700">▾</button>
        </div>
      ) : (
        <button type="button" onClick={()=>{ run(""); toggle(); }}
          className="h-7 px-2 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50">🔍 เลือกรายการจริง</button>
      )}>
      {(close)=>(<>
        <input autoFocus value={q} onChange={(e)=>run(e.target.value)} placeholder="ค้นหา code/ชื่อ…"
          className="w-full h-8 px-2 text-xs border border-slate-200 rounded mb-1" />
        <div className="max-h-56 overflow-y-auto">
          {loading && <div className="text-xs text-slate-400 py-2 text-center">กำลังค้นหา…</div>}
          {!loading && opts.length===0 && <div className="text-xs text-slate-300 py-2 text-center">— ไม่พบ —</div>}
          {opts.map((o)=>(
            <button key={o.id} type="button" onClick={()=>{ onPick(o.id, o.label); close(); }}
              className="block w-full text-left px-2 py-1.5 text-xs rounded hover:bg-orange-50 truncate">{o.label}</button>
          ))}
        </div>
      </>)}
    </Popover>
  );
}

export function StudioPanel({
  fields, moduleLabel, moduleKey, layout, onClose, sampleRows = [], searchSample, loadSample,
}: {
  fields:      StudioField[];
  moduleLabel: string;
  moduleKey?:  string;
  layout?:     FormLayout;
  onClose:     () => void;
  onSaved?:    () => void;   // (เลิกใช้) — บันทึกแล้วไม่ปิด ให้กด "ปิด" เอง
  sampleRows?: Record<string, unknown>[];
  searchSample?: (q: string) => Promise<{ id: string; label: string }[]>;
  loadSample?:   (id: string) => Promise<Record<string, unknown> | null>;
}) {
  // group ที่ "รู้จัก" = อยู่ใน GROUP_META มาตรฐาน หรือใน layout (tab/section) ที่บันทึกไว้
  // group แปลก (orphan เช่น "รายละเอียดเข็มขัด") → แสดงรวมใต้กล่อง "อื่น ๆ" (ตรงกับฟอร์มจริง + หาเจอง่าย)
  const recognizedGroupKeys = new Set<string>([
    ...Object.keys(GROUP_META),
    ...(layout?.tabs ?? []).flatMap((t) => (t.sections ?? []).map((s) => s.key)),
  ]);
  const effGroup = (g?: string | null): string => {
    const k = g ?? "other";
    return recognizedGroupKeys.has(k) ? k : "other";
  };

  // เลือกรายการจริงมาโชว์ใน preview (pickup)
  const [pickedRow, setPickedRow] = useState<Record<string, unknown> | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string>("");
  const [tab, setTab] = useState<Tab>("table");
  // หมวด (section) — แก้ชื่อ/ลบ/สร้าง/เรียง/คอลัมน์ได้ · init จาก layout เดิม ไม่งั้น derive จาก group ของ field
  const [sections, setSections] = useState<SectionDef[]>(() => {
    // แตกทุก section จากทุกแท็บ — ถ้าแท็บมีหลาย section (หรือ key แท็บ≠section) → จำชื่อแท็บไว้ (tab)
    const fromLayout: SectionDef[] = (layout?.tabs ?? []).flatMap((t) =>
      (t.sections ?? []).map((s) => ({
        key: s.key, label: s.label, icon: gmeta(s.key).icon, columns: s.columns ?? 2,
        tab: t.key === s.key ? "" : t.label,
      })),
    );
    const have = new Set(fromLayout.map((s) => s.key));
    // group แปลก (orphan) ถูก map เป็น "other" → ไม่สร้างกล่องแยก แต่ต้องมีกล่อง "other" รองรับเสมอ
    const extra: SectionDef[] = Array.from(new Set(fields.map((f) => effGroup(f.groupKey))))
      .filter((k) => !have.has(k))
      .sort((a, b) => gmeta(a).order - gmeta(b).order)
      .map((k) => ({ key: k, label: gmeta(k).label, icon: gmeta(k).icon, columns: 2, tab: "" }));
    return [...fromLayout, ...extra];
  });
  const setSectionTab = (key: string, tab: string) => { setSections((p) => p.map((s) => s.key === key ? { ...s, tab } : s)); setDirty(true); };
  const setCols = (key: string, n: number) => { setSections((p) => p.map((s) => s.key === key ? { ...s, columns: n } : s)); setDirty(true); };
  const renameSection = (key: string, label: string) => { setSections((p) => p.map((s) => s.key === key ? { ...s, label } : s)); setDirty(true); };
  const setSectionIcon = (key: string, icon: string) => { setSections((p) => p.map((s) => s.key === key ? { ...s, icon } : s)); setDirty(true); };
  const moveSection = (key: string, dir: -1 | 1) => setSections((p) => {
    const i = p.findIndex((s) => s.key === key); const j = i + dir;
    if (i < 0 || j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; setDirty(true); return n;
  });
  // สลับ/เรียงลำดับ "แท็บ" — ย้ายทั้งบล็อก section ของแท็บนั้นไปสลับกับแท็บข้างเคียง
  // tabKey = key ที่ FormPreview ใช้ ("tab_<ชื่อ>" สำหรับแท็บมีชื่อ หรือ section.key สำหรับแท็บเดี่ยว)
  const moveTab = (tabKey: string, dir: -1 | 1) => setSections((p) => {
    const tabKeyOf = (s: SectionDef) => ((s.tab ?? "").trim() ? `tab_${(s.tab ?? "").trim()}` : s.key);
    const order: string[] = [];
    for (const s of p) { const tk = tabKeyOf(s); if (!order.includes(tk)) order.push(tk); }
    const i = order.indexOf(tabKey); const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return p;
    [order[i], order[j]] = [order[j], order[i]];
    const byTab = new Map<string, SectionDef[]>();
    for (const s of p) { const tk = tabKeyOf(s); const l = byTab.get(tk) ?? []; l.push(s); byTab.set(tk, l); }
    setDirty(true);
    return order.flatMap((tk) => byTab.get(tk) ?? []);
  });
  const addSection = (tab = "") => {
    const nums = sections.filter((s) => /^sec_\d+$/.test(s.key)).map((s) => parseInt(s.key.slice(4), 10));
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    setSections((p) => [...p, { key: `sec_${n}`, label: `หมวดใหม่ ${n}`, icon: "📁", columns: 2, tab }]);
    setDirty(true);
  };
  // เปลี่ยนชื่อแท็บ → กระทบทุก section ในแท็บนั้น
  const renameTab = (oldTab: string, newTab: string) => { setSections((p) => p.map((s) => (s.tab ?? "") === oldTab ? { ...s, tab: newTab } : s)); setDirty(true); };
  const addTab = () => {
    const base = "แท็บใหม่"; const used = new Set(sections.map((s) => (s.tab ?? "").trim()));
    let i = 1; while (used.has(`${base} ${i}`)) i++;
    addSection(`${base} ${i}`);
  };
  const deleteSection = (key: string) => {
    setItems((prev) => prev.map((i) => (i.groupKey ?? "other") === key ? { ...i, groupKey: "other" } : i));
    setSections((p) => {
      const next = p.filter((s) => s.key !== key);
      if (!next.some((s) => s.key === "other")) next.push({ key: "other", label: gmeta("other").label, icon: gmeta("other").icon, columns: 2 });
      return next;
    });
    setDirty(true);
  };
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewFull, setPreviewFull] = useState(false);   // 3a: ขยาย preview ให้กว้าง/เต็ม
  const [items, setItems] = useState<StudioField[]>(() =>
    [...fields].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  );
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [msg,    setMsg]    = useState<string | null>(null);
  const [settingsKey, setSettingsKey] = useState<string | null>(null);   // field ที่กำลังเปิด ⚙️ ตั้งค่า
  const [creatorOpen, setCreatorOpen] = useState(false);                  // เปิดฟอร์มสร้างฟิลด์ใหม่

  // โหลด field ใหม่ที่เพิ่งสร้าง (เพิ่มคอลัมน์ DB) เข้ามาในตัวออกแบบ โดยไม่ทับ edit เดิม
  const reloadNewFields = useCallback(async () => {
    if (!moduleKey) return;
    const j = await apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then((r) => r.json()).catch(() => ({}));
    const regs = (j.fields ?? []) as Record<string, unknown>[];
    const mapReg = (r: Record<string, unknown>): StudioField => ({
      fieldId: String(r.id), key: String(r.field_key), label: String(r.field_label ?? r.field_key), groupKey: String(r.group_key ?? "other"),
      order: Number(r.display_order ?? 999), type: String(r.ui_field_type ?? "text"), isVisible: !!r.is_visible, showInForm: !!r.show_in_form,
      inlineEditable: !!r.is_inline_editable, bulkEditable: !!r.is_bulk_editable, formSpan: Number(r.form_column_span ?? 1),
      helpText: (r.help_text as string) ?? "", placeholder: (r.placeholder as string) ?? "", required: !!r.is_required,
      editable: r.is_editable !== false, defaultValue: (r.default_value as string) ?? null, uiStyle: (r.ui_style as Record<string, unknown>) ?? {},
    });
    setItems((prev) => {
      const have = new Set(prev.map((i) => i.key));
      const add = regs.filter((r) => !have.has(String(r.field_key))).map(mapReg);
      return add.length ? [...prev, ...add] : prev;
    });
    setSections((prev) => {
      const have = new Set(prev.map((s) => s.key));
      const extra = [...new Set(regs.map((r) => effGroup(String(r.group_key ?? "other"))).filter((g) => !have.has(g)))]
        .map((g) => ({ key: g, label: gmeta(g).label, icon: gmeta(g).icon, columns: 2, tab: "" }));
      return extra.length ? [...prev, ...extra] : prev;
    });
  }, [moduleKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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

      // 1. บันทึกทุก field ในคำขอเดียว (ของกลาง PUT) — เร็วกว่าเดิมมาก (เคยยิงทีละ field ~หลายสิบครั้ง)
      //    รวม: order / group / visible / form / inline / bulk / ความกว้าง / help / required / readonly / default / สไตล์
      const updates = withId.map((i, idx) => ({
        id: i.fieldId!,
        patch: {
          display_order:      (idx + 1) * 10,
          group_key:          i.groupKey,
          is_visible:         !!i.isVisible,
          show_in_form:       !!i.showInForm,
          is_inline_editable: !!i.inlineEditable,
          is_bulk_editable:   !!i.bulkEditable,
          form_column_span:   i.formSpan ?? 1,
          help_text:          i.helpText || null,
          placeholder:        i.placeholder || null,
          is_required:        !!i.required,
          is_editable:        i.editable !== false,
          default_value:      (i.defaultValue ?? "") || null,
          ui_style:           i.uiStyle ?? {},
        },
      }));
      for (let s = 0; s < updates.length; s += 100) {
        const chunk = updates.slice(s, s + 100);
        const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: chunk }),
        });
        const j = await r.json();
        if (j.error) throw new Error("บันทึก field: " + j.error);
      }

      // 2. layout ฟอร์ม → erp_modules.config.layout (Tab → Section)
      //    section ที่ตั้งชื่อแท็บเดียวกัน → รวมอยู่แท็บเดียว ; ไม่ตั้งแท็บ → เป็นแท็บเดี่ยวของตัวเอง
      if (moduleKey) {
        const tabMap = new Map<string, { key: string; label: string; icon: string; sections: { key: string; label: string; columns: number }[] }>();
        for (const s of sections) {
          const tname = (s.tab ?? "").trim();
          const tk = tname ? `tab_${tname}` : s.key;
          const ent = tabMap.get(tk) ?? { key: tk, label: tname || s.label, icon: s.icon, sections: [] };
          ent.sections.push({ key: s.key, label: s.label, columns: s.columns });
          tabMap.set(tk, ent);
        }
        const tabs = [...tabMap.values()];
        const r = await apiFetch("/api/admin/module-layout", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module_key: moduleKey, layout: { tabs } }),
        });
        if ((await r.json()).error) throw new Error("layout failed");
      }

      setMsg("✓ บันทึกแล้ว — แก้ต่อได้เลย (กด \"ปิด\" เมื่อเสร็จ)");
      setDirty(false);
      setTimeout(() => setMsg(null), 4000);
      // ไม่ปิดอัตโนมัติ — ให้ผู้ใช้ทำงานต่อ แล้วกด "ปิด" เอง (onClose จะรีเฟรชหน้าให้)
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  // ---- drag (form tab — group + reorder + drop ที่คลัง/แท็บ) ----
  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id), overId = String(over.id);
    // ลากออกไปคลังซ้าย → เอาออกจากฟอร์ม
    if (overId === "palette") { setItems((p) => p.map((i) => i.key === activeKey ? { ...i, showInForm: false } : i)); setDirty(true); return; }
    // ลากไปจ่อชื่อแท็บ → ย้ายเข้ากล่องแรกของแท็บนั้น
    if (overId.startsWith("tab:")) {
      const tk = overId.slice(4);
      const secTabKey = (s: SectionDef) => ((s.tab ?? "").trim() ? `tab_${(s.tab ?? "").trim()}` : s.key);
      const target = sections.find((s) => secTabKey(s) === tk);
      if (target) { setItems((p) => p.map((i) => i.key === activeKey ? { ...i, groupKey: target.key } : i)); setDirty(true); }
      return;
    }
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
  }, [sections]);

  // จัด field เข้ากล่อง: ถ้า groupKey ตรงกับ section ที่ "มีอยู่จริงตอนนี้" (รวมที่เพิ่งสร้าง/เปลี่ยนชื่อ) → กล่องนั้น
  // ไม่งั้น (กลุ่ม orphan ที่ไม่มีกล่องรองรับ) → "other" (แท็บ "อื่น ๆ")
  const sectionKeySet = useMemo(() => new Set(sections.map((s) => s.key)), [sections]);
  const groupOf = useCallback(
    (g?: string | null) => { const k = g ?? "other"; return sectionKeySet.has(k) ? k : "other"; },
    [sectionKeySet],
  );

  // ---- group สำหรับ form tab ----
  const grouped = useMemo(() => {
    const map = new Map<string, StudioField[]>();
    for (const it of items) { const k = groupOf(it.groupKey); const l = map.get(k) ?? []; l.push(it); map.set(k, l); }
    return Array.from(map.entries()).sort(([a], [b]) => gmeta(a).order - gmeta(b).order);
  }, [items, groupOf]);

  // form tab: เรียงตามลำดับ sections (รวมหมวดว่างเป็น drop zone) + ตัวเลือกหมวดสำหรับ dropdown
  // — field กลุ่ม orphan ถูกจัดเข้ากล่อง "other" (แสดงใต้แท็บ "อื่น ๆ") แต่ย้ายเข้ากล่อง/แท็บอื่นได้ปกติ
  const formGroups = useMemo<[SectionDef, StudioField[]][]>(
    () => sections.map((s) => [s, items.filter((i) => groupOf(i.groupKey) === s.key)]),
    [sections, items, groupOf],
  );
  const sectionOptions = useMemo(() => sections.map((s) => ({ key: s.key, label: s.label })), [sections]);

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

      {/* Body: ซ้าย = editor / ขวา = preview (DnD ครอบทั้งคู่ → ลากข้ามฝั่ง/แท็บ/คลังได้) */}
      {tab !== "registry" && (
      <DndContext sensors={sensors} collisionDetection={smartCollision} onDragEnd={onDragEnd}>
      <div className="flex-1 overflow-hidden flex">
        {/* ---- LEFT: editor ---- */}
        <div className={`${previewFull ? "hidden" : (tab === "form" ? "w-64" : "w-2/5")} overflow-y-auto border-r border-slate-200 p-4 bg-slate-50`}>
          {tab === "table" ? (
            <TableEditor
              items={items} sensors={sensors}
              onReorder={(a,b)=>{ setItems((p)=>arrayMove(p,a,b)); setDirty(true); }}
              onToggleVisible={toggleVisible}
            />
          ) : (
            <FormEditor
              formGroups={formGroups} sectionOptions={sectionOptions} sensors={sensors} onDragEnd={onDragEnd}
              onToggleForm={toggleForm} onToggleInline={toggleInline} onToggleBulk={toggleBulk} onMoveGroup={(k,g)=>patchItem(k,{groupKey:g})}
              settingsKey={settingsKey} onToggleSettings={(k)=>setSettingsKey(s=>s===k?null:k)}
              onSetCols={setCols} onRename={renameSection} onSetIcon={setSectionIcon} onMove={moveSection} onDelete={deleteSection} onAddSection={addSection}
              onSetTab={setSectionTab} tabNames={[...new Set(sections.map((s) => (s.tab ?? "").trim()).filter(Boolean))]}
              paletteFields={items.filter((i) => !i.showInForm)} onAddToForm={(k) => toggleForm(k)} onAddNew={moduleKey ? () => setCreatorOpen(true) : undefined}
              paletteOnly
            />
          )}
        </div>

        {/* ---- RIGHT: live preview (พื้นหลังเทาอ่อน ให้กล่อง field เด่นชัด) ---- */}
        <div className={`${previewFull ? "w-full" : "flex-1 min-w-0"} overflow-y-auto bg-slate-100 p-5`}>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2">
              👁 Preview สด {tab==="form" && (pickedRow || sampleRows.length>0) ? "(ข้อมูลจริง)" : ""}
              <button type="button" onClick={()=>setPreviewFull(v=>!v)} title={previewFull?"ย่อ (โชว์ตัวแก้ไข)":"ขยาย preview เต็มจอ"}
                className="text-slate-400 hover:text-slate-700 normal-case">{previewFull ? "⤡ ย่อ" : "⤢ ขยาย"}</button>
            </div>
            {tab==="form" && (
              <div className="flex items-center gap-2">
                {/* เลือกรายการจริงมาโชว์ (pickup) */}
                {searchSample && loadSample && (
                  <SamplePicker label={pickedLabel} searchSample={searchSample}
                    onPick={async (id, lbl)=>{ const row = await loadSample(id); if (row) { setPickedRow(row); setPickedLabel(lbl); } }}
                    onClear={()=>{ setPickedRow(null); setPickedLabel(""); }} />
                )}
                {!pickedRow && sampleRows.length>0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400 mr-1">ตัวอย่าง:</span>
                    {sampleRows.map((_,i)=>(
                      <button key={i} onClick={()=>setPreviewIdx(i)}
                        className={`w-6 h-6 rounded text-xs ${previewIdx===i?"bg-orange-500 text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{i+1}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {tab === "table" ? (
            <TablePreview cols={visibleCols} />
          ) : (
            <FormPreview
              groups={formGroups.map(([s,fs])=>[s,fs.filter(f=>f.showInForm)] as [SectionDef,StudioField[]])}
              row={pickedRow ?? sampleRows[previewIdx]} moduleLabel={moduleLabel}
              editable selectedKey={settingsKey} onSelectField={(k)=>setSettingsKey((s)=>s===k?null:k)}
              onPatch={patchItem} onRemoveField={(k)=>toggleForm(k)}
              editApi={{ sections, renameSection, setCols, setSectionTab, deleteSection, addSection, addTab, renameTab, moveField: (k,g)=>patchItem(k,{groupKey:g}), moveTab }} />
          )}
        </div>
      </div>
      </DndContext>
      )}

      {creatorOpen && moduleKey && (
        <FieldCreatorModal moduleKey={moduleKey} moduleTitle={moduleLabel}
          onClose={() => setCreatorOpen(false)} onCreated={() => { void reloadNewFields(); }} />
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
  formGroups, sectionOptions, sensors, onDragEnd, onToggleForm, onToggleInline, onToggleBulk, onMoveGroup, settingsKey, onToggleSettings, onSetCols, onRename, onSetIcon, onMove, onDelete, onAddSection, onSetTab, tabNames, paletteFields, onAddToForm, onAddNew, paletteOnly,
}: {
  formGroups: [SectionDef, StudioField[]][];
  sectionOptions: { key: string; label: string }[];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (e: DragEndEvent)=>void;
  onToggleForm: (key: string)=>void;
  onToggleInline: (key: string)=>void;
  onToggleBulk: (key: string)=>void;
  onMoveGroup: (key: string, group: string)=>void;
  onSetCols: (group: string, n: number)=>void;
  onRename: (group: string, label: string)=>void;
  onSetIcon: (group: string, icon: string)=>void;
  onMove: (group: string, dir: -1 | 1)=>void;
  onDelete: (group: string)=>void;
  onAddSection: ()=>void;
  onSetTab: (group: string, tab: string)=>void;
  tabNames: string[];
  settingsKey: string | null;
  onToggleSettings: (key: string)=>void;
  paletteFields: StudioField[];
  onAddToForm: (key: string)=>void;
  onAddNew?: ()=>void;
  paletteOnly?: boolean;
}) {
  const [paletteQ, setPaletteQ] = useState("");
  const ql = paletteQ.trim().toLowerCase();
  const palette = ql ? paletteFields.filter((f)=>f.label.toLowerCase().includes(ql)||f.key.toLowerCase().includes(ql)) : paletteFields;
  const { setNodeRef: paletteDropRef, isOver: paletteOver } = useDroppable({ id: "palette" });
  const paletteBlock = (
    <div ref={paletteDropRef} className={`border rounded-xl bg-white ${paletteOver?"border-orange-400 ring-2 ring-orange-200":"border-slate-200"}`}>
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">📥 คลังฟิลด์</span>
        <span className="text-xs text-slate-400">({paletteFields.length})</span>
        {onAddNew && <button type="button" onClick={onAddNew} className="ml-auto h-7 px-2.5 text-xs font-medium rounded-md bg-orange-500 text-white hover:bg-orange-600">➕ สร้างฟิลด์ใหม่</button>}
      </div>
      <div className="p-2 space-y-1">
        <p className="text-[11px] text-slate-400 px-1 pb-1">ฟิลด์ที่ยังไม่อยู่ในฟอร์ม — กด &quot;+ ใส่ฟอร์ม&quot; เพื่อเพิ่ม</p>
        {paletteFields.length > 5 && (
          <input value={paletteQ} onChange={(e)=>setPaletteQ(e.target.value)} placeholder="ค้นหาฟิลด์…" className="w-full h-7 px-2 mb-1 text-xs border border-slate-200 rounded" />
        )}
        {palette.length===0 && <div className="text-[11px] text-slate-300 italic px-2 py-2">— ทุกฟิลด์อยู่ในฟอร์มแล้ว —</div>}
        {palette.map(f=>(
          <div key={f.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
            <span className="flex-1 text-sm text-slate-600 truncate">{f.label}<code className="ml-1.5 text-[10px] text-slate-400">{f.key}</code></span>
            <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">{f.type}</span>
            <button type="button" onClick={()=>onAddToForm(f.key)} className="h-7 px-2 text-xs font-medium rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">+ ใส่</button>
          </div>
        ))}
      </div>
    </div>
  );
  if (paletteOnly) return paletteBlock;
  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">☑ = โชว์ในฟอร์ม • ⚡ = แก้ไขเร็ว • ∑ = bulk • ⚙️ = ตั้งค่า/สไตล์ • ลาก ⋮⋮ เรียง/ย้ายหมวด • หัวหมวด: แก้ชื่อ/คอลัมน์/↑↓/ลบ</p>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={formGroups.flatMap(([,fs])=>fs.filter(f=>f.showInForm).map(f=>f.key))} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {formGroups.map(([sec, fs], idx)=>{
              const inForm = fs.filter(f=>f.showInForm);
              return (
              <FormSectionZone key={sec.key} groupKey={sec.key} label={sec.label} icon={sec.icon} count={inForm.length}
                cols={sec.columns} onSetCols={(n)=>onSetCols(sec.key,n)} onSetIcon={(ic)=>onSetIcon(sec.key,ic)}
                onRename={(l)=>onRename(sec.key,l)} onUp={idx>0?()=>onMove(sec.key,-1):undefined}
                onDown={idx<formGroups.length-1?()=>onMove(sec.key,1):undefined}
                tab={sec.tab ?? ""} onSetTab={(t)=>onSetTab(sec.key,t)} tabNames={tabNames}
                onDelete={()=>onDelete(sec.key)}>
                {inForm.length===0 && <div className="text-[11px] text-slate-300 italic px-2 py-2">— ยังไม่มีฟิลด์ในหมวดนี้ (เพิ่มจากคลังด้านล่าง) —</div>}
                {inForm.map(f=>(
                  <FormFieldRow key={f.key} field={f} sectionOptions={sectionOptions} onToggle={()=>onToggleForm(f.key)} onToggleInline={()=>onToggleInline(f.key)} onToggleBulk={()=>onToggleBulk(f.key)} onMoveGroup={(g)=>onMoveGroup(f.key,g)}
                    selected={settingsKey===f.key} onSelect={()=>onToggleSettings(f.key)} />
                ))}
              </FormSectionZone>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <button type="button" onClick={onAddSection}
        className="mt-3 w-full h-9 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/40">
        ➕ เพิ่มหมวด
      </button>

      <div className="mt-4">{paletteBlock}</div>
    </div>
  );
}

// ⚙️ แผงตั้งค่า field — จัดเป็นกลุ่ม: เลย์เอาต์ · ข้อความ · ตัวอักษร · เน้น
const STYLE_COLORS = ["", "#0f172a", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed", "#64748b"];
const HL_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fecaca", "#fed7aa"];
const SIZE_OPTS: [string,string][] = [["","อัตโนมัติ"],["sm","เล็ก"],["base","ปกติ"],["lg","ใหญ่"],["xl","ใหญ่มาก"]];
// component ย่อยของกล่องตั้งค่า — ต้องอยู่ระดับนอก ไม่งั้น React remount ทุกครั้งที่กด (scroll เด้ง/โฟกัสหลุด)
function FSToggle({ on, label, onClick, title }: { on: boolean; label: string; onClick: ()=>void; title?: string }) {
  return <button type="button" title={title} onClick={onClick} className={`px-2 py-1 rounded border text-xs ${on?"bg-orange-100 border-orange-300 text-orange-700 font-medium":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{label}</button>;
}
function FSRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5"><span className="text-slate-500 w-[68px] shrink-0">{label}</span>{children}</div>;
}
function FSGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-1.5 pt-2.5 first:pt-0 border-t first:border-t-0 border-slate-100">
    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{title}</div>{children}</div>;
}
function FieldSettings({ field, onPatch }: { field: StudioField; onPatch: (patch: Partial<StudioField>)=>void }) {
  const us = (field.uiStyle ?? {}) as Record<string, unknown>;
  const setUi = (k: string, v: unknown) => onPatch({ uiStyle: { ...us, [k]: v } });
  const labelPos = String(us.labelPos ?? "top");
  const selStyle = "h-7 px-1.5 border border-slate-200 rounded bg-white text-slate-600";
  return (
    <div className="p-3 space-y-2 text-xs">
      <FSGroup title="เลย์เอาต์">
        <FSRow label="ความกว้าง">
          {([[3,"¼"],[4,"⅓"],[6,"ครึ่ง"],[8,"⅔"],[12,"เต็ม"]] as [number,string][]).map(([n,lbl])=>(
            <FSToggle key={n} on={Number(us.gw)===n} label={lbl} onClick={()=>setUi("gw",n)} />
          ))}
        </FSRow>
        <FSRow label="ตำแหน่งหัวข้อ">
          <FSToggle on={labelPos!=="left"} label="⬆ บน" onClick={()=>setUi("labelPos","top")} />
          <FSToggle on={labelPos==="left"} label="⬅ ข้างหน้า" onClick={()=>setUi("labelPos","left")} />
        </FSRow>
        <FSRow label="ตัวเลือก">
          <FSToggle on={!!field.required} label="บังคับกรอก" onClick={()=>onPatch({required:!field.required})} />
          <FSToggle on={field.editable===false} label="อ่านอย่างเดียว" onClick={()=>onPatch({editable:field.editable===false?true:false})} />
          <FSToggle on={!!us.count} label="📊 นับความครบ" onClick={()=>setUi("count",!us.count)} />
        </FSRow>
      </FSGroup>

      <FSGroup title="ข้อความช่วย">
        <input value={field.helpText ?? ""} onChange={(e)=>onPatch({helpText:e.target.value})} placeholder="ข้อความช่วย (help text)" className="w-full h-8 px-2 border border-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-1.5">
          <input value={field.placeholder ?? ""} onChange={(e)=>onPatch({placeholder:e.target.value})} placeholder="placeholder" className="h-8 px-2 border border-slate-200 rounded" />
          <input value={String(field.defaultValue ?? "")} onChange={(e)=>onPatch({defaultValue:e.target.value})} placeholder="ค่าเริ่มต้น" className="h-8 px-2 border border-slate-200 rounded" />
        </div>
      </FSGroup>

      <FSGroup title="ตัวอักษร">
        <FSRow label="ขนาดหัวข้อ">
          <select value={String(us.label_size ?? "")} onChange={(e)=>setUi("label_size", e.target.value)} className={selStyle}>
            {SIZE_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </FSRow>
        <FSRow label="ขนาดค่า">
          <select value={String(us.value_size ?? "")} onChange={(e)=>setUi("value_size", e.target.value)} className={selStyle}>
            {SIZE_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </FSRow>
        <FSRow label="สไตล์">
          <FSToggle on={!!us.bold} label="B" onClick={()=>setUi("bold",!us.bold)} title="ตัวหนา" />
          <FSToggle on={!!us.italic} label="I" onClick={()=>setUi("italic",!us.italic)} title="ตัวเอียง" />
          <FSToggle on={!!us.underline} label="U" onClick={()=>setUi("underline",!us.underline)} title="ขีดเส้นใต้" />
          <span className="text-slate-300">|</span>
          {(["left","center","right"] as const).map(al=>(
            <FSToggle key={al} on={String(us.align??"left")===al} label={al==="left"?"⬅":al==="center"?"↔":"➡"} onClick={()=>setUi("align",al)} />
          ))}
        </FSRow>
        <FSRow label="ฟอนต์">
          {(["","serif","mono"] as const).map(ff=>(
            <FSToggle key={ff||"sans"} on={String(us.font??"")===ff} label={ff===""?"ปกติ":ff==="serif"?"มีหัว":"mono"} onClick={()=>setUi("font",ff)} />
          ))}
        </FSRow>
        <FSRow label="สีตัวอักษร">
          {STYLE_COLORS.map(c=>(
            <button key={c||"default"} type="button" onClick={()=>setUi("color",c)}
              className={`w-6 h-6 rounded-full border-2 ${String(us.color??"")===c?"border-orange-500":"border-slate-200"} ${c===""?"bg-white text-[9px] text-slate-400 flex items-center justify-center":""}`}
              style={c?{background:c}:undefined} title={c||"ค่าเริ่มต้น"}>{c===""?"—":""}</button>
          ))}
        </FSRow>
      </FSGroup>

      <FSGroup title="เน้น / อื่นๆ">
        <FSRow label="ไฮไลต์">
          <FSToggle on={!!us.highlight} label={us.highlight?"เปิด":"ปิด"} onClick={()=>setUi("highlight",!us.highlight)} />
          {us.highlight ? HL_COLORS.map(c=>(
            <button key={c} type="button" onClick={()=>setUi("highlightColor",c)}
              className={`w-6 h-6 rounded-full border-2 ${String(us.highlightColor??HL_COLORS[0])===c?"border-orange-500":"border-slate-200"}`}
              style={{background:c}} title="สีไฮไลต์" />
          )) : <span className="text-slate-300 text-[11px]">(เปิดก่อนถึงเลือกสีได้)</span>}
        </FSRow>
        <FSRow label="ค่า">
          <FSToggle on={!!us.copyable} label="📋 ปุ่มคัดลอกค่า" onClick={()=>setUi("copyable",!us.copyable)} />
        </FSRow>
      </FSGroup>
    </div>
  );
}

function FormSectionZone({ groupKey, label, icon, count, cols, onSetCols, onSetIcon, onRename, onUp, onDown, onDelete, tab, onSetTab, tabNames, children }: { groupKey: string; label: string; icon: string; count: number; cols: number; onSetCols: (n: number)=>void; onSetIcon: (icon: string)=>void; onRename: (label: string)=>void; onUp?: ()=>void; onDown?: ()=>void; onDelete: ()=>void; tab: string; onSetTab: (tab: string)=>void; tabNames: string[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useSortable({ id: `group:${groupKey}` });
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div ref={setNodeRef} className={`px-3 py-2 flex items-center gap-2 border-b border-slate-100 flex-wrap ${isOver?"bg-orange-50":"bg-slate-50"}`}>
        <IconPicker value={icon} onChange={onSetIcon} />
        {/* แก้ชื่อหมวดได้ */}
        <input value={label} onChange={(e)=>onRename(e.target.value)} title="แก้ชื่อหมวด (กล่อง section)"
          className="text-sm font-semibold text-slate-700 bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-300 focus:bg-white rounded px-1 py-0.5 w-36 focus:outline-none" />
        <span className="text-xs text-slate-400">({count})</span>
        {/* แท็บ: section ที่ใส่ชื่อแท็บเดียวกัน = อยู่แท็บเดียวกัน (เว้นว่าง = แท็บเดี่ยว) */}
        <label className="flex items-center gap-1 text-[11px] text-slate-400">📑 แท็บ:
          <input list="studio-tabs" value={tab} onChange={(e)=>onSetTab(e.target.value)} placeholder="(เดี่ยว)" title="พิมพ์ชื่อแท็บ — section ที่แท็บเดียวกันจะรวมอยู่แท็บเดียว"
            className="w-28 h-6 px-1.5 text-[11px] border border-slate-200 rounded bg-white text-slate-600 focus:border-orange-300 focus:outline-none" />
          <datalist id="studio-tabs">{tabNames.map((t)=><option key={t} value={t} />)}</datalist>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-slate-400">คอลัมน์:</span>
          {[1,2,3].map((n)=>(
            <button key={n} type="button" onClick={()=>onSetCols(n)}
              className={`w-6 h-6 text-xs rounded border ${cols===n?"bg-orange-100 border-orange-300 text-orange-700 font-semibold":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{n}</button>
          ))}
          <span className="mx-1 text-slate-200">|</span>
          <button type="button" onClick={onUp} disabled={!onUp} title="เลื่อนขึ้น" className="w-6 h-6 text-xs rounded text-slate-400 hover:text-slate-700 disabled:opacity-30">▲</button>
          <button type="button" onClick={onDown} disabled={!onDown} title="เลื่อนลง" className="w-6 h-6 text-xs rounded text-slate-400 hover:text-slate-700 disabled:opacity-30">▼</button>
          <button type="button" onClick={()=>{ if(confirm(`ลบหมวด "${label}"? ฟิลด์ในหมวดนี้จะย้ายไป "อื่น ๆ"`)) onDelete(); }} title="ลบหมวด" className="w-6 h-6 text-xs rounded text-slate-300 hover:text-red-500">✕</button>
        </div>
      </div>
      <div className="p-2 space-y-1 min-h-[2.5rem]">{children}</div>
    </div>
  );
}

function FormFieldRow({ field, sectionOptions, onToggle, onToggleInline, onToggleBulk, onMoveGroup, selected, onSelect }: { field: StudioField; sectionOptions: { key: string; label: string }[]; onToggle: ()=>void; onToggleInline: ()=>void; onToggleBulk: ()=>void; onMoveGroup: (g:string)=>void; selected: boolean; onSelect: ()=>void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.4:1 };
  // ชนิดที่ quick-edit ได้ (text/number/boolean/select/textarea/relation)
  const inlineable = ["text","number","boolean","select","textarea","relation"].includes(field.type);
  // ชนิดที่ bulk-edit ได้ (รวม relation ด้วย — เลือกค่าเดียวให้ทุกแถว)
  const bulkable = inlineable || field.type === "relation";
  return (
    <div ref={setNodeRef} style={style} onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer ${selected?"border-orange-300 bg-orange-50/60 ring-1 ring-orange-200":field.showInForm?"border-blue-200 bg-blue-50/40":"border-slate-200 bg-white"} ${isDragging?"shadow-lg":""}`}>
      <span {...attributes} {...listeners} onClick={(e)=>e.stopPropagation()} className="cursor-grab active:cursor-grabbing text-slate-400 select-none px-1">⋮⋮</span>
      <input type="checkbox" checked={!!field.showInForm} onChange={onToggle} onClick={(e)=>e.stopPropagation()} className="rounded accent-blue-500" title="โชว์ในฟอร์ม" />
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
        {sectionOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );
}

// preset → CSS (ให้ตรงกับฝั่ง form จริงใน MasterCRUD) — sizeKey: label_size/value_size แยกขนาดหัวข้อ/ค่า
function uiStyleCss(us: Record<string, unknown>, sizeKey?: "label_size" | "value_size"): React.CSSProperties {
  const SZ: Record<string, string> = { sm: "12px", base: "14px", lg: "16px", xl: "20px" };
  const FF: Record<string, string> = { serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, 'Courier New', monospace" };
  const sizeVal = sizeKey ? (us[sizeKey] ?? us.size) : us.size;
  return {
    fontSize: SZ[String(sizeVal ?? "")] || undefined,
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

// ฟิลด์ 1 ช่องบน preview (โหมดแก้ไข: ลาก ⋮⋮ ย้าย/สลับ · คลิก=เลือก · มุมขวาล่าง=ปรับกว้าง/สูง)
function PreviewField({ f, cols, row, editable, selected, onSelect, onPatch }: {
  f: StudioField; cols: number; row?: Record<string, unknown>; editable?: boolean;
  selected?: boolean; onSelect?: (k: string)=>void;
  onPatch?: (k: string, patch: Partial<StudioField>)=>void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.key, disabled: !editable });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const us = (f.uiStyle ?? {}) as Record<string, unknown>;
  const labelCss = uiStyleCss(us, "label_size");
  const valueCss = uiStyleCss(us, "value_size");
  const hl = !!us.highlight;
  const hlColor = (us.highlightColor as string) || "#fef08a";
  const labelLeft = String(us.labelPos ?? "top") === "left";
  const val = previewVal(row, f);
  // ความกว้างบนกริด 12 ช่อง — ui_style.gw (1-12) ถ้ามี ; ไม่งั้นแปลงจาก span/คอลัมน์เดิม
  const gwDerive = (() => { const g = Number(us.gw); if (g>=1 && g<=12) return Math.round(g);
    const eff = f.formSpan && f.formSpan>1 ? f.formSpan : ((f.type==="textarea"||f.type==="image") && cols>1 ? cols : 1);
    return Math.max(1, Math.min(12, Math.round((12*Math.min(eff,cols))/(cols||2)))); })();
  const gw = gwDerive;
  const isTextarea = f.type === "textarea";
  const rows = Number(us.rows ?? 0) || 0;
  const dndStyle: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.5:1, zIndex: isDragging?10:undefined, gridColumn: `span ${gw}` };

  // ลากมุมขวาล่าง: แกน X = จำนวนช่อง 1-12 (กว้าง), แกน Y = จำนวนบรรทัด (สูง — เฉพาะ textarea)
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const el = boxRef.current; if (!el || !onPatch) return;
    const colW = el.offsetWidth / gw;
    const startX = e.clientX, startY = e.clientY, startGw = gw, startRows = rows || 3;
    const move = (ev: PointerEvent) => {
      const ng = Math.max(1, Math.min(12, startGw + Math.round((ev.clientX - startX) / colW)));
      const patch: Record<string, unknown> = { ...us, gw: ng };
      if (isTextarea) patch.rows = Math.max(2, Math.min(20, startRows + Math.round((ev.clientY - startY) / 22)));
      onPatch(f.key, { uiStyle: patch });
    };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.body.style.cursor=""; };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.body.style.cursor = isTextarea ? "nwse-resize" : "ew-resize";
  };

  return (
    <div ref={(el)=>{ setNodeRef(el); boxRef.current = el; }} style={{ ...dndStyle, ...(hl?{ background: hlColor, borderColor: hlColor }:{}) }} {...attributes} {...(editable?listeners:{})}
      onClick={editable ? (e)=>{ e.stopPropagation(); onSelect?.(f.key); } : undefined}
      className={`relative rounded p-2 ${hl?"border":selected?"ring-2 ring-orange-400 bg-orange-50":editable?"bg-white border border-slate-200 shadow-sm hover:border-orange-300 cursor-grab active:cursor-grabbing":""} ${labelLeft?"flex items-baseline gap-2":"space-y-0.5"}`}>
      {editable && (
        <span title="กดค้างที่กล่องเพื่อลากย้าย" className="absolute top-0.5 left-0.5 text-slate-300 select-none text-xs leading-none pointer-events-none">⋮⋮</span>
      )}
      <div className={`text-[11px] text-slate-500 ${editable&&!labelLeft?"pl-3":""} ${labelLeft?"shrink-0 w-32 pt-0.5":""}`} style={labelCss}>{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
        {editable && <span className="ml-1 text-[9px] text-slate-300">{gw}/12{isTextarea&&rows?` · ${rows} บรรทัด`:""}</span>}</div>
      <div className={`text-sm text-slate-800 break-words whitespace-pre-wrap ${labelLeft?"flex-1":""}`} style={{ ...valueCss, minHeight: isTextarea && rows ? `${rows*1.4}em` : "1.25rem" }}>{val || <span className="text-slate-300">—</span>}</div>
      {editable && (
        <div onPointerDown={startResize} title={isTextarea?"ลากปรับกว้าง (ซ้าย-ขวา) / สูง (บน-ล่าง)":"ลากปรับความกว้าง (ช่อง)"}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 flex items-end justify-end cursor-nwse-resize group">
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-slate-300 group-hover:text-orange-500"><path d="M9 3 3 9M9 6 6 9" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
        </div>
      )}
    </div>
  );
}

// กริดของ section บน canvas — เป็น drop zone (id group:<key>) รับ field ที่ลากมาวาง
function GridDrop({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`p-3 grid grid-cols-12 gap-3 min-h-[3rem] ${isOver?"bg-orange-50 ring-1 ring-orange-200":""}`}>{children}</div>;
}
// หัวแท็บ — drop zone (id tab:<key>) ลาก field มาจ่อ = ย้ายเข้าแท็บนั้น
function CanvasTab({ t, active, editable, editApi, onClick, first, last }: {
  t: { key: string; label: string; icon: string; entries: [SectionDef, StudioField[]][] };
  active: boolean; editable?: boolean; editApi?: EditApi; onClick: ()=>void; first?: boolean; last?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${t.key}` });
  const named = t.key.startsWith("tab_");
  return (
    <div ref={setNodeRef} onClick={onClick}
      className={`flex items-center gap-1 px-2 py-2 text-sm whitespace-nowrap border-b-2 cursor-pointer ${active?"border-orange-500 text-orange-600 font-medium":"border-transparent text-slate-500 hover:text-slate-700"} ${isOver?"bg-orange-100 ring-1 ring-orange-300 rounded-t":""}`}>
      {/* ◀▶ เรียง/สลับแท็บ */}
      {editable && editApi && (
        <button type="button" title="เลื่อนแท็บไปทางซ้าย" disabled={first}
          onClick={(e)=>{ e.stopPropagation(); editApi.moveTab(t.key, -1); }}
          className="text-slate-300 hover:text-orange-600 disabled:opacity-0 text-xs leading-none">◀</button>
      )}
      {iconNode(t.icon)}
      {editable && editApi
        ? <input value={t.label} onClick={(e)=>e.stopPropagation()}
            onChange={(e)=> named ? editApi.renameTab(t.label, e.target.value) : editApi.renameSection(t.entries[0][0].key, e.target.value)}
            className="bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-300 focus:bg-white rounded px-1 w-24 focus:outline-none" />
        : <span>{t.label}</span>}
      {editable && editApi && (
        <button type="button" title="เลื่อนแท็บไปทางขวา" disabled={last}
          onClick={(e)=>{ e.stopPropagation(); editApi.moveTab(t.key, 1); }}
          className="text-slate-300 hover:text-orange-600 disabled:opacity-0 text-xs leading-none">▶</button>
      )}
    </div>
  );
}

type EditApi = {
  sections: SectionDef[];
  renameSection: (key: string, label: string)=>void;
  setCols: (key: string, n: number)=>void;
  setSectionTab: (key: string, tab: string)=>void;
  deleteSection: (key: string)=>void;
  addSection: (tab?: string)=>void;
  addTab: ()=>void;
  renameTab: (oldTab: string, newTab: string)=>void;
  moveField: (fieldKey: string, groupKey: string)=>void;
  moveTab: (tabKey: string, dir: -1 | 1)=>void;
};

function FormPreview({ groups, row, moduleLabel, editable, selectedKey, onSelectField, onPatch, onRemoveField, editApi }: {
  groups: [SectionDef, StudioField[]][]; row?: Record<string, unknown>; moduleLabel: string;
  editable?: boolean; selectedKey?: string | null; onSelectField?: (k: string)=>void;
  onPatch?: (k: string, patch: Partial<StudioField>)=>void; onRemoveField?: (k: string)=>void;
  editApi?: EditApi;
}) {
  const allTabNames = editApi ? [...new Set(editApi.sections.map((s)=>(s.tab??"").trim()).filter(Boolean))] : [];
  // จัด section เข้าแท็บ (ตรงกับฟอร์มจริง): tab เดียวกัน = แท็บเดียว, เว้นว่าง = แท็บเดี่ยว
  const tabs = useMemo(() => {
    const m = new Map<string, { key: string; label: string; icon: string; entries: [SectionDef, StudioField[]][] }>();
    for (const [sec, fs] of groups) {
      const tname = (sec.tab ?? "").trim();
      const tk = tname ? `tab_${tname}` : sec.key;
      const ent = m.get(tk) ?? { key: tk, label: tname || sec.label, icon: sec.icon, entries: [] };
      ent.entries.push([sec, fs]); m.set(tk, ent);
    }
    return [...m.values()];
  }, [groups]);
  const [active, setActive] = useState(0);
  const curIdx = active < tabs.length ? active : 0;
  const selField = useMemo(() => groups.flatMap(([,fs])=>fs).find((f)=>f.key===selectedKey) ?? null, [groups, selectedKey]);
  if (groups.length === 0) return <div className="text-sm text-slate-300 py-8 text-center">ยังไม่เลือก field — ติ๊กด้านซ้าย</div>;
  const cur = tabs[curIdx];
  return (
    <div className="space-y-4 w-full max-w-5xl mx-auto relative" onClick={editable && selectedKey ? ()=>onSelectField?.(selectedKey) : undefined}>
      <div className="text-sm font-semibold text-slate-800">📄 {moduleLabel} — รายละเอียด {row ? "" : <span className="text-xs font-normal text-slate-300">(ไม่มีข้อมูลตัวอย่าง)</span>}{editable && <span className="ml-2 text-[11px] font-normal text-orange-500">✏️ คลิกที่ field เพื่อตั้งค่า · ลากขอบปรับความกว้าง</span>}</div>
      {/* กล่องตั้งค่า field ที่เลือก (ลอยมุมขวาบน) */}
      {editable && selField && onPatch && (
        <div onClick={(e)=>e.stopPropagation()} className="absolute right-0 top-7 z-20 w-[360px] max-w-[90%] bg-white rounded-lg border border-orange-200 shadow-xl">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-orange-100 bg-orange-50/60">
            <span className="text-xs font-semibold text-slate-700 truncate flex-1">⚙️ {selField.label}</span>
            {onRemoveField && <button type="button" onClick={()=>{ onRemoveField(selField.key); onSelectField?.(selField.key); }} title="เอาออกจากฟอร์ม (กลับเข้าคลัง)" className="text-[11px] text-rose-500 hover:text-rose-700 mr-1">เอาออก</button>}
            <button type="button" onClick={()=>onSelectField?.(selField.key)} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
          </div>
          {editApi && (
            <div className="px-3 py-2 border-b border-orange-100 text-xs flex items-center gap-1.5">
              <span className="text-slate-500 whitespace-nowrap">📦 ย้ายไปกล่อง:</span>
              <select value={selField.groupKey} onChange={(e)=>editApi.moveField(selField.key, e.target.value)} className="flex-1 h-7 px-1 border border-slate-200 rounded bg-white">
                {editApi.sections.map((s)=><option key={s.key} value={s.key}>{s.tab?`[${s.tab}] `:""}{s.label}</option>)}
              </select>
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto"><FieldSettings field={selField} onPatch={(patch)=>onPatch(selField.key, patch)} /></div>
        </div>
      )}
      {(tabs.length > 1 || (editable && editApi)) && (
        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
          {tabs.map((t, i)=>(
            <CanvasTab key={t.key} t={t} active={i===curIdx} editable={editable} editApi={editApi} onClick={()=>setActive(i)} first={i===0} last={i===tabs.length-1} />
          ))}
          {editable && editApi && (
            <button type="button" onClick={()=>editApi.addTab()} title="เพิ่มแท็บใหม่"
              className="px-2.5 py-2 text-sm text-orange-500 hover:text-orange-700 whitespace-nowrap">＋ แท็บ</button>
          )}
        </div>
      )}
      {(cur?.entries ?? []).map(([sec, fs])=>{
        const cols = sec.columns || 2;
        return (
          <div key={sec.key} className="border border-slate-200 rounded-lg overflow-hidden mb-4">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium text-slate-700 flex items-center gap-1.5 flex-wrap">
              {iconNode(sec.icon)}
              {editable && editApi ? (
                <>
                  <input value={sec.label} onChange={(e)=>editApi.renameSection(sec.key, e.target.value)} title="ชื่อกล่อง"
                    className="bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-300 focus:bg-white rounded px-1 w-32 focus:outline-none" />
                  <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                    คอลัมน์:
                    {[1,2,3].map((n)=>(
                      <button key={n} type="button" onClick={()=>editApi.setCols(sec.key,n)}
                        className={`w-5 h-5 rounded border ${cols===n?"bg-orange-100 border-orange-300 text-orange-700":"bg-white border-slate-200 text-slate-500"}`}>{n}</button>
                    ))}
                    <span className="mx-1">·</span>📑
                    <input list="studio-tabs-canvas" value={sec.tab ?? ""} onChange={(e)=>editApi.setSectionTab(sec.key, e.target.value)} placeholder="(เดี่ยว)" title="ชื่อแท็บ"
                      className="w-20 h-5 px-1 border border-slate-200 rounded bg-white focus:outline-none" />
                    <datalist id="studio-tabs-canvas">{allTabNames.map((t)=><option key={t} value={t} />)}</datalist>
                    <button type="button" onClick={()=>{ if(confirm(`ลบกล่อง "${sec.label}"? ฟิลด์จะย้ายไป "อื่น ๆ"`)) editApi.deleteSection(sec.key); }} title="ลบกล่อง" className="ml-1 text-slate-300 hover:text-red-500">✕</button>
                  </div>
                </>
              ) : sec.label}
            </div>
            <SortableContext items={fs.map(f=>f.key)} strategy={rectSortingStrategy}>
              <GridDrop id={`group:${sec.key}`}>
                {fs.length===0 && <div className="col-span-12 text-[11px] text-slate-300 italic py-2 text-center">— ลากฟิลด์มาวางที่นี่ —</div>}
                {fs.map(f=>(
                  <PreviewField key={f.key} f={f} cols={cols} row={row} editable={editable}
                    selected={selectedKey===f.key} onSelect={onSelectField} onPatch={onPatch} />
                ))}
              </GridDrop>
            </SortableContext>
          </div>
        );
      })}
      {editable && editApi && cur && (
        <button type="button" onClick={()=>{
          // เพิ่มกล่องในแท็บปัจจุบัน: ทำให้กล่องในแท็บนี้ใช้ชื่อแท็บเดียวกัน แล้วเพิ่มกล่องใหม่เข้าแท็บนั้น
          const tname = cur.label;
          cur.entries.forEach(([s])=>{ if ((s.tab ?? "").trim() !== tname) editApi.setSectionTab(s.key, tname); });
          editApi.addSection(tname);
        }}
          className="w-full h-9 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/40">
          ➕ เพิ่มกล่อง (section) ในแท็บ &quot;{cur.label}&quot;
        </button>
      )}
    </div>
  );
}
