"use client";

/**
 * RelationPeekModal — popup ดู/แก้ไขรายละเอียดของ record ที่เชื่อม (ของกลาง)
 * ใช้ตอนกดที่ค่า relation หรือกดรายการในการ์ด "ข้อมูลที่เกี่ยวข้อง (360)"
 * registry-driven: โหลด field + ค่า → โชว์เป็น view; กด "✎ แก้ไข" → แก้ได้ทุก field แล้วบันทึก (PATCH)
 */
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useBackdropDismiss } from "@/components/modal";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { ImageInput } from "@/components/image-input";

type RF = {
  field_key: string; column_name: string | null; field_label: string; ui_field_type: string;
  is_visible: boolean; show_in_form: boolean; is_editable: boolean; is_required: boolean;
  options: { options?: string[] } | null; relation_config: RelationConfig | null; display_order: number;
};

const img = (k: unknown) => (k ? `/api/r2-image?key=${encodeURIComponent(String(k))}` : null);

export function RelationPeekModal({
  moduleKey, recordId, onClose, startInEdit, onChanged, createDefaults, createTitle,
}: {
  moduleKey: string;
  recordId?: string | null;       // ว่าง/null = โหมดสร้างใหม่ (POST)
  onClose: () => void;
  startInEdit?: boolean;          // เปิดมาในโหมดแก้ไขเลย (กดปุ่ม ✎ จากการ์ด)
  onChanged?: () => void;         // เรียกหลังบันทึกสำเร็จ → ให้ตัวเรียกรีเฟรชรายการ
  createDefaults?: Record<string, unknown>;  // โหมดสร้าง: ค่าตั้งต้น เช่น { parent_sku_id, is_active:true }
  createTitle?: string;           // โหมดสร้าง: หัวข้อ popup
}) {
  const isCreate = !recordId;
  const { user } = useAuth();
  const [fields, setFields] = useState<RF[]>([]);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const reg = await apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then((r) => r.json());
      setFields((reg.fields ?? []).filter((f: RF) => (f.is_visible || f.show_in_form) && !["one2many", "many2many"].includes(f.ui_field_type)));
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

  // field ที่แก้ไขได้ (เคารพทะเบียน field) — ตัด one2many/many2many/related/computed/id
  const editableFields = fields.filter(
    (f) => f.is_editable && f.show_in_form && !["one2many", "many2many", "related", "computed"].includes(f.ui_field_type) && f.field_key !== "id",
  );

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

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body: Record<string, unknown> = { actor: user?.name };
      editableFields.forEach((fd) => { body[fd.field_key] = form[fd.field_key]; });
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
    return (
      <div>
        <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
        <input type={isNum ? "number" : "text"} value={(v as string | number) ?? ""} step={isNum ? "any" : undefined}
          onChange={(e) => set(fd.field_key, isNum ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
          className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
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
    <div className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4" {...dismiss}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-800 line-clamp-1">{isCreate ? "➕ " : editing ? "✎ " : "🔗 "}{title}</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editing && !loading && row && editableFields.length > 0 && (
              <button onClick={enterEdit} className="h-7 px-2.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
            )}
            {!editing && (
              <a href={`/m/${moduleKey}?open=${encodeURIComponent(recordId)}`}
                className="h-7 px-2.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center">เปิดหน้าเต็ม →</a>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>

        <div className="p-5 overflow-auto flex-1">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
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
              <dl className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 min-w-0">
                {fields.filter((f) => f.ui_field_type !== "image").map((f) => (
                  <div key={f.field_key} className="min-w-0">
                    <dt className="text-[11px] text-slate-400">{f.field_label}</dt>
                    <dd className="text-sm text-slate-700 truncate">{val(f)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {err && <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
        </div>

        {editing && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setErr(null); }} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
