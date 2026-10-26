"use client";

/**
 * ✂️ ครอปรูปจากรูปสินค้า (ของกลาง) — เลือกรูป (จัดกลุ่มตาม SKU) → ลากกรอบ + ซูม → ได้รูปใหม่เฉพาะส่วนนั้น (อัปขึ้น R2)
 * --------------------------------------------------------------------------
 * - ซ้าย: กลุ่มรูป (เช่น SKU ละกลุ่ม · ป้าย "บนเว็บ") → กดรูปย่อเพื่อเลือก · 📤 อัปรูปอื่นมาครอปได้ (กลุ่ม "รูปที่อัปเอง")
 * - ขวา: ImageCropBox (กรอบสัดส่วน aspect · ลากกลางกรอบ = ย้าย · จับมุมลาก = ย่อ/ขยาย · หมุนลูกกลิ้งบนรูปก็ได้) + ตัวอย่างผลลัพธ์ (วงกลม/สี่เหลี่ยม)
 * - "ใช้ส่วนนี้" → ตัดพิกเซลจริงบน canvas (รูปจาก /api/r2-image โดเมนเดียวกัน) → อัปผ่าน /api/admin/upload → onDone(r2Key)
 * ใช้ที่: ทะเบียนสี (รูปลายจุดสี) · ใช้ได้กับงานอื่นที่ต้อง "ตัดส่วนหนึ่งของรูปสินค้า" (ไอคอน · ป้าย · พื้นผิว)
 * ข้อจำกัด: รูปต้องเป็น r2 key (โดเมนเดียวกัน) · ผลลัพธ์เป็น webp ขนาด outSize px (ด้านกว้าง)
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ImageCropBox, useImageSize, type CropValue } from "@/components/image-crop-box";
import { canvasBgWindow } from "@/lib/website-canvas";

export interface CropSourceGroup {
  key: string;
  /** หัวกลุ่ม เช่น รหัส SKU */
  label: string;
  /** บรรทัดรอง เช่น ชื่อสินค้า */
  sub?: string;
  /** ป้ายเล็กข้างหัวกลุ่ม เช่น "บนเว็บ" */
  badge?: string;
  /** r2 keys */
  images: string[];
}

const imgUrl = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
/** ซูมสูงสุด = กรอบเล็กสุด ≈ 1/20 ของรูป (5%) — ลายเล็ก ๆ ตัดได้ (เล็กกว่านี้มุมจับซ้อนกัน ลากยาก) */
const ZOOM_MAX = 2000;

/** ตัดส่วน win (สัดส่วนของรูป 0–1) ของรูป r2 → Blob webp กว้าง outW px */
export async function cropImageKey(key: string, win: { x: number; y: number; w: number; h: number }, outW: number, outH: number): Promise<Blob> {
  const img = new Image();
  // รูปใหญ่สุดที่ระบบย่อให้ (ไม่ขยายเกินต้นฉบับ) — กรอบเล็กมากก็ยังได้พิกเซลจริงพอ
  img.src = imgUrl(key, 3200);
  await img.decode();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, win.x * nw, win.y * nh, win.w * nw, win.h * nh, 0, 0, outW, outH);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/webp", 0.9));
}

/** ตัวอย่างผลลัพธ์ (วาดด้วย CSS จากกรอบเดียวกัน — ไม่ต้องตัดจริง) */
function CropPreview({ imageKey, win, size, round }: { imageKey: string; win: { x: number; y: number; w: number; h: number } | null; size: number; round?: boolean }) {
  return (
    <span className={`relative inline-block overflow-hidden bg-slate-100 shrink-0 ${round ? "rounded-full" : "rounded-md"}`} style={{ width: size, height: size, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }}>
      {win && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl(imageKey, 600)}
          alt=""
          className="absolute max-w-none pointer-events-none"
          style={{ width: `${100 / win.w}%`, height: `${100 / win.h}%`, left: `${(-win.x / win.w) * 100}%`, top: `${(-win.y / win.h) * 100}%` }}
        />
      )}
    </span>
  );
}

