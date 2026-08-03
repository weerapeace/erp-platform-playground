"use client";

/**
 * ของกลาง — แถบ "ตั้งค่าการพิมพ์" (เลือกแม่แบบ + ติ๊กคอลัมน์ที่จะโชว์)
 *
 * ใช้กับเอกสารชนิดไหนก็ได้ — ส่ง entityType ต่างกัน (so / po / qt / billing_note …)
 * ค่าที่ตั้งเป็น "ค่ากลางของระบบ" ทุกคนพิมพ์ได้หน้าตาเดียวกัน (ต้องมีสิทธิ์ products.edit ถึงบันทึกได้)
 *
 * เห็นผลบนเอกสารทันทีที่ติ๊ก แล้วค่อยกดบันทึก — จะได้ลองก่อนว่าชอบไหม
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import {
  DOC_COLUMNS, defaultPrefs, normalizePrefs, prefsKey,
  type DocPrintPrefs,
} from "@/lib/doc-print-prefs";
import type { ReportTemplateRow } from "@/app/api/admin/report-templates/route";

/** โหลด/เก็บค่าตั้งค่าการพิมพ์ของเอกสารชนิดหนึ่ง */
export function useDocPrintPrefs(entityType: string) {
  const [prefs, setPrefs] = useState<DocPrintPrefs | null>(null);

  const reload = useCallback(() => {
    apiFetch(`/api/ui-config?key=${encodeURIComponent(prefsKey(entityType))}`)
      .then((r) => r.json())
      .then((j) => setPrefs(normalizePrefs(entityType, j?.value)))
      .catch(() => setPrefs(defaultPrefs(entityType)));   // โหลดไม่ได้ = ใช้ค่าเริ่มต้น ไม่ให้หน้าพิมพ์พัง
  }, [entityType]);

  useEffect(() => { reload(); }, [reload]);
  return { prefs, setPrefs, reload };
}

export function DocPrintSettings({
  entityType, templates, prefs, onChange,
}: {
  entityType: string;
  templates: ReportTemplateRow[];
  prefs: DocPrintPrefs;
  onChange: (next: DocPrintPrefs) => void;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cols = DOC_COLUMNS[entityType] ?? [];

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/ui-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prefsKey(entityType), value: prefs }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) { toast.error(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      toast.success("บันทึกเป็นค่ากลางแล้ว — ทุกคนพิมพ์ได้หน้าตานี้");
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [entityType, prefs, toast]);

  const setCol = (key: string, on: boolean) =>
    onChange({ ...prefs, columns: { ...prefs.columns, [key]: on } });

  const activeTpl = templates.find((t) => t.id === prefs.template_id)
    ?? templates.find((t) => t.is_default) ?? templates[0] ?? null;

  return (
    <div className="no-print border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-6 py-2.5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="text-xs font-medium text-slate-400">แบบฟอร์ม</span>
          <select
            value={prefs.template_id || activeTpl?.id || ""}
            onChange={(e) => onChange({ ...prefs, template_id: e.target.value })}
            className="h-8 max-w-[280px] rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            {templates.length === 0 && <option value="">— ยังไม่มีแบบฟอร์ม —</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.label}{t.is_default ? " (ตั้งต้น)" : ""}</option>
            ))}
          </select>
        </label>

        {cols.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)}
            className={`h-8 px-3 text-sm rounded-md border ${open
              ? "bg-blue-600 border-blue-600 text-white font-medium" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
            ☰ เลือกคอลัมน์
          </button>
        )}

        <div className="ml-auto text-[11px] text-slate-400">
          เปลี่ยนแล้วเห็นผลทันที · กดบันทึกถ้าอยากให้ทุกคนได้หน้าตานี้
        </div>
      </div>

      {open && cols.length > 0 && (
        <div className="px-6 pb-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {cols.map((c) => {
                const on = c.locked ? true : prefs.columns[c.key] !== false;
                return (
                  <label key={c.key}
                    className={`flex items-center gap-1.5 text-sm ${c.locked ? "text-slate-400" : "text-slate-700 cursor-pointer"}`}
                    title={c.locked ? "คอลัมน์นี้ปิดไม่ได้ — เอกสารขาดไม่ได้" : undefined}>
                    <input type="checkbox" checked={on} disabled={c.locked}
                      onChange={(e) => setCol(c.key, e.target.checked)} className="rounded border-slate-300" />
                    {c.label}{c.locked && " 🔒"}
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-blue-200">
              <button type="button" onClick={() => onChange(defaultPrefs(entityType))}
                className="h-8 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-600">
                คืนค่าเริ่มต้น
              </button>
              {canEdit && (
                <button type="button" onClick={() => void save()} disabled={saving}
                  className="h-8 px-4 text-xs rounded-md bg-blue-600 text-white font-medium disabled:opacity-50">
                  {saving ? "กำลังบันทึก…" : "💾 บันทึกเป็นค่ากลาง"}
                </button>
              )}
              <span className="text-[11px] text-slate-500 ml-auto">
                {canEdit ? "บันทึกแล้วทุกคนจะพิมพ์ได้หน้าตานี้" : "ดูอย่างเดียว — ไม่มีสิทธิ์บันทึกค่ากลาง"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
