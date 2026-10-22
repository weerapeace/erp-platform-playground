"use client";

/**
 * ของกลางของผืนผ้าใบอิสระ — ตั้ง "ส่วนที่เห็น" ของรูปพื้นหลังผืน (แผงตั้งค่าทั้งผืน)
 *
 * เต็มผืน (cover): โชว์รูปเต็ม + กรอบขาว = ส่วนที่เห็นบนจอ → ลากกรอบ / คลิกตรงไหนของรูป = ย้ายส่วนที่เห็นไปตรงนั้น · ซูม 100–300%
 * เห็นทั้งรูป (contain): โชว์หน้าตาบนจอ (รูปไม่ถูกตัด เหลือขอบเป็นสีพื้นผืน) · เลื่อนชิดซ้าย/ขวา/บน/ล่างได้
 *
 * คอม / มือถือ ปรับแยกกัน (ตามปุ่ม 🖥 คอม / 📲 มือถือ ของหน้าแก้เต็มจอ):
 *   คอม   = bgFit/bgX/bgY/bgZoom (กรอบขาว อ้างอิงจอกว้าง 1440)
 *   มือถือ = bgMCustom + bgMFit/bgMX/bgMY/bgMZoom · ยังไม่ปรับแยก = ใช้ค่าคอม (แก้ครั้งแรกบนมือถือ = เริ่มจากค่าคอม)
 *
 * คำนวณด้วย canvasBgWindow (lib/website-canvas.ts) — สูตรเดียวกับเว็บร้าน (object-position + scale รอบจุดเดียวกัน)
 */
import { ImageCropBox } from "@/components/image-crop-box";
import { CANVAS_BG_DEFAULT, CANVAS_BG_REF_PHONE, CANVAS_BG_REF_WIDTH, CANVAS_MAX_HEIGHT, CANVAS_MOBILE_WIDTH, CANVAS_WIDTH, canvasMaxPx } from "@/lib/website-canvas";

export interface CanvasBgPos {
  fit: "cover" | "contain";
  x: number;
  y: number;
  zoom: number;
}
type Device = "desktop" | "mobile";
type BgPatch = Record<string, unknown>;

