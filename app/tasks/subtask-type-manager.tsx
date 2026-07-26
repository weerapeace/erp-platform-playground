"use client";

// ============================================================
// SubtaskTypeManager (ของกลาง) — จัดการชนิดงานย่อย (erp_subtask_types)
// ใช้ได้ทั้งในหน้า Settings (แท็บ 🧩) และในป๊อปอัป "จัดการชนิดงานย่อย" จากตัวเลือกงานย่อย
// แก้ในเครื่องก่อน แล้วกดปุ่ม "บันทึก" ต่อแถว (กันเซฟรัว/toast กระพริบตอนลากเลือกสี) · เปิด/ปิด + เรียง = บันทึกทันที
// onChanged() เรียกหลังบันทึกสำเร็จ → ให้ผู้เรียก refresh รายการ (เช่นการ์ดในตัวเลือกงานย่อย)
// showToast ไม่ส่งมาก็ได้ (จะโชว์ toast ในตัวเอง — เหมาะกับตอนอยู่ในป๊อปอัป)
// ============================================================
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { ColorInput } from "@/components/color-picker";
import { listSubtaskTypes, updateSubtaskType, createSubtaskType, subtaskTypeHint, type SubtaskType } from "./data";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";

export function SubtaskTypeManager({ showToast: showToastProp, onChanged }: { showToast?: (m: string) => void; onChanged?: () => void }) {
  const t = useT();
  const [localToast, setLocalToast] = useState<string | null>(null);
  const showToast = showToastProp ?? ((m: string) => { setLocalToast(m); setTimeout(() => setLocalToast(null), 2500); });
  const [rows, setRows] = useState<SubtaskType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const isHex = (c?: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

  const load = async () => {
    setLoading(true);
    try { setRows(await listSubtaskTypes(true)); setDirty(new Set()); } catch (e) { showToast((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // แก้ในเครื่อง (ยังไม่เซฟ) → ชื่อ/ไอคอน/สี · ลากเลือกสีอัปเดตพรีวิวสด แต่ไม่ยิง API
  const setField = (key: string, p: Partial<SubtaskType>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
    setDirty((d) => new Set(d).add(key));
  };
  // เซฟทันที → เปิด/ปิด + เรียงลำดับ (คลิกครั้งเดียว ไม่กระพริบ)
  const saveNow = async (key: string, p: Partial<SubtaskType>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
    try { await updateSubtaskType(key, p as Record<string, unknown>); onChanged?.(); } catch (e) { showToast((e as Error).message); }
  };
  // ปุ่มบันทึกต่อแถว → เซฟ ชื่อ/ไอคอน/สี ครั้งเดียว
  const saveRow = async (key: string) => {
    const r = rows.find((x) => x.key === key); if (!r) return;
    const label_th = (r.label_th || "").trim();
    if (!label_th) { showToast(t("ต้องมีชื่อไทย", "Thai name required")); return; }
    setSavingKey(key);
    try {
      await updateSubtaskType(key, { label_th, label_en: (r.label_en || "").trim() || null, icon: (r.icon || "").trim(), color: r.color ?? null });
      setDirty((d) => { const n = new Set(d); n.delete(key); return n; });
      showToast(t("บันทึกแล้ว", "Saved")); onChanged?.();
    } catch (e) { showToast((e as Error).message); } finally { setSavingKey(null); }
  };
  const add = async () => {
    const k = newKey.trim().toLowerCase(); const l = newLabel.trim();
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(k)) { showToast(t("รหัส (key): a-z 0-9 _ เริ่มด้วยตัวอักษร", "key: a-z 0-9 _, start with a letter")); return; }
    if (!l) { showToast(t("ใส่ชื่อชนิดงานย่อย", "Enter a name")); return; }
    setBusy(true);
    try { await createSubtaskType(k, l); setNewKey(""); setNewLabel(""); await load(); showToast(t("เพิ่มแล้ว", "Added")); onChanged?.(); }
    catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  };
  // ลากจัดลำดับ (ของกลาง) — จัดในเครื่องก่อน แล้วเซฟ sort_order เฉพาะแถวที่เปลี่ยน (ไม่ reload → ที่แก้ค้างในแถวอื่นไม่หาย)
  const reorder = async (from: number, to: number) => {
    const next = moveItem(rows, from, to).map((r, idx) => ({ ...r, sort_order: idx }));
    const changed = next.filter((r, idx) => rows[idx]?.key !== r.key);
    setRows(next);
    try { await Promise.all(changed.map((r) => updateSubtaskType(r.key, { sort_order: r.sort_order }))); onChanged?.(); }
    catch (e) { showToast((e as Error).message); await load(); }
  };
  const { rowProps, handleProps, rowCls } = useDragReorder(reorder);

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">{t("ตั้งชื่อ (ไทย/อังกฤษ) + ไอคอน + สี แล้วกดปุ่ม \"บันทึก\" ต่อแถว · เปิด/ปิด + เรียงลำดับ = บันทึกทันที · บรรทัดใต้แต่ละอันบอก \"logic\" (รับอะไร · อนุมัติแล้วไปไหน) · ปิด = ซ่อนจากรายการเลือก (ของเดิมไม่หาย)", "Set name (TH/EN) + icon + color then click Save per row · active + reorder save instantly · the line below shows its logic · off = hidden from picker (data kept)")}</p>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={t("รหัส (a-z_)", "key (a-z_)")} className="w-32 h-9 border border-slate-200 rounded-lg px-3 text-sm font-mono" />
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("ชื่อชนิดงานย่อยใหม่...", "New subtask type name...")} className="flex-1 min-w-[160px] h-9 border border-slate-200 rounded-lg px-3 text-sm" />
        <button onClick={add} disabled={busy} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">＋ {t("เพิ่ม", "Add")}</button>
      </div>
      {loading ? <div className="py-10 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        : rows.length === 0 ? <div className="py-10 text-center text-slate-400">{t("ยังไม่มีชนิดงานย่อย", "No subtask types yet")}</div>
        : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const hex = isHex(r.color) ? r.color : null;
              const isDirty = dirty.has(r.key);
              return (
                <div key={r.key} {...rowProps(i)} className={`border rounded-lg px-3 py-2 transition-colors ${rowCls(i)} ${isDirty ? "border-violet-300 ring-1 ring-violet-200" : r.is_active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DragHandle {...handleProps(i)} title={t("ลากเพื่อจัดลำดับ", "Drag to reorder")} />
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border shrink-0 max-w-[160px]" style={hex ? { backgroundColor: `${hex}1a`, color: hex, borderColor: `${hex}55` } : undefined} title={t("ตัวอย่างชิป", "Chip preview")}>
                      <span className="leading-none">{r.icon || "🧩"}</span><span className="truncate">{r.label_th}</span>
                    </span>
                    <div title={t("สีประจำ", "Color")}><ColorInput value={r.color || "#64748b"} onChange={(v) => setField(r.key, { color: v })} allowText={false} /></div>
                    <input value={r.icon || ""} maxLength={2} placeholder="🧩" onChange={(e) => setField(r.key, { icon: e.target.value })} title={t("ไอคอน emoji", "Emoji icon")} className="w-9 h-7 text-center border border-slate-200 rounded text-sm" />
                    <input value={r.label_th} onChange={(e) => setField(r.key, { label_th: e.target.value })} placeholder={t("ชื่อไทย", "Thai")} className="flex-1 min-w-[100px] text-sm bg-transparent outline-none border-b border-transparent focus:border-violet-300 py-0.5" />
                    <input value={r.label_en ?? ""} onChange={(e) => setField(r.key, { label_en: e.target.value })} placeholder="EN" title={t("ชื่ออังกฤษ (ว่าง=ใช้ไทย)", "English (blank = use Thai)")} className="w-28 text-sm text-slate-500 bg-transparent outline-none border-b border-transparent focus:border-violet-300 py-0.5" />
                    <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={r.is_active} onChange={(e) => saveNow(r.key, { is_active: e.target.checked })} />{t("ใช้งาน", "Active")}</label>
                    {r.is_builtin && <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 rounded px-1">{t("ระบบ", "built-in")}</span>}
                    <span className="text-[10px] text-slate-300 font-mono">{r.key}</span>
                    <button onClick={() => saveRow(r.key)} disabled={!isDirty || savingKey === r.key} title={t("บันทึกแถวนี้", "Save this row")}
                      className={`h-7 px-3 text-xs font-medium rounded-md shrink-0 ${isDirty ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-slate-100 text-slate-400"} disabled:opacity-60`}>
                      {savingKey === r.key ? "..." : t("บันทึก", "Save")}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-6">↳ {subtaskTypeHint(r)}</p>
                </div>
              );
            })}
          </div>
        )}
      {!showToastProp && localToast && <div className="fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white bg-slate-800">{localToast}</div>}
    </div>
  );
}
