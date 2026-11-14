"use client";

/**
 * ✂️ ครอปรูปจากรูปสินค้า (ของกลาง) — เลือกรูป (จัดกลุ่มตาม SKU) → ลากกรอบ + ซูม → ได้รูปใหม่เฉพาะส่วนนั้น (อัปขึ้น R2)
 * --------------------------------------------------------------------------
 * - ซ้าย: กลุ่มรูป (เช่น SKU ละกลุ่ม · ป้าย "บนเว็บ") → กดรูปย่อเพื่อเลือก · 📤 อัปรูปอื่นมาครอปได้ (กลุ่ม "รูปที่อัปเอง")
 * - ขวา: ImageCropBox (กรอบสัดส่วน aspect · ลากกลางกรอบ = ย้าย · จับมุมลาก = ย่อ/ขยาย · หมุนลูกกลิ้งบนรูปก็ได้) + ตัวอย่างผลลัพธ์ (วงกลม/สี่เหลี่ยม)
 * - "ใช้ส่วนนี้" → ตัดพิกเซลจริงบน canvas (รูปจาก /api/r2-image โดเมนเดียวกัน) → อัปผ่าน /api/admin/upload → onDone(r2Key)
 * ใช้ที่: ทะเบียนสี (รูปลายจุดสี) · ใช้ได้กับงานอื่นที่ต้อง "ตัดส่วนหนึ่งของรูปสินค้า" (ไอคอน · ป้าย · พื้นผิว)
 * ข้อจำกัด: รูปต้องเป็น r2 key (โดเมนเดียวกัน) · ผลลัพธ์เป็น webp ขนาด outSize px (ด้านกว้าง)
 *
 * ✂️ โหมดกรอบอิสระ — ImageFreeCropModal (เพิ่ม 2026-11-14 · แผงผ้า Swatch)
 * - รูปเดียว (ไฟล์ในเครื่องที่ยังไม่อัป = blob URL หรือรูป r2) · กรอบสี่เหลี่ยมสัดส่วนอะไรก็ได้ (ลากกรอบ/มุม · ลากที่ว่าง = วาดกรอบใหม่)
 * - หมุน 90° ซ้าย/ขวา ก่อนครอป · นอกกรอบมืดลง = ส่วนที่จะถูกตัดทิ้ง
 * - ผลลัพธ์ = Blob (ยังไม่อัป ผู้เรียกอัปเอง) + rotation (จำนวนครั้งหมุนตามเข็ม) + rect (% ของรูปหลังหมุน) → เลื่อนกรอบเดิมตามได้ด้วย lib/sku-swatch
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ImageCropBox, useImageSize, type CropValue } from "@/components/image-crop-box";
import { ImageRegions } from "@/components/image-regions";
import { ZoomBox, ZoomControls } from "@/components/zoom-box";
import { canvasBgWindow } from "@/lib/website-canvas";

// ───────────────────────────── ตัวช่วยตัด/หมุนรูป (ใช้ได้ทั้งไฟล์ในเครื่องและรูป r2) ─────────────────────────────

/** เปิดรูปจาก URL (blob:/data: ในเครื่อง หรือ /api/r2-image ที่ส่งต่อไป erp-img คนละโดเมน → ต้องขอ CORS ถึงตัดรูปได้) */
export async function loadImageEl(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  if (!/^(blob|data):/.test(src)) img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type, quality));
}

/** ตัดส่วน win (สัดส่วน 0–1 ของรูป) ด้วยความละเอียดจริง แล้วย่อให้ด้านยาว ≤ maxSide → Blob (jpeg ค่าเริ่ม) */
export async function cropImageSource(src: string, win: { x: number; y: number; w: number; h: number }, opts: { maxSide?: number; type?: "image/jpeg" | "image/webp"; quality?: number } = {}): Promise<{ blob: Blob; w: number; h: number }> {
  const img = await loadImageEl(src);
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const sw = Math.max(1, win.w * nw), sh = Math.max(1, win.h * nh);
  const k = Math.min(1, (opts.maxSide ?? 2400) / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, win.x * nw, win.y * nh, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas, opts.type ?? "image/jpeg", opts.quality ?? 0.9);
  return { blob, w: canvas.width, h: canvas.height };
}

/** หมุนรูป 90° × turns (ตามเข็ม) → blob URL ใหม่ (ผู้เรียกต้อง URL.revokeObjectURL เอง) */
export async function rotateImageSource(src: string, turns: number): Promise<string> {
  const t = ((turns % 4) + 4) % 4;
  const img = await loadImageEl(src);
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = t % 2 ? nh : nw;
  canvas.height = t % 2 ? nw : nh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(img, -nw / 2, -nh / 2);
  return URL.createObjectURL(await canvasBlob(canvas, "image/jpeg", 0.92));
}

export type FreeCropResult = { blob: Blob; w: number; h: number; rotation: number; rect: { x: number; y: number; w: number; h: number } };
const FULL = { x: 0, y: 0, w: 100, h: 100 };

