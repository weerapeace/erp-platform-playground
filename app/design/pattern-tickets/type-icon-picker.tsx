"use client";

/**
 * ตัวเลือกไอคอนประเภทงาน (ใช้ในป๊อปเปลี่ยนไอคอนบนแผ่น + หน้าตั้งค่าประเภทงาน)
 *   แท็บ: มาตรฐาน (Lottie ขยับได้ · lib/lottie-library) · ไอคอนเส้น · อัปโหลดเอง (PNG/JPG/WEBP/GIF/Lottie .json → R2 folder pattern-icons)
 *   ไม่บันทึกเอง — คืนค่าที่เลือกผ่าน onChange (ผู้เรียกกดบันทึก)
 */
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useLang, useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { MediaUploadError, uploadMediaFile } from "@/lib/media-upload";
import { LOTTIE_LIBRARY, lottieLibraryKey, lottieLibraryValue } from "@/lib/lottie-library";
import { PATTERN_ICON_FOLDER, typeColorCls, typeIconKind, typeIconSize } from "@/lib/pattern-tickets";

const LINE_ICONS = ["scissors", "layout-grid", "needle-thread", "needle", "brush", "bolt", "ruler-measure", "flower", "circle-check", "package", "pencil", "camera", "file-text", "tag", "palette", "color-swatch", "stack-2", "shirt", "hanger", "tool", "dots-vertical"];
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
const isLottieFile = (f: File) => f.type === "application/json" || /\.json$/i.test(f.name);

type Tab = "library" | "line" | "upload";

/** กรอบตัวอย่างไอคอน (สีพื้นตามประเภท · รูปอัปเองพื้นเทาอ่อน) */
export function TypeIconBox({ value, color, box }: { value: string; color: string; box: number }) {
  const kind = typeIconKind(value);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${kind === "uploaded" ? "bg-slate-50" : typeColorCls(color)}`}
      style={{ width: box, height: box, fontSize: Math.round(box / 2) }}>
      <Icon value={value} size={typeIconSize(value, box)} />
    </span>
  );
}

export function TypeIconPicker({ value, color, defaultValue, onChange, onBusy }: {
  value: string;
  color: string;
  /** ค่าตั้งต้นของประเภท (ปุ่ม "กลับเป็นไอคอนเดิม") */
  defaultValue?: string;
  onChange: (v: string) => void;
  /** แจ้งว่ากำลังอัปโหลด (ผู้เรียกปิดปุ่มบันทึกระหว่างนี้) */
  onBusy?: (busy: boolean) => void;
}) {
  const t = useT();
  const isEn = useLang().lang === "en";
  const toast = useToast();
  const kind = typeIconKind(value);
  const [tab, setTab] = useState<Tab>(kind === "uploaded" ? "upload" : kind === "line" ? "line" : "library");
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const libKey = lottieLibraryKey(value);

  const upload = async (file: File) => {
    if (!IMAGE_TYPES.test(file.type) && !isLottieFile(file)) { toast.warning(t("ใช้รูป PNG / JPG / WEBP / GIF หรือไฟล์ Lottie (.json)", "Use a PNG / JPG / WEBP / GIF image or a Lottie (.json) file")); return; }
    setUp({ name: file.name, size: file.size, pct: null }); onBusy?.(true);
    try {
      const key = await uploadMediaFile(file, { folder: PATTERN_ICON_FOLDER, onProgress: (pct) => setUp((u) => u && { ...u, pct }) });
      onChange(`img:${key}`);
    } catch (e) {
      if (!(e instanceof MediaUploadError && e.code === "aborted")) toast.error(t(`อัปโหลดไม่สำเร็จ: ${(e as Error).message}`, `Upload failed: ${(e as Error).message}`));
    } finally {
      setUp(null); onBusy?.(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const tabBtn = (k: Tab, th: string, en: string) => (
    <button key={k} type="button" onClick={() => setTab(k)}
      className={`rounded-full border px-3 py-1 text-xs ${tab === k ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{t(th, en)}</button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <TypeIconBox value={value} color={color} box={64} />
        <div className="min-w-0 text-xs text-slate-500">
          <div>{kind === "library" ? t("ไอคอนมาตรฐาน (ขยับเมื่อเอาเมาส์ชี้)", "Standard icon (animates on hover)") : kind === "uploaded" ? t("รูปที่อัปโหลด", "Uploaded image") : t("ไอคอนเส้น", "Line icon")}</div>
          {defaultValue && value !== defaultValue && (
            <button type="button" onClick={() => onChange(defaultValue)} className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline">
              <Icon name="refresh" /> {t("กลับเป็นไอคอนเดิม", "Reset to default")}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tabBtn("library", "มาตรฐาน (ขยับได้)", "Standard (animated)")}
        {tabBtn("line", "ไอคอนเส้น", "Line icons")}
        {tabBtn("upload", "อัปโหลดเอง", "Upload")}
      </div>

      {tab === "library" && (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {LOTTIE_LIBRARY.map((x) => (
            <button key={x.key} type="button" onClick={() => onChange(lottieLibraryValue(x.key))} title={isEn ? x.en : x.th}
              className={`flex flex-col items-center gap-0.5 rounded-lg border p-1.5 ${libKey === x.key ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
              <Icon value={lottieLibraryValue(x.key)} size={32} />
              <span className="w-full truncate text-center text-[10px] text-slate-500">{isEn ? x.en : x.th}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "line" && (
        <div className="flex flex-wrap gap-1.5">
          {LINE_ICONS.map((k) => (
            <button key={k} type="button" onClick={() => onChange(`i:${k}`)} title={k}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl text-slate-600 ${value === `i:${k}` ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 hover:border-slate-300"}`}>
              <Icon value={`i:${k}`} />
            </button>
          ))}
        </div>
      )}

      {tab === "upload" && (
        <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center">
          {up ? <UploadProgress {...up} /> : (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="upload" /> {t("เลือกไฟล์ไอคอน", "Choose icon file")}
            </button>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            {t("รูปสี่เหลี่ยมจัตุรัส พื้นใส (PNG) · ไอคอนขยับ: Lottie (.json) จาก Lordicon / LottieFiles หรือ GIF", "Square image with a transparent background (PNG) · animated: Lottie (.json) from Lordicon / LottieFiles, or GIF")}
          </p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </div>
      )}
    </div>
  );
}
