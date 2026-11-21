"use client";

/**
 * 📷 PhotoCapture — ถ่ายรูปจากมือถือ/กล้องเว็บ ใส่ช่องอัปรูป (ของกลาง · เจ้าของขอ 2026-11-21)
 * --------------------------------------------------------------------------
 * มือถือ/แท็บเล็ต (ดูจาก "ชนิดตัวชี้" ไม่ใช่ความกว้างจอ — lib/use-can-hover):
 *   [ถ่ายรูป] = เปิดแอปกล้องของเครื่องตรง (input capture="environment") · [เลือกจากคลัง] = คลังรูป/ไฟล์
 *   + ลิงก์เล็ก "กล้องในเว็บ" (มีเส้นกริดช่วยถ่ายตรง · ถ่ายต่อเนื่อง) — web-camera.tsx
 * PC: หน้าตาเดิมทุกอย่าง (ลาก/วาง/Ctrl+V ของช่องเดิม) · ถ้าเครื่องมีเว็บแคม → ลิงก์เล็ก "ถ่ายจากเว็บแคม"
 *
 * หลังถ่าย → ถาด "ตรวจรูปก่อนใส่": ถ่ายอีกรูป (ต่อเนื่อง) · ครอป/หมุน (ImageFreeCropModal) · ดัดให้ตรง 4 มุม (straighten-modal)
 *   · ลบ (กดย้อนกลับได้) → กด "ใส่ N รูป" → ย่อรูปให้ด้านยาว ≤ maxSide (ค่าเริ่ม 2400px · ประหยัดเน็ต) → onFiles(files)
 * รูปจากคลัง = ย่อแล้วส่งทันที (ไม่ผ่านถาด) · PDF/GIF/ไฟล์อื่นส่งตามเดิมไม่ย่อ
 * ไม่อัปโหลดเอง — ผู้เรียกอัปตามทางเดิม (แถบ UploadProgress ของช่องนั้นทำงานเหมือนเดิม)
 *
 *   const cap = usePhotoCapture({ onFiles: (fs) => handleFiles(fs) });
 *   <PhotoCaptureButtons capture={cap} />   … {cap.ui}
 *   หรือรวมในตัว: <PhotoCapture onFiles={…} />
 * ใช้แล้วที่: กล่องรูปแผงผ้า Swatch · ImageAttach / ImageAttachKeys · FileInput · FileMultiInput — docs/photo-capture.md
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { useCanHover } from "@/lib/use-can-hover";
import { ImageFreeCropModal } from "@/components/image-crop-picker";
import { prepareResizedImage } from "@/components/image-attach";
import { StraightenModal } from "./straighten-modal";
import { WebCameraModal } from "./web-camera";

export type PhotoCaptureOptions = {
  onFiles: (files: File[]) => void | Promise<void>;
  /** รับหลายรูป (ค่าเริ่ม true) · false = ถาดเก็บรูปเดียว ถ่ายใหม่ = แทนรูปเดิม */
  multiple?: boolean;
  /** ย่อรูปให้ด้านยาว ≤ ค่านี้ก่อนส่ง (px) · 0 = ไม่ย่อ */
  maxSide?: number;
  /** accept ของปุ่ม "เลือกจากคลัง" (ค่าเริ่ม image/*) — ช่องที่รับ PDF ด้วยส่งของตัวเอง */
  libraryAccept?: string;
  disabled?: boolean;
  /** กล้องที่เปิด: environment = กล้องหลัง (ค่าเริ่ม) · user = กล้องหน้า (รูปโปรไฟล์) */
  facing?: "environment" | "user";
  /** ชั้นของหน้าต่าง (ถาด/กล้อง/ครอป) — ใช้เมื่อเปิดจากป๊อปที่ทำเองซึ่งสูงกว่า z-50 (เช่น โอนเงินจีน z-210) */
  zIndex?: number;
};

type TrayItem = { id: string; file: File; url: string };
let seq = 0;
const isResizable = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/** ย่อรูปก่อนส่ง (ไฟล์ที่ย่อไม่ได้ = ส่งตัวเดิม) */
async function shrink(files: File[], maxSide: number): Promise<File[]> {
  if (!maxSide) return files;
  const out: File[] = [];
  for (const f of files) {
    if (!isResizable(f)) { out.push(f); continue; }
    try { out.push(await prepareResizedImage(f, maxSide)); } catch { out.push(f); }
  }
  return out;
}

