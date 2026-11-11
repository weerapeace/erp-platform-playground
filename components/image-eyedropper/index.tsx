"use client";

/**
 * 💧 ดูดสีจากรูป (ของกลาง) — กดตำแหน่งบนรูปแล้วได้รหัสสี #RRGGBB
 * --------------------------------------------------------------------------
 * - เลือกรูปจากแถบรูปย่อ (หลายรูปได้) → ชี้ดูสีสด → คลิกจุดที่ต้องการ (เฉลี่ยรอบจุด 7×7 px กันสีเพี้ยนจากเม็ดพิกเซล)
 * - รูปต้องมาจาก /api/r2-image (หรือโดเมนที่อนุญาตให้อ่านข้ามโดเมน) ไม่งั้นเบราว์เซอร์ห้ามอ่านสี — โหลดแบบ crossOrigin เพราะรูปถูกส่งต่อไป erp-img
 * - ปุ่ม "เลือกรูปอื่น" = ตัวเลือกรูปกลาง (AssetPicker · คลังรูป + พิมพ์รหัสรุ่นเจอรูปสินค้าบนเว็บทั้งชุด) → ต่อหน้าแถบรูปย่อแล้วเลือกให้เลย
 *   ไม่มีรูปมาให้ (images ว่าง) ก็ยังเปิดได้ — เลือกรูปเอง · loading = ผู้เรียกกำลังโหลดรูปเพิ่ม
 * ใช้: <ImageEyedropper open images={[r2key...]} labels={{ [r2key]: "รหัส SKU" }} onPick={(hex) => …} onClose={…} />
 */
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";

const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });

