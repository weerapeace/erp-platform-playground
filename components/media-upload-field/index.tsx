"use client";
/**
 * MediaUploadField — อัปโหลด "รูป หรือ วิดีโอสั้น" ช่องเดียว (ของกลาง)
 * --------------------------------------------------------------------------
 * - รูป: อัปโหลด / เลือกจากคลัง (AssetPicker) · วิดีโอ: MP4/WebM ไม่เกิน 4 MB (เช็กก่อนส่ง — Vercel รับไฟล์ได้ ~4.5 MB)
 * - พรีวิวในช่อง: รูป = ภาพ · วิดีโอ = เล่นเอง เงียบ วนซ้ำ
 * - ส่งผ่าน /api/admin/upload (สิทธิ์ files.upload) → ได้ r2 key
 * ใช้: <MediaUploadField label value={{kind,key}} onChange={(m) => …} allowVideo />
 */
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

export interface MediaValue { kind: "image" | "video"; key: string }

const MAX_BYTES = 4 * 1024 * 1024;
const keyUrl = (key: string, w?: number) => `/api/r2-image?key=${encodeURIComponent(key)}${w ? `&w=${w}` : ""}`;

export function MediaUploadField({
  label,
  hint,
  value,
  onChange,
  allowVideo = true,
  folder = "storefront-hero",
  previewRatio = "16 / 9",
}: {
  label: string;
  hint?: string;
  value: MediaValue | null;
  onChange: (v: MediaValue | null) => void;
  allowVideo?: boolean;
  folder?: string;
  /** สัดส่วนกรอบพรีวิว เช่น "16 / 9" · "4 / 5" */
  previewRatio?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const upload = async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    if (isVideo && !allowVideo) return toast.error("ช่องนี้รับเฉพาะรูป");
    if (file.size > MAX_BYTES) {
      return toast.error(`ไฟล์ใหญ่เกิน 4 MB (${(file.size / 1024 / 1024).toFixed(1)} MB) — ${isVideo ? "ตัดคลิปให้สั้นลง/ลดความละเอียด (แนะนำ 6–10 วินาที 1920×1080 ไม่มีเสียง)" : "ย่อรูปก่อนอัปโหลด"}`);
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ error: r.status === 413 ? "ไฟล์ใหญ่เกินที่ระบบรับได้" : "อัปโหลดไม่สำเร็จ" }));
      if (j.r2_key) {
        onChange({ kind: isVideo ? "video" : "image", key: j.r2_key });
        toast.success("อัปโหลดแล้ว");
      } else toast.error(j.error ?? "อัปโหลดไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <div className="flex items-start gap-2">
        <div className="shrink-0 w-40 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center text-[11px] text-slate-400" style={{ aspectRatio: previewRatio }}>
          {value ? (
            value.kind === "video" ? (
              <video key={value.key} src={keyUrl(value.key)} className="w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={keyUrl(value.key, 400)} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            "ยังไม่มี"
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <input ref={inputRef} type="file" accept={allowVideo ? "image/*,video/mp4,video/webm" : "image/*"} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:border-blue-400 disabled:opacity-50">
            {busy ? "กำลังอัปโหลด…" : allowVideo ? "⬆ อัปโหลดรูป/วิดีโอ" : "⬆ อัปโหลดรูป"}
          </button>
          <button type="button" onClick={() => setPickerOpen(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400">🖼 เลือกรูปจากคลัง</button>
          {value && <button type="button" onClick={() => onChange(null)} className="text-[11px] text-rose-500 hover:underline text-left">เอาออก</button>}
          {hint && <p className="text-[10px] text-slate-400 leading-snug">{hint}</p>}
        </div>
      </div>
      {pickerOpen && (
        <AssetPicker
          open
          onClose={() => setPickerOpen(false)}
          typeFilter="image"
          title={`เลือกรูป — ${label}`}
          onSelect={(rows) => {
            const key = rows[0]?.r2_key;
            if (key) onChange({ kind: "image", key });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
