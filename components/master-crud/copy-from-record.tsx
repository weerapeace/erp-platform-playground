"use client";
/**
 * CopyFromRecordButton — ของกลาง: "คัดลอกจากระเบียนอื่น" ทีละกลุ่มฟิลด์ (section)
 *
 * ใช้ทำอะไร: อยู่หัวข้อของแต่ละกลุ่มในฟอร์ม (เช่น "รายละเอียด Platform") กดแล้วค้นหาระเบียนอื่น
 *            ในโมดูลเดียวกัน เลือกได้ 1 ตัว → เอาค่าเฉพาะฟิลด์ในกลุ่มนั้นมาใส่ในฟอร์ม
 * ใช้เมื่อไหร่: สินค้าหลายตัวใช้ข้อความชุดเดียวกัน (Introduction/Description/สเปค) ไม่ต้องพิมพ์ซ้ำ
 * ห้ามใช้เมื่อ: กลุ่มที่มีค่าห้ามซ้ำ (รหัสสินค้า/บาร์โค้ด) — ระบบตัดฟิลด์กลุ่มนั้นให้อัตโนมัติแล้ว
 *
 * ความปลอดภัย: แค่ "เติมลงในฟอร์ม" เท่านั้น ยังไม่บันทึกจนกว่าจะกดบันทึกเอง
 *              และช่องที่มีข้อความอยู่แล้วจะเตือนก่อนทับ (นับให้เห็นจำนวน)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";

/** ฟิลด์ที่ห้ามคัดลอกเด็ดขาด (ค่าเฉพาะตัวของแต่ละระเบียน) */
const NEVER_COPY = new Set([
  "id", "code", "sku", "sku_code", "barcode", "created_at", "updated_at", "created_by", "updated_by",
  "cover_image_r2_key", "is_active", "status",
]);

type Row = Record<string, unknown>;

