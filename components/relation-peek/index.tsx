"use client";

/**
 * RelationPeekModal — popup ดูรายละเอียดของ record ที่เชื่อม (read-only)
 * ใช้ตอนกดที่ค่า relation ในหน้า detail เช่น กด "Parent SKU" ในหน้า SKU → เด้งดู parent
 * registry-driven: โหลด field + ค่า แล้วแสดงเป็น label/value (ไม่ให้แก้)
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

type RF = { field_key: string; column_name: string | null; field_label: string; ui_field_type: string; is_visible: boolean; show_in_form: boolean; display_order: number };

const img = (k: unknown) => (k ? `/api/r2-image?key=${encodeURIComponent(String(k))}` : null);

export function RelationPeekModal({ moduleKey, recordId, onClose }: { moduleKey: string; recordId: string; onClose: () => void }) {
  const [fields, setFields] = useState<RF[]>([]);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [reg, rec] = await Promise.all([
          apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then((r) => r.json()),
          apiFetch(`/api/master-v2/${moduleKey}/${recordId}`).then((r) => r.json()),
        ]);
        if (!alive) return;
        setFields((reg.fields ?? []).filter((f: RF) => (f.is_visible || f.show_in_form) && !["one2many", "many2many"].includes(f.ui_field_type)));
        setRow((rec.data ?? null) as Record<string, unknown> | null);
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [moduleKey, recordId]);

  const val = (f: RF): React.ReactNode => {
    if (!row) return "—";
    if (f.ui_field_type === "image") {
      const k = row[f.field_key];
      return img(k) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(k)!} alt="" className="w-20 h-20 rounded object-cover border border-slate-100" /> : <span className="text-slate-300">—</span>;
    }
    // relation → โชว์ *_label ถ้ามี
    if (f.ui_field_type === "relation") {
      const lk = f.field_key.endsWith("_id") ? f.field_key.slice(0, -3) + "_label" : null;
      const lbl = lk ? row[lk] : null;
      return <span>{String(lbl ?? row[f.field_key] ?? "—")}</span>;
    }
    if (f.ui_field_type === "boolean") return row[f.field_key] ? "ใช่" : "ไม่ใช่";
    const v = row[f.field_key];
    if (v == null || v === "") return <span className="text-slate-300">—</span>;
    return <span>{typeof v === "number" ? v.toLocaleString() : String(v)}</span>;
  };

  const title = row ? String(row["name_th"] ?? row["name"] ?? row["code"] ?? "รายละเอียด") : "รายละเอียด";
  const cover = row ? (row["cover_image_r2_key"] ?? row["image_key"]) : null;

  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-800 line-clamp-1">🔗 {title}</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={`/m/${moduleKey}?open=${encodeURIComponent(recordId)}`}
              className="h-7 px-2.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center">
              เปิดหน้าเต็ม →
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>
        <div className="p-5 overflow-auto">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : !row ? (
            <div className="py-10 text-center text-slate-300 text-sm">— ไม่พบข้อมูล —</div>
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