/** ✂️ ครอปกรอบอิสระ + หมุน 90° (รูปเดียว) — ดูหัวไฟล์ */
export function ImageFreeCropModal({ open, src, onClose, onDone, title = "✂️ ครอปรูป", description = "ลากกรอบ = ย้าย · ลากมุม = ย่อ/ขยาย · ลากที่ว่างบนรูป = วาดกรอบใหม่ · นอกกรอบ (ส่วนมืด) จะถูกตัดทิ้ง", maxSide = 2400, initialRect }: {
  open: boolean;
  /** blob URL (ไฟล์ในเครื่อง) หรือ URL รูป r2 (/api/r2-image?key=…&w=3200) */
  src: string;
  onClose: () => void;
  onDone: (r: FreeCropResult) => void | Promise<void>;
  title?: string;
  description?: string;
  /** ด้านยาวสุดของรูปผลลัพธ์ (px) */
  maxSide?: number;
  /** กรอบเริ่มต้น (% ของรูป) — ไม่ส่ง = เกือบเต็มรูป */
  initialRect?: { x: number; y: number; w: number; h: number } | null;
}) {
  const toast = useToast();
  const [turns, setTurns] = useState(0);
  const [shown, setShown] = useState(src);   // รูปที่หมุนแล้ว (blob URL) หรือรูปเดิม
  // กรอบเริ่ม = เต็มรูป (กด "ใช้ส่วนนี้" ทันที = ไม่ตัดอะไรทิ้ง)
  const [rect, setRect] = useState(initialRect ?? FULL);
  const [ar, setAr] = useState(1);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);   // Ctrl + หมุนลูกกลิ้ง = ซูม (ของกลาง ZoomBox) — ตีกรอบชิ้นเล็ก ๆ ได้แม่น
  useEffect(() => { if (open) { setTurns(0); setShown(src); setRect(initialRect ?? FULL); setZoom(1); } }, [open, src]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (shown !== src && shown.startsWith("blob:")) URL.revokeObjectURL(shown); }, [shown, src]);
  useEffect(() => {
    let alive = true;
    const im = new Image();
    im.onload = () => { if (alive) setAr((im.naturalWidth || 1) / (im.naturalHeight || 1)); };
    im.src = shown;
    return () => { alive = false; };
  }, [shown]);

  const rotate = async (d: 1 | -1) => {
    const next = (((turns + d) % 4) + 4) % 4;
    setBusy(true);
    try {
      setShown(next === 0 ? src : await rotateImageSource(src, next));
      setTurns(next);
      setRect(FULL);
    } catch { toast.error("หมุนรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };
  const use = async () => {
    if (turns === 0 && rect.x <= 0 && rect.y <= 0 && rect.w >= 100 && rect.h >= 100) { onClose(); return; }   // ไม่ได้ครอป/หมุน = ไม่ต้องสร้างรูปใหม่
    setBusy(true);
    try {
      const out = await cropImageSource(shown, { x: rect.x / 100, y: rect.y / 100, w: rect.w / 100, h: rect.h / 100 }, { maxSide });
      await onDone({ ...out, rotation: turns, rect });
      onClose();
    } catch { toast.error("ครอปรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };
  const dim = "absolute bg-slate-950/55";
  return (
    <ERPModal open={open} onClose={onClose} title={title} description={description} size="xl" loading={busy}
      footer={
        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void rotate(-1)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">⟲ หมุนซ้าย</button>
            <button type="button" onClick={() => void rotate(1)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">⟳ หมุนขวา</button>
            <button type="button" onClick={() => setRect(FULL)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">ทั้งรูป</button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-lg text-slate-600 hover:bg-slate-100">ยกเลิก</button>
            <button type="button" onClick={() => void use()} disabled={busy} className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังทำ…" : "✂️ ใช้ส่วนนี้"}</button>
          </div>
        </div>
      }>
      <div className="flex justify-end mb-1.5"><ZoomControls zoom={zoom} onZoom={setZoom} /></div>
      <div className="relative bg-slate-100 rounded-lg h-[60vh] min-h-[260px]">
        <ZoomBox zoom={zoom} onZoom={setZoom} aspect={ar} padding={12} className="absolute inset-0 rounded-lg">
          <ImageRegions src={shown} mode="edit" className="w-full" regions={[{ id: "crop", ...rect }]} selectedId="crop"
            onChange={(_, r) => setRect(r)} onCreate={(r) => setRect(r)}
            overlay={<>
              <span className={dim} style={{ left: 0, top: 0, width: "100%", height: `${rect.y}%` }} />
              <span className={dim} style={{ left: 0, top: `${rect.y + rect.h}%`, width: "100%", height: `${Math.max(0, 100 - rect.y - rect.h)}%` }} />
              <span className={dim} style={{ left: 0, top: `${rect.y}%`, width: `${rect.x}%`, height: `${rect.h}%` }} />
              <span className={dim} style={{ left: `${rect.x + rect.w}%`, top: `${rect.y}%`, width: `${Math.max(0, 100 - rect.x - rect.w)}%`, height: `${rect.h}%` }} />
            </>} />
        </ZoomBox>
      </div>
    </ERPModal>
  );
}

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
  img.crossOrigin = "anonymous"; // รูปถูกส่งต่อไป erp-img (คนละโดเมน) — ไม่ใส่ = ตัดรูปออกมาเป็นไฟล์ไม่ได้
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