const keyUrl = (key: string, w = 900) => (/^(https?:)?\/\//.test(key) || key.startsWith("/") ? key : `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`);
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export function ImageEyedropper({
  open,
  images,
  onPick,
  onClose,
  title = "💧 ดูดสีจากรูปสินค้า",
  labels,
  loading = false,
}: {
  open: boolean;
  /** r2 key หรือ URL (โดเมนเดียวกัน) */
  images: string[];
  onPick: (hex: string) => void;
  onClose: () => void;
  title?: string;
  /** ป้ายตอนชี้รูปย่อ เช่น รหัส SKU (key = รายการใน images) */
  labels?: Record<string, string>;
  /** ผู้เรียกกำลังโหลดรูปเพิ่ม (โชว์ "กำลังหารูป…" ท้ายแถบ) */
  loading?: boolean;
}) {
  // รูปที่เลือกเองจากตัวเลือกรูปกลาง — อยู่หน้าแถบ (ใช้ซ้ำได้ตอนดูดสีช่องถัดไป)
  const [own, setOwn] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const list = useMemo(() => [...new Set([...own, ...images])], [own, images]);
  const [cur, setCur] = useState<string | null>(null);
  const curKey = cur && list.includes(cur) ? cur : list[0] ?? null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ hex: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setPicked(null); // เปลี่ยนรูป/เปิดใหม่ = ล้างจุดที่เลือกไว้
    if (!open || !curKey) return;
    setState("loading");
    const img = new Image();
    img.crossOrigin = "anonymous"; // รูป /api/r2-image ถูกส่งต่อไปตัวเสิร์ฟรูป erp-img (คนละโดเมน) — ไม่ใส่ = เบราว์เซอร์ห้ามอ่านสี
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      const s = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return setState("error");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try {
        ctx.getImageData(0, 0, 1, 1); // รูปข้ามโดเมน = อ่านสีไม่ได้
        setState("ready");
      } catch {
        setState("error");
      }
    };
    img.onerror = () => setState("error");
    img.src = keyUrl(curKey);
  }, [open, curKey]);

  /** สีเฉลี่ยรอบจุดที่ชี้ (r = รัศมีเป็นพิกเซลของรูป) */
  const sample = (e: React.MouseEvent<HTMLCanvasElement>, r: number) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !ctx || state !== "ready") return null;
    const rect = c.getBoundingClientRect();
    const px = Math.floor(((e.clientX - rect.left) / rect.width) * c.width);
    const py = Math.floor(((e.clientY - rect.top) / rect.height) * c.height);
    const x0 = Math.max(0, px - r), y0 = Math.max(0, py - r);
    const w = Math.max(1, Math.min(c.width, px + r + 1) - x0), h = Math.max(1, Math.min(c.height, py + r + 1) - y0);
    const d = ctx.getImageData(x0, y0, w, h).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue; // ข้ามส่วนโปร่งใส
      R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
    }
    if (!n) return null;
    return { hex: toHex(R / n, G / n, B / n), x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  };

  const shown = picked?.hex ?? hover;
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={title}
      description="ชี้บนรูปเพื่อดูสี แล้วคลิกจุดที่ต้องการ — ระบบเฉลี่ยสีรอบ ๆ จุดให้ (กันเงา/เม็ดพิกเซล)"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block w-8 h-8 rounded-lg" style={{ background: shown ?? "transparent", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
            <span className="font-mono text-slate-700">{shown ?? "—"}</span>
            {picked && <span className="text-[11px] text-emerald-600">✓ เลือกแล้ว</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100">ยกเลิก</button>
            <button type="button" disabled={!picked} onClick={() => picked && onPick(picked.hex)} className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40">ใช้สีนี้</button>
          </div>
        </div>
      }
    >
      {open && (
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 items-center">
            <button type="button" onClick={() => setPickerOpen(true)} title="เลือกจากคลังรูป หรือพิมพ์รหัส/ชื่อรุ่นเพื่อหารูปสินค้าบนเว็บ"
              className="w-14 h-14 shrink-0 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 flex flex-col items-center justify-center gap-0.5 text-[10px] leading-tight">
              <Icon name="image" size={16} />เลือกรูปอื่น
            </button>
            {list.map((k) => (
              <button key={k} type="button" onClick={() => setCur(k)} title={labels?.[k] ?? (own.includes(k) ? "รูปที่เลือกเอง" : undefined)}
                className={`w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 ${k === curKey ? "border-blue-500" : "border-transparent hover:border-slate-300"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={keyUrl(k, 160)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            {loading && <span className="shrink-0 px-2 text-[11px] text-slate-400">กำลังหารูปสินค้า…</span>}
          </div>
          <div className="relative flex justify-center rounded-lg bg-slate-50 p-2" style={{ minHeight: 240 }}>
            {!curKey && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
                {loading ? "กำลังหารูปสินค้า…" : (
                  <>
                    <span>ยังไม่มีรูปสินค้าของสีนี้</span>
                    <button type="button" onClick={() => setPickerOpen(true)} className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100">
                      <Icon name="image" /> เลือกรูปจากคลัง / รูปสินค้าบนเว็บ
                    </button>
                  </>
                )}
              </div>
            )}
            {curKey && state === "loading" && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">กำลังโหลดรูป…</div>}
            {curKey && state === "error" && <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-600">โหลดรูปไม่ได้ หรือรูปนี้อ่านสีไม่ได้ — ลองรูปอื่น</div>}
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                className="block max-w-full max-h-[55vh] cursor-crosshair rounded"
                style={{ visibility: curKey && state === "ready" ? "visible" : "hidden" }}
                onMouseMove={(e) => setHover(sample(e, 1)?.hex ?? null)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => setPicked(sample(e, 3))}
              />
              {picked && (
                <span
                  className="pointer-events-none absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white"
                  style={{ left: `${picked.x}%`, top: `${picked.y}%`, background: picked.hex, boxShadow: "0 0 0 1px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.3)" }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {pickerOpen && (
        <AssetPicker
          open
          multiple
          typeFilter="image"
          title="เลือกรูปมาดูดสี"
          contextLabel="พิมพ์รหัส/ชื่อรุ่น = รูปสินค้าบนเว็บทั้งชุด (Parent · SKU · Description)"
          onClose={() => setPickerOpen(false)}
          onSelect={(rows) => {
            const keys = rows.map((r) => r.r2_key).filter(Boolean);
            if (keys.length) {
              setOwn((o) => [...new Set([...keys, ...o])]);
              setCur(keys[0]);
            }
            setPickerOpen(false);
          }}
        />
      )}
    </ERPModal>
  );
}
