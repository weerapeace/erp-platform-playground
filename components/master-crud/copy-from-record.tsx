"use client";
/**
 * CopyFromRecordButton — ของกลาง: "คัดลอกจากระเบียนอื่น" (ทีละกลุ่มฟิลด์ หรือทั้งระเบียน)
 *
 * ใช้ทำอะไร: กดแล้วค้นหาระเบียนอื่นในโมดูลเดียวกัน เลือกได้ 1 ตัว → เห็นตารางเทียบ "ตอนนี้" กับ "จะได้"
 *            ติ๊กเลือกช่องที่จะเอา (ติ๊กไว้ทุกช่องที่ต่างกันตั้งแต่แรก) → เติมลงฟอร์ม
 * ใช้ที่ไหน: 1) ปุ่มเล็กข้างหัวข้อกลุ่มในฟอร์ม (variant "chip" — ค่าตั้งต้น) = คัดลอกเฉพาะกลุ่มนั้น
 *            2) ปุ่มบนแถบเครื่องมือของลิ้นชัก (variant "toolbar") = ทุกกลุ่ม แบ่งหัวข้อตามกลุ่ม
 *               — เปิดด้วย config.copyFromRecordToolbar (ตอนนี้ Parent SKU · เจ้าของขอ 2026-11-11 "copy รายละเอียดจากรุ่นอื่น")
 * ใช้เมื่อไหร่: สินค้าหลายตัวใช้ข้อความชุดเดียวกัน (Introduction/Description/สเปค) ไม่ต้องพิมพ์ซ้ำ
 * ห้ามใช้เมื่อ: ช่องที่มีค่าห้ามซ้ำ (รหัสสินค้า/บาร์โค้ด) — ระบบตัดให้อัตโนมัติแล้ว (NEVER_COPY + copyExcludeKeys)
 *
 * ความปลอดภัย: แค่ "เติมลงในฟอร์ม" เท่านั้น ยังไม่บันทึกจนกว่าจะกดบันทึกเอง
 *              ต้นทางว่าง = ไม่คัดลอก (กันล้างของเดิม) · ช่องที่จะทับของเดิมมีป้ายบอก
 * กฎเทียบค่า: lib/copy-record-diff (pure + เทสต์)
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { buildCopyRows, defaultCopySelection, type CopyRow } from "@/lib/copy-record-diff";

/** ฟิลด์ที่ห้ามคัดลอกเด็ดขาด (ค่าเฉพาะตัวของแต่ละระเบียน) */
const NEVER_COPY = new Set([
  "id", "code", "sku", "sku_code", "barcode", "created_at", "updated_at", "created_by", "updated_by",
  "cover_image_r2_key", "is_active", "status",
]);

type Row = Record<string, unknown>;
/** ข้อมูลช่องสำหรับโชว์ในตารางเทียบ (ไม่ส่ง = ใช้ชื่อคีย์) */
export type CopyFieldInfo = { key: string; label: string; group?: string };

