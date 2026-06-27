"use client";

// จัดการ "ชนิดไฟล์นำเข้า" ต่อแพลตฟอร์ม (ระดับ 2) — ของกลาง เปิดจากปุ่ม ⚙️ หน้าสินค้าบนแพลตฟอร์ม
// - รายการ: โปรไฟล์มาตรฐาน (จากโค้ด, อ่านอย่างเดียว + คัดลอกไปปรับแต่ง) + ที่ผู้ใช้สร้างเอง (แก้/ลบ)
// - เพิ่ม/แก้ด้วย "เรียนรู้จากไฟล์ตัวอย่าง": อัปไฟล์ → ชี้แถวหัว/แถวข้อมูล → จับคู่คอลัมน์ → บันทึก
// API: /api/platform-import-profiles

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { IMPORT_TARGET_FIELDS, type ImportProfile, type ImportMatrix } from "@/lib/platform-import-profiles";

type DbRow = {
  id: string; profile_key: string; label: string; kind: string; level: string; section: string;
  header_row_index: number; label_row_index: number | null; data_start_row_index: number;
  detect: Record<string, unknown>; field_map: Record<string, string[]>; is_active: boolean; sort_order: number;
};
type Marker = { row: number; col: number; value: string } | null;
type FormState = {
  dbId: string | null; profile_key: string; label: string; kind: "catalog" | "orders"; level: "product" | "variation";
  section: string; headerRowIndex: number; dataStartRowIndex: number; labelRowIndex: number | "";
  map: Record<string, string>; marker: Marker; is_active: boolean;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export default function PlatformImportProfileManager({ platformId, platformCode, onClose, onChanged }: { platformId: string; platformCode: string; onClose: () => void; onChanged: () => void }) {
  const [builtin, setBuiltin] = useState<ImportProfile[]>([]);
  const [custom, setCustom] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [matrix, setMatrix] = useState<ImportMatrix | null>(null);
  const [sampleName, setSampleName] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/platform-import-profiles?platform_id=${platformId}`).then((r) => r.json());
      setBuiltin((j.builtin ?? []) as ImportProfile[]);
      setCustom((j.custom ?? []) as DbRow[]);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [platformId]);
  useEffect(() => { load(); }, [load]);

  // หัวคอลัมน์จากไฟล์ตัวอย่าง (ตามแถวหัวที่เลือก) — ไว้เป็นตัวช่วยจับคู่
  const headerCols: string[] = (() => {
    if (!matrix || !form) return [];
    const r = matrix[form.headerRowIndex] ?? [];
    return r.map((c) => String(c ?? "").trim()).filter(Boolean);
  })();

  const emptyForm = (): FormState => ({ dbId: null, profile_key: "", label: "", kind: "catalog", level: "product", section: "", headerRowIndex: 0, dataStartRowIndex: 1, labelRowIndex: "", map: {}, marker: null, is_active: true });

  const openCreate = () => { setForm(emptyForm()); setMatrix(null); setSampleName(""); setErr(null); };
  const openEdit = (r: DbRow) => {
    const map: Record<string, string> = {};
    for (const k of Object.keys(r.field_map ?? {})) map[k] = (r.field_map[k] ?? []).join(", ");
    const d = r.detect ?? {};
    const marker = d.metaEquals ? { row: Number(d.metaRow ?? 1), col: Number(d.metaCol ?? 0), value: String(d.metaEquals) } : null;
    setForm({ dbId: r.id, profile_key: r.profile_key, label: r.label, kind: r.kind === "orders" ? "orders" : "catalog", level: r.level === "variation" ? "variation" : "product", section: r.section, headerRowIndex: r.header_row_index, dataStartRowIndex: r.data_start_row_index, labelRowIndex: r.label_row_index ?? "", map, marker, is_active: r.is_active });
    setMatrix(null); setSampleName(""); setErr(null);
  };
  const openCopy = (p: ImportProfile) => {
    const map: Record<string, string> = {};
    for (const k of Object.keys(p.map)) map[k] = ((p.map as Record<string, string[]>)[k] ?? []).join(", ");
    const marker = p.detect?.metaEquals ? { row: p.detect.metaRow ?? 1, col: p.detect.metaCol ?? 0, value: p.detect.metaEquals } : null;
    setForm({ dbId: null, profile_key: slug(p.id + "_copy"), label: p.label + " (ของฉัน)", kind: p.kind, level: p.level, section: p.section, headerRowIndex: p.headerRowIndex, dataStartRowIndex: p.dataStartRowIndex, labelRowIndex: p.labelRowIndex ?? "", map, marker, is_active: true });
    setMatrix(null); setSampleName(""); setErr(null);
  };

  const parseSample = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as ImportMatrix;
      setMatrix(m); setSampleName(file.name);
    } catch (e) { setErr("อ่านไฟล์ตัวอย่างไม่สำเร็จ: " + (e as Error).message); }
  };

  const save = async () => {
    if (!form) return;
    if (!form.label.trim()) { setErr("ตั้งชื่อชนิดไฟล์ก่อน"); return; }
    setSaving(true); setErr(null);
    // field_map: แยกชื่อคอลัมน์ด้วย ,
    const field_map: Record<string, string[]> = {};
    for (const k of Object.keys(form.map)) { const arr = form.map[k].split(",").map((s) => s.trim()).filter(Boolean); if (arr.length) field_map[k] = arr; }
    // ตัวบ่งชี้: ถ้าเลือกช่องบ่งชี้ → metaEquals · ไม่งั้นเดาจากคอลัมน์ระบุตัวสินค้า (headerIncludes)
    const detect: Record<string, unknown> = {};
    if (form.marker) { detect.metaEquals = form.marker.value; detect.metaRow = form.marker.row; detect.metaCol = form.marker.col; }
    else {
      const sig = ["external_product_id", "parent_sku", "variation_sku"].map((k) => field_map[k]?.[0]).filter(Boolean);
      if (sig.length) detect.headerIncludes = sig;
    }
    const payload = {
      id: form.dbId ?? undefined, platform_id: platformId, profile_key: form.profile_key.trim() || slug(form.label),
      label: form.label.trim(), kind: form.kind, level: form.level, section: form.section.trim() || undefined,
      header_row_index: form.headerRowIndex, label_row_index: form.labelRowIndex === "" ? null : form.labelRowIndex,
      data_start_row_index: form.dataStartRowIndex, detect, field_map, is_active: form.is_active,
    };
    try {
      const r = await apiFetch("/api/platform-import-profiles", { method: form.dbId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setForm(null); await load(); onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };

  const remove = async (r: DbRow) => {
    if (!confirm(`ลบชนิดไฟล์ "${r.label}" ?`)) return;
    try {
      const res = await apiFetch(`/api/platform-import-profiles?id=${r.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await load(); onChanged();
    } catch (e) { setErr((e as Error).message); }
  };

  const setF = (patch: Partial<FormState>) => setForm((f) => f ? { ...f, ...patch } : f);
  const previewRows = matrix ? matrix.slice(0, 12) : [];
  const previewCols = Math.min(matrix ? Math.max(...previewRows.map((r) => r.length), 0) : 0, 14);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">⚙️ ชนิดไฟล์นำเข้า — {platformCode || "แพลตฟอร์ม"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        {err && <p className="mx-5 mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>}

        {!form ? (
          // ---------- รายการ ----------
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">ระบบรู้จักไฟล์เหล่านี้ตอนนำเข้า — เพิ่มได้เองถ้าแพลตฟอร์มเปลี่ยนคอลัมน์</p>
              <button onClick={openCreate} className="h-9 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700">+ เพิ่มชนิดไฟล์</button>
            </div>
            {loading ? <p className="text-slate-400 text-sm py-6 text-center">กำลังโหลด...</p> : (
              <div className="space-y-2">
                {custom.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">{r.label} {!r.is_active && <span className="text-[10px] text-slate-400">(ปิดอยู่)</span>}<span className="ml-2 font-mono text-[11px] text-slate-400">{r.profile_key}</span></span>
                    <span className="text-[11px] text-slate-400">{r.kind === "orders" ? "ออเดอร์" : "สินค้า"} · {r.level === "variation" ? "ตัวเลือก" : "สินค้า"}</span>
                    <button onClick={() => openEdit(r)} className="h-7 px-2 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50">แก้</button>
                    <button onClick={() => remove(r)} className="h-7 px-2 text-xs text-rose-600 border border-rose-200 rounded hover:bg-rose-50">ลบ</button>
                  </div>
                ))}
                <div className="text-[11px] text-slate-400 pt-2 pb-1">มาตรฐาน (อ่านอย่างเดียว)</div>
                {builtin.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 border border-slate-100 bg-slate-50/50 rounded-lg px-3 py-2">
                    <span className="text-sm text-slate-600 flex-1 min-w-0 truncate">{p.label}<span className="ml-2 font-mono text-[11px] text-slate-400">{p.id}</span></span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">มาตรฐาน</span>
                    <button onClick={() => openCopy(p)} className="h-7 px-2 text-xs text-violet-600 border border-violet-200 rounded hover:bg-violet-50">คัดลอกไปปรับแต่ง</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // ---------- ฟอร์มเพิ่ม/แก้ (เรียนรู้จากไฟล์ตัวอย่าง) ----------
          <div className="p-5 space-y-4">
            {/* ขั้น 1: ไฟล์ตัวอย่าง */}
            <section>
              <h3 className="text-sm font-medium text-slate-700 mb-1">1) อัปไฟล์ตัวอย่าง (ช่วยให้จับคู่ง่ายขึ้น)</h3>
              <label className="inline-block">
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseSample(f); }} />
                <span className="cursor-pointer inline-block h-9 px-3 leading-9 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📄 เลือกไฟล์ตัวอย่าง</span>
              </label>
              {sampleName && <span className="ml-2 text-xs text-slate-500">{sampleName}</span>}
              {matrix && (
                <div className="mt-2 overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="text-[11px] border-collapse">
                    <tbody>
                      {previewRows.map((row, ri) => {
                        const tag = ri === form.headerRowIndex ? "หัว" : ri === form.dataStartRowIndex ? "ข้อมูล" : ri === form.labelRowIndex ? "ป้าย" : "";
                        const bg = ri === form.headerRowIndex ? "bg-sky-50" : ri === form.dataStartRowIndex ? "bg-emerald-50" : ri === form.labelRowIndex ? "bg-amber-50" : "";
                        return (
                          <tr key={ri} className={bg}>
                            <td className="px-1.5 py-1 text-slate-400 border border-slate-100 whitespace-nowrap sticky left-0 bg-inherit">
                              <span className="font-mono">{ri}</span>
                              <span className="ml-1 inline-flex gap-0.5">
                                <button title="ตั้งเป็นแถวหัวตาราง" onClick={() => setF({ headerRowIndex: ri })} className="px-1 rounded hover:bg-sky-100">H</button>
                                <button title="ตั้งเป็นแถวข้อมูลเริ่ม" onClick={() => setF({ dataStartRowIndex: ri })} className="px-1 rounded hover:bg-emerald-100">D</button>
                                <button title="ตั้งเป็นแถวป้ายไทย" onClick={() => setF({ labelRowIndex: ri })} className="px-1 rounded hover:bg-amber-100">L</button>
                              </span>
                              {tag && <span className="ml-1 text-[9px] text-slate-500">{tag}</span>}
                            </td>
                            {Array.from({ length: previewCols }).map((_, ci) => (
                              <td key={ci} title="คลิกเพื่อใช้เป็นตัวบ่งชี้ชนิดไฟล์" onClick={() => setF({ marker: { row: ri, col: ci, value: String(row[ci] ?? "").trim() } })}
                                className={`px-1.5 py-1 border border-slate-100 max-w-[120px] truncate cursor-pointer hover:bg-violet-100 ${form.marker && form.marker.row === ri && form.marker.col === ci ? "ring-2 ring-violet-400" : ""}`}>
                                {String(row[ci] ?? "").slice(0, 24)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ขั้น 2: แถว */}
            <section className="grid grid-cols-3 gap-3">
              <label className="text-sm text-slate-600">แถวหัวตาราง<input type="number" min={0} value={form.headerRowIndex} onChange={(e) => setF({ headerRowIndex: Number(e.target.value) })} className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2" /></label>
              <label className="text-sm text-slate-600">แถวข้อมูลเริ่ม<input type="number" min={0} value={form.dataStartRowIndex} onChange={(e) => setF({ dataStartRowIndex: Number(e.target.value) })} className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2" /></label>
              <label className="text-sm text-slate-600">แถวป้ายไทย (ไม่มีเว้นว่าง)<input type="number" min={0} value={form.labelRowIndex} onChange={(e) => setF({ labelRowIndex: e.target.value === "" ? "" : Number(e.target.value) })} className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2" /></label>
            </section>

            {/* ขั้น 3: จับคู่คอลัมน์ */}
            <section>
              <h3 className="text-sm font-medium text-slate-700 mb-1">3) จับคู่คอลัมน์ (พิมพ์ชื่อคอลัมน์ หรือเลือกจากรายการ)</h3>
              <datalist id="impcols">{headerCols.map((c) => <option key={c} value={c} />)}</datalist>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {IMPORT_TARGET_FIELDS.map((f) => (
                  <label key={f.key} className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="w-40 shrink-0">{f.label}</span>
                    <input list="impcols" value={form.map[f.key] ?? ""} onChange={(e) => setF({ map: { ...form.map, [f.key]: e.target.value } })} placeholder="—" className="flex-1 h-8 border border-slate-200 rounded-md px-2 font-mono" />
                  </label>
                ))}
              </div>
            </section>

            {/* ขั้น 4: ตัวบ่งชี้ */}
            <section className="text-sm text-slate-600">
              <h3 className="text-sm font-medium text-slate-700 mb-1">4) ระบบเดาว่าเป็นไฟล์นี้ได้ยังไง</h3>
              {form.marker
                ? <p className="text-xs">ใช้ค่าช่อง (แถว {form.marker.row}, คอลัมน์ {form.marker.col}) = <span className="font-mono bg-violet-50 px-1 rounded">{form.marker.value || "(ว่าง)"}</span> <button onClick={() => setF({ marker: null })} className="ml-2 text-rose-500 underline">ล้าง</button></p>
                : <p className="text-xs text-slate-400">เดาจากชื่อคอลัมน์ที่จับคู่ไว้ (รหัสสินค้า/SKU) — หรือคลิกช่องในตารางตัวอย่างด้านบนเพื่อกำหนดตัวบ่งชี้เอง</p>}
            </section>

            {/* ขั้น 5: ชื่อ + ตัวเลือก */}
            <section className="grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-600 col-span-2">ชื่อชนิดไฟล์<input value={form.label} onChange={(e) => setF({ label: e.target.value, profile_key: form.dbId ? form.profile_key : (form.profile_key || slug(e.target.value)) })} placeholder="เช่น Shopee — โปรโมชั่น" className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2" /></label>
              <label className="text-sm text-slate-600">รหัส (ภาษาอังกฤษ)<input value={form.profile_key} onChange={(e) => setF({ profile_key: e.target.value })} className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2 font-mono" /></label>
              <label className="text-sm text-slate-600">เข้าหน้า<select value={form.kind} onChange={(e) => setF({ kind: e.target.value as "catalog" | "orders" })} className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2 bg-white"><option value="catalog">สินค้า</option><option value="orders">ออเดอร์</option></select></label>
              <label className="text-sm text-slate-600">1 แถวคือ<select value={form.level} onChange={(e) => setF({ level: e.target.value as "product" | "variation" })} className="mt-1 w-full h-9 border border-slate-200 rounded-md px-2 bg-white"><option value="product">1 สินค้า</option><option value="variation">1 ตัวเลือก/สี</option></select></label>
              <label className="text-sm text-slate-600 flex items-center gap-2 pt-5"><input type="checkbox" checked={form.is_active} onChange={(e) => setF({ is_active: e.target.checked })} /> เปิดใช้งาน</label>
            </section>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => { setForm(null); setErr(null); }} className="h-9 px-3 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
              <button onClick={save} disabled={saving} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
