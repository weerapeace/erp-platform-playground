"use client";

/**
 * StudioLauncher — เปิด "ตัวออกแบบ layout กลาง" (StudioPanel) จากที่ไหนก็ได้ (ของกลาง)
 *
 * ใช้กับ drawer มินิ (MasterRecordDrawer) เป็นหลัก — ดึง field-registry ของโมดูล + แปลงเป็น StudioField
 * + ต่อ sample loader (ดึงตัวอย่างจริงจาก master-v2) ให้เอง แล้ว render StudioPanel ตัวเดียวกับหน้าเต็ม
 *
 * layout ที่บันทึก = ของกลางชุดเดียว → popup + ฟอร์มหน้าเต็ม + ตาราง สะท้อนผลเหมือนกัน (ออกแบบที่เดียว)
 * z-index: StudioPanel เป็น fixed z-[60] → ห่อด้วย portal z-[200] ให้ลอยทับ popup (z-[140]) ได้
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { invalidateCache } from "@/lib/client-cache";
import type { StudioField } from "@/components/master-crud/studio-panel";
import type { FormField, FormLayout } from "@/app/api/admin/field-registry-v2/route";

const StudioPanel = dynamic(
  () => import("@/components/master-crud/studio-panel").then((m) => m.StudioPanel),
  { ssr: false, loading: () => <div className="fixed inset-0 z-[200] bg-slate-50 flex items-center justify-center text-slate-400 text-sm">กำลังเปิดตัวออกแบบ…</div> },
);

// แปลง field ดิบจากทะเบียน (snake_case) → StudioField (camelCase) แบบเดียวกับหน้าเต็ม
function toStudioField(f: FormField): StudioField {
  return {
    fieldId:       f.id,
    key:           f.field_key,
    label:         f.field_label,
    groupKey:      f.group_key ?? "other",
    order:         f.display_order ?? 999,
    type:          f.ui_field_type,
    isVisible:     f.is_visible ?? false,
    width:         f.width,
    showInForm:    f.show_in_form ?? false,
    inlineEditable: f.is_inline_editable ?? false,
    bulkEditable:  f.is_bulk_editable ?? false,
    formSpan:      f.form_column_span ?? 1,
    helpText:      f.help_text ?? "",
    placeholder:   f.placeholder ?? "",
    required:      f.is_required ?? false,
    editable:      f.is_editable,
    defaultValue:  (f.default_value as string | null) ?? "",
    uiStyle:       f.ui_style ?? {},
    currency:      (f.options?.currency as string) ?? "",
    currencyField: (f.options?.currency_field as string) ?? "",
    optionsRaw:    f.options ?? {},
  };
}

export function StudioLauncher({
  moduleKey, moduleLabel, sampleRow, onClose, onSaved,
}: {
  moduleKey: string;
  moduleLabel?: string;
  sampleRow?: Record<string, unknown> | null;   // record ปัจจุบัน (เอาไป preview ใน Studio เลย)
  onClose: () => void;
  onSaved?: () => void;                          // เรียกหลังปิด Studio → ให้ตัวเรียกรีโหลด layout ใหม่
}) {
  const [fields, setFields] = useState<StudioField[] | null>(null);
  const [layout, setLayout] = useState<FormLayout>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const reg = await apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(moduleKey)}`).then((r) => r.json());
        if (cancel) return;
        setFields(((reg.fields ?? []) as FormField[]).filter((f) => f.id).map(toStudioField));
        setLayout((reg.layout ?? null) as FormLayout);
      } catch { if (!cancel) setFields([]); }
    })();
    return () => { cancel = true; };
  }, [moduleKey]);

  const inner = fields == null ? (
    <div className="fixed inset-0 z-[200] bg-slate-50 flex items-center justify-center text-slate-400 text-sm">กำลังโหลดฟิลด์…</div>
  ) : (
    <div className="fixed inset-0 z-[200]">
      <StudioPanel
        fields={fields}
        moduleLabel={moduleLabel ?? moduleKey}
        moduleKey={moduleKey}
        layout={layout ?? undefined}
        sampleRows={sampleRow ? [sampleRow] : []}
        searchSample={async (q: string) => {
          try {
            const url = `/api/master-v2/${moduleKey}?limit=10&include_inactive=true${q ? `&search=${encodeURIComponent(q)}` : ""}`;
            const j = await apiFetch(url).then((r) => r.json());
            return ((j.data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), label: String(r.code ?? r.name_th ?? r.name ?? r.id) }));
          } catch { return []; }
        }}
        loadSample={async (id: string) => {
          try { const j = await apiFetch(`/api/master-v2/${moduleKey}/${id}`).then((r) => r.json()); return (j.data ?? null) as Record<string, unknown> | null; } catch { return null; }
        }}
        onClose={() => { invalidateCache("/api/admin/field-registry-v2"); onSaved?.(); onClose(); }}
      />
    </div>
  );

  return createPortal(inner, document.body);
}
