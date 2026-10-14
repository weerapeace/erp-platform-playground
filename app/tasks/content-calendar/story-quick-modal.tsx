"use client";
/**
 * สร้าง Story แบบเร็ว (จากแถบ 📖 ในปฏิทิน) — เจ้าของขอ: ไม่ต้องเหมือนฟอร์มคอนเทนต์ปกติ
 * ป๊อปเล็ก ๆ ถามแค่ หัวข้อ · ประเภท (รูป/วิดีโอ) · ที่อยู่ไฟล์ (อัปโหลด หรือวางลิงก์ Drive/อื่น ๆ)
 * บันทึกเป็นคอนเทนต์ปกติ (status ร่าง · IG+FB รูปแบบ Story · วันที่ = วันที่กด) แล้วแนบไฟล์/ลิงก์ให้ → เปิดแก้ต่อใน drawer ได้เหมือนเดิม
 * ของกลาง: ERPModal / ERPInput / useT / apiFetch(/api/admin/upload) / createContent / addContentAttachment
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { createContent, addContentAttachment, type BrandOption } from "../data";

type Props = {
  open: boolean; onClose: () => void;
  day: string | null;                 // YYYY-MM-DD
  brands: BrandOption[];
  defaultBrandId: string | null;      // แท็บแบรนด์ที่เลือกอยู่ (null = ให้เลือกในป๊อป)
  onCreated: () => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
};

export function StoryQuickModal({ open, onClose, day, brands, defaultBrandId, onCreated, pushToast }: Props) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"image" | "video">("image");
  const [brandId, setBrandId] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const d = day ? new Date(`${day}T00:00:00`) : new Date();
    setTitle(`Story ${d.getDate()}/${d.getMonth() + 1}`); setKind("image"); setBrandId(defaultBrandId ?? ""); setLink(""); setFile(null);
  }, [open, day, defaultBrandId]);

  const save = async () => {
    if (!day) return;
    if (!title.trim()) { pushToast("error", t("ใส่หัวข้อก่อน", "Enter a title")); return; }
    if (!file && !link.trim()) { pushToast("error", t("ใส่ที่อยู่ไฟล์ (อัปโหลด หรือวางลิงก์)", "Add a file or a link")); return; }
    setSaving(true);
    try {
      const r = await createContent({
        title: title.trim(), brand_id: brandId || null, post_type: kind, status: "draft",
        platforms: ["instagram", "facebook"], platform_formats: { instagram: "story", facebook: "story" },
        scheduled_at: `${day}T10:00`, note: null,
      });
      // ที่อยู่ไฟล์: อัปโหลดขึ้น R2 (รูป/วิดีโอ) หรือเก็บเป็นลิงก์
      if (file) {
        const fd = new FormData(); fd.append("file", file); fd.append("folder", "creative-content");
        const up = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
        const j = await up.json().catch(() => ({ error: "อัปโหลดไม่สำเร็จ" }));
        if (j.error) throw new Error(j.error as string);
        await addContentAttachment(r.id, { kind: file.type.startsWith("video/") ? "video" : "image", r2_key: j.r2_key as string, file_name: file.name, content_type: j.content_type as string, size_bytes: j.size as number });
      }
      if (link.trim()) await addContentAttachment(r.id, { kind: "link", url: link.trim(), label: t("ไฟล์ Story", "Story file") });
      pushToast("success", t(`สร้าง Story ${r.content_no} แล้ว`, `Story ${r.content_no} created`));
      onCreated();
    } catch (e) { pushToast("error", e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const dLabel = day ? new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <ERPModal open={open} onClose={onClose} title={`📖 ${t("สร้าง Story", "New Story")} · ${dLabel}`} size="sm"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("สร้าง Story", "Create")}</button>
      </>}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-slate-500">{t("หัวข้อ", "Title")}</span>
          <ERPInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 !h-10 font-medium" />
        </label>
        {!defaultBrandId && brands.length > 0 && (
          <label className="block">
            <span className="text-xs text-slate-500">{t("แบรนด์", "Brand")}</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm">
              <option value="">{t("— ไม่ระบุ —", "— None —")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <div>
          <span className="text-xs text-slate-500">{t("ประเภท", "Type")}</span>
          <div className="mt-1 flex gap-2">
            {([["image", "🖼", t("รูปภาพ", "Image")], ["video", "🎬", t("วิดีโอ", "Video")]] as const).map(([k, ic, lb]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`h-10 flex-1 rounded-lg border text-sm font-medium ${kind === k ? "bg-pink-600 border-pink-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-pink-300"}`}>{ic} {lb}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs text-slate-500">{t("ที่อยู่ไฟล์", "File")}</span>
          <div className="mt-1 space-y-1.5">
            <input ref={fileRef} type="file" accept={kind === "video" ? "video/*" : "image/*"} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()} className={`h-10 w-full rounded-lg border border-dashed text-sm ${file ? "border-pink-300 bg-pink-50 text-pink-700" : "border-slate-300 text-slate-500 hover:border-pink-300 hover:text-pink-700"}`}>
              {file ? `📎 ${file.name}` : t(`⬆ อัปโหลด${kind === "video" ? "วิดีโอ" : "รูป"}จากเครื่อง`, "⬆ Upload from device")}
            </button>
            <div className="flex items-center gap-2 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t("หรือวางลิงก์ (Google Drive / อื่น ๆ)", "or paste a link")}<span className="h-px flex-1 bg-slate-200" /></div>
            <ERPInput value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" className="!h-10" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400">{t("บันทึกเป็นร่าง ลง Instagram + Facebook แบบ Story · แคปชั่น/รูปเพิ่ม แก้ต่อได้โดยกดจุดในแถบ Story", "Saved as draft · IG + FB story · edit later from the story strip")}</p>
      </div>
    </ERPModal>
  );
}