export function usePhotoCapture(o: PhotoCaptureOptions) {
  const { multiple = true, maxSide = 2400, libraryAccept = "image/*", disabled, facing = "environment", zIndex } = o;
  const toast = useToast();
  const canHover = useCanHover();
  const touch = !canHover;
  const [hasWebcam, setHasWebcam] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [webOpen, setWebOpen] = useState(false);
  const [lastSrc, setLastSrc] = useState<"native" | "web">("native");
  const [cropId, setCropId] = useState<string | null>(null);
  const [straightId, setStraightId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const onFilesRef = useRef(o.onFiles); onFilesRef.current = o.onFiles;

  // PC: มีเว็บแคมไหม (ไม่ขอสิทธิ์ — แค่นับอุปกรณ์) · มือถือมีกล้องอยู่แล้วไม่ต้องเช็ก
  useEffect(() => {
    if (touch || !navigator.mediaDevices?.enumerateDevices) return;
    let alive = true;
    navigator.mediaDevices.enumerateDevices()
      .then((ds) => { if (alive) setHasWebcam(ds.some((d) => d.kind === "videoinput")); })
      .catch(() => {});
    return () => { alive = false; };
  }, [touch]);

  // คืนหน่วยความจำรูปในถาดตอนปิด
  const trayRef = useRef(tray); trayRef.current = tray;
  useEffect(() => () => trayRef.current.forEach((t) => URL.revokeObjectURL(t.url)), []);

  const addToTray = (files: File[], src: "native" | "web") => {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!imgs.length) return;
    setLastSrc(src);
    const items = imgs.map((file) => ({ id: `ph${++seq}`, file, url: URL.createObjectURL(file) }));
    setTray((t) => {
      if (multiple) return [...t, ...items];
      t.forEach((x) => URL.revokeObjectURL(x.url));
      return items.slice(0, 1);
    });
    setTrayOpen(true);
  };

  const closeTray = () => {
    tray.forEach((t) => URL.revokeObjectURL(t.url));
    setTray([]); setTrayOpen(false);
  };
  const send = async () => {
    if (!tray.length) return;
    setSending(true);
    try {
      const files = await shrink(tray.map((t) => t.file), maxSide);
      closeTray();
      await onFilesRef.current(files);
    } finally { setSending(false); }
  };
  const removeItem = (id: string) => {
    const i = tray.findIndex((t) => t.id === id);
    if (i < 0) return;
    const it = tray[i];
    setTray((t) => t.filter((x) => x.id !== id));
    toast.undo("เอารูปออกแล้ว", () => setTray((t) => { const n = [...t]; n.splice(Math.min(i, n.length), 0, it); return n; }));
  };
  const replaceItem = (id: string, blob: Blob) => {
    setTray((t) => t.map((x) => {
      if (x.id !== id) return x;
      URL.revokeObjectURL(x.url);
      const file = new File([blob], x.file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      return { ...x, file, url: URL.createObjectURL(file) };
    }));
  };

  const openCamera = () => { if (!disabled) camRef.current?.click(); };
  const openLibrary = () => { if (!disabled) libRef.current?.click(); };
  const openWebCamera = () => { if (!disabled) setWebOpen(true); };
  const again = () => (lastSrc === "web" ? openWebCamera() : openCamera());

  const cropItem = tray.find((t) => t.id === cropId) ?? null;
  const straightItem = tray.find((t) => t.id === straightId) ?? null;

  const ui: ReactNode = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture={facing} className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; addToTray(f, "native"); }} />
      <input ref={libRef} type="file" accept={libraryAccept} multiple={multiple} className="hidden"
        onChange={async (e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) await onFilesRef.current(await shrink(f, maxSide)); }} />
      <WebCameraModal open={webOpen} onClose={() => setWebOpen(false)} multiple={multiple} initialFacing={facing} zIndex={zIndex} onShots={(fs) => addToTray(fs, "web")} />
      <ERPModal open={trayOpen} onClose={closeTray} title={`ตรวจรูปก่อนใส่ (${tray.length})`} size="lg" loading={sending} zIndex={zIndex}
        hasUnsavedChanges={tray.length > 0} closeOnBackdrop={false}
        description="ครอป หมุน หรือดัดรูปเอียงให้ตรงได้ก่อน — กด ใส่รูป แล้วระบบย่อรูปให้อัตโนมัติก่อนส่ง"
        footer={
          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
            <button type="button" onClick={again} disabled={sending}
              className="h-10 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"><Icon name="camera" /> {multiple ? "ถ่ายอีกรูป" : "ถ่ายใหม่"}</button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={closeTray} className="h-10 px-3 text-sm rounded-lg text-slate-600 hover:bg-slate-100">ยกเลิก</button>
              <button type="button" onClick={() => void send()} disabled={sending || !tray.length}
                className="h-10 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{sending ? "กำลังย่อรูป…" : `ใส่ ${tray.length} รูป`}</button>
            </div>
          </div>
        }>
        {tray.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีรูป — กด ถ่ายอีกรูป</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tray.map((t, i) => (
              <div key={t.id} className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                <div className="relative bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.url} alt="" className="w-full h-48 object-contain" />
                  <span className="absolute left-1.5 top-1.5 text-[11px] px-1.5 rounded bg-slate-900/70 text-white">รูป {i + 1}</span>
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <button type="button" onClick={() => setCropId(t.id)} className="flex-1 h-9 text-[12.5px] rounded-md border border-slate-200 hover:bg-slate-50">ครอป / หมุน</button>
                  <button type="button" onClick={() => setStraightId(t.id)} className="flex-1 h-9 text-[12.5px] rounded-md border border-slate-200 hover:bg-slate-50">ดัดให้ตรง</button>
                  <button type="button" onClick={() => removeItem(t.id)} aria-label="เอารูปนี้ออก" className="w-9 h-9 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"><Icon name="delete" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ERPModal>
      {cropItem && (
        <ImageFreeCropModal open src={cropItem.url} onClose={() => setCropId(null)} maxSide={maxSide || 4000} zIndex={zIndex ? zIndex + 1 : undefined}
          onDone={(r) => replaceItem(cropItem.id, r.blob)} />
      )}
      {straightItem && (
        <StraightenModal open src={straightItem.url} onClose={() => setStraightId(null)} maxSide={maxSide || 4000} zIndex={zIndex ? zIndex + 1 : undefined}
          onDone={(r) => replaceItem(straightItem.id, r.blob)} />
      )}
    </>
  );

  return {
    /** อุปกรณ์จอสัมผัส (มือถือ/แท็บเล็ต) — โชว์ปุ่มถ่ายรูป */
    touch,
    /** PC ที่มีเว็บแคม */
    hasWebcam,
    openCamera, openLibrary, openWebCamera,
    /** มีหน้าต่างของตัวนี้เปิดอยู่ (หน้าที่เป็น overlay เต็มจอเองต้องถอยลงให้ — เช่น Swatch viewer) */
    overlayOpen: trayOpen || webOpen || !!cropId || !!straightId,
    /** ต้อง render ไว้ในหน้า (ช่องเลือกไฟล์ที่ซ่อน + หน้าต่างถาด/กล้อง/ครอป) */
    ui,
  };
}

export type PhotoCaptureApi = ReturnType<typeof usePhotoCapture>;

/** แปลง File[] เป็น FileList (หน้าเก่าที่ตัวรับไฟล์ต้องการ FileList) */
export function toFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
}

