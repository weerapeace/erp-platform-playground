"use client";

/**
 * ⚙️ ตั้งค่า "วิธีทำงานสินค้า" ต่อประเภทงาน (โหมดเดิม / โหมดใหม่) — อยู่ใน /tasks/settings แท็บ "ส่งงาน"
 * บันทึกทันทีที่กด · เปิดโหมดใหม่ = จดเวลาไว้ (since) → ใช้กับงานที่สร้างหลังจากนี้ งานที่ทำค้างไม่เปลี่ยน
 */
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "./use-options";
import { DEFAULT_SKIP_SUBTASKS, loadProductModeCfg, saveProductModeCfg, type ProductEditMode, type ProductModeCfg } from "./product-edit-mode";
import { listSubtaskTypes, type SubtaskType } from "./data";

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function ProductModeManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const { taskTypes } = useCreativeOptions();
  const [cfg, setCfg] = useState<ProductModeCfg | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadProductModeCfg(true).then(setCfg); }, []);
  // ชนิดงานย่อยทั้งหมด (ไว้เลือกว่าโหมดใหม่ "ไม่ต้องมี" อันไหน)
  const [subTypes, setSubTypes] = useState<SubtaskType[]>([]);
  useEffect(() => { listSubtaskTypes().then((ts) => setSubTypes(ts.filter((x) => x.is_active !== false))).catch(() => setSubTypes([])); }, []);

  const save = async (type: string, next: ProductModeCfg, okMsg: string) => {
    setSaving(type); setErr(null);
    try { await saveProductModeCfg(next); setCfg(next); showToast(okMsg); }
    catch (e) { setErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(null); }
  };
  // ติ๊ก = งานย่อยชนิดนี้ "ไม่ต้องมี" ตอนสร้างงานใหม่ของประเภทนี้ (โหมดใหม่)
  const toggleSkip = (type: string, key: string) => {
    if (!cfg?.types[type]) return;
    const cur = cfg.types[type].skip_subtasks ?? DEFAULT_SKIP_SUBTASKS;
    const skip = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    void save(type, { types: { ...cfg.types, [type]: { ...cfg.types[type], skip_subtasks: skip } } }, t("บันทึกแล้ว — ใช้กับงานที่สร้างหลังจากนี้", "Saved — applies to new tasks"));
  };

  const setMode = async (type: string, mode: ProductEditMode) => {
    if (!cfg || cfg.types[type]?.mode === mode || (!cfg.types[type] && mode === "legacy")) return;
    const next: ProductModeCfg = { types: { ...cfg.types, [type]: { ...cfg.types[type], mode, since: mode === "direct" ? new Date().toISOString() : (cfg.types[type]?.since ?? null) } } };
    await save(type, next, mode === "direct" ? t("เปิดโหมดใหม่แล้ว — ใช้กับงานที่สร้างหลังจากนี้", "New mode on — applies to tasks created from now") : t("กลับไปใช้โหมดเดิมแล้ว", "Back to the old mode"));
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
      <h3 className="text-sm font-semibold text-slate-800">🔁 {t("วิธีทำงานสินค้า (ต่อประเภทงาน)", "How product work is done (per task type)")}</h3>
      <div className="mt-1 text-xs text-slate-500 leading-relaxed space-y-0.5">
        <p><b className="text-slate-600">{t("โหมดเดิม", "Old mode")}</b> — {t("อัปโหลดรูปในงาน → เลือกตัวที่จะแทน → อนุมัติแล้วระบบค่อยส่งเข้าสินค้า", "Upload in the task → pick what to replace → pushed to the product on approval")}</p>
        <p><b className="text-slate-600">{t("โหมดใหม่", "New mode")}</b> — {t("กด \"แก้ที่สินค้า\" ในงาน แก้ SKU/Parent ตัวจริงเลย · ระบบเก็บเวอร์ชันเก่าและสรุปสิ่งที่แก้ให้ผู้ตรวจ (ย้อนกลับได้)", "Press \"Edit product\" in the task to edit the real SKU/Parent · old versions are kept and changes summarised for the reviewer (undoable)")}</p>
        <p className="text-amber-700">⚠ {t("โหมดใหม่: แก้แล้วขึ้นสินค้าจริงทันที — ถ้าสินค้าขายบนเว็บอยู่ ลูกค้าจะเห็นภายในไม่กี่นาที", "New mode: edits go live right away — if the product is on the website, customers see it within minutes")}</p>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">⚠ {err}</p>}
      {cfg === null ? (
        <div className="mt-3 space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />)}</div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {taskTypes.map((ty) => {
            const m = cfg.types[ty.value];
            const direct = m?.mode === "direct";
            return (
              <li key={ty.value} className="flex items-center justify-between gap-3 py-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{ty.label}</p>
                  {direct && m?.since && <p className="text-[11px] text-slate-400">{t("ใช้กับงานที่สร้างตั้งแต่", "For tasks created since")} {fmt(m.since)}</p>}
                </div>
                <div className={`inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs ${saving === ty.value ? "opacity-60" : ""}`}>
                  <button type="button" disabled={saving !== null} onClick={() => void setMode(ty.value, "legacy")}
                    className={`h-8 px-3 ${!direct ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>{t("โหมดเดิม", "Old")}</button>
                  <button type="button" disabled={saving !== null} onClick={() => void setMode(ty.value, "direct")}
                    className={`h-8 px-3 border-l border-slate-200 ${direct ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>{t("โหมดใหม่", "New")}</button>
                </div>
                {/* โหมดใหม่: เลือกว่างานย่อยชนิดไหน "ไม่ต้องมี" (ติ๊กไว้ = ไม่สร้าง · แก้ที่สินค้าจากหน้างานแทน) */}
                {direct && subTypes.length > 0 && (() => {
                  const skip = m?.skip_subtasks ?? DEFAULT_SKIP_SUBTASKS;
                  return (
                    <div className="w-full rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-[11px] text-slate-500 mb-1.5">{t("งานย่อยที่ \"ไม่ต้องมี\" ตอนสร้างงานใหม่ (กดสลับ) — งานที่ไม่มีงานย่อยพวกนี้ จะมีปุ่ม \"แก้ที่สินค้า\" ที่หน้างานแทน", "Subtasks NOT created for new tasks (tap to toggle) — without them the task itself gets the \"Edit product\" panel")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {subTypes.map((st) => {
                          const off = skip.includes(st.key);
                          return (
                            <button key={st.key} type="button" disabled={saving !== null} onClick={() => toggleSkip(ty.value, st.key)}
                              title={off ? t("ไม่สร้างงานย่อยนี้ (กดเพื่อให้มี)", "Not created (tap to keep)") : t("สร้างตามเทมเพลต (กดเพื่อไม่ต้องมี)", "Created from template (tap to skip)")}
                              className={`h-7 px-2.5 rounded-full border text-[11px] ${off ? "border-slate-200 bg-white text-slate-400 line-through" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
                              {st.icon ?? "🧩"} {t(st.label_th, st.label_en || st.label_th)}{off ? ` · ${t("ไม่มี", "skip")}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">{t("แก้ที่สินค้าได้กับงานรูปภาพ / รูปคำอธิบาย / เขียนคำอธิบาย · งานเปลี่ยนปก คอนเทนต์ และอื่น ๆ ใช้วิธีเดิมเสมอ · สลับกลับได้ตลอด งานที่ทำค้างไม่หาย · งานที่สร้างไปแล้วไม่ถูกลบงานย่อย",
        "Edit-product works for image / description-image / description-text · cover, content and others always use the old flow · switch back any time · existing tasks keep their subtasks")}</p>
    </section>
  );
}
