"use client";
/**
 * 🖨 แผงตั้งค่า "ลายรีดบนกระเป๋า" ต่อรุ่น (แท็บเว็บไซต์ของ Parent SKU) — ค่าเก็บ store_listings.web_print
 *
 * - เปิด/ปิด · วิธีพิมพ์ (ร้านกำหนดตามวัสดุ) · ราคาเพิ่มต่อลายตามขนาด · ลายสูงสุดต่อส่วน · ให้อัปรูปเองไหม
 * - คลังลาย = อัลบั้มในคลังไฟล์ (เลือกได้หลายอัลบั้ม + ราคาเพิ่มต่ออัลบั้ม)
 * - ส่วนพิมพ์ = ลากกรอบบนรูปสินค้า (ย้าย · ย่อ/ขยายทุกมุม/ทุกด้าน · หมุน) + ขนาดจริง ซม.
 * กฎกลาง: lib/website-print-design (เว็บร้านใช้สำเนาเดียวกัน) · ของกลาง: MoneyInput · StepInput · ToggleSwitch
 */
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { MoneyInput } from "@/components/money-input";
import { StepInput } from "@/components/step-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import {
  newPrintZone,
  normRot,
  printDesignUsable,
  PRINT_MAX_PER_ZONE,
  PRINT_MAX_ZONES,
  PRINT_TIER_MAX_CM,
  type PrintDesignConfig,
  type PrintTier,
  type PrintZone,
} from "@/lib/website-print-design";

const imgUrl = (key: string, w = 900) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const TIERS: { key: PrintTier; label: string }[] = [
  { key: "S", label: `เล็ก ≤ ${PRINT_TIER_MAX_CM.S} ซม.` },
  { key: "M", label: `กลาง ≤ ${PRINT_TIER_MAX_CM.M} ซม.` },
  { key: "L", label: `ใหญ่ > ${PRINT_TIER_MAX_CM.M} ซม.` },
];
const METHOD_NOTE = {
  DTF: "ฟิล์มรีดร้อน นุ่ม พับได้ ซักได้ — เหมาะกับผ้า (แคนวาส คอตตอน)",
  UV: "หมึก UV ลงผิวโดยตรง — เหมาะกับหนัง/PU ผิวเรียบแข็ง (บนผ้าอาจแข็งและแตกเมื่อพับ)",
} as const;

type Collection = { id: string; name: string; count: number };

