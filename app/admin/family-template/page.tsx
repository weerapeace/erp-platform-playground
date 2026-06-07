"use client";

/**
 * ตั้งค่าเทมเพลตต่อประเภทสินค้า (Product Family Template) — /admin/family-template
 *
 * แต่ละแท็ก (product_family) กำหนดได้ว่า เมื่อ "Parent SKU" หรือ "SKU" ติดแท็กนี้:
 *   - field ไหน "โชว์เสมอ" / "ซ่อน" / "ปกติ"
 *   - section ไหนซ่อน
 *   - field ไหนบังคับกรอก
 *   - ค่าตั้งต้น (default) ของแต่ละ field
 *
 * เก็บใน product_families.template (jsonb) แบบ { parent_sku: {...}, sku: {...} }
 * (ของเก่าแบบ flat = ถือเป็นของ Parent SKU อัตโนมัติ ไม่หาย)
 * แสดงผลเป็น "ดีเทล" (โชว์เฉพาะที่ตั้งค่า) + กดปุ่ม "แก้ไข" เพื่อกางฟอร์มเต็ม
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { RelationPicker } from "@/components/relation-picker";
import { resolveRelationLabels, type RelationConfig } from "@/lib/relation";
import { FamilyNavTabs } from "@/components/family-nav-tabs";

type FieldMode = "normal" | "show" | "hide";

type Template = {
  show_fields?: string[];
  hide_fields?: string[];
  hide_sections?: string[];
  required_fields?: string[];
  defaults?: Record<string, string>;
};
type RawTemplate = Template & { parent_sku?: Template; sku?: Template };

type Family = { id: string; name: string; template: RawTemplate };
type RegField = { field_key: string; field_label: string; group_key: string; ui_field_type: string; column_name?: string; relation_config?: RelationConfig; options?: string[] };
type Section = { key: string; label: string };
type Scope = "parent_sku" | "sku";

const SCOPES: { key: Scope; label: string; module: string }[] = [
  { key: "parent_sku", label: "Parent SKU", module: "parent-skus-v2" },
  { key: "sku", label: "SKU", module: "skus-v2" },
];

const VIRTUAL = new Set(["computed", "computed_text", "one2many", "many2many"]);

// อ่าน sub-template ตาม scope (ของเก่า flat = parent_sku)
const scopedTpl = (raw: RawTemplate | undefined, scope: Scope): Template => {
  if (!raw) return {};
  if (raw.parent_sku !== undefined || raw.sku !== undefined) return (raw[scope] ?? {}) as Template;
  return scope === "parent_sku" ? (raw as Template) : {};
};
// แปลงเป็นรูปแบบใหม่ { parent_sku, sku } เสมอ (ของเก่า flat → parent_sku)
const normNested = (raw: RawTemplate | undefined): { parent_sku: Template; sku: Template } => {
  if (raw && (raw.parent_sku !== undefined || raw.sku !== undefined)) return { parent_sku: raw.parent_sku ?? {}, sku: raw.sku ?? {} };
  return { parent_sku: (raw as Template) ?? {}, sku: {} };
};
// ช่อง "ค่าตั้งต้น" ที่เปลี่ยนรูปแบบตามชนิด field (เลข/ใช่-ไม่ใช่/dropdown/relation/วันที่/ข้อความ)
function DefaultValueInput({ f, value, onChange }: { f: RegField; value: string; onChange: (v: string) => void }) {
  const cls = "w-full h-7 text-xs border border-slate-200 rounded px-1.5";
  const t = f.ui_field_type;
  if (t === "number" || t === "currency")
    return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="(ไม่ตั้ง)" className={cls} />;
  if (t === "boolean")
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls + " bg-white"}>
        <option value="">(ไม่ตั้ง)</option><option value="true">ใช่</option><option value="false">ไม่ใช่</option>
      </select>
    );
  if (t === "date")
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
  if (t === "select" && (f.options?.length ?? 0) > 0)
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls + " bg-white"}>
        <option value="">(ไม่ตั้ง)</option>
        {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  if (t === "relation" && f.relation_config?.target_table)
    return <RelationPicker value={value || null} onChange={(v) => onChange(v ?? "")} config={f.relation_config} placeholder="(ไม่ตั้ง)" />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="(ไม่ตั้ง)" className={cls} />;
}

// แท็กนี้ "เป็นเทมเพลต" ใน scope นี้ไหม
const hasTpl = (t?: Template): boolean =>
  !!t && (!!t.show_fields?.length || !!t.hide_fields?.length || !!t.hide_sections?.length ||
    !!t.required_fields?.length || !!(t.defaults && Object.keys(t.defaults).length));

export default function FamilyTemplatePage({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const goBack = () => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push("/master/lookups"); };

  const [scope, setScope] = useState<Scope>("parent_sku");
  const scopeModule = SCOPES.find((s) => s.key === scope)!.module;

  const [families, setFamilies] = useState<Family[]>([]);
  const [fields, setFields] = useState<RegField[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [tpl, setTpl] = useState<Template>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [viewMode, setViewMode] = useState<"tag" | "section">("tag");
  const [sectionRules, setSectionRules] = useState<Record<string, string[]>>({});
  const [savingSec, setSavingSec] = useState(false);
  const [secMsg, setSecMsg] = useState("");

  // โหลดแท็ก (ครั้งเดียว)
  useEffect(() => {
    apiFetch(`/api/master-v2/product_families?limit=500&include_inactive=true`).then((r) => r.json())
      .then((fr) => {
        setFamilies((fr.data ?? fr.rows ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id), name: String(r.name ?? r.id), template: (r.template as RawTemplate) ?? {},
        })));
      })
      .finally(() => setLoading(false));
  }, []);

  // โหลด field registry + section ตาม scope (เปลี่ยนแท็บ → โหลดใหม่)
  useEffect(() => {
    apiFetch(`/api/admin/field-registry-v2?module=${scopeModule}`).then((r) => r.json()).then((reg) => {
      setFields((reg.fields ?? []).map((f: Record<string, unknown>) => ({
        field_key: String(f.field_key), field_label: String(f.field_label ?? f.field_key),
        group_key: String(f.group_key ?? ""), ui_field_type: String(f.ui_field_type ?? "text"),
        column_name: f.column_name ? String(f.column_name) : undefined,
        relation_config: (f.relation_config as RelationConfig) ?? undefined,
        options: (f.options as { options?: string[] })?.options ?? undefined,
      })));
      const secs: Section[] = [];
      for (const t of (reg.layout?.tabs ?? [])) for (const s of (t.sections ?? [])) secs.push({ key: s.key, label: s.label });
      setSections(secs);
      setSectionRules((reg.section_tag_rules as Record<string, string[]>) ?? {});
    }).catch(() => {});
  }, [scopeModule]);

  // เปลี่ยน scope → โหลด tpl ของแท็กที่เลือกใหม่ + กลับเป็นโหมดดีเทล
  useEffect(() => {
    if (activeId) setTpl(scopedTpl(families.find((f) => f.id === activeId)?.template, scope));
    setEditing(false); setMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const selectFamily = (id: string) => {
    setActiveId(id);
    setTpl(scopedTpl(families.find((f) => f.id === id)?.template, scope));
    setEditing(false); setMsg("");
  };

  const templateFamilies = useMemo(
    () => families.filter((f) => hasTpl(scopedTpl(f.template, scope)) || addedIds.has(f.id)),
    [families, addedIds, scope],
  );
  const availableToAdd = useMemo(() => {
    const s = pickerSearch.trim().toLowerCase();
    return families
      .filter((f) => !hasTpl(scopedTpl(f.template, scope)) && !addedIds.has(f.id))
      .filter((f) => !s || f.name.toLowerCase().includes(s));
  }, [families, addedIds, pickerSearch, scope]);

  const addTemplate = (id: string) => {
    setAddedIds((prev) => new Set(prev).add(id));
    setPickerOpen(false); setPickerSearch("");
    selectFamily(id); setEditing(true);
  };

  // เอาแท็กออกจากเทมเพลต (เฉพาะ scope นี้)
  const removeTemplate = async (id: string) => {
    const fam = families.find((f) => f.id === id);
    if (!confirm(`เอา "${fam?.name ?? id}" ออกจากเทมเพลต ${scope === "sku" ? "SKU" : "Parent SKU"}? (ค่าที่ตั้งไว้ของส่วนนี้จะถูกล้าง)`)) return;
    const nested = normNested(fam?.template);
    nested[scope] = {};
    const finalTpl = !hasTpl(nested.parent_sku) && !hasTpl(nested.sku) ? {} : nested;
    try {
      await apiFetch(`/api/master-v2/product_families/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: finalTpl }),
      });
    } catch { /* best-effort */ }
    setFamilies((fs) => fs.map((f) => (f.id === id ? { ...f, template: finalTpl as RawTemplate } : f)));
    setAddedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    if (activeId === id) { setActiveId(""); setTpl({}); }
  };

  const grouped = useMemo(() => {
    const byKey = new Map<string, RegField[]>();
    for (const f of fields) { const k = f.group_key || "_other"; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(f); }
    const out: { key: string; label: string; fields: RegField[] }[] = [];
    for (const s of sections) if (byKey.has(s.key)) { out.push({ key: s.key, label: s.label, fields: byKey.get(s.key)! }); byKey.delete(s.key); }
    for (const [k, fs] of byKey) out.push({ key: k, label: k === "_other" ? "อื่นๆ" : k, fields: fs });
    return out;
  }, [fields, sections]);

  const labelOfField = (key: string) => fields.find((f) => f.field_key === key)?.field_label ?? key;
  const labelOfSection = (key: string) => sections.find((s) => s.key === key)?.label ?? key;

  // helpers แก้ไข template
  const modeOf = (key: string): FieldMode =>
    (tpl.show_fields ?? []).includes(key) ? "show" : (tpl.hide_fields ?? []).includes(key) ? "hide" : "normal";
  const setMode = (key: string, mode: FieldMode) => setTpl((p) => {
    const show = new Set(p.show_fields ?? []); const hide = new Set(p.hide_fields ?? []);
    show.delete(key); hide.delete(key);
    if (mode === "show") show.add(key); else if (mode === "hide") hide.add(key);
    return { ...p, show_fields: [...show], hide_fields: [...hide] };
  });
  const sectionHidden = (key: string) => (tpl.hide_sections ?? []).includes(key);
  const toggleSection = (key: string) => setTpl((p) => {
    const s = new Set(p.hide_sections ?? []); if (s.has(key)) s.delete(key); else s.add(key);
    return { ...p, hide_sections: [...s] };
  });
  const isRequired = (key: string) => (tpl.required_fields ?? []).includes(key);
  const toggleRequired = (key: string) => setTpl((p) => {
    const s = new Set(p.required_fields ?? []); if (s.has(key)) s.delete(key); else s.add(key);
    return { ...p, required_fields: [...s] };
  });
  const defaultOf = (key: string) => (tpl.defaults ?? {})[key] ?? "";
  const setDefault = (key: string, v: string) => setTpl((p) => {
    const d = { ...(p.defaults ?? {}) }; if (v === "") delete d[key]; else d[key] = v;
    return { ...p, defaults: d };
  });

  const save = async () => {
    if (!activeId) return;
    setSaving(true); setMsg("");
    const clean: Template = {};
    if (tpl.show_fields?.length) clean.show_fields = tpl.show_fields;
    if (tpl.hide_fields?.length) clean.hide_fields = tpl.hide_fields;
    if (tpl.hide_sections?.length) clean.hide_sections = tpl.hide_sections;
    if (tpl.required_fields?.length) clean.required_fields = tpl.required_fields;
    if (tpl.defaults && Object.keys(tpl.defaults).length) clean.defaults = tpl.defaults;
    const fam = families.find((f) => f.id === activeId);
    const nested = normNested(fam?.template);
    nested[scope] = clean;
    const finalTpl = !hasTpl(nested.parent_sku) && !hasTpl(nested.sku) ? {} : nested;
    try {
      const res = await apiFetch(`/api/master-v2/product_families/${activeId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: finalTpl }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setMsg("❌ บันทึกไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      setFamilies((fs) => fs.map((f) => (f.id === activeId ? { ...f, template: finalTpl as RawTemplate } : f)));
      setMsg("✅ บันทึกแล้ว"); setEditing(false);
    } catch (e) { setMsg("❌ " + (e instanceof Error ? e.message : "network")); }
    finally { setSaving(false); }
  };

  const toggleSecTag = (secKey: string, tagId: string) => setSectionRules((p) => {
    const cur = new Set(p[secKey] ?? []); if (cur.has(tagId)) cur.delete(tagId); else cur.add(tagId);
    const next = { ...p }; if (cur.size) next[secKey] = [...cur]; else delete next[secKey];
    return next;
  });
  const saveSectionRules = async () => {
    setSavingSec(true); setSecMsg("");
    try {
      const res = await apiFetch("/api/admin/section-tag-rules", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: scopeModule, rules: sectionRules }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setSecMsg("❌ บันทึกไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      setSecMsg("✅ บันทึกแล้ว");
    } catch (e) { setSecMsg("❌ " + (e instanceof Error ? e.message : "network")); }
    finally { setSavingSec(false); }
  };

  // ---- ดีเทล (อ่านอย่างเดียว) — โชว์เฉพาะรายการที่ตั้งค่า ----
  const detailRows = useMemo(() => {
    const out: { title: string; items: string[]; tone: string }[] = [];
    if (tpl.show_fields?.length) out.push({ title: "โชว์เสมอ", tone: "text-emerald-700 bg-emerald-50 border-emerald-100", items: tpl.show_fields.map(labelOfField) });
    if (tpl.hide_fields?.length) out.push({ title: "ซ่อน", tone: "text-slate-600 bg-slate-50 border-slate-200", items: tpl.hide_fields.map(labelOfField) });
    if (tpl.hide_sections?.length) out.push({ title: "ซ่อนทั้ง Section", tone: "text-slate-600 bg-slate-50 border-slate-200", items: tpl.hide_sections.map(labelOfSection) });
    if (tpl.required_fields?.length) out.push({ title: "บังคับกรอก", tone: "text-rose-700 bg-rose-50 border-rose-100", items: tpl.required_fields.map(labelOfField) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, fields, sections]);
  const defaultEntries = Object.entries(tpl.defaults ?? {});

  // โหมดดีเทล: แปลง id ของ default ที่เป็น relation → ชื่อ (อ่านง่าย)
  const [defLabels, setDefLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (editing) return;
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(tpl.defaults ?? {})) {
        const f = fields.find((x) => x.field_key === k);
        if (f?.ui_field_type === "relation" && f.relation_config?.target_table && v) {
          try { const m = await resolveRelationLabels(apiFetch, f.relation_config, [String(v)]); const opt = m.get(String(v)); if (opt) out[k] = opt.label; } catch { /* ignore */ }
        }
      }
      if (alive) setDefLabels(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, scope, editing, fields]);
  const renderDefaultVal = (k: string, v: string): string => {
    const f = fields.find((x) => x.field_key === k);
    if (f?.ui_field_type === "boolean") return v === "true" ? "ใช่" : v === "false" ? "ไม่ใช่" : String(v);
    if (f?.ui_field_type === "relation") return defLabels[k] ?? String(v);
    return String(v);
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">กำลังโหลด…</div>;

  return (
    <div className={embedded ? "" : "min-h-screen bg-slate-50"}>
      {!embedded && <FamilyNavTabs active="template" />}
      <div className={embedded ? "px-1 pb-3" : "bg-white border-b border-slate-200 px-6 py-4"}>
        {!embedded && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={goBack} title="กลับ" className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
              <h1 className="text-xl font-bold text-slate-900">🧩 เทมเพลตประเภทสินค้า</h1>
            </div>
            <button onClick={goBack} className="h-8 px-3 text-sm flex items-center gap-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">✕ ปิด</button>
          </div>
        )}
        {/* แท็บ scope: Parent SKU / SKU */}
        <div className="mt-3 inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {SCOPES.map((s) => (
            <button key={s.key} onClick={() => setScope(s.key)}
              className={`px-4 h-8 ${scope === s.key ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} ${s.key !== "parent_sku" ? "border-l border-slate-200" : ""}`}>{s.label}</button>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-2">
          {viewMode === "tag"
            ? `กำหนดว่าเมื่อ ${scope === "sku" ? "SKU" : "Parent SKU"} ติดแท็กนี้ จะโชว์/ซ่อนฟิลด์ไหน บังคับกรอกอะไร — ติดหลายแท็กรวมกันแบบ union`
            : `กำหนดว่าแต่ละ Section ของ ${scope === "sku" ? "SKU" : "Parent SKU"} จะโชว์เฉพาะที่มีแท็กไหน (ไม่เลือก = โชว์ทุกแท็ก)`}
        </p>
        <div className="mt-2 inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          <button onClick={() => setViewMode("tag")} className={`px-3 h-8 ${viewMode === "tag" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามแท็ก</button>
          <button onClick={() => setViewMode("section")} className={`px-3 h-8 border-l border-slate-200 ${viewMode === "section" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตาม Section (โชว์เฉพาะแท็ก)</button>
        </div>
      </div>

      {viewMode === "tag" && (
        <div className="flex gap-4 p-4 max-w-6xl mx-auto">
          {/* รายการแท็กที่เป็นเทมเพลต */}
          <div className="w-60 shrink-0">
            <div className="relative mb-2">
              <button onClick={() => setPickerOpen((o) => !o)}
                className="w-full h-9 px-3 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">＋ เพิ่มแท็กเป็นเทมเพลต</button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
                  <div className="absolute z-40 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-72 overflow-auto">
                    <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="ค้นหาแท็ก…" autoFocus
                      className="w-full h-8 px-2 mb-2 text-sm border border-slate-200 rounded-md" />
                    {availableToAdd.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-slate-400 text-center">— ไม่มีแท็กให้เพิ่มแล้ว —</div>
                    ) : availableToAdd.map((f) => (
                      <button key={f.id} onClick={() => addTemplate(f.id)} className="block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-blue-50 text-slate-700">{f.name}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {templateFamilies.length === 0 ? (
                <div className="p-3 text-xs text-slate-400">ยังไม่มีแท็กที่เป็นเทมเพลตของ {scope === "sku" ? "SKU" : "Parent SKU"} — กด “เพิ่มแท็กเป็นเทมเพลต”</div>
              ) : templateFamilies.map((f) => (
                <div key={f.id} className={`group flex items-center border-b border-slate-100 last:border-0 ${activeId === f.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <button onClick={() => selectFamily(f.id)} className={`flex-1 text-left px-3 py-2 text-sm ${activeId === f.id ? "text-blue-700 font-medium" : "text-slate-700"}`}>
                    {f.name}
                    {!hasTpl(scopedTpl(f.template, scope)) && <span className="ml-1.5 text-[10px] text-amber-500">(ยังไม่ตั้งค่า)</span>}
                  </button>
                  <button onClick={() => removeTemplate(f.id)} title="เอาออกจากเทมเพลต" className="px-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* ดีเทล / แก้ไข */}
          <div className="flex-1 min-w-0">
            {!activeId ? (
              <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-400">เลือกแท็กทางซ้าย</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-slate-500">
                    {editing ? "กำลังแก้ไข: " : "เทมเพลตของ: "}
                    <span className="font-semibold text-slate-800">{families.find((f) => f.id === activeId)?.name}</span>
                    <span className="ml-1.5 text-xs text-slate-400">({scope === "sku" ? "SKU" : "Parent SKU"})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {msg && <span className="text-xs">{msg}</span>}
                    {editing ? (
                      <>
                        <button onClick={() => { setEditing(false); setTpl(scopedTpl(families.find((f) => f.id === activeId)?.template, scope)); setMsg(""); }}
                          className="h-8 px-3 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                        <button onClick={save} disabled={saving} className="h-8 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
                      </>
                    ) : (
                      <button onClick={() => setEditing(true)} className="h-8 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">✎ แก้ไข</button>
                    )}
                  </div>
                </div>

                {/* ── โหมดดีเทล (โชว์เฉพาะที่ตั้งค่า) ── */}
                {!editing && (
                  detailRows.length === 0 && defaultEntries.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-400">ยังไม่ได้ตั้งค่าเทมเพลตสำหรับ {scope === "sku" ? "SKU" : "Parent SKU"} — กด “✎ แก้ไข”</div>
                  ) : (
                    <div className="space-y-3">
                      {/* ค่าตั้งต้น (เน้นเป็นพิเศษ) */}
                      {defaultEntries.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-sm font-medium text-amber-800">ค่าตั้งต้น (Default) — {defaultEntries.length} ฟิลด์</div>
                          <table className="w-full text-sm">
                            <tbody>
                              {defaultEntries.map(([k, v]) => (
                                <tr key={k} className="border-b border-slate-50 last:border-0">
                                  <td className="px-3 py-1.5 text-slate-600 w-1/2">{labelOfField(k)}</td>
                                  <td className="px-3 py-1.5 font-medium text-slate-800">{renderDefaultVal(k, v)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {/* การแสดงฟิลด์/section/บังคับ */}
                      {detailRows.map((r) => (
                        <div key={r.title} className="bg-white border border-slate-200 rounded-lg p-3">
                          <div className="text-sm font-medium text-slate-700 mb-1.5">{r.title} <span className="text-xs text-slate-400">({r.items.length})</span></div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.items.map((it, i) => (
                              <span key={i} className={`text-xs px-2 py-0.5 rounded border ${r.tone}`}>{it}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* ── โหมดแก้ไข (ฟอร์มเต็ม) ── */}
                {editing && (
                  <div className="space-y-3">
                    {grouped.map((g) => {
                      const hidden = sectionHidden(g.key);
                      return (
                        <div key={g.key} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                            <span className="text-sm font-medium text-slate-700">{g.label}</span>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={hidden} onChange={() => toggleSection(g.key)} className="rounded border-slate-300" />ซ่อนทั้ง section
                            </label>
                          </div>
                          <div className={hidden ? "opacity-40 pointer-events-none" : ""}>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-[11px] text-slate-400 border-b border-slate-100">
                                  <th className="text-left font-normal px-3 py-1.5">ฟิลด์</th>
                                  <th className="text-left font-normal px-2 py-1.5 w-44">การแสดง</th>
                                  <th className="text-center font-normal px-2 py-1.5 w-20">บังคับ</th>
                                  <th className="text-left font-normal px-3 py-1.5 w-48">ค่าตั้งต้น</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.fields.map((f) => {
                                  const virtual = VIRTUAL.has(f.ui_field_type);
                                  return (
                                    <tr key={f.field_key} className="border-b border-slate-50 last:border-0">
                                      <td className="px-3 py-1.5 text-slate-700">{f.field_label}<span className="ml-1.5 text-[10px] text-slate-300">{f.field_key}</span></td>
                                      <td className="px-2 py-1.5">
                                        <select value={modeOf(f.field_key)} onChange={(e) => setMode(f.field_key, e.target.value as FieldMode)} className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white">
                                          <option value="normal">ปกติ (ตาม registry)</option>
                                          <option value="show">โชว์เสมอ</option>
                                          <option value="hide">ซ่อน</option>
                                        </select>
                                      </td>
                                      <td className="px-2 py-1.5 text-center">
                                        <input type="checkbox" checked={isRequired(f.field_key)} onChange={() => toggleRequired(f.field_key)} className="rounded border-slate-300" />
                                      </td>
                                      <td className="px-3 py-1.5">
                                        {virtual ? <span className="text-[11px] text-slate-300 italic">— ตั้งค่าไม่ได้ —</span>
                                          : <DefaultValueInput f={f} value={defaultOf(f.field_key)} onChange={(v) => setDefault(f.field_key, v)} />}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ───────── โหมด: ตาม Section ───────── */}
      {viewMode === "section" && (
        <div className="p-4 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">เลือกแท็กที่จะให้ section นั้นโชว์ — ไม่เลือกแท็กเลย = โชว์ทุกแท็ก (ปกติ)</p>
            <div className="flex items-center gap-2">
              {secMsg && <span className="text-xs">{secMsg}</span>}
              <button onClick={saveSectionRules} disabled={savingSec} className="h-8 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{savingSec ? "กำลังบันทึก…" : "บันทึก"}</button>
            </div>
          </div>
          {grouped.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-400">ยังไม่มี section</div>
          ) : (
            <div className="space-y-3">
              {grouped.map((g) => {
                const sel = sectionRules[g.key] ?? [];
                return (
                  <div key={g.key} className="bg-white border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">{g.label}</span>
                      <span className={`text-[11px] ${sel.length ? "text-blue-600" : "text-slate-400"}`}>{sel.length === 0 ? "โชว์ทุกแท็ก" : `โชว์เฉพาะ ${sel.length} แท็ก`}</span>
                    </div>
                    {families.length === 0 ? <div className="text-xs text-slate-400">ยังไม่มีแท็ก</div> : (
                      <div className="flex flex-wrap gap-1.5">
                        {families.map((f) => {
                          const on = sel.includes(f.id);
                          return (
                            <button key={f.id} onClick={() => toggleSecTag(g.key, f.id)}
                              className={`text-[11px] px-2 py-1 rounded-full border ${on ? "border-blue-400 bg-blue-100 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{f.name}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