export function ImageCropPicker({
  open,
  onClose,
  onDone,
  groups,
  error,
  title = "✂️ ครอปจากรูปสินค้า",
  description = "เลือกรูปทางซ้าย → ลากกรอบไปตรงส่วนที่ต้องการ · จับมุมกรอบลากเพื่อย่อ/ขยาย (หรือหมุนลูกกลิ้งเมาส์บนรูป)",
  aspect = 1,
  outSize = 320,
  folder = "uploads",
  emptyText = "ยังไม่มีรูปให้เลือก",
}: {
  open: boolean;
  onClose: () => void;
  /** ได้ r2 key ของรูปที่ครอปแล้ว */
  onDone: (r2Key: string) => void;
  /** null = กำลังโหลด */
  groups: CropSourceGroup[] | null;
  error?: string | null;
  title?: string;
  description?: string;
  /** สัดส่วนกรอบ กว้าง/สูง (1 = จัตุรัส) */
  aspect?: number;
  /** ความกว้างรูปผลลัพธ์ (px) */
  outSize?: number;
  /** โฟลเดอร์ R2 ที่อัปขึ้น (/api/admin/upload) */
  folder?: string;
  emptyText?: string;
}) {
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropValue>({ x: 50, y: 50, zoom: 250 });
  const [busy, setBusy] = useState(false);
  const size = useImageSize(sel);
  const box = { w: aspect, h: 1 };
  const win = size ? canvasBgWindow(size, box, crop) : null;
  const wheelRef = useRef<HTMLDivElement>(null);
  // 📤 รูปที่อัปเองมาครอป (ไม่มีรูปที่ต้องการในรายการ) — ต่อท้ายเป็นกลุ่ม "รูปที่อัปเอง"
  const [own, setOwn] = useState<string[]>([]);
  const [upBusy, setUpBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const allGroups: CropSourceGroup[] | null = groups === null ? null : [...(own.length ? [{ key: "__own", label: "📤 รูปที่อัปเอง", images: own }] : []), ...groups];

  // เปิดมา → เลือกรูปแรกให้
  useEffect(() => {
    if (!open) return;
    const all = (allGroups ?? []).flatMap((g) => g.images);
    if (!sel || !all.includes(sel)) setSel(all[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups, own, sel]);

  const uploadSource = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("เลือกไฟล์รูปเท่านั้น");
      return;
    }
    setUpBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder", folder);
      fd.append("no_library", "1");
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.r2_key) {
        toast.error(j.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      setOwn((o) => [j.r2_key, ...o]);
      setSel(j.r2_key);
    } catch {
      toast.error("อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUpBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const uploadBtn = (
    <>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={upBusy} className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-2 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50">
        {upBusy ? "กำลังอัปโหลด…" : "📤 อัปรูปอื่นมาครอป"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void uploadSource(e.target.files?.[0])} />
    </>
  );

  // หมุนลูกกลิ้งบนรูป = ซูม (ต้องเป็น listener ไม่ passive ถึงกันหน้าเลื่อนได้)
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // ทีละ ~12% ของขนาดตอนนี้ (กรอบใหญ่/เล็กก็หมุนแล้วรู้สึกเท่ากัน)
      setCrop((c) => ({ ...c, zoom: Math.max(100, Math.min(ZOOM_MAX, Math.round(c.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, sel]);

  const use = async () => {
    if (!sel || !win) return;
    setBusy(true);
    try {
      const blob = await cropImageKey(sel, win, outSize, Math.round(outSize / aspect));
      const fd = new FormData();
      fd.append("file", new File([blob], "crop.webp", { type: "image/webp" }));
      fd.append("folder", folder);
      fd.append("no_library", "1");
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.r2_key) {
        toast.error(j.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      onDone(j.r2_key);
      onClose();
    } catch {
      toast.error("ครอปรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            ผลลัพธ์
            {sel && (
              <>
                <CropPreview imageKey={sel} win={win} size={56} round />
                <CropPreview imageKey={sel} win={win} size={22} round />
                <CropPreview imageKey={sel} win={win} size={56} />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            <button type="button" disabled={!sel || !win || busy} onClick={use} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? "กำลังครอป…" : "✂️ ใช้ส่วนนี้"}
            </button>
          </div>
        </div>
      }
    >
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">เกิดข้อผิดพลาดในการโหลดรูป ({error})</div>
      ) : allGroups === null ? (
        <div className="py-12 text-center text-sm text-slate-400">กำลังโหลดรูป…</div>
      ) : !allGroups.length ? (
        <div className="py-12 text-center text-sm text-slate-500 space-y-3">
          <p>{emptyText}</p>
          <div className="mx-auto max-w-[240px]">{uploadBtn}</div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-3 md:max-h-[60vh] overflow-y-auto pr-1">
            {uploadBtn}
            {allGroups.map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium text-slate-700 truncate">{g.label}</span>
                  {g.badge && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[10px] text-emerald-700">{g.badge}</span>}
                </div>
                {g.sub && <div className="text-[11px] text-slate-400 truncate">{g.sub}</div>}
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {g.images.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSel(k)}
                      className={`aspect-square overflow-hidden rounded-md border-2 bg-slate-100 ${sel === k ? "border-blue-500" : "border-transparent hover:border-slate-300"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl(k, 120)} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="min-w-0 space-y-2">
            {sel ? (
              <>
                <div ref={wheelRef}>
                  <ImageCropBox imageKey={sel} box={box} value={crop} onChange={(p) => setCrop((c) => ({ ...c, ...p }))} maxHeight={460} maxZoom={ZOOM_MAX} />
                </div>
                <p className="text-center text-[11px] text-slate-400">ลากกลางกรอบ = ย้าย · จับมุม ◻ ลาก = ย่อ/ขยาย (เล็กสุด ≈ 5% ของรูป) · หมุนลูกกลิ้ง = ซูม</p>
              </>
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">เลือกรูปทางซ้าย</div>
            )}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
