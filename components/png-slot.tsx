"use client";

/**
 * 🖼 PngSlot — ช่องใหญ่ใส่รูป PNG พื้นใส (ของกลาง)
 *
 * ใช้ใน: Parent SKU คอลัมน์ซ้ายใต้รูปสินค้า (config.sideImageSlots ของ MasterCRUD) · ตัวจัดหน้าเว็บ แผง "🖼 รูป PNG ของสินค้า" (การ์ดบนฉาก)
 * ทำได้: ลากรูปมาวาง · คลิกเลือก · วาง (Ctrl+V) · เปลี่ยน · เอาออก (ถามยืนยันก่อน)
 * พื้นตารางหมากรุก = เห็นทันทีว่าพื้นใสจริงไหม · รับเฉพาะ PNG/WebP · รูปไม่มีพื้นใส = บันทึกได้แต่เตือน
 * บันทึกทันทีผ่าน onSave(key) — ผู้ใช้ส่งที่บันทึกเอง (ทั้ง 2 ที่ใช้ /api/website/product-png: สิทธิ์ + audit + ล้างแคชเว็บ)
 * อัปโหลดไฟล์ผ่าน /api/admin/upload (สิทธิ์ files.upload · ไม่แปลงไฟล์ = ความใสอยู่ครบ)
 * ห้ามใช้: รูปทั่วไปที่ไม่ต้องใสพื้น → ใช้ ImageInput / ImageManager
 */
import { useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useFileUploadAccess } from "@/components/upload-permission";
import { ConfirmDialog } from "@/components/modal";

const ACCEPT = "image/png,image/webp";
/** พื้นตารางหมากรุก (เห็นส่วนที่ใส) */
const CHECKER: React.CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage: "conic-gradient(#e8ecf1 25%, transparent 0 50%, #e8ecf1 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

