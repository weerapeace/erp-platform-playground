"use client";
/**
 * MediaUploadField — อัปโหลด "รูป หรือ วิดีโอสั้น" ช่องเดียว (ของกลาง)
 * --------------------------------------------------------------------------
 * - รูป: อัปโหลด / เลือกจากคลัง (AssetPicker) · วิดีโอ: MP4/WebM (เล่นได้ทุกเครื่อง)
 * - ขนาด: ≤ 4 MB ส่งผ่าน ERP ทันที · ใหญ่กว่านั้น (วิดีโอ ≤ 200 MB · รูป ≤ 20 MB) ส่งตรงเข้า R2 มีแถบ % + ยกเลิกได้
 *   (ของกลาง lib/media-upload · ⚠️ ไฟล์ใหญ่ต้องเปิด CORS ของ bucket ก่อน 1 ครั้ง — ยังไม่เปิด = ขึ้นข้อความบอกวิธี)
 * - พรีวิวในช่อง: รูป = ภาพ · วิดีโอ = เล่นเอง เงียบ วนซ้ำ
 * - 📥 ลากรูป/วิดีโอจากเครื่องมาวางในช่องได้ (ของกลาง useFileDrop · หลายไฟล์ = ใช้ไฟล์แรก)
 * ใช้: <MediaUploadField label value={{kind,key}} onChange={(m) => …} allowVideo />
 */
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/toast";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { MediaUploadError, uploadMediaFile, type UploadHandle } from "@/lib/media-upload";

const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

export interface MediaValue { kind: "image" | "video"; key: string }

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
  /** กำลังอัปโหลด · pct = ไฟล์ใหญ่ (มีแถบ %) · null = ไฟล์เล็ก (รอสั้น ๆ) */
  const [busy, setBusy] = useState<{ pct: number | null } | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const upload = async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    if (isVideo && !allowVideo) return toast.error("ช่องนี้รับเฉพาะรูป");
    if (file.type === "video/quicktime") toast.warning("ไฟล์ .MOV บางไฟล์เล่นบน Chrome/Android ไม่ได้ — แนะนำแปลงเป็น MP4 (H.264)");
    setProblem(null);
    setBusy({ pct: null });
    try {
      const key = await uploadMediaFile(file, {
        folder,
        onStart: (h) => (handleRef.current = h),
        onProgress: (pct) => setBusy({ pct }),
      });
      onChange({ kind: isVideo ? "video" : "image", key });
      toast.success("อัปโหลดแล้ว");
    } catch (e) {
      const err = e instanceof MediaUploadError ? e : null;
      if (err?.code === "aborted") toast.info(err.message);
      else if (err?.code === "blocked") setProblem(err.message);
      else toast.error(err?.message ?? "เชื่อมต่อไม่ได้");
    } finally {
      handleRef.current = null;
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const drop = useFileDrop((files) => void upload(files[0]), {
    accept: allowVideo ? ["image/", "video/"] : "image/",
    disabled: !!busy,
    onReject: () => toast.error(allowVideo ? "ลากมาได้เฉพาะรูป หรือวิดีโอ MP4/WebM" : "ช่องนี้รับเฉพาะรูป"),
    onBusy: () => toast.warning("กำลังอัปโหลดอยู่ — รอสักครู่แล้วลากใหม่"),
  });

  return (
    <div {...drop.zone("field")} className="relative">
      <FileDropHint show={drop.over === "field"} label={`วาง${allowVideo ? "รูป/วิดีโอ" : "รูป"}เพื่ออัปโหลด — ${label}`} />
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
            <span className="text-center leading-snug px-1">
              ยังไม่มี
              <br />
              <span className="text-[10px] text-slate-300">ลาก{allowVideo ? "รูป/วิดีโอ" : "รูป"}มาวางได้</span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <input ref={inputRef} type="file" accept={allowVideo ? "image/*,video/mp4,video/webm" : "image/*"} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" disabled={!!busy} onClick={() => inputRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:border-blue-400 disabled:opacity-50">
            {busy ? (busy.pct != null ? `กำลังอัปโหลด ${busy.pct}%` : "กำลังอัปโหลด…") : allowVideo ? "⬆ อัปโหลดรูป/วิดีโอ" : "⬆ อัปโหลดรูป"}
          </button>
          {busy?.pct != null && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${busy.pct}%` }} />
              </div>
              <button type="button" onClick={() => handleRef.current?.abort()} className="shrink-0 text-[11px] text-rose-500 hover:underline">
                ยกเลิก
              </button>
            </div>
          )}
          <button type="button" onClick={() => setPickerOpen(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400">🖼 เลือกรูปจากคลัง</button>
          {value && <button type="button" onClick={() => onChange(null)} className="text-[11px] text-rose-500 hover:underline text-left">เอาออก</button>}
          {hint && <p className="text-[10px] text-slate-400 leading-snug">{hint}</p>}
          {problem && <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">⚠️ {problem}</p>}
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
