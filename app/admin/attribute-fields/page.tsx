"use client";

/**
 * จัดการชุดฟิลด์ต่อประเภทสินค้า — /admin/attribute-fields
 * เพิ่ม/แก้/ลบ/เรียง ฟิลด์ (สเปกร่วม=model / รายสี=sku) · ชนิดฟิลด์ · ตัวเลือก many2one · กรองแท็กของ sku-ref
 * ใช้กับหน้า "แก้รายละเอียดสั่งงาน" (work-instruction)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type FieldType = "text" | "number" | "boolean" | "select" | "multiselect" | "sku";
type Opt = { id: string; label: string; value: string; display_order: number };
type Def = { id: string; product_family: string | null; key: string; label: string; scope: string; type: FieldType; required: boolean; display_order: number; help_text: string; relation_filter: { tags?: string[] } | null; options: Opt[] };

const TYPE_LABEL: Record<FieldType, string> = { text: "ข้อความ", number: "ตัวเลข", boolean: "ใช่/ไม่ใช่", select: "ตัวเลือก (เลือก 1)", multiselect: "เลือกหลายอัน", sku: "เลือกวัตถุดิบ (SKU)" };
const SCOPES: [string, string][] = [["model", "สเปกร่วม (ใช้ทุกสี)"], ["sku", "รายสี (เฉพาะรุ่นสีนี้)"]];

export default function AttributeFieldsPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  const toast = useToast();

  const [families, setFamilies] = useState<string[]>([]);
  const [family, setFamily] = useState<string>("");
  const [defs, setDefs] = useState<Def[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Def> | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async (fam: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/attribute-fields${fam ? `?family=${encodeURIComponent(fam)}` : ""}`);
      const j = await res.json();
      setFamilies((j.families ?? []) as string[]);
      setDefs((j.definitions ?? []) as Def[]);
      if (!fam && (j.families ?? []).length) setFamily((j.families as string[])[0]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(family); }, [family, load]);
  useEffect(() => {
    apiFetch("/api/admin/picker?table=product_families&label=name&limit=300").then((r) => r.json())
      .then((j) => setTags(((j.data ?? []) as { label: string }[]).map((o) => o.label).filter(Boolean))).catch(() => {});
  }, []);

  const addFamily = () => {
    const name = window.prompt("ชื่อประเภทสินค้าใหม่ (เช่น กระเป๋า, เข็มขัด):")?.trim();
    if (name) { setFamilies((f) => [...new Set([...f, name])]); setFamily(name); }
  };

  const saveDef = async (d: Partial<Def>) => {
    if (!d.label?.trim()) { toast.error("ใส่ชื่อฟิลด์ก่อน"); return; }
    try {
      const body = { id: d.id, product_family: family, label: d.label, scope: d.scope ?? "model", type: d.type ?? "text", required: !!d.required, help_text: d.help_text ?? "", relation_filter: d.type === "sku" ? { tags: d.relation_filter?.tags ?? [] } : null };
      const res = await apiFetch("/api/admin/attribute-fields", { method: d.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกฟิลด์แล้ว"); setEditing(null); await load(family);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  const delDef = async (id: string) => {
    try { const res = await apiFetch(`/api/admin/attribute-fields?id=${id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setConfirmDel(null); await load(family); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const moveDef = async (d: Def, dir: -1 | 1) => {
    const sibs = defs.filter((x) => x.scope === d.scope).sort((a, b) => a.display_order - b.display_order);
    const i = sibs.findIndex((x) => x.id === d.id); const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const a = sibs[i], b = sibs[j];
    try {
      await Promise.all([
        apiFetch("/api/admin/attribute-fields", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, display_order: b.display_order }) }),
        apiFetch("/api/admin/attribute-fields", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, display_order: a.display_order }) }),
      ]);
      await load(family);
    } catch { toast.error("ย้ายไม่สำเร็จ"); }
  };

  const byScope = useMemo(() => (s: string) => defs.filter((d) => d.scope === s).sort((a, b) => a.display_order - b.display_order), [defs]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-[1100px] mx-auto px-5 py-5">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">🧩 จัดการชุดฟิลด์ (ตามประเภทสินค้า)</h1>
          <p className="text-sm text-slate-500 mt-0.5">ตั้งว่าแต่ละประเภท (เข็มขัด/กระเป๋า) มีฟิลด์อะไรในหน้า “แก้รายละเอียดสั่งงาน” · เพิ่ม/แก้เองได้</p>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-slate-500">ประเภทสินค้า:</span>
          <select value={family} onChange={(e) => setFamily(e.target.value)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {families.length === 0 && <option value="">— ยังไม่มี —</option>}
            {[...new Set([...families, family].filter(Boolean))].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {canEdit && <button onClick={addFamily} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">＋ ประเภทใหม่</button>}
        </div>

        {loading ? <div className="text-center py-16 text-slate-400">กำลังโหลด…</div>
          : !family ? <div className="text-center py-16 text-slate-300">กด “＋ ประเภทใหม่” เพื่อเริ่ม</div>
            : (
              <div className="space-y-5">
                {SCOPES.map(([scope, scopeLabel]) => {
                  const rows = byScope(scope);
                  return (
                    <section key={scope} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                        <span className="text-sm font-semibold text-slate-700">{scopeLabel}</span>
                        {canEdit && <button onClick={() => setEditing({ scope, type: "text", required: false })} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">＋ เพิ่มฟิลด์</button>}
                      </div>
                      {rows.length === 0 ? <div className="px-4 py-6 text-center text-xs text-slate-300">ยังไม่มีฟิลด์</div>
                        : <div className="divide-y divide-slate-50">
                          {rows.map((d, i) => (
                            <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                              <div className="flex flex-col text-[10px] leading-none">
                                <button onClick={() => moveDef(d, -1)} disabled={i === 0} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                                <button onClick={() => moveDef(d, 1)} disabled={i === rows.length - 1} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-slate-800">{d.label}</span>
                                {d.required && <span className="ml-1 text-rose-500 text-xs">*</span>}
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {TYPE_LABEL[d.type]}
                                  {(d.type === "select" || d.type === "multiselect") && <span> · {d.options.length} ตัวเลือก</span>}
                                  {d.type === "sku" && d.relation_filter?.tags?.length ? <span> · เฉพาะแท็ก: {d.relation_filter.tags.join(", ")}</span> : null}
                                </div>
                              </div>
                              {canEdit && <>
                                <button onClick={() => setEditing(d)} className="h-8 px-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">✎ แก้</button>
                                {confirmDel === d.id
                                  ? <><button onClick={() => delDef(d.id)} className="h-8 px-2 text-xs bg-rose-600 text-white rounded-lg">ยืนยันลบ</button><button onClick={() => setConfirmDel(null)} className="h-8 px-2 text-xs border border-slate-200 rounded-lg">ยกเลิก</button></>
                                  : <button onClick={() => setConfirmDel(d.id)} className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button>}
                              </>}
                            </div>
                          ))}
                        </div>}
                    </section>
                  );
                })}
              </div>
            )}
      </div>

      {editing && <FieldEditor key={editing.id ?? "new"} initial={editing} tags={tags} onClose={() => setEditing(null)} onSave={saveDef} onReload={() => load(family)} canEdit={canEdit} />}
    </PlaygroundShell>
  );
}

// ===== ตัวแก้ฟิลด์ (modal) =====
function FieldEditor({ initial, tags, onClose, onSave, onReload, canEdit }: { initial: Partial<Def>; tags: string[]; onClose: () => void; onSave: (d: Partial<Def>) => void; onReload: () => void; canEdit: boolean }) {
  const toast = useToast();
  const [label, setLabel] = useState(initial.label ?? "");
  const [type, setType] = useState<FieldType>(initial.type ?? "text");
  const [required, setRequired] = useState(!!initial.required);
  const [help, setHelp] = useState(initial.help_text ?? "");
  const [filterTags, setFilterTags] = useState<string[]>(initial.relation_filter?.tags ?? []);
  const [options, setOptions] = useState<Opt[]>(initial.options ?? []);
  const [newOpt, setNewOpt] = useState("");
  const isNew = !initial.id;
  const usesOptions = type === "select" || type === "multiselect";

  const addOption = async () => {
    const lab = newOpt.trim(); if (!lab || !initial.id) return;
    try {
      const res = await apiFetch("/api/admin/attribute-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition_id: initial.id, label: lab }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setOptions((o) => [...o, { id: j.id, label: lab, value: lab, display_order: o.length + 1 }]); setNewOpt(""); onReload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มตัวเลือกไม่สำเร็จ"); }
  };
  const delOption = async (id: string) => {
    try { const res = await apiFetch(`/api/admin/attribute-options?id=${id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setOptions((o) => o.filter((x) => x.id !== id)); onReload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={isNew ? "＋ เพิ่มฟิลด์" : `✎ แก้ฟิลด์: ${initial.label}`}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
        {canEdit && <button onClick={() => onSave({ ...initial, label, type, required, help_text: help, relation_filter: { tags: filterTags } })} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{isNew ? "สร้างฟิลด์" : "บันทึก"}</button>}
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block col-span-2"><span className="text-[11px] text-slate-500">ชื่อฟิลด์</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
          <label className="block"><span className="text-[11px] text-slate-500">ชนิด</span>
            <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <label className="flex items-center gap-2 text-sm text-slate-600 mt-5"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="rounded border-slate-300" /> บังคับกรอก</label>
        </div>

        {/* ตัวเลือก (many2one/multiselect) */}
        {usesOptions && (
          <div className="border border-slate-100 rounded-lg p-2.5">
            <div className="text-xs font-semibold text-slate-600 mb-1.5">ตัวเลือก</div>
            {isNew ? <p className="text-[11px] text-amber-600">บันทึกฟิลด์ก่อน แล้วเปิดมาแก้เพื่อเพิ่มตัวเลือก</p>
              : <>
                <div className="space-y-1 mb-2">
                  {options.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-slate-700">{o.label}</span>
                      <button onClick={() => delOption(o.id)} className="h-6 w-6 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded">✕</button>
                    </div>
                  ))}
                  {options.length === 0 && <p className="text-[11px] text-slate-300">ยังไม่มีตัวเลือก</p>}
                </div>
                <div className="flex gap-1">
                  <input value={newOpt} onChange={(e) => setNewOpt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addOption(); }} placeholder="ตัวเลือกใหม่…" className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => void addOption()} className="h-8 px-3 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800">＋</button>
                </div>
              </>}
          </div>
        )}

        {/* กรองแท็ก (sku-ref) */}
        {type === "sku" && (
          <div className="border border-slate-100 rounded-lg p-2.5">
            <div className="text-xs font-semibold text-slate-600 mb-1.5">โชว์เฉพาะวัตถุดิบที่ติดแท็ก (เว้นว่าง = ทุกตัว)</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => { const on = filterTags.includes(t); return (
                <button key={t} type="button" onClick={() => setFilterTags((s) => on ? s.filter((x) => x !== t) : [...s, t])}
                  className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t}</button>
              ); })}
              {tags.length === 0 && <span className="text-[11px] text-slate-300">ยังไม่มีแท็ก</span>}
            </div>
          </div>
        )}

        <label className="block"><span className="text-[11px] text-slate-500">คำอธิบาย (help)</span>
          <input value={help} onChange={(e) => setHelp(e.target.value)} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
      </div>
    </ERPModal>
  );
}