export function CopyFromRecordButton({
  apiBase, apiPath, currentId, sectionLabel, fieldKeys, labelKeys, currentValues, onApply, excludeKeys = [],
}: {
  apiBase: string;
  apiPath: string;
  /** ระเบียนที่กำลังแก้ (ไม่ให้เลือกตัวเอง) */
  currentId?: string | null;
  sectionLabel: string;
  /** คีย์ฟิลด์ในกลุ่มนี้ (จะคัดลอกเฉพาะพวกนี้) */
  fieldKeys: string[];
  /** คีย์ที่ใช้แสดงชื่อระเบียนในรายการค้นหา (เช่น ["code","name_th"]) */
  labelKeys: string[];
  /** ค่าปัจจุบันในฟอร์ม — ใช้บอกว่าจะทับกี่ช่อง */
  currentValues: Record<string, unknown>;
  onApply: (values: Record<string, unknown>) => void;
  excludeKeys?: string[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const copyKeys = fieldKeys.filter((k) => !NEVER_COPY.has(k) && !excludeKeys.includes(k));

  const search = useCallback(async (term: string) => {
    setRows(null); setErr("");
    try {
      const qs = new URLSearchParams({ limit: "20", include_inactive: "true" });
      if (term.trim()) qs.set("search", term.trim());
      const j = await apiFetch(`${apiBase}${apiPath}?${qs.toString()}`).then((r) => r.json());
      const list = (j.data ?? j.rows ?? []) as Row[];
      setRows(list.filter((r) => String(r.id ?? "") !== String(currentId ?? "")));
    } catch (e) { setErr(e instanceof Error ? e.message : t("ค้นหาไม่สำเร็จ", "Search failed")); setRows([]); }
  }, [apiBase, apiPath, currentId, t]);

  // เปิดป๊อป = โหลดรายการล่าสุดให้เลย · พิมพ์แล้วหยุด 400ms ค่อยค้น (ไม่ยิงทุกตัวอักษร)
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => { void search(q); }, q ? 400 : 0);
    return () => clearTimeout(id);
  }, [open, q, search]);

  const label = (r: Row) => labelKeys.map((k) => String(r[k] ?? "").trim()).filter(Boolean).join(" · ") || String(r.id ?? "");

  const apply = async () => {
    if (!picked) return;
    setBusy(true); setErr("");
    try {
      // ดึงระเบียนเต็ม (รายการค้นหาอาจส่งมาไม่ครบทุกคอลัมน์)
      const j = await apiFetch(`${apiBase}${apiPath}/${encodeURIComponent(String(picked.id))}`).then((r) => r.json());
      const full = (j.data ?? j.row ?? picked) as Row;
      const values: Record<string, unknown> = {};
      for (const k of copyKeys) if (k in full) values[k] = full[k];
      if (Object.keys(values).length === 0) throw new Error(t("ไม่มีข้อมูลให้คัดลอกในกลุ่มนี้", "Nothing to copy in this section"));
      onApply(values);
      setOpen(false); setPicked(null); setQ("");
    } catch (e) { setErr(e instanceof Error ? e.message : t("คัดลอกไม่สำเร็จ", "Copy failed")); }
    finally { setBusy(false); }
  };

  const willOverwrite = copyKeys.filter((k) => String(currentValues[k] ?? "").trim()).length;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title={t(`คัดลอกค่าในกลุ่ม “${sectionLabel}” จากระเบียนอื่น`, `Copy the “${sectionLabel}” section from another record`)}
        className="h-6 px-2 text-[11px] rounded-full border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 hover:text-slate-700">
        📋 {t("คัดลอกจากตัวอื่น", "Copy from another")}
      </button>

      {open && (
        <ERPModal open onClose={() => setOpen(false)} size="md"
          title={t(`📋 คัดลอก “${sectionLabel}” จากระเบียนอื่น`, `📋 Copy “${sectionLabel}” from another record`)}
          description={t("เลือกได้ 1 รายการ — ระบบจะเติมลงในฟอร์มเท่านั้น ยังไม่บันทึกจนกว่าจะกดบันทึกเอง",
            "Pick one — values are filled into the form only; nothing is saved until you press Save")}
          footer={
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-[11.5px] text-slate-500">
                {picked
                  ? t(`จะคัดลอก ${copyKeys.length} ช่อง${willOverwrite ? ` · ทับของเดิม ${willOverwrite} ช่อง` : ""}`,
                      `Copies ${copyKeys.length} fields${willOverwrite ? ` · overwrites ${willOverwrite}` : ""}`)
                  : t("ยังไม่ได้เลือกรายการ", "No record selected")}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
                <button onClick={() => void apply()} disabled={!picked || busy}
                  className="h-9 px-4 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">
                  {busy ? t("กำลังคัดลอก…", "Copying…") : t("คัดลอกมาใส่", "Copy into form")}
                </button>
              </div>
            </div>
          }>
          <div className="space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder={t("ค้นหาด้วยรหัสหรือชื่อ", "Search by code or name")}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300" />
            {err && <p className="text-[12px] text-red-600">{err}</p>}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {rows === null && <p className="px-3 py-3 text-[12.5px] text-slate-400">{t("กำลังค้นหา…", "Searching…")}</p>}
              {rows?.length === 0 && <p className="px-3 py-3 text-[12.5px] text-slate-400">{t("ไม่พบรายการ", "No records found")}</p>}
              {(rows ?? []).map((r) => {
                const on = String(picked?.id ?? "") === String(r.id ?? "");
                return (
                  <button key={String(r.id)} type="button" onClick={() => setPicked(r)}
                    className={`w-full text-left px-3 py-2 text-[13px] ${on ? "bg-orange-50 text-orange-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}>
                    {on ? "✓ " : ""}{label(r)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              {t(`คัดลอกเฉพาะช่องในกลุ่มนี้ (${copyKeys.length} ช่อง) · ไม่คัดลอกรหัสสินค้า รูป และสถานะ`,
                 `Copies only this section's fields (${copyKeys.length}) · never the code, images, or status`)}
            </p>
          </div>
        </ERPModal>
      )}
    </>
  );
}
