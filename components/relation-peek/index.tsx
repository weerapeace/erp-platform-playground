"use client";

/**
 * RelationPeekModal — popup ดู/แก้ไขรายละเอียดของ record ที่เชื่อม (ของกลาง)
 * ใช้ตอนกดที่ค่า relation หรือกดรายการในการ์ด "ข้อมูลที่เกี่ยวข้อง (360)"
 * registry-driven: โหลด field + ค่า → โชว์เป็น view; กด "✎ แก้ไข" → แก้ได้ทุก field แล้วบันทึก (PATCH)
 *
 * โหมด quickEdit: โชว์เฉพาะ "ชุดฟิลด์แก้เร็ว" ของโมดูล (erp_modules.config.quick_edit_fields)
 * — ยังไม่ตั้ง = โชว์ทุกฟิลด์เหมือนเดิม · ปุ่ม ⚙ (admin) เลือกฟิลด์ → เป็น default ของทุก user
 */
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAuth, usePermission } from "@/components/auth";
import { useBackdropDismiss } from "@/components/modal";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { ImageInput } from "@/components/image-input";
import { invalidateCache } from "@/lib/client-cache";
import { formatAmount, currencyLabel } from "@/lib/money";
import { StudioLauncher } from "@/components/studio-launcher";

type RF = {
  field_key: string; column_name: string | null; field_label: string; ui_field_type: string;
  is_visible: boolean; show_in_form: boolean; is_editable: boolean; is_required: boolean;
  options: { options?: string[]; currency?: string; currency_field?: string } | null;
  relation_config: RelationConfig | null; display_order: number; group_key?: string | null;
};
// layout ฟอร์มที่ออกแบบไว้ (Tab→Section) — peek เอามาจัดเซกชัน/ลำดับเหมือนฟอร์ม
type PeekLayout = { tabs: { key: string; label: string; sections: { key: string; label: string }[] }[] } | null;

// สกุลเงินของฟิลด์ (ทะเบียนกลาง) — ตายตัว (options.currency) หรือตามฟิลด์อื่นในรายการ (options.currency_field)
const fieldCurrency = (f: RF, rec: Record<string, unknown> | null): unknown => {
  if (f.options?.currency) return f.options.currency;
  if (f.options?.currency_field) return rec?.[f.options.currency_field];
  return f.ui_field_type === "currency" ? "THB" : null;
};

const img = (k: unknown) => (k ? `/api/r2-image?key=${encodeURIComponent(String(k))}` : null);