const imgUrl = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const seg = (on: boolean) => `flex-1 px-2 py-1.5 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
const n = (v: unknown, fb: number, min: number, max: number) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fb);

/** ค่าในบล็อก → ค่าที่ใช้ของจอนั้น (ข้อมูลเก่าไม่มีช่อง = กลางรูป เต็มผืน ไม่ซูม · มือถือไม่ได้ปรับแยก = ค่าคอม) */
export function canvasBgPosOf(block: Record<string, unknown>, device: Device = "desktop"): CanvasBgPos {
  const d = CANVAS_BG_DEFAULT;
  const desk: CanvasBgPos = { fit: block.bgFit === "contain" ? "contain" : "cover", x: n(block.bgX, d.bgX, 0, 100), y: n(block.bgY, d.bgY, 0, 100), zoom: n(block.bgZoom, d.bgZoom, 100, 300) };
  if (device === "desktop" || block.bgMCustom !== true) return desk;
  return { fit: block.bgMFit === "contain" ? "contain" : "cover", x: n(block.bgMX, desk.x, 0, 100), y: n(block.bgMY, desk.y, 0, 100), zoom: n(block.bgMZoom, desk.zoom, 100, 300) };
}

/** แก้ค่าของจอนั้น → ช่องข้อมูลที่ต้องบันทึก (มือถือแก้ครั้งแรก = เปิดปรับแยก + ตั้งต้นจากค่าคอม) */
function toPatch(block: Record<string, unknown>, device: Device, p: Partial<CanvasBgPos>): BgPatch {
  if (device === "desktop") {
    const out: BgPatch = {};
    if (p.fit !== undefined) out.bgFit = p.fit;
    if (p.x !== undefined) out.bgX = p.x;
    if (p.y !== undefined) out.bgY = p.y;
    if (p.zoom !== undefined) out.bgZoom = p.zoom;
    return out;
  }
  const cur = canvasBgPosOf(block, "mobile");
  const v = { ...cur, ...p };
  return { bgMCustom: true, bgMFit: v.fit, bgMX: v.x, bgMY: v.y, bgMZoom: v.zoom };
}

function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] text-slate-500">
        {label}
        <span className="tabular-nums">{value}%</span>
      </span>
      <input type="range" className="w-full accent-blue-600" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function CanvasBgPositioner({
  block,
  device,
  onChange,
}: {
  /** บล็อกผืน (อ่าน bgImageKey · ความสูง · โหมดมือถือ · ค่าตำแหน่งคอม/มือถือ) */
  block: Record<string, unknown>;
  /** จอที่กำลังแก้ในหน้าแก้เต็มจอ (🖥 คอม / 📲 มือถือ) */
  device: Device;
  onChange: (p: BgPatch) => void;
}) {
  const imageKey = String(block.bgImageKey ?? "");
  const mobile = device === "mobile";
  const mobileCustomLayout = block.mobileMode === "custom";
  const split = block.bgMCustom === true;
  const value = canvasBgPosOf(block, device);
  const set = (p: Partial<CanvasBgPos>) => onChange(toPatch(block, device, p));

  // กล่องที่รูปไปอยู่บนเว็บ: คอม = กว้างเต็มจออ้างอิง × สูงตามผืน (ผืนกว้างสุดตามช่องความกว้างผืน 1200/1600/เต็มจอ)
  // มือถือ = ผืนมือถือจัดเอง (กว้าง 400 × ความสูงที่ตั้ง) · เรียงอัตโนมัติ = สัดส่วนจอโทรศัพท์โดยประมาณ (สูงจริงตามจำนวนชิ้น)
  const height = n(block.height, 560, 120, CANVAS_MAX_HEIGHT);
  const desk = { w: CANVAS_BG_REF_WIDTH, h: (height * Math.min(CANVAS_BG_REF_WIDTH, canvasMaxPx(block.width))) / CANVAS_WIDTH };
  const phone = mobileCustomLayout ? { w: CANVAS_MOBILE_WIDTH, h: n(block.mobileHeight, 800, 120, 8000) } : CANVAS_BG_REF_PHONE;
  const box = mobile ? phone : desk;
  const cover = value.fit === "cover";
  if (!imageKey) return null;

  return (
    <div className="space-y-2">
      {mobile ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-800">📲 กำลังปรับของมือถือ</p>
          <div className="flex gap-1.5">
            <button type="button" className={seg(!split)} onClick={() => onChange({ bgMCustom: false })}>
              ใช้ตามคอม
            </button>
            <button type="button" className={seg(split)} onClick={() => !split && set({})}>
              ปรับแยก
            </button>
          </div>
          {!split && <p className="text-[10px] text-amber-700">ตอนนี้ใช้ตำแหน่งเดียวกับคอม — ลาก/ซูมด้านล่างเพื่อเริ่มปรับแยก (คอมไม่เปลี่ยน)</p>}
        </div>
      ) : (
        split && <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">📲 มือถือปรับแยกไว้แล้ว — กด &quot;📲 มือถือ&quot; ด้านบนเพื่อแก้ของมือถือ</p>
      )}

      <div className="flex gap-1.5">
        <button type="button" className={seg(cover)} onClick={() => set({ fit: "cover" })}>
          เต็มผืน
        </button>
        <button type="button" className={seg(!cover)} onClick={() => set({ fit: "contain" })}>
          เห็นทั้งรูป
        </button>
      </div>

      {cover ? (
        <>
          {/* ของกลาง ImageCropBox — หน้าคอม + มือถือยังใช้ค่าเดียวกัน → เส้นประ = ส่วนที่มือถือเห็น */}
          <ImageCropBox
            imageKey={imageKey}
            box={box}
            value={value}
            onChange={(p) => set(p)}
            label={mobile ? "📲 มือถือ" : "🖥 คอม"}
            tone={mobile ? "amber" : "white"}
            extraBox={!mobile && !split ? phone : null}
          />
          <p className="text-[10px] text-slate-500">
            {mobile
              ? `ลากกรอบ (หรือคลิกตรงไหนของรูป) = ส่วนที่เห็นบนมือถือ${mobileCustomLayout ? "" : " · ผืนเรียงอัตโนมัติ: กรอบคิดจากจอโทรศัพท์ (สูงจริงตามจำนวนชิ้น)"}`
              : "ลากกรอบขาว (หรือคลิกตรงไหนของรูป) = ส่วนที่เห็นบนจอคอม · เส้นประ = มือถือ (ถ้าไม่ปรับแยก)"}
          </p>
          <Range label="ซูม" value={value.zoom} min={100} max={300} step={5} onChange={(z) => set({ zoom: z })} />
        </>
      ) : (
        <>
          {/* หน้าตาบนจอ: ทั้งรูป ไม่ถูกตัด · ที่เหลือเป็นสีพื้นของผืน */}
          <div
            className={`relative mx-auto overflow-hidden rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px]`}
            style={{ aspectRatio: `${box.w / box.h}`, maxWidth: mobile ? 120 : undefined }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl(imageKey, 600)} alt="" draggable={false} className="absolute inset-0 w-full h-full" style={{ objectFit: "contain", objectPosition: `${value.x}% ${value.y}%` }} />
          </div>
          <p className="text-[10px] text-slate-500">เห็นทั้งรูป ไม่ถูกตัด · ที่ว่างรอบรูปเป็น &quot;สีพื้นผืน&quot; ด้านบน</p>
        </>
      )}

      <Range label="ซ้าย ↔ ขวา" value={value.x} min={0} max={100} onChange={(x) => set({ x })} />
      <Range label="บน ↕ ล่าง" value={value.y} min={0} max={100} onChange={(y) => set({ y })} />
      <div className="flex items-center justify-between">
        <button type="button" className="text-[11px] text-slate-500 hover:text-blue-600" onClick={() => set({ x: 50, y: 50, zoom: 100 })}>
          ↺ กลับกลางรูป
        </button>
        {cover && <span className="text-[10px] text-slate-400">อยากเห็นรูปมากขึ้น = เพิ่ม &quot;ความสูงผืน&quot;</span>}
      </div>
    </div>
  );
}
