"use client";

/**
 * ✏️ เปลี่ยนลิงก์หมวด (/c/<รหัส>) — ป๊อปในแท็บ 📂 หมวดหมู่
 * พิมพ์รหัสใหม่ → ดูก่อนว่าระบบจะตามแก้อะไรบ้าง (GET /api/website/category-rename) → ยืนยัน (POST)
 * ระบบแก้สินค้า/เมนู/Section/หน้าเว็บ/โปร ให้เอง + ลิงก์เก่าพาไปหน้าใหม่อัตโนมัติ (กติกา lib/website-category-rename)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { cleanCategoryKey, type WebCategoryDef } from "@/lib/website-field-map";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type Preview = { summary: { label: string; count: number; unit: string }[]; redirect: string } | { error: string };

const inputCls = webForm.inputRoomy;

export function CategoryRenameModal({
  cat,
  cats,
  shopId,
  onClose,
  onDone,
}: {
  cat: WebCategoryDef | null;
  cats: WebCategoryDef[];
  shopId: string;
  onClose: () => void;
  onDone: (newKey: string, warning: string | null) => void;
}) {
  const t = useT();
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เปิดป๊อป = เดารหัสจากชื่อหมวด (เช่น WALLETS → wallets) · เหมือนเดิม = ว่างให้พิมพ์เอง
  useEffect(() => {
    if (!cat) return;
    const guess = cleanCategoryKey(cat.label);
    setRaw(guess && guess !== cat.key ? guess : "");
    setErr(null);
    setPreview(null);
  }, [cat]);

  const to = cleanCategoryKey(raw);
  const owner = to && cat && to !== cat.key ? cats.find((c) => c.key === to) : undefined;
  const localProblem = !cat ? null : !to ? t("พิมพ์รหัสใหม่ (ภาษาอังกฤษตัวเล็ก ตัวเลข ขีดกลาง)", "Type a new code (lowercase letters, numbers, hyphens)") : to === cat.key ? t("รหัสเหมือนเดิม", "Same code as before") : owner ? t(`รหัสนี้หมวด “${owner.label}” ใช้อยู่ — เปลี่ยนลิงก์หมวดนั้นเป็นรหัสอื่นก่อน แล้วค่อยกลับมาเปลี่ยนหมวดนี้`, `Category “${owner.label}” already uses this code — change that category's link first, then come back`) : null;

  // ดูก่อนว่าจะแก้อะไรบ้าง (หน่วง 0.35 วิ หลังหยุดพิมพ์)
  useEffect(() => {
    if (!cat || localProblem) {
      setPreview(null);
      return;
    }
    let stop = false;
    const timer = window.setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/website/category-rename?shopId=${encodeURIComponent(shopId)}&from=${encodeURIComponent(cat.key)}&to=${encodeURIComponent(to)}`);
        const j = await r.json().catch(() => ({}));
        if (!stop) setPreview(r.ok && j.ok ? { summary: j.summary ?? [], redirect: j.redirect } : { error: j?.error || tr("ตรวจไม่สำเร็จ ลองใหม่", "Check failed, try again") });
      } catch {
        if (!stop) setPreview({ error: tr("ตรวจไม่สำเร็จ ลองใหม่", "Check failed, try again") });
      }
    }, 350);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [cat, to, localProblem, shopId]);

  const ready = !!cat && !localProblem && !!preview && !("error" in preview);

  const apply = async () => {
    if (!cat || !ready) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/website/category-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, from: cat.key, to }),
      });
      const j = await r.json().catch(() => ({}));
      // ok:false แต่มี to = เปลี่ยนแล้วบางจุดไม่สำเร็จ → ปิดป๊อป + เตือน
      if (!r.ok && !j?.to) throw new Error(j?.error || tr("เปลี่ยนลิงก์ไม่สำเร็จ", "Couldn't change the link"));
      onDone(to, j.ok ? null : j.error || tr("บางจุดแก้ไม่สำเร็จ", "Some places couldn't be updated"));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open={!!cat}
      onClose={() => !saving && onClose()}
      title={t(`✏️ เปลี่ยนลิงก์หมวด “${cat?.label ?? ""}”`, `✏️ Change category link “${cat?.label ?? ""}”`)}
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {t("ยกเลิก", "Cancel")}
          </button>
          <button onClick={apply} disabled={!ready || saving} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("กำลังเปลี่ยน…", "Changing…") : t("เปลี่ยนลิงก์", "Change link")}
          </button>
        </div>
      }
    >
      {cat && (
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-1">{t("ลิงก์ตอนนี้", "Current link")}</p>
            <code className="block rounded-lg bg-slate-100 px-3 py-2 text-slate-600">/c/{cat.key}</code>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("ลิงก์ใหม่", "New link")}</label>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">/c/</span>
              <input autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void apply()} className={inputCls} placeholder={t("เช่น wallets", "e.g. wallets")} />
            </div>
            {raw && to !== raw && <p className="text-[11px] text-slate-400 mt-1">{t("จะใช้เป็น", "Will be saved as")} <code>{to || "—"}</code> {t("(ภาษาอังกฤษตัวเล็ก ตัวเลข ขีดกลาง)", "(lowercase letters, numbers, hyphens)")}</p>}
          </div>

          {localProblem && raw ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{localProblem}</p>
          ) : preview && "error" in preview ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{preview.error}</p>
          ) : preview ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-emerald-800">{t("ระบบจะตามแก้ให้เองทั้งหมด:", "The system will update all of these for you:")}</p>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {preview.summary.map((x) => (
                  <li key={x.label}>
                    {x.label} <span className="text-slate-500">{x.count} {x.unit}</span>
                  </li>
                ))}
                <li>
                  🔀 {t("ลิงก์เก่าพาไปหน้าใหม่อัตโนมัติ", "Old link redirects to the new page automatically")} <code className="text-slate-500">{preview.redirect}</code>
                </li>
              </ul>
              <p className="text-[11px] text-slate-500">{t("ลิงก์ที่แชร์ไปแล้ว (LINE/โพสต์/Google) ยังเข้าได้ · ถ้าเปิดหน้าตกแต่งเว็บค้างไว้ในแท็บอื่น ให้โหลดหน้านั้นใหม่หลังเปลี่ยน", "Links already shared (LINE / posts / Google) still work · if the site design page is open in another tab, reload it after the change")}</p>
            </div>
          ) : !localProblem ? (
            <p className="text-xs text-slate-400">{t("กำลังตรวจ…", "Checking…")}</p>
          ) : null}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}
    </ERPModal>
  );
}
