"use client";

/**
 * ⚙️ ตั้งค่า "วิธีทำงานสินค้า" ต่อประเภทงาน (โหมดเดิม / โหมดใหม่) — อยู่ใน /tasks/settings แท็บ "ส่งงาน"
 * บันทึกทันทีที่กด · เปิดโหมดใหม่ = จดเวลาไว้ (since) → ใช้กับงานที่สร้างหลังจากนี้ งานที่ทำค้างไม่เปลี่ยน
 */
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "./use-options";
import { loadProductModeCfg, saveProductModeCfg, type ProductEditMode, type ProductModeCfg } from "./product-edit-mode";

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function ProductModeManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const { taskTypes } = useCreativeOptions();
  const [cfg, setCfg] = useState<ProductModeCfg | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadProductModeCfg(true).then(setCfg); }, []);

  const setMode = async (type: string, mode: ProductEditMode) => {
    if (!cfg || cfg.types[type]?.mode === mode || (!cfg.types[type] && mode === "legacy")) return;
    const next: ProductModeCfg = { types: { ...cfg.types, [type]: { mode, since: mode === "direct" ? new Date().toISOString() : (cfg.types[type]?.since ?? null) } } };
    setSaving(type); setErr(null);
    try {
      await saveProductModeCfg(next);
      setCfg(next);
      showToast(mode === "direct" ? t("เปิดโหมดใหม่แล้ว — ใช้กับงานที่สร้างหลังจากนี้", "New mode on — applies to tasks created from now") : t("กลับไปใช้โหมดเดิมแล้ว", "Back to the old mode"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally { setSaving(null); }
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
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">{t("ใช้เฉพาะงานย่อยรูปภาพ / รูปคำอธิบาย / เขียนคำอธิบาย · งานเปลี่ยนปก คอนเทนต์ และงานอื่น ๆ ใช้วิธีเดิมเสมอ · สลับกลับได้ตลอด งานที่ทำค้างไม่หาย",
        "Only for image / description-image / description-text subtasks · cover, content and other subtasks always use the old flow · switch back any time")}</p>
    </section>
  );
}