export function PrintDesignEditor({
  value,
  onChange,
  imageOptions,
  fallbackImageKey,
}: {
  value: PrintDesignConfig;
  onChange: (next: PrintDesignConfig) => void;
  /** รูปที่เลือกเป็นพื้นของส่วนพิมพ์ได้ (key + ป้าย) */
  imageOptions: { key: string; label: string }[];
  /** รูปที่เว็บใช้เมื่อไม่ได้เลือก (รูปแรกของสินค้า) */
  fallbackImageKey: string | null;
}) {
  const v = value;
  const set = (patch: Partial<PrintDesignConfig>) => onChange({ ...v, ...patch });
  const setZone = (i: number, patch: Partial<PrintZone>) => set({ zones: v.zones.map((z, k) => (k === i ? { ...z, ...patch } : z)) });
  const [cols, setCols] = useState<Collection[] | null>(null);
  const [colErr, setColErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/assets/collections")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setColErr("ดูรายชื่ออัลบั้มไม่ได้ (ต้องมีสิทธิ์ดูคลังไฟล์)");
        setCols(((j.data ?? []) as Collection[]).filter((c) => c.count > 0 || v.library.some((s) => s.collectionId === c.id)));
      })
      .catch(() => alive && setColErr("โหลดอัลบั้มไม่สำเร็จ"));
    return () => {
      alive = false;
    };
    // โหลดครั้งเดียวตอนเปิดแผง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usable = printDesignUsable(v);
  const toggleSet = (c: Collection, on: boolean) =>
    set({ library: on ? [...v.library, { collectionId: c.id, label: c.name, labelEn: "", extra: 0 }] : v.library.filter((s) => s.collectionId !== c.id) });

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleSwitch on={v.enabled} onChange={(on) => set({ enabled: on, zones: on && !v.zones.length ? [newPrintZone(0)] : v.zones })} label="เปิดให้ลูกค้าออกแบบลายรีดบนรุ่นนี้" />
        {v.enabled && !usable && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">ยังไม่พร้อม: ต้องมีส่วนพิมพ์ และเปิดอัปรูปหรือเลือกอัลบั้มลายอย่างน้อย 1 อย่าง</span>
        )}
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-500">วิธีพิมพ์ (ร้านกำหนดตามวัสดุ)</div>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {(["DTF", "UV"] as const).map((m) => (
              <button key={m} type="button" onClick={() => set({ method: m })} className={`rounded-md px-4 py-1 text-sm ${v.method === m ? "bg-white shadow font-medium text-slate-800" : "text-slate-500"}`}>
                {m}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{METHOD_NOTE[v.method]}</p>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-500">ราคาเพิ่มต่อ 1 ลาย (ตามด้านยาวสุดของลาย)</div>
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((t) => (
              <label key={t.key} className="space-y-0.5">
                <span className="block text-[11px] text-slate-500">{t.label}</span>
                <MoneyInput value={v.prices[t.key]} onChange={(raw) => set({ prices: { ...v.prices, [t.key]: Math.max(0, Math.round(Number(raw) || 0)) } })} className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm" />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-0.5">
            <span className="block text-xs font-semibold text-slate-500">ลายสูงสุดต่อ 1 ส่วน</span>
            <StepInput value={v.maxPerZone} onChange={(n) => set({ maxPerZone: Math.min(PRINT_MAX_PER_ZONE, Math.max(1, Math.round(n ?? 1))) })} min={1} max={PRINT_MAX_PER_ZONE} integer unit="ลาย" className="h-8 w-32" />
          </label>
          <ToggleSwitch on={v.allowUpload} onChange={(on) => set({ allowUpload: on })} label="ให้ลูกค้าอัปรูปเอง" size="sm" />
        </div>
      </section>

      <section className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-500">คลังลายให้ลูกค้าเลือก (อัลบั้มในคลังไฟล์)</div>
        {colErr && <p className="text-[11px] text-rose-600">{colErr}</p>}
        {!cols && !colErr && <p className="text-[11px] text-slate-400">กำลังโหลดอัลบั้ม…</p>}
        {cols && !cols.length && <p className="text-[11px] text-slate-400">ยังไม่มีอัลบั้มในคลังไฟล์ — สร้างอัลบั้มลายที่ขายบนเว็บได้ที่ Master Data › คลังไฟล์</p>}
        {cols && cols.length > 0 && (
          <ul className="max-h-60 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
            {cols.map((c) => {
              const s = v.library.find((x) => x.collectionId === c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" checked={!!s} onChange={(e) => toggleSet(c, e.target.checked)} />
                    <span className="truncate">{c.name}</span>
                    <span className="text-[11px] text-slate-400">{c.count} ไฟล์</span>
                  </label>
                  {s && (
                    <>
                      <input value={s.label} onChange={(e) => set({ library: v.library.map((x) => (x === s ? { ...x, label: e.target.value.slice(0, 40) } : x)) })} placeholder="ชื่อที่ลูกค้าเห็น" className="h-7 w-36 rounded border border-slate-300 px-2 text-xs" />
                      <span className="text-[11px] text-slate-500">บวกเพิ่ม</span>
                      <MoneyInput value={s.extra} onChange={(raw) => set({ library: v.library.map((x) => (x === s ? { ...x, extra: Math.max(0, Math.round(Number(raw) || 0)) } : x)) })} className="h-7 w-20 rounded border border-slate-300 px-2 text-xs" />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-slate-400">ลูกค้าเห็นรูปตัวอย่างของไฟล์ในอัลบั้ม · ไฟล์พิมพ์ตัวจริงใช้ "ไฟล์พิมพ์ PNG" ของลายนั้นในคลัง</p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500">ส่วนที่พิมพ์ได้ ({v.zones.length}/{PRINT_MAX_ZONES})</div>
          {v.zones.length < PRINT_MAX_ZONES && (
            <button type="button" onClick={() => set({ zones: [...v.zones, { ...newPrintZone(v.zones.length), id: `z${Date.now().toString(36).slice(-4)}` }] })} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:border-blue-400">
              ＋ เพิ่มส่วนพิมพ์
            </button>
          )}
        </div>
        {!v.zones.length && <p className="text-[11px] text-slate-400">ยังไม่มีส่วนพิมพ์ — กด "เพิ่มส่วนพิมพ์" แล้วลากกรอบบนรูปสินค้า</p>}
        {v.zones.map((z, i) => (
          <ZoneCard
            key={z.id}
            zone={z}
            imageOptions={imageOptions}
            fallbackImageKey={fallbackImageKey}
            onChange={(patch) => setZone(i, patch)}
            onRemove={() => set({ zones: v.zones.filter((_, k) => k !== i) })}
          />
        ))}
      </section>
    </div>
  );
}

function ZoneCard({
  zone,
  imageOptions,
  fallbackImageKey,
  onChange,
  onRemove,
}: {
  zone: PrintZone;
  imageOptions: { key: string; label: string }[];
  fallbackImageKey: string | null;
  onChange: (patch: Partial<PrintZone>) => void;
  onRemove: () => void;
}) {
  const key = zone.imageKey ?? fallbackImageKey;
  // สัดส่วนรูป (สูง/กว้าง) — ใช้เทียบว่ากรอบบนรูปกับขนาดจริง ซม. สัดส่วนตรงกันไหม (ไม่ตรง = ลายบนเว็บดูยืด/บีบ)
  const [imgAr, setImgAr] = useState<number | null>(null);
  const boxRatio = imgAr ? zone.w / (zone.h * imgAr) : null;
  const cmRatio = zone.widthCm / zone.heightCm;
  const off = boxRatio ? Math.abs(boxRatio / cmRatio - 1) > 0.12 : false;
  const fitH = boxRatio ? Math.min(120, Math.max(2, Math.round((zone.widthCm / boxRatio) * 2) / 2)) : zone.heightCm;
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_16rem]">
      <ZoneRectEditor imageKey={key} zone={zone} onChange={onChange} onImageAr={setImgAr} />
      <div className="space-y-2">
        <label className="block space-y-0.5">
          <span className="text-[11px] text-slate-500">ชื่อส่วน (ลูกค้าเห็น)</span>
          <input value={zone.label} onChange={(e) => onChange({ label: e.target.value.slice(0, 40) })} className="h-8 w-full rounded-md border border-slate-300 px-2" />
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] text-slate-500">ชื่ออังกฤษ (ไม่ใส่ก็ได้)</span>
          <input value={zone.labelEn} onChange={(e) => onChange({ labelEn: e.target.value.slice(0, 40) })} className="h-8 w-full rounded-md border border-slate-300 px-2" />
        </label>
        <label className="block space-y-0.5">
          <span className="text-[11px] text-slate-500">รูปพื้น</span>
          <select value={zone.imageKey ?? ""} onChange={(e) => onChange({ imageKey: e.target.value || null })} className="h-8 w-full rounded-md border border-slate-300 px-2">
            <option value="">รูปแรกของสินค้า</option>
            {imageOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="text-[11px] text-slate-500">กว้างจริง</span>
            <StepInput value={zone.widthCm} onChange={(n) => onChange({ widthCm: Math.min(120, Math.max(2, n ?? 2)) })} step={0.5} min={2} max={120} unit="ซม." className="h-8 w-full" />
          </label>
          <label className="space-y-0.5">
            <span className="text-[11px] text-slate-500">สูงจริง</span>
            <StepInput value={zone.heightCm} onChange={(n) => onChange({ heightCm: Math.min(120, Math.max(2, n ?? 2)) })} step={0.5} min={2} max={120} unit="ซม." className="h-8 w-full" />
          </label>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>หมุนกรอบ</span>
            {zone.rot !== 0 && (
              <button type="button" onClick={() => onChange({ rot: 0 })} className="text-blue-600 hover:underline">
                ตั้งตรง (0°)
              </button>
            )}
          </div>
          <StepInput value={zone.rot} onChange={(n) => onChange({ rot: normRot(n ?? 0) })} step={1} min={-180} max={180} integer unit="°" className="h-8 w-full" />
        </div>
        {off && boxRatio && (
          <div className="space-y-1 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            <p>
              สัดส่วนกรอบบนรูป (กว้าง:สูง ≈ {boxRatio.toFixed(2)}) ไม่ตรงกับขนาดจริง ({cmRatio.toFixed(2)}) — ลายบนเว็บจะดูยืดหรือบีบ
            </p>
            <button type="button" onClick={() => onChange({ heightCm: fitH })} className="rounded border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100">
              ปรับความสูงจริงให้ตรงกรอบ ({fitH} ซม.)
            </button>
          </div>
        )}
        <p className="text-[11px] text-slate-400">วัดพื้นที่ที่รีดได้จริงบนกระเป๋า (เว้นตะเข็บ/หูหิ้ว) · รูปทุกสีควรถ่ายมุมเดียวกัน เว็บจะสลับรูปตามสีที่ลูกค้าเลือกให้เอง</p>
        <button type="button" onClick={onRemove} className="text-xs text-rose-600 hover:underline">
          ลบส่วนนี้
        </button>
      </div>
    </div>
  );
}

type Handle = { sx: -1 | 0 | 1; sy: -1 | 0 | 1 };
/** จุดจับย่อ/ขยาย: 4 มุม + กลาง 4 ด้าน (sx/sy = ด้านไหนของกรอบ · 0 = กลาง) */
const HANDLES: Handle[] = [
  { sx: -1, sy: -1 },
  { sx: 0, sy: -1 },
  { sx: 1, sy: -1 },
  { sx: 1, sy: 0 },
  { sx: 1, sy: 1 },
  { sx: 0, sy: 1 },
  { sx: -1, sy: 1 },
  { sx: -1, sy: 0 },
];
const handleCursor = (h: Handle) => (h.sx === 0 ? "ns-resize" : h.sy === 0 ? "ew-resize" : h.sx === h.sy ? "nwse-resize" : "nesw-resize");
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * ลากกรอบพื้นที่พิมพ์บนรูป (เก็บเป็น % ของรูป + องศา)
 * ลากกลางกรอบ = ย้าย · จุดมุม/กลางด้าน = ย่อ/ขยาย (ฝั่งตรงข้ามอยู่กับที่ — คิดตามแนวที่กรอบหมุนอยู่) · วงกลมด้านบน = หมุน (ดีดเข้า 0/90/180 เมื่อใกล้)
 */
function ZoneRectEditor({
  imageKey,
  zone,
  onChange,
  onImageAr,
}: {
  imageKey: string | null;
  zone: PrintZone;
  onChange: (patch: Partial<PrintZone>) => void;
  onImageAr?: (ar: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  // รูปที่โหลดจากแคชก่อนหน้าจอพร้อม = onLoad ไม่ยิง → อ่านสัดส่วนเองหลังวาด
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth) onImageAr?.(el.naturalHeight / el.naturalWidth);
  }, [imageKey, onImageAr]);
  const drag = useRef<{ mode: "move" | "rot" | "size"; h?: Handle; px: number; py: number; z: PrintZone; W: number; H: number; L: number; T: number } | null>(null);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const start = (mode: "move" | "rot" | "size", h?: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { mode, h, px: e.clientX, py: e.clientY, z: zone, W: r.width, H: r.height, L: r.left, T: r.top };
    try {
      wrap.current?.setPointerCapture(e.pointerId);
    } catch {
      /* บางเบราว์เซอร์ไม่ให้จับ — ยังลากได้ตราบที่เมาส์อยู่ในกรอบรูป */
    }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { z, W, H } = d;
    const a = (z.rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const zw = (z.w / 100) * W;
    const zh = (z.h / 100) * H;
    const cx = ((z.x + z.w / 2) / 100) * W;
    const cy = ((z.y + z.h / 2) / 100) * H;
    const px = e.clientX - d.L;
    const py = e.clientY - d.T;
    if (d.mode === "move") {
      onChange({ x: r2(clamp(z.x + ((e.clientX - d.px) / W) * 100, 0, 100 - z.w)), y: r2(clamp(z.y + ((e.clientY - d.py) / H) * 100, 0, 100 - z.h)) });
    } else if (d.mode === "rot") {
      let deg = normRot((Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90);
      for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(deg - snap) <= 3) deg = snap === -180 ? 180 : snap;
      onChange({ rot: deg });
    } else if (d.h) {
      const { sx, sy } = d.h;
      // จุดยึด = มุม/กลางด้านฝั่งตรงข้าม (พิกัดจอ) — ไม่ขยับระหว่างลาก
      const ox = cx + ((-sx * zw) / 2) * cos - ((-sy * zh) / 2) * sin;
      const oy = cy + ((-sx * zw) / 2) * sin + ((-sy * zh) / 2) * cos;
      // ตำแหน่งเมาส์ในแนวของกรอบ (หมุนกลับ)
      const vx = (px - ox) * cos + (py - oy) * sin;
      const vy = -(px - ox) * sin + (py - oy) * cos;
      const nw = sx ? Math.max(0.03 * W, sx * vx) : zw;
      const nh = sy ? Math.max(0.03 * H, sy * vy) : zh;
      const ncx = ox + ((sx * nw) / 2) * cos - ((sy * nh) / 2) * sin;
      const ncy = oy + ((sx * nw) / 2) * sin + ((sy * nh) / 2) * cos;
      const w = Math.min(100, (nw / W) * 100);
      const h = Math.min(100, (nh / H) * 100);
      onChange({ w: r2(w), h: r2(h), x: r2(clamp((ncx / W) * 100 - w / 2, 0, 100 - w)), y: r2(clamp((ncy / H) * 100 - h / 2, 0, 100 - h)) });
    }
  };
  const end = () => {
    drag.current = null;
  };

  if (!imageKey) return <div className="grid min-h-40 place-items-center rounded-md bg-slate-100 text-xs text-slate-400">ยังไม่มีรูปสินค้า — เพิ่มรูปเว็บก่อน</div>;
  return (
    <div className="space-y-1">
      {/* เว้นขอบรอบรูป ให้จุดจับที่อยู่ริมรูปกดได้ */}
      <div ref={wrap} className="select-none rounded-md bg-slate-100 p-5" style={{ touchAction: "none" }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <div ref={box} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={img}
            src={imgUrl(imageKey)}
            alt=""
            className="block w-full rounded"
            draggable={false}
            onLoad={(e) => e.currentTarget.naturalWidth && onImageAr?.(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
          />
          <div
            onPointerDown={start("move")}
            className="absolute cursor-move border-2 border-dashed border-pink-500 bg-pink-500/10"
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%`, transform: `rotate(${zone.rot}deg)` }}
          >
            <span className="pointer-events-none absolute -bottom-6 left-0 whitespace-nowrap rounded-full bg-pink-600 px-2 py-0.5 text-[11px] text-white">
              {zone.label} · {zone.widthCm}×{zone.heightCm} ซม.{zone.rot ? ` · ${zone.rot}°` : ""}
            </span>
            <span className="pointer-events-none absolute left-1/2 top-0 h-5 w-px -translate-y-full bg-pink-500" />
            <span
              onPointerDown={start("rot")}
              title="ลากเพื่อหมุน"
              className="absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 -translate-y-[calc(100%+18px)] cursor-grab rounded-full border-2 border-pink-600 bg-white shadow"
            />
            {HANDLES.map((h) => (
              <span
                key={`${h.sx}${h.sy}`}
                onPointerDown={start("size", h)}
                title="ลากเพื่อย่อ/ขยาย"
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-pink-600 shadow"
                style={{ left: `${(h.sx + 1) * 50}%`, top: `${(h.sy + 1) * 50}%`, cursor: handleCursor(h) }}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">ลากกลางกรอบ = ย้าย · จุดที่มุม/กลางด้าน = ย่อ/ขยาย · วงกลมด้านบน = หมุน (ใกล้ 0°/90° จะดีดเข้าเอง)</p>
    </div>
  );
}
