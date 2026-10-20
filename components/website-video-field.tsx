"use client";

/**
 * 🎬 ช่อง "ไฟล์คลิป" (ชนิด videoFile ใน schema เว็บ) — อัปโหลดวิดีโอเอง แล้วเก็บ r2 key
 *
 * - ไฟล์ ≤ 4 MB ส่งผ่าน ERP ทันที · ไฟล์ใหญ่ ≤ 200 MB ส่งตรงเข้า R2 (มีแถบ %) — ของกลาง lib/media-upload (ตัวเดียวกับ MediaUploadField)
 *   ⚠️ ไฟล์ใหญ่ต้องตั้ง CORS ของ bucket R2 ก่อน (docs/website-video.md) — ยังไม่ตั้ง = ขึ้นข้อความบอกวิธี ไม่พังเงียบ
 * - ลากไฟล์มาวางได้ (ของกลาง useFileDrop) · ดูคลิปที่อัปแล้วได้ในช่อง · เปลี่ยน / เอาออก
 * - 📁 เลือกจากคลัง (ของกลาง AssetPicker หน้าวิดีโอ) — คลิปที่อัปที่ไหนก็อยู่ในคลัง ใช้ซ้ำได้ทุกร้าน/ทุก Section
 */
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/toast";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { MediaUploadError, normalizeMediaFile, uploadMediaFile, type UploadHandle } from "@/lib/media-upload";

const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

const TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

export function WebsiteVideoField({
  value,
  onChange,
  slot,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  /** ชื่อช่อง (เช่น "🖥 คลิปสำหรับคอม") โชว์ในกรอบว่างด้วย — เลื่อนจนหัวข้อหลุดจอก็ยังรู้ว่าเป็นช่องไหน */
  slot?: string;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<UploadHandle | null>(null);
  const [busy, setBusy] = useState<{ name: string; pct: number | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    // ชนิดจริงจากหัวไฟล์ (บางเครื่องส่ง MP4 มาไม่บอกชนิด)
    const file = await normalizeMediaFile(picked);
    setProblem(null);
    if (!TYPES.includes(file.type)) return toast.error("รับเฉพาะไฟล์วิดีโอ MP4 / WebM / MOV");
    if (file.type === "video/quicktime") toast.warning("ไฟล์ .MOV บางไฟล์เล่นบน Chrome/Android ไม่ได้ — แนะนำแปลงเป็น MP4 (H.264)");
    setBusy({ name: file.name, pct: null });
    try {
      const key = await uploadMediaFile(file, {
        folder: "storefront-videos",
        onStart: (h) => (xhrRef.current = h),
        onProgress: (pct) => setBusy({ name: file.name, pct }),
        onNotice: (m) => toast.info(m),
      });
      onChange(key);
      toast.success("อัปโหลดคลิปแล้ว — กดบันทึก/เผยแพร่เพื่อขึ้นเว็บ");
    } catch (e) {
      const err = e instanceof MediaUploadError ? e : null;
      if (err?.code === "aborted") toast.info(err.message);
      else if (err?.code === "blocked") setProblem(`${err.message} หรือลิงก์ YouTube`);
      else toast.error(err?.message || "อัปโหลดไม่สำเร็จ");
    } finally {
      xhrRef.current = null;
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const drop = useFileDrop((files) => void upload(files[0]), {
    accept: "video/",
    disabled: !!busy,
    onReject: () => toast.error("ลากมาได้เฉพาะไฟล์วิดีโอ"),
    onBusy: () => toast.warning("กำลังอัปโหลดอยู่ — รอสักครู่"),
  });

  return (
    <div {...drop.zone("v")} className="relative space-y-2">
      <FileDropHint show={drop.over === "v"} label="วางคลิปเพื่ออัปโหลด" />
      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      {value ? (
        <video key={value} src={url(value)} className="w-full max-h-52 rounded-lg bg-black" controls muted playsInline preload="metadata" />
      ) : (
        !busy && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center hover:border-blue-400"
          >
            <span className="text-2xl">🎬</span>
            {slot && <span className="text-xs font-semibold text-blue-700">{slot} · ยังไม่มีคลิป</span>}
            <span className="text-sm font-medium text-slate-700">ลากคลิปมาวาง หรือกดเลือกไฟล์</span>
            <span className="text-[11px] text-slate-400">MP4 / WebM / MOV · ใหญ่สุด 200 MB · อัปแล้วเข้าคลังให้เอง</span>
          </button>
        )
      )}
      {!value && !busy && (
        <button type="button" onClick={() => setPickerOpen(true)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-blue-400">
          📁 เลือกคลิปจากคลัง
        </button>
      )}

      {busy && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs text-blue-800">
            <span className="truncate">⬆ กำลังอัปโหลด {busy.name}{busy.pct != null ? ` · ${busy.pct}%` : "…"}</span>
            {xhrRef.current && (
              <button type="button" onClick={() => xhrRef.current?.abort()} className="shrink-0 text-red-600 hover:underline">
                ยกเลิก
              </button>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div className={`h-full bg-blue-500 transition-all ${busy.pct == null ? "w-1/3 animate-pulse" : ""}`} style={busy.pct != null ? { width: `${busy.pct}%` } : undefined} />
          </div>
        </div>
      )}

      {problem && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">⚠️ {problem}</p>}

      {value && !busy && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:border-blue-400">
            ⬆ เปลี่ยนคลิป
          </button>
          <button type="button" onClick={() => setPickerOpen(true)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:border-blue-400">
            📁 เลือกจากคลัง
          </button>
          <button type="button" onClick={() => onChange(null)} className="text-rose-500 hover:underline">
            เอาออก
          </button>
          <span className="text-[11px] text-slate-400">หรือลากคลิปใหม่มาวางที่ช่องนี้</span>
        </div>
      )}
      {pickerOpen && (
        <AssetPicker
          open
          onClose={() => setPickerOpen(false)}
          typeFilter="video"
          title="เลือกคลิปจากคลัง"
          onSelect={(rows) => {
            const key = rows[0]?.r2_key;
            if (key) {
              setProblem(null);
              onChange(key);
              toast.success("เลือกคลิปแล้ว — กดบันทึก/เผยแพร่เพื่อขึ้นเว็บ");
            }
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