export function CopyFromRecordButton({
  apiBase, apiPath, currentId, sectionLabel, fieldKeys, labelKeys, currentValues, onApply, excludeKeys = [],
  fields, renderValue, variant = "chip",
}: {
  apiBase: string;
  apiPath: string;
  /** ระเบียนที่กำลังแก้ (ไม่ให้เลือกตัวเอง) */
  currentId?: string | null;
  sectionLabel: string;
  /** คีย์ฟิลด์ที่คัดลอกได้ (จะคัดลอกเฉพาะพวกนี้) */
  fieldKeys: string[];
  /** คีย์ที่ใช้แสดงชื่อระเบียนในรายการค้นหา (เช่น ["code","name_th"]) */
  labelKeys: string[];
  /** ค่าปัจจุบันในฟอร์ม — ใช้เทียบ/บอกว่าจะทับกี่ช่อง */
  currentValues: Record<string, unknown>;
  onApply: (values: Record<string, unknown>) => void;
  excludeKeys?: string[];
  /** ชื่อช่อง + กลุ่ม สำหรับตารางเทียบ */
  fields?: CopyFieldInfo[];
  /** วาดค่าในตารางเทียบ (เช่น id อ้างอิง → ชื่อ) · record = ระเบียนเจ้าของค่า (ตอนนี้ หรือ ต้นทาง) */
  renderValue?: (key: string, value: unknown, record: Record<string, unknown>) => ReactNode;
  /** chip = ปุ่มเล็กข้างหัวข้อกลุ่ม · toolbar = ปุ่มโปร่งในแถบเครื่องมือ */
  variant?: "chip" | "toolbar";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Row | null>(null);      // รายการที่เลือก (จากผลค้นหา)
  const [source, setSource] = useState<Row | null>(null);      // ระเบียนเต็มของต้นทาง → ขั้นเทียบ
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const copyKeys = useMemo(() => fieldKeys.filter((k) => !NEVER_COPY.has(k) && !excludeKeys.includes(k)), [fieldKeys, excludeKeys]);
  const info = useMemo(() => new Map((fields ?? []).map((f) => [f.key, f])), [fields]);

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
    if (!open || source) return;
    const id = setTimeout(() => { void search(q); }, q ? 400 : 0);
    return () => clearTimeout(id);
  }, [open, q, search, source]);

  const label = (r: Row) => labelKeys.map((k) => String(r[k] ?? "").trim()).filter(Boolean).join(" · ") || String(r.id ?? "");

  const close = () => { setOpen(false); setPicked(null); setSource(null); setQ(""); setErr(""); };

  // ขั้น 1 → 2: ดึงระเบียนเต็ม (รายการค้นหาอาจส่งมาไม่ครบทุกคอลัมน์) แล้วเทียบ
  const loadSource = async (r: Row) => {
    setPicked(r); setBusy(true); setErr("");
    try {
      const j = await apiFetch(`${apiBase}${apiPath}/${encodeURIComponent(String(r.id))}`).then((x) => x.json());
      const full = (j.data ?? j.row ?? r) as Row;
      const cmp = buildCopyRows(copyKeys.filter((k) => k in full), currentValues, full);
      if (cmp.length === 0) throw new Error(t("ไม่มีข้อมูลให้คัดลอก", "Nothing to copy"));
      setSource(full);
      setSelected(new Set(defaultCopySelection(cmp)));
    } catch (e) { setErr(e instanceof Error ? e.message : t("โหลดรายการไม่สำเร็จ", "Couldn't load the record")); }
    finally { setBusy(false); }
  };

  const cmpRows: CopyRow[] = useMemo(
    () => (source ? buildCopyRows(copyKeys.filter((k) => k in source), currentValues, source) : []),
    [source, copyKeys, currentValues],
  );
  // จัดกลุ่มตามหัวข้อ (ทั้งระเบียน) — ลำดับตาม fieldKeys
  const groups = useMemo(() => {
    const out: { name: string; rows: CopyRow[] }[] = [];
    for (const r of cmpRows) {
      const g = info.get(r.key)?.group ?? "";
      const last = out[out.length - 1];
      if (last && last.name === g) last.rows.push(r); else out.push({ name: g, rows: [r] });
    }
    return out;
  }, [cmpRows, info]);
  const pickedCount = cmpRows.filter((r) => selected.has(r.key)).length;
  const overwriteCount = cmpRows.filter((r) => selected.has(r.key) && r.overwrite).length;
  const changeCount = cmpRows.filter((r) => r.status === "change").length;

  const toggle = (keys: string[], on: boolean) => setSelected((prev) => {
    const n = new Set(prev);
    for (const k of keys) { if (on) n.add(k); else n.delete(k); }
    return n;
  });

  const apply = () => {
    if (!source) return;
    const values: Record<string, unknown> = {};
    for (const r of cmpRows) if (selected.has(r.key) && r.status === "change") values[r.key] = source[r.key];
    if (Object.keys(values).length === 0) { setErr(t("ยังไม่ได้เลือกช่องที่จะคัดลอก", "Pick at least one field to copy")); return; }
    onApply(values);
    close();
  };

  const showValue = (key: string, v: unknown, rec: Row): ReactNode => {
    if (renderValue) return renderValue(key, v, rec);
    if (v == null || v === "") return <span className="text-slate-300">—</span>;
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };

  const whole = variant === "toolbar";
  return (
    <>
      {whole ? (
        <button type="button" onClick={() => setOpen(true)}
          title={t("เลือกสินค้ารุ่นอื่น แล้วเลือกว่าจะคัดลอกช่องไหน (เทียบให้ดูก่อน)", "Pick another record, then choose which fields to copy (side-by-side preview)")}
          className="h-7 px-2.5 rounded-md text-[12.5px] font-medium text-violet-700 hover:bg-violet-50">
          📋 {t("คัดลอกจากรุ่นอื่น", "Copy from another")}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          title={t(`คัดลอกค่าในกลุ่ม “${sectionLabel}” จากระเบียนอื่น`, `Copy the “${sectionLabel}” section from another record`)}
          className="h-6 px-2 text-[11px] rounded-full border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 hover:text-slate-700">
          📋 {t("คัดลอกจากตัวอื่น", "Copy from another")}
        </button>
      )}

      {open && (
        <ERPModal open onClose={close} size={source ? "xl" : "md"}
          title={whole ? t("📋 คัดลอกรายละเอียดจากรุ่นอื่น", "📋 Copy details from another record") : t(`📋 คัดลอก “${sectionLabel}” จากระเบียนอื่น`, `📋 Copy “${sectionLabel}” from another record`)}
          description={source
            ? t("ติ๊กช่องที่จะเอา (ติ๊กไว้ทุกช่องที่ต่างกันแล้ว) — เติมลงฟอร์มเท่านั้น ยังไม่บันทึกจนกว่าจะกดบันทึกเอง", "Tick the fields to take (every changed field is ticked) — fills the form only; nothing is saved until you press Save")
            : t("เลือกได้ 1 รายการ แล้วจะเห็นตารางเทียบก่อนคัดลอก", "Pick one — you'll see a comparison before anything is copied")}
          footer={
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-[11.5px] text-slate-500">
                {source
                  ? t(`เลือก ${pickedCount}/${changeCount} ช่องที่ต่างกัน${overwriteCount ? ` · ทับของเดิม ${overwriteCount} ช่อง` : ""}`,
                      `${pickedCount}/${changeCount} changed fields picked${overwriteCount ? ` · overwrites ${overwriteCount}` : ""}`)
                  : t("ยังไม่ได้เลือกรายการ", "No record selected")}
              </span>
              <div className="flex gap-2">
                <button onClick={close} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
                {source && (
                  <button onClick={apply} disabled={pickedCount === 0}
                    className="h-9 px-4 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">
                    {t(`เติมลงฟอร์ม (${pickedCount} ช่อง)`, `Fill the form (${pickedCount})`)}
                  </button>
                )}
              </div>
            </div>
          }>
          {!source ? (
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
                    <button key={String(r.id)} type="button" disabled={busy} onClick={() => void loadSource(r)}
                      className={`w-full text-left px-3 py-2 text-[13px] ${on ? "bg-orange-50 text-orange-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}>
                      {on && busy ? "⏳ " : ""}{label(r)}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400">
                {t(`คัดลอกได้ ${copyKeys.length} ช่อง · ไม่คัดลอกรหัสสินค้า รูป และสถานะ`, `${copyKeys.length} copyable fields · never the code, images, or status`)}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                <span className="text-slate-500">{t("จาก:", "From:")}</span>
                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">{label(source)}</span>
                <button type="button" onClick={() => { setSource(null); setPicked(null); }} className="text-violet-700 hover:underline">{t("← เลือกรายการอื่น", "← Pick another")}</button>
                <span className="ml-auto flex gap-3">
                  <button type="button" onClick={() => setSelected(new Set(defaultCopySelection(cmpRows)))} className="text-violet-700 hover:underline">{t("เลือกทั้งหมด", "Select all")}</button>
                  <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">{t("ไม่เลือกเลย", "Select none")}</button>
                </span>
              </div>
              {err && <p className="text-[12px] text-red-600">{err}</p>}
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-[12.5px] table-fixed">
                  <colgroup><col className="w-9" /><col className="w-36" /><col /><col /></colgroup>
                  <thead className="sticky top-0 z-[1] bg-slate-50 text-[11.5px] text-slate-500">
                    <tr>
                      <th className="py-1.5" />
                      <th className="text-left font-medium py-1.5 px-2">{t("ช่อง", "Field")}</th>
                      <th className="text-left font-medium py-1.5 px-2">{t("ตอนนี้", "Current")}</th>
                      <th className="text-left font-medium py-1.5 px-2">{t("จะได้ (จากรายการที่เลือก)", "Will become (from source)")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const changeKeys = g.rows.filter((r) => r.status === "change").map((r) => r.key);
                      const allOn = changeKeys.length > 0 && changeKeys.every((k) => selected.has(k));
                      return [
                        g.name ? (
                          <tr key={`g:${g.name}`} className="bg-slate-50/70 border-t border-slate-200">
                            <td className="py-1.5 text-center">
                              {changeKeys.length > 0 && <input type="checkbox" checked={allOn} aria-label={t(`เลือกทั้งกลุ่ม ${g.name}`, `Select group ${g.name}`)} onChange={(e) => toggle(changeKeys, e.target.checked)} />}
                            </td>
                            <td colSpan={3} className="py-1.5 px-2 text-[11.5px] font-semibold text-slate-600">{g.name}</td>
                          </tr>
                        ) : null,
                        ...g.rows.map((r) => {
                          const f = info.get(r.key);
                          const muted = r.status !== "change";
                          return (
                            <tr key={r.key} className={`border-t border-slate-100 align-top ${muted ? "text-slate-400" : ""}`}>
                              <td className="py-2 text-center">
                                <input type="checkbox" disabled={muted} checked={!muted && selected.has(r.key)}
                                  aria-label={f?.label ?? r.key} onChange={(e) => toggle([r.key], e.target.checked)} />
                              </td>
                              <td className="py-2 px-2">
                                <div className={muted ? "" : "text-slate-700"}>{f?.label ?? r.key}</div>
                                {r.status === "same" && <span className="text-[10.5px]">{t("เหมือนกัน", "Same")}</span>}
                                {r.status === "empty_source" && <span className="text-[10.5px]">{t("ต้นทางว่าง (ไม่คัดลอก)", "Source empty (skipped)")}</span>}
                                {r.status === "change" && r.overwrite && selected.has(r.key) && <span className="text-[10.5px] text-amber-600">{t("ทับของเดิม", "Overwrites")}</span>}
                              </td>
                              <td className="py-2 px-2 min-w-0"><div className="line-clamp-4 break-words">{showValue(r.key, currentValues[r.key], currentValues)}</div></td>
                              <td className={`py-2 px-2 min-w-0 ${!muted && selected.has(r.key) ? "bg-emerald-50/60" : ""}`}><div className="line-clamp-4 break-words">{showValue(r.key, source[r.key], source)}</div></td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ERPModal>
      )}
    </>
  );
}