/** ปุ่มถ่ายรูป/เลือกจากคลัง (เฉพาะจอสัมผัส) · PC มีเว็บแคม = ลิงก์เล็ก · PC ไม่มี = ไม่โชว์อะไร */
export function PhotoCaptureButtons({ capture, size = "md", libraryLabel = "เลือกจากคลัง", onLibrary, webLink = true, className = "" }: {
  capture: PhotoCaptureApi;
  size?: "sm" | "md";
  libraryLabel?: string;
  /** ใช้ตัวเลือกไฟล์ของช่องเอง (เช่น ช่องที่รับ PDF) แทนคลังรูปของตัวนี้ */
  onLibrary?: () => void;
  /** โชว์ลิงก์ "กล้องในเว็บ" */
  webLink?: boolean;
  className?: string;
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };
  if (!capture.touch) {
    if (!capture.hasWebcam || !webLink) return null;
    return (
      <button type="button" onClick={stop(capture.openWebCamera)} className={`text-[11px] text-slate-500 underline hover:text-blue-700 ${className}`}>
        <Icon name="camera" /> ถ่ายจากเว็บแคม
      </button>
    );
  }
  const h = size === "sm" ? "h-9 text-[13px]" : "h-11 text-sm";
  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={stop(capture.openCamera)}
          className={`${h} inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white font-medium active:bg-blue-700`}><Icon name="camera" /> ถ่ายรูป</button>
        <button type="button" onClick={stop(onLibrary ?? capture.openLibrary)}
          className={`${h} inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium active:bg-slate-50`}><Icon name="image" /> {libraryLabel}</button>
      </div>
      {webLink && (
        <button type="button" onClick={stop(capture.openWebCamera)} className="mt-1.5 text-[11px] text-slate-500 underline">
          หรือใช้กล้องในเว็บ (มีเส้นช่วยถ่ายตรง · ถ่ายต่อเนื่อง)
        </button>
      )}
    </div>
  );
}

/** รวมในตัว: ปุ่ม + หน้าต่างทั้งหมด */
export function PhotoCapture(props: PhotoCaptureOptions & { size?: "sm" | "md"; libraryLabel?: string; webLink?: boolean; className?: string }) {
  const cap = usePhotoCapture(props);
  return <>{<PhotoCaptureButtons capture={cap} size={props.size} libraryLabel={props.libraryLabel} webLink={props.webLink} className={props.className} />}{cap.ui}</>;
}

/**
 * ปุ่ม "ถ่ายรูป" ปุ่มเดียว (เฉพาะจอสัมผัส · PC ไม่โชว์อะไร) — วางข้างปุ่มเลือกรูปเดิมของหน้าได้ในบรรทัดเดียว
 * กด = เปิดกล้องของเครื่อง → ถาดตรวจรูป (ครอป/ดัดให้ตรง/ถ่ายต่อ) → onFiles
 */
export function CameraButton({ className = "", label = "ถ่ายรูป", ...o }: PhotoCaptureOptions & { className?: string; label?: string }) {
  const cap = usePhotoCapture(o);
  if (!cap.touch) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); cap.openCamera(); }} disabled={o.disabled}
        className={className || "inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-medium text-blue-700 disabled:opacity-50"}>
        <Icon name="camera" /> {label}
      </button>
      {cap.ui}
    </>
  );
}
