"use client";

// โมดอลแต่งหน้าแท็บแบรนด์ในปฏิทินคอนเทนต์ — สีเน้น + รูปพื้นหลังแบนเนอร์ (ต่อแบรนด์)
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { saveBrandCalStyle, type BrandCalStyle, type BrandOption } from "../data";

const PRESETS = ["#7c3aed", "#2563eb", "#0ea5e9", "#059669", "#d946ef", "#e11d48", "#ea580c", "#f59e0b", "#64748b", "#111827"];

export function BrandStyleModal({ brand, current, onClose, onSaved, pushToast }: {
  brand: BrandOption;
  current: BrandCalStyle | null;
  onClose: () => void;
  onSaved: (s: BrandCalStyle) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const [accent, setAccent] = useState<string>(current?.accent_color || brand.color || "#7c3aed");
  const [bgKey, setBgKey] = useState<string | null>(current?.bg_image_key ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const onPickImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "content-calendar");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({ error: "อัปโหลดไม่สำเร็จ" }));
      if (j.error) { pushToast("error", j.error as string); return; }
      setBgKey(j.r2_key as string);
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const s: BrandCalStyle = { brand_id: brand.id, accent_color: accent || null, bg_image_key: bgKey };
      await saveBrandCalStyle(s);
      pushToast("success", t("บันทึกการแต่งหน้าแล้ว", "Saved"));
      onSaved(s);
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  const clearAll = async () => {
    setSaving(true);
    try {
      const s: BrandCalStyle = { brand_id: brand.id, accent_color: null, bg_image_key: null };
      await saveBrandCalStyle(s);
      pushToast("success", t("ล้างการแต่งหน้าแล้ว", "Reset"));
      onSaved(s);
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  const bgUrl = bgKey ? r2ImageUrl(bgKey, 640) : null;

  return (
    <ERPModal open onClose={onClose} title={`🎨 ${t("แต่งหน้าแท็บ", "Style tab")} · ${brand.name}`} size="md"
      footer={<>
        <button onClick={clearAll} disabled={saving} className="h-9 px-3 text-sm font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 mr-auto">{t("ล้างค่า", "Reset")}</button>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
      </>}>
      {/* พรีวิวแบนเนอร์ */}
      <div className="rounded-xl overflow-hidden border border-slate-200 mb-4" style={{ background: accent }}>
        <div className="h-20 flex items-end p-3 relative" style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          <div className="absolute inset-0" style={{ background: bgUrl ? `linear-gradient(to top, ${accent}cc, ${accent}22)` : "transparent" }} />
          <span className="relative text-white font-semibold drop-shadow">{brand.name}</span>
        </div>
      </div>

      {/* สีเน้น */}
      <div className="mb-4">
        <label className="text-sm font-medium text-slate-700">{t("สีเน้น (แท็บ + แบนเนอร์)", "Accent color")}</label>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 rounded border border-slate-200 cursor-pointer bg-white" />
          <input type="text" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-28 border border-slate-200 rounded-lg px-2 text-sm font-mono" />
          {PRESETS.map((c) => <button key={c} type="button" onClick={() => setAccent(c)} title={c} className={`h-6 w-6 rounded-full border ${accent.toLowerCase() === c ? "ring-2 ring-offset-1 ring-slate-400" : "border-slate-200"}`} style={{ background: c }} />)}
        </div>
      </div>

      {/* รูปพื้นหลัง */}
      <div>
        <label className="text-sm font-medium text-slate-700">{t("รูปพื้นหลังแบนเนอร์ (ไม่ใส่ก็ได้)", "Banner background image (optional)")}</label>
        <div className="flex items-center gap-2 mt-1.5">
          <label className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 cursor-pointer">
            {uploading ? t("กำลังอัป...", "Uploading...") : t("⬆ เลือกรูป", "⬆ Upload")}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ""; }} />
          </label>
          {bgKey && <button onClick={() => setBgKey(null)} className="h-9 px-3 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50">{t("เอารูปออก", "Remove")}</button>}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{t("แนะนำรูปแนวนอน · ระบบจะเบลอทับด้วยสีเน้นให้อ่านชื่อง่าย", "Landscape image recommended · overlaid with the accent color")}</p>
      </div>
    </ERPModal>
  );
}