export function RelationPeekModal({
  moduleKey, recordId, onClose, startInEdit, onChanged, createDefaults, createTitle, quickEdit,
}: {
  moduleKey: string;
  recordId?: string | null;       // ว่าง/null = โหมดสร้างใหม่ (POST)
  onClose: () => void;
  startInEdit?: boolean;          // เปิดมาในโหมดแก้ไขเลย (กดปุ่ม ✎ จากการ์ด)
  onChanged?: () => void;         // เรียกหลังบันทึกสำเร็จ → ให้ตัวเรียกรีเฟรชรายการ
  createDefaults?: Record<string, unknown>;  // โหมดสร้าง: ค่าตั้งต้น เช่น { parent_sku_id, is_active:true }
  createTitle?: string;           // โหมดสร้าง: หัวข้อ popup
  quickEdit?: boolean;            // โหมดแก้เร็ว: กรองตามชุดฟิลด์ของโมดูล + ปุ่ม ⚙ (admin) เลือกฟิลด์
}) {
  const isCreate = !recordId;
  const { user } = useAuth();
  const canCfg = usePermission("admin.users");   // ⚙ ตั้งชุดฟิลด์ = ค่ากลางของทุก user → จำกัด admin
  const [fields, setFields] = useState<RF[]>([]);
  const [layout, setLayout] = useState<PeekLayout>(null);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // quick edit config
  const [quickFields, setQuickFields] = useState<string[] | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgSel, setCfgSel] = useState<string[]>([]);
  const [cfgQ, setCfgQ] = useState("");
  const [cfgSaving, setCfgSaving] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);   // เปิดตัวออกแบบ layout กลาง (StudioPanel)
  const [activeTab, setActiveTab] = useState(0);   // แท็บที่เลือกในโหมดดู (drawer ขวา)

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const reg = await apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then((r) => r.json());
      setFields((reg.fields ?? []).filter((f: RF) => (f.is_visible || f.show_in_form) && !["one2many", "many2many"].includes(f.ui_field_type)));
      setLayout((reg.layout ?? null) as PeekLayout);
      setQuickFields(Array.isArray(reg.quick_edit_fields) && reg.quick_edit_fields.length > 0 ? (reg.quick_edit_fields as string[]) : null);
      if (isCreate) {
        setRow({});               // โหมดสร้าง: ไม่มี record เดิม ใช้ object ว่าง (กัน "ไม่พบข้อมูล")
      } else {
        const rec = await apiFetch(`/api/master-v2/${moduleKey}/${recordId}`).then((r) => r.json());
        setRow((rec.data ?? null) as Record<string, unknown> | null);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [moduleKey, recordId, isCreate]);

  useEffect(() => { void load(); }, [load]);

  // โหมดแก้เร็ว: กรองตามชุดฟิลด์ของโมดูล (ยังไม่ตั้ง = โชว์ทุกฟิลด์)
  const shownFields = quickEdit && quickFields ? fields.filter((f) => quickFields.includes(f.field_key)) : fields;

  // field ที่แก้ไขได้ (เคารพทะเบียน field) — ตัด one2many/many2many/related/computed/id
  const editableFields = shownFields.filter(
    (f) => f.is_editable && f.show_in_form && !["one2many", "many2many", "related", "computed"].includes(f.ui_field_type) && f.field_key !== "id",
  );

  // ⚙ บันทึกชุดฟิลด์แก้เร็ว → config กลางของโมดูล (default ทุก user) ผ่าน API กลาง (admin + audit)
  const saveQuickCfg = async (list: string[] | null) => {
    setCfgSaving(true); setErr(null);
    try {
      const res = await apiFetch(`/api/admin/module-settings/${moduleKey}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: { quick_edit_fields: list }, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error ?? `บันทึกไม่สำเร็จ (HTTP ${res.status})`); return; }
      const next = list && list.length > 0 ? list : null;
      setQuickFields(next);
      // กำลังแก้ไขค้างอยู่ → เติมค่าฟิลด์ที่เพิ่งเพิ่มเข้าชุดจาก record (กันฟอร์มส่งค่าว่างทับ)
      if (editing && row) {
        setForm((p) => {
          const f = { ...p };
          fields.filter((fd) => !next || next.includes(fd.field_key)).forEach((fd) => {
            if (!(fd.field_key in f)) {
              const v = row[fd.field_key];
              f[fd.field_key] = v == null ? (fd.ui_field_type === "boolean" ? false : "") : v;
            }
          });
          return f;
        });
      }
      invalidateCache("/api/admin/field-registry-v2");   // ให้จุดอื่นที่ cache ทะเบียนเห็นค่าล่าสุด
      setCfgOpen(false);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setCfgSaving(false); }
  };

  const enterEdit = () => {
    if (!row) return;
    const f: Record<string, unknown> = {};
    editableFields.forEach((fd) => {
      const v = row[fd.field_key];
      f[fd.field_key] = v == null ? (fd.ui_field_type === "boolean" ? false : "") : v;
    });
    if (isCreate) Object.assign(f, createDefaults ?? {});   // โหมดสร้าง: ทับด้วยค่าตั้งต้น (เช่น FK)
    setForm(f); setErr(null); setEditing(true);
  };

  // เข้าโหมดแก้ไขทันทีถ้าสั่งมา (หลังโหลด row เสร็จ) — โหมดสร้างเข้าฟอร์มเลย
  useEffect(() => {
    if ((startInEdit || isCreate) && !loading && row && !editing) enterEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInEdit, isCreate, loading, row]);

  // แปลงค่าให้ตรงชนิดก่อนส่ง (เหมือน master-crud) — กัน "" ไปลงคอลัมน์ number/integer แล้วฐานข้อมูล error
  const serializeValue = (fd: RF, v: unknown): unknown => {
    if (fd.ui_field_type === "number" || fd.ui_field_type === "currency") {
      if (v === "" || v == null) return null;
      const n = Number(v); return Number.isFinite(n) ? n : null;
    }
    if (fd.ui_field_type === "boolean") return !!v;
    return v === "" || v == null ? null : v;   // ข้อความว่าง → null (เหมือนตารางกลาง)
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body: Record<string, unknown> = { actor: user?.name };
      editableFields.forEach((fd) => { body[fd.field_key] = serializeValue(fd, form[fd.field_key]); });
      if (isCreate) {
        Object.assign(body, createDefaults ?? {});   // กัน FK/ค่าตั้งต้นหลุด แม้ไม่ใช่ field ที่แก้ได้
        const res = await apiFetch(`/api/master-v2/${moduleKey}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) { setErr(j.error ?? `บันทึกไม่สำเร็จ (HTTP ${res.status})`); return; }
        onChanged?.();        // ให้รายการต้นทางรีเฟรช
        onClose();            // สร้างเสร็จ → ปิด popup
        return;
      }
      const res = await apiFetch(`/api/master-v2/${moduleKey}/${recordId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      setEditing(false);
      await load();          // ดึงค่าใหม่ + label มาแสดง
      onChanged?.();         // ให้รายการต้นทางรีเฟรช
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  // ---- view value ----
  const val = (f: RF): React.ReactNode => {
    if (!row) return "—";
    if (f.ui_field_type === "image") {
      const k = row[f.field_key];
      return img(k) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(k)!} alt="" className="w-20 h-20 rounded object-cover border border-slate-100" /> : <span className="text-slate-300">—</span>;
    }
    if (f.ui_field_type === "relation") {
      const lk = f.field_key.endsWith("_id") ? f.field_key.slice(0, -3) + "_label" : f.field_key + "_label";
      const lbl = row[lk];
      return <span>{String(lbl ?? row[f.field_key] ?? "—")}</span>;
    }
    if (f.ui_field_type === "boolean") return row[f.field_key] ? "ใช่" : "ไม่ใช่";
    const v = row[f.field_key];
    if (v == null || v === "") return <span className="text-slate-300">—</span>;
    // ค่าเป็น array/object (เช่น attribute_values jsonb) — แปลงให้อ่านได้ (กัน [object Object])
    if (Array.isArray(v)) return v.length ? <span>{v.map((x) => String(x)).join(", ")}</span> : <span className="text-slate-300">—</span>;
    if (typeof v === "object") {
      const e = Object.entries(v as Record<string, unknown>).filter(([, vv]) => vv != null && vv !== "");
      return e.length ? <span className="text-xs text-slate-600">{e.map(([k, vv]) => `${k}: ${typeof vv === "object" ? JSON.stringify(vv) : String(vv)}`).join(" · ")}</span> : <span className="text-slate-300">—</span>;
    }
    // ฟิลด์เงิน → โชว์สกุลถูกต้องตามทะเบียน (฿1,234 / 1,234 RMB)
    const cur = fieldCurrency(f, row);
    if (cur != null && typeof v !== "boolean" && !isNaN(Number(v))) return <span className="tabular-nums">{formatAmount(Number(v), cur)}</span>;
    return <span>{typeof v === "number" ? v.toLocaleString() : String(v)}</span>;
  };

  // ---- edit input ----
  const editField = (fd: RF) => {
    const v = form[fd.field_key];
    if (fd.ui_field_type === "boolean") {
      return <label className="flex items-center gap-2 text-sm text-slate-700 h-9"><input type="checkbox" checked={!!v} onChange={(e) => set(fd.field_key, e.target.checked)} /> {fd.field_label}</label>;
    }
    if (fd.ui_field_type === "relation" && fd.relation_config?.target_table) {
      return (
        <div>
          <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
          <div className="mt-0.5"><RelationPicker value={(v as string) || null} onChange={(id) => set(fd.field_key, id)} config={fd.relation_config} /></div>
        </div>
      );
    }
    if (fd.ui_field_type === "image") {
      return <div><label className="text-[11px] font-medium text-slate-500">{fd.field_label}</label><div className="mt-0.5"><ImageInput value={(v as string) || null} onChange={(k) => set(fd.field_key, k)} folder={moduleKey} /></div></div>;
    }
    if (fd.ui_field_type === "select" && fd.options?.options?.length) {
      return (
        <div>
          <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
          <select value={(v as string) ?? ""} onChange={(e) => set(fd.field_key, e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
            <option value="">—</option>{fd.options.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    const isNum = fd.ui_field_type === "number" || fd.ui_field_type === "currency";
    // ฟิลด์เงิน: ป้ายสกุลกำกับท้ายช่อง (currency_field อ่านจากค่าที่กำลังแก้ก่อน แล้วค่อย fallback record เดิม)
    const cur = isNum ? fieldCurrency(fd, { ...(row ?? {}), ...form }) : null;
    return (
      <div>
        <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
        <div className="relative">
          <input type={isNum ? "number" : "text"} value={(v as string | number) ?? ""} step={isNum ? "any" : undefined}
            onChange={(e) => set(fd.field_key, isNum ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
            className={`mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md ${cur != null ? "pr-12" : ""}`} />
          {cur != null && <span className="absolute right-3 top-1/2 -translate-y-1/2 mt-[1px] text-[11px] font-medium text-slate-400 pointer-events-none">{currencyLabel(cur)}</span>}
        </div>
      </div>
    );
  };

  const title = isCreate
    ? (createTitle ?? "เพิ่มรายการใหม่")
    : (row ? String(row["name_th"] ?? row["name"] ?? row["code"] ?? "รายละเอียด") : "รายละเอียด");
  const cover = row ? (row["cover_image_r2_key"] ?? row["image_key"]) : null;
  // ปิดด้วย backdrop ได้เฉพาะตอน "ดู" — โหมดแก้ไขกันปิดพลาด
  const dismiss = useBackdropDismiss(editing ? () => {} : onClose);

  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black/40 flex justify-end" {...dismiss}>
      <div className="bg-white shadow-2xl w-full max-w-xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-800 line-clamp-1">{isCreate ? "➕ " : editing ? "✎ " : "🔗 "}{title}</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            {quickEdit && canCfg && !cfgOpen && !loading && (
              <button onClick={() => { setCfgSel(quickFields ?? fields.map((f) => f.field_key)); setCfgQ(""); setCfgOpen(true); }}
                title="เลือกฟิลด์ที่จะโชว์/แก้ไขในป๊อปนี้ (เป็นค่าเริ่มต้นของทุกคน)"
                className="h-7 w-7 text-sm border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50">⚙</button>
            )}
            {canCfg && !editing && !cfgOpen && !loading && !isCreate && row && (
              <button onClick={() => setStudioOpen(true)} title="ออกแบบ layout ของป๊อปนี้ (ใช้ตัวกลางชุดเดียวกับฟอร์มหน้าเต็ม — แก้ที่นี่มีผลทุกที่)"
                className="h-7 px-2.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">🎨 Layout</button>
            )}
            {!editing && !cfgOpen && !loading && row && editableFields.length > 0 && (
              <button onClick={enterEdit} className="h-7 px-2.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
            )}
            {!editing && !cfgOpen && !isCreate && recordId && (
              <a href={`/m/${moduleKey}?open=${encodeURIComponent(recordId)}`}
                className="h-7 px-2.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center">เปิดหน้าเต็ม →</a>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>

        <div className="p-5 overflow-auto flex-1">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : cfgOpen ? (
            /* ⚙ เลือกชุดฟิลด์แก้เร็ว — เป็น default ของทุก user */
            <div>
              <div className="text-xs text-slate-500 mb-2">เลือกฟิลด์ที่จะโชว์/แก้ไขในป๊อปแก้เร็วนี้ — มีผลกับ<b>ทุกคน</b>ที่เปิดป๊อปนี้ · ฟิลด์ใหม่ที่เพิ่มเข้าทะเบียนภายหลังจะโผล่ในรายการนี้อัตโนมัติ</div>
              <input value={cfgQ} onChange={(e) => setCfgQ(e.target.value)} placeholder="🔎 ค้นหาฟิลด์…" className="w-full h-8 px-2 mb-2 text-xs border border-slate-200 rounded-md" />
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[45vh] overflow-auto">
                {fields
                  .filter((f) => { const q = cfgQ.trim().toLowerCase(); return !q || f.field_label.toLowerCase().includes(q) || f.field_key.toLowerCase().includes(q); })
                  .map((f) => (
                    <label key={f.field_key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={cfgSel.includes(f.field_key)}
                        onChange={(e) => setCfgSel((p) => e.target.checked ? [...p, f.field_key] : p.filter((k) => k !== f.field_key))}
                        className="rounded border-slate-300" />
                      <span className="flex-1 min-w-0 truncate">{f.field_label}</span>
                      <span className="text-[10px] font-mono text-slate-300">{f.field_key}</span>
                    </label>
                  ))}
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5">เลือกแล้ว {cfgSel.length} / {fields.length} ฟิลด์</div>
            </div>
          ) : !row ? (
            <div className="py-10 text-center text-slate-300 text-sm">— ไม่พบข้อมูล —</div>
          ) : editing ? (
            <div className="grid grid-cols-2 gap-3">{editableFields.map((f) => <div key={f.field_key}>{editField(f)}</div>)}</div>
          ) : (
            <div className="flex gap-4">
              {img(cover) && (
                <div className="w-28 h-28 flex-shrink-0 rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img(cover)!} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-3">
                {(() => {
                  const viewFields = shownFields.filter((f) => f.ui_field_type !== "image");
                  const grid = (list: RF[]) => (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {list.map((f) => (
                        <div key={f.field_key} className="min-w-0">
                          <dt className="text-[11px] text-slate-400">{f.field_label}</dt>
                          <dd className="text-sm text-slate-700 truncate">{val(f)}</dd>
                        </div>
                      ))}
                    </dl>
                  );
                  // จัดเป็น "แท็บ" ตาม layout ฟอร์ม (Tab→Section) · ไม่มี layout → grid แบบเดิม
                  const bySec = new Map<string, RF[]>();
                  for (const f of viewFields) { const k = f.group_key || ""; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k)!.push(f); }
                  const known = new Set((layout?.tabs ?? []).flatMap((t) => t.sections.map((s) => s.key)));
                  const leftover = viewFields.filter((f) => !known.has(f.group_key || ""));
                  const vtabs = (layout?.tabs ?? [])
                    .map((t) => ({ label: t.label, secs: t.sections.filter((s) => (bySec.get(s.key)?.length ?? 0) > 0) }))
                    .filter((t) => t.secs.length > 0);
                  if (leftover.length) { bySec.set("__lo__", leftover); vtabs.push({ label: "อื่นๆ", secs: [{ key: "__lo__", label: "" }] }); }
                  if (vtabs.length === 0) return grid(viewFields);
                  const renderSecs = (secs: { key: string; label: string }[]) => secs.map((s) => (
                    <div key={s.key} className="mb-3">
                      {s.label && <div className="text-xs font-semibold text-slate-500 mb-1 pb-0.5 border-b border-slate-100">{s.label}</div>}
                      {grid(bySec.get(s.key) ?? [])}
                    </div>
                  ));
                  if (vtabs.length === 1) return <>{renderSecs(vtabs[0].secs)}</>;
                  const ai = Math.min(activeTab, vtabs.length - 1);
                  return (
                    <>
                      <div className="flex gap-1 border-b border-slate-100 mb-3 flex-wrap">
                        {vtabs.map((t, i) => (
                          <button key={i} onClick={() => setActiveTab(i)}
                            className={`px-3 py-1.5 text-[13px] -mb-px border-b-2 ${i === ai ? "border-blue-500 text-blue-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
                        ))}
                      </div>
                      {renderSecs(vtabs[ai].secs)}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {err && <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
        </div>

        {cfgOpen && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
            <button onClick={() => void saveQuickCfg(null)} disabled={cfgSaving}
              title="ล้างค่า — กลับไปโชว์ทุกฟิลด์ตามทะเบียน"
              className="h-9 px-3 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50">↺ โชว์ทุกฟิลด์</button>
            <div className="flex-1" />
            <button onClick={() => { setCfgOpen(false); setErr(null); }} disabled={cfgSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void saveQuickCfg(cfgSel)} disabled={cfgSaving || cfgSel.length === 0}
              title={cfgSel.length === 0 ? "เลือกอย่างน้อย 1 ฟิลด์" : ""}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{cfgSaving ? "กำลังบันทึก..." : "บันทึก (ทุกคน)"}</button>
          </div>
        )}

        {editing && !cfgOpen && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setErr(null); }} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        )}
      </div>

      {studioOpen && (
        <StudioLauncher
          moduleKey={moduleKey}
          moduleLabel={moduleKey}
          sampleRow={row}
          onClose={() => setStudioOpen(false)}
          onSaved={() => void load()}
        />
      )}
    </div>,
    document.body,
  );
}
