"use client";

/**
 * SkuFormModal — ฟอร์มเพิ่ม/แก้ไข SKU แบบ popup (ใช้ในหน้าขอซื้อ)
 * ดึง field จากทะเบียน field ของ skus-v2 → ฟอร์ม "ชุดเดียวกับหน้า SKU" (ไม่ hardcode)
 * create: POST /api/master-v2/skus | edit: GET /[id] → PATCH
 */
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { ImageInput } from "@/components/image-input";
import { useBackdropDismiss } from "@/components/modal";
import { SkuSupplierList } from "@/components/sku-supplier-list";

type RF = {
  field_key: string;
  column_name: string | null;
  field_label: string;
  ui_field_type: string;
  is_editable: boolean;
  show_in_form: boolean;
  is_required: boolean;
  options: { options?: string[] } | null;
  relation_config: RelationConfig | null;
  display_order: number;
  group_key: string;
};

export function SkuFormModal({
  mode, skuId, onClose, onSaved,
}: {
  mode: "create" | "edit";
  skuId?: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { user } = useAuth();
  const [fields, setFields] = useState<RF[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const reg = await apiFetch("/api/admin/field-registry-v2?module=skus-v2").then((r) => r.json());
      const ff: RF[] = (reg.fields ?? [])
        .filter((f: RF) => f.show_in_form && f.is_editable
          && !["one2many", "many2many", "related"].includes(f.ui_field_type)
          && f.field_key !== "id")
        .sort((a: RF, b: RF) => a.display_order - b.display_order);
      setFields(ff);
      if (mode === "edit" && skuId) {
        const j = await apiFetch(`/api/master-v2/skus/${skuId}`).then((r) => r.json());
        const full = (j.data ?? {}) as Record<string, unknown>;
        const f: Record<string, unknown> = {};
        ff.forEach((fd) => { const v = full[fd.field_key]; f[fd.field_key] = v == null ? (fd.ui_field_type === "boolean" ? false : "") : v; });
        setForm(f);
      } else {
        const f: Record<string, unknown> = {};
        ff.forEach((fd) => { f[fd.field_key] = fd.ui_field_type === "boolean" ? false : ""; });
        setForm(f);
      }
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }, [mode, skuId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      // ส่งเฉพาะ field ที่มี column จริง (ตัด readonly/virtual ออกแล้วตอน filter)
      const body: Record<string, unknown> = { actor: user?.name };
      fields.forEach((fd) => { body[fd.field_key] = form[fd.field_key]; });
      const url = mode === "edit" && skuId ? `/api/master-v2/skus/${skuId}` : "/api/master-v2/skus";
      const method = mode === "edit" && skuId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      onSaved(String(j.data?.id ?? skuId ?? ""));
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const renderField = (fd: RF) => {
    const v = form[fd.field_key];
    if (fd.ui_field_type === "boolean") {
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700 h-9">
          <input type="checkbox" checked={!!v} onChange={(e) => set(fd.field_key, e.target.checked)} /> {fd.field_label}
        </label>
      );
    }
    if (fd.ui_field_type === "relation" && fd.relation_config?.target_table) {
      return (
        <div>
          <label className="text-xs font-medium text-slate-600">{fd.field_label}{fd.is_required && " *"}</label>
          <div className="mt-0.5">
            <RelationPicker value={(v as string) || null} onChange={(id) => set(fd.field_key, id)} config={fd.relation_config} siblingValues={form} />
          </div>
        </div>
      );
    }
    if (fd.ui_field_type === "image") {
      return (
        <div>
          <label className="text-xs font-medium text-slate-600">{fd.field_label}</label>
          <div className="mt-0.5"><ImageInput value={(v as string) || null} onChange={(k) => set(fd.field_key, k)} folder="skus" /></div>
        </div>
      );
    }
    if (fd.ui_field_type === "select" && fd.options?.options?.length) {
      return (
        <div>
          <label className="text-xs font-medium text-slate-600">{fd.field_label}{fd.is_required && " *"}</label>
          <select value={(v as string) ?? ""} onChange={(e) => set(fd.field_key, e.target.value)}
            className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
            <option value="">—</option>
            {fd.options.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    const isNum = fd.ui_field_type === "number";
    return (
      <div>
        <label className="text-xs font-medium text-slate-600">{fd.field_label}{fd.is_required && " *"}</label>
        <input type={isNum ? "number" : "text"} value={(v as string | number) ?? ""} step={isNum ? "any" : undefined}
          onChange={(e) => set(fd.field_key, isNum ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
          className="mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
      </div>
    );
  };

  const dismiss = useBackdropDismiss(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center p-4" {...dismiss}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{mode === "edit" ? "✎ แก้ไขสินค้า (SKU)" : "＋ เพิ่มสินค้าใหม่ (SKU)"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลดฟอร์ม…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {fields.map((fd) => <div key={fd.field_key}>{renderField(fd)}</div>)}
              </div>
              {/* รายการราคาหลายร้าน (ของกลาง) — เฉพาะตอนแก้ไขสินค้าที่มีอยู่แล้ว */}
              {mode === "edit" && skuId && (
                <div className="mt-4">
                  <SkuSupplierList skuId={skuId} />
                </div>
              )}
            </>
          )}
          {err && <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving || loading}
            className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