/** r2 key | URL → ลิงก์รูปย่อ */
export function pngSlotUrl(v: string | null | undefined, w = 480): string | null {
  if (!v) return null;
  if (/^https?:\/\//.test(v) || v.startsWith("/")) return v;
  return `/api/r2-image?key=${encodeURIComponent(v)}&w=${w}`;
}

/** มีพิกเซลใส/โปร่งไหม (ย่อเหลือ 64px ก่อนตรวจ) · อ่านไม่ได้ = null */
async function hasTransparency(file: File): Promise<boolean | null> {
  try {
    const bmp = await createImageBitmap(file);
    const w = 64;
    const h = Math.max(1, Math.round((64 * bmp.height) / Math.max(1, bmp.width)));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  } catch {
    return null;
  }
}

export function PngSlot({
  value,
  onSave,
  label,
  hint,
  ghost,
  caption,
  size = "lg",
  readonly,
}: {
  /** r2 key หรือ URL ของรูปตอนนี้ · null = ยังไม่มี */
  value: string | null;
  /** บันทึกค่าใหม่ (null = เอาออก) → คืนข้อความผิดพลาด หรือ null = สำเร็จ */
  onSave: (key: string | null) => Promise<string | null>;
  label?: string;
  hint?: string;
  /** รูปจาง ๆ ในช่องว่าง (เช่น รูปสินค้าปกติ) ให้รู้ว่าช่องนี้ของสินค้าไหน */
  ghost?: string | null;
  /** ใต้ช่อง (เช่น รหัส + ชื่อสินค้า) */
  caption?: ReactNode;
  /** lg = ช่องใหญ่ (หน้าสินค้า) · md = ช่องในตาราง (แผงหลายสินค้า) */
  size?: "lg" | "md";
  readonly?: boolean;
}) {
  const [busy, setBusy] = useState<"" | "upload" | "save">("");
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadDisabled, uploadDeniedMessage } = useFileUploadAccess(readonly);
  const url = pngSlotUrl(value, size === "lg" ? 640 : 320);
  const md = size === "md";
  const locked = !!readonly || !!busy;

  const handleFile = async (file: File) => {
    if (uploadDisabled) return setErr(uploadDeniedMessage ?? "อัปโหลดไม่ได้");
    if (!/^image\/(png|webp)$/.test(file.type)) return setErr("ต้องเป็นไฟล์ PNG พื้นใส (หรือ WebP)");
    setErr(null);
    setWarn(null);
    setBusy("upload");
    try {
      const clear = await hasTransparency(file);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "parent-skus/png");
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error || !j.r2_key) return setErr(j.error || "อัปโหลดไม่สำเร็จ");
      setBusy("save");
      const e = await onSave(String(j.r2_key));
      if (e) return setErr(e);
      if (clear === false) setWarn("รูปนี้ไม่มีพื้นใส — บนการ์ดจะเห็นเป็นกล่องสี่เหลี่ยม");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const remove = async () => {
    setAskRemove(false);
    setBusy("save");
    setErr(null);
    setWarn(null);
    const e = await onSave(null).catch((x: unknown) => (x instanceof Error ? x.message : "เอาออกไม่สำเร็จ"));
    setBusy("");
    if (e) setErr(e);
  };
  const pick = () => !locked && !uploadDisabled && fileRef.current?.click();

  return (
    <div className="min-w-0">
      {label && (
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          {value ? <span className="rounded bg-emerald-50 px-1.5 text-[10px] text-emerald-700">✓ มีแล้ว</span> : <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">ยังไม่มี</span>}
        </div>
      )}
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-label={value ? `เปลี่ยนรูป PNG${label ? ` ${label}` : ""}` : `ใส่รูป PNG${label ? ` ${label}` : ""}`}
        onClick={() => !value && pick()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
        onPaste={(e) => {
          if (locked) return;
          const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
          if (f) {
            e.preventDefault();
            void handleFile(f);
          }
        }}
        onDragOver={(e) => {
          if (locked) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (locked) return;
          const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
          if (f) void handleFile(f);
        }}
        className={`group relative aspect-square w-full overflow-hidden rounded-xl border-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange-200 ${
          over ? "border-orange-400" : value ? "border-slate-200" : "cursor-pointer border-dashed border-slate-300 hover:border-orange-300"
        }`}
        style={CHECKER}
        title={readonly ? undefined : "ลากรูป PNG มาวาง · คลิกเลือก · วาง (Ctrl+V)"}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label ?? "PNG"} className="absolute inset-0 h-full w-full object-contain p-[6%]" draggable={false} />
        ) : (
          <>
            {ghost && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ghost} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale" draggable={false} />
            )}
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-slate-500">
              <span className={md ? "text-xl leading-none" : "text-3xl leading-none"}>＋</span>
              <span className={`${md ? "text-[10px]" : "text-xs"} font-medium`}>{readonly ? "ยังไม่มีรูป PNG" : md ? "ลาก PNG มาวาง" : "ลากรูป PNG มาวาง"}</span>
              {!md && !readonly && <span className="text-[10px] text-slate-400">คลิกเลือก · วาง (Ctrl+V) · พื้นใสเท่านั้น</span>}
            </span>
          </>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-medium text-slate-600">
            {busy === "upload" ? "กำลังอัปโหลด…" : "กำลังบันทึก…"}
          </span>
        )}
        {value && !readonly && !busy && (
          <span className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <button type="button" onClick={pick} className="rounded-md border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[10px] shadow-sm hover:bg-slate-50" title="เปลี่ยนรูป">
              📷{md ? "" : " เปลี่ยน"}
            </button>
            <button type="button" onClick={() => setAskRemove(true)} className="rounded-md border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[10px] text-rose-600 shadow-sm hover:bg-rose-50" title="เอารูป PNG ออก">
              ✕{md ? "" : " เอาออก"}
            </button>
          </span>
        )}
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
      </div>
      {caption && <div className="mt-1 min-w-0">{caption}</div>}
      {hint && !err && !warn && <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>}
      {warn && <p className="mt-1 text-[11px] leading-snug text-amber-600">⚠ {warn}</p>}
      {err && <p className="mt-1 text-[11px] leading-snug text-rose-600">{err}</p>}
      <ConfirmDialog
        open={askRemove}
        onClose={() => setAskRemove(false)}
        onConfirm={() => void remove()}
        title="เอารูป PNG ออก?"
        message="สินค้านี้จะไม่โชว์ใน Section การ์ดบนฉาก จนกว่าจะใส่รูป PNG ใหม่ (ไฟล์รูปเดิมไม่ถูกลบ)"
        confirmText="เอาออก"
        variant="danger"
      />
    </div>
  );
}
