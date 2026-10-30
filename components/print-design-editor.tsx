"use client";
/**
 * 🖨 แผงตั้งค่า "ลายรีดบนกระเป๋า" ต่อรุ่น (แท็บเว็บไซต์ของ Parent SKU) — ค่าเก็บ store_listings.web_print
 *
 * - เปิด/ปิด · วิธีพิมพ์ (ร้านกำหนดตามวัสดุ) · ราคาเพิ่มต่อลายตามขนาด · ลายสูงสุดต่อส่วน · ให้อัปรูปเองไหม
 * - คลังลาย = อัลบั้มในคลังไฟล์ (เลือกได้หลายอัลบั้ม + ราคาเพิ่มต่ออัลบั้ม)
 * - ส่วนพิมพ์ = กรอบบนรูปสินค้า (ทุกส่วนบนรูปเดียวกันเห็นพร้อมกัน คนละสี) · ย้าย/ย่อ/ขยาย/หมุน + ขนาดจริง ซม.
 * - ทรง: สี่เหลี่ยม · วงกลม · สามเหลี่ยม · สี่เหลี่ยมดัดทรง (ขยับทีละมุม) · ปากกา (วาดเอง เส้นตรง/โค้ง) — ลายที่เกินขอบทรงถูกตัด
 * กฎกลาง: lib/website-print-design (เว็บร้านใช้สำเนาเดียวกัน) · ของกลาง: MoneyInput · StepInput · ToggleSwitch
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { apiFetch } from "@/lib/api";
import { MoneyInput } from "@/components/money-input";
import { StepInput } from "@/components/step-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import {
  defaultShapePoints,
  newPrintZone,
  normRot,
  printDesignUsable,
  printZoneOutline,
  printZonePath,
  printZoneShapeLabel,
  PRINT_MAX_PER_ZONE,
  PRINT_MAX_ZONES,
  PRINT_TIER_MAX_CM,
  PRINT_ZONE_MAX_POINTS,
  PRINT_ZONE_SHAPES,
  type PrintDesignConfig,
  type PrintTier,
  type PrintZone,
  type PrintZonePoint,
  type PrintZoneShape,
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
        <div className="text-xs font-semibold text-slate-500">
          ส่วนที่พิมพ์ได้ ({v.zones.length}/{PRINT_MAX_ZONES})
        </div>
        <ZonesBoard zones={v.zones} onChange={(zones) => set({ zones })} imageOptions={imageOptions} fallbackImageKey={fallbackImageKey} />
      </section>
    </div>
  );
}

/** สีกรอบของแต่ละส่วน (ตามลำดับ) — ไว้แยกส่วนในหลังบ้าน · หน้าร้านเห็นเส้นประสีเดียวกันหมด */
const ZONE_COLORS = ["#db2777", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0d9488"];
const zoneColor = (i: number) => ZONE_COLORS[i % ZONE_COLORS.length];
const pt = (x: number, y: number, hx = 0, hy = 0): PrintZonePoint => ({ x, y, hx, hy });
/** รูปทรงบนปุ่มเลือกทรง */
const SHAPE_ICON: Record<PrintZoneShape, string> = {
  rect: printZonePath({ shape: "rect" }),
  ellipse: printZonePath({ shape: "ellipse" }),
  tri: printZonePath({ shape: "tri", pts: defaultShapePoints("tri") }),
  quad: printZonePath({ shape: "quad", pts: [pt(0.15, 0.1), pt(0.92, 0), pt(1, 1), pt(0, 0.85)] }),
  pen: printZonePath({ shape: "pen", pts: [pt(0.5, 0.04, 0.3, 0), pt(0.96, 0.6, 0, 0.25), pt(0.5, 0.96, -0.3, 0), pt(0.04, 0.45, 0.05, -0.3)] }),
};
const SHAPE_TIP: Record<PrintZoneShape, string> = {
  rect: "ลากกลางกรอบ = ย้าย · จุดที่มุม/กลางด้าน = ย่อ/ขยาย · วงกลมด้านบน = หมุน",
  ellipse: "ลากจุดที่มุม/กลางด้าน = ย่อ/ขยาย · วงกลมด้านบน = หมุน",
  tri: "ลากจุดขาวที่มุม = ขยับทีละมุม · จุดสีกลางด้าน = เลื่อนทั้งด้าน · ลากข้างใน = ย้ายทั้งรูป",
  quad: "ลากจุดขาวที่มุม = ขยับทีละมุม · จุดสีกลางด้าน = เลื่อนทั้งด้าน · ลากข้างใน = ย้ายทั้งรูป",
  pen: "ลากจุดขาว = แก้ทรง · จุดสีปลายก้าน = ดัดโค้ง · ดับเบิลคลิกจุด = สลับมุมแหลม/โค้ง · กดปากกาอีกครั้ง = วาดใหม่",
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const cmOf = (n: number) => clamp(Math.round(n * 10) / 10, 2, 120);

/** เส้นที่กำลังวาดด้วยปากกา — จุดเป็นสัดส่วน 0..1 ของรูป */
type PenDraft = { idx: number; pts: PrintZonePoint[] };

/** จุดที่วาดด้วยปากกา (สัดส่วนของรูป) → กรอบที่ครอบทรงพอดี + จุดแบบสัดส่วนของกรอบ · ขนาด ซม. ใช้สเกลเดิมของส่วนนี้ */
function zoneFromPen(z: PrintZone, pts: PrintZonePoint[]): Partial<PrintZone> {
  const out = printZoneOutline({ shape: "pen", pts });
  const xs = out.map((p) => p[0]);
  const ys = out.map((p) => p[1]);
  const minX = clamp(Math.min(...xs), 0, 1);
  const minY = clamp(Math.min(...ys), 0, 1);
  const bw = Math.max(0.01, clamp(Math.max(...xs), 0, 1) - minX);
  const bh = Math.max(0.01, clamp(Math.max(...ys), 0, 1) - minY);
  return {
    shape: "pen",
    rot: 0,
    x: r2(minX * 100),
    y: r2(minY * 100),
    w: r2(bw * 100),
    h: r2(bh * 100),
    pts: pts.map((p) => pt(r3(clamp((p.x - minX) / bw, 0, 1)), r3(clamp((p.y - minY) / bh, 0, 1)), r3(p.hx / bw), r3(p.hy / bh))),
    widthCm: cmOf((z.widthCm * bw * 100) / z.w),
    heightCm: cmOf((z.heightCm * bh * 100) / z.h),
  };
}

/** ส่วนพิมพ์บนจอ (px): กึ่งกลาง · ขนาดก่อนหมุน · มุม */
function zoneGeo(z: PrintZone, W: number, H: number) {
  const a = (z.rot * Math.PI) / 180;
  return { cos: Math.cos(a), sin: Math.sin(a), zw: (z.w / 100) * W, zh: (z.h / 100) * H, cx: ((z.x + z.w / 2) / 100) * W, cy: ((z.y + z.h / 2) / 100) * H };
}
type ZoneGeo = ReturnType<typeof zoneGeo>;
/** จุดบนรูป (px) → ในแนวของกรอบ นับจากมุมซ้ายบนของกรอบก่อนหมุน (px) */
function toLocal(g: ZoneGeo, px: number, py: number) {
  const dx = px - g.cx;
  const dy = py - g.cy;
  return { x: dx * g.cos + dy * g.sin + g.zw / 2, y: -dx * g.sin + dy * g.cos + g.zh / 2 };
}

/**
 * แก้จุดของทรง (px ในแนวกรอบเดิม) → กรอบใหม่ที่ครอบทรงพอดี (มุมหมุนเดิม) + จุดแบบสัดส่วน
 * ขนาด ซม. ขยาย/หดตามกรอบ (สเกลของรูปเท่าเดิม — ดึงมุมออกไป = พื้นที่จริงใหญ่ขึ้น)
 */
function reshapeZone(z: PrintZone, W: number, H: number, P: PrintZonePoint[]): Partial<PrintZone> {
  const g = zoneGeo(z, W, H);
  const out = printZoneOutline({ shape: z.shape, pts: P.map((p) => pt(p.x / g.zw, p.y / g.zh, p.hx / g.zw, p.hy / g.zh)) }).map(([x, y]) => [x * g.zw, y * g.zh]);
  const xs = out.map((p) => p[0]);
  const ys = out.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const nw = Math.max(8, Math.max(...xs) - minX);
  const nh = Math.max(8, Math.max(...ys) - minY);
  const mx = minX + nw / 2 - g.zw / 2;
  const my = minY + nh / 2 - g.zh / 2;
  const ncx = g.cx + mx * g.cos - my * g.sin;
  const ncy = g.cy + mx * g.sin + my * g.cos;
  const w = Math.min(100, (nw / W) * 100);
  const h = Math.min(100, (nh / H) * 100);
  return {
    pts: P.map((p) => pt(r3(clamp((p.x - minX) / nw, 0, 1)), r3(clamp((p.y - minY) / nh, 0, 1)), r3(p.hx / nw), r3(p.hy / nh))),
    x: r2(clamp((ncx / W) * 100 - w / 2, 0, 100 - w)),
    y: r2(clamp((ncy / H) * 100 - h / 2, 0, 100 - h)),
    w: r2(w),
    h: r2(h),
    widthCm: cmOf((z.widthCm * nw) / g.zw),
    heightCm: cmOf((z.heightCm * nh) / g.zh),
  };
}

/**
 * ส่วนพิมพ์ทั้งหมดของรุ่น — รูปเดียวเห็นทุกส่วนที่อยู่บนรูปนั้น (คนละสี) · เพิ่มส่วนใหม่ลงรูปที่เปิดอยู่
 * ทรง: สี่เหลี่ยม · วงกลม/วงรี · สามเหลี่ยม · สี่เหลี่ยมดัดทรง · ปากกา (ทุกทรงตัดลายตามขอบ — กฎ lib/website-print-design)
 */
function ZonesBoard({
  zones,
  onChange,
  imageOptions,
  fallbackImageKey,
}: {
  zones: PrintZone[];
  onChange: (zones: PrintZone[]) => void;
  imageOptions: { key: string; label: string }[];
  fallbackImageKey: string | null;
}) {
  const keyOf = (z: PrintZone) => z.imageKey ?? fallbackImageKey;
  const images = useMemo(
    () => [...(fallbackImageKey ? [{ key: fallbackImageKey, label: "รูปแรกของสินค้า" }] : []), ...imageOptions].filter((o, i, a) => a.findIndex((x) => x.key === o.key) === i),
    [imageOptions, fallbackImageKey],
  );
  const [img, setImg] = useState<string | null>(() => (zones[0] ? (zones[0].imageKey ?? fallbackImageKey) : fallbackImageKey));
  const [selId, setSelId] = useState<string | null>(() => zones[0]?.id ?? null);
  const [pen, setPen] = useState<PenDraft | null>(null);
  const [imgAr, setImgAr] = useState<number | null>(null);
  const cur = img ?? images[0]?.key ?? null;
  const selIdx = zones.findIndex((z) => z.id === selId);
  const sel = selIdx >= 0 ? zones[selIdx] : null;
  const setZone = (i: number, patch: Partial<PrintZone>) => onChange(zones.map((z, k) => (k === i ? { ...z, ...patch } : z)));
  const labelOf = (key: string | null) => images.find((o) => o.key === key)?.label ?? "รูปสินค้า";
  const openImage = (key: string | null) => {
    setPen(null);
    if (key !== cur) setImgAr(null);
    setImg(key);
  };
  const pick = (z: PrintZone) => {
    setSelId(z.id);
    openImage(keyOf(z));
  };

  const add = () => {
    // ขนาดจริงของส่วนใหม่ ใช้สเกลของส่วนที่อยู่บนรูปเดียวกัน (ซม. ต่อ 1% ของรูป)
    const ref = zones.find((z) => keyOf(z) === cur);
    const n = zones.length;
    const w = 34;
    const h = 24;
    const id = `z${Date.now().toString(36).slice(-4)}`;
    const z: PrintZone = {
      ...newPrintZone(n),
      id,
      imageKey: cur && cur !== fallbackImageKey ? cur : null,
      x: 33 + (n % 3) * 5,
      y: 38 + (n % 3) * 5,
      w,
      h,
      widthCm: cmOf(ref ? (w * ref.widthCm) / ref.w : 15),
      heightCm: cmOf(ref ? (h * ref.heightCm) / ref.h : 10),
    };
    onChange([...zones, z]);
    setSelId(id);
    setPen(null);
  };
  const remove = (i: number) => {
    const next = zones.filter((_, k) => k !== i);
    onChange(next);
    setPen(null);
    setSelId(next.find((z) => keyOf(z) === cur)?.id ?? next[0]?.id ?? null);
  };
  const setShape = (shape: PrintZoneShape) => {
    if (!sel) return;
    if (shape === "pen") {
      setPen({ idx: selIdx, pts: [] });
      return;
    }
    setPen(null);
    setZone(selIdx, { shape, pts: defaultShapePoints(shape) });
  };
  const finishPen = () => {
    if (!pen || pen.pts.length < 3 || !zones[pen.idx]) return;
    setZone(pen.idx, zoneFromPen(zones[pen.idx], pen.pts));
    setPen(null);
  };

  // ระหว่างวาดด้วยปากกา: Enter = ปิดรูป · Esc = ยกเลิก
  useEffect(() => {
    if (!pen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPen(null);
      else if (e.key === "Enter" && pen.pts.length >= 3 && zones[pen.idx]) {
        e.preventDefault();
        onChange(zones.map((z, k) => (k === pen.idx ? { ...z, ...zoneFromPen(z, pen.pts) } : z)));
        setPen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pen, zones, onChange]);

  // สัดส่วนกรอบบนรูปเทียบขนาดจริง ซม. (ไม่ตรง = ลายบนเว็บดูยืด/บีบ)
  const boxRatio = sel && imgAr && keyOf(sel) === cur ? sel.w / (sel.h * imgAr) : null;
  const cmRatio = sel ? sel.widthCm / sel.heightCm : 1;
  const off = boxRatio ? Math.abs(boxRatio / cmRatio - 1) > 0.12 : false;
  const fitH = sel && boxRatio ? clamp(Math.round((sel.widthCm / boxRatio) * 2) / 2, 2, 120) : 0;
  const notRound = sel?.shape === "ellipse" && imgAr ? Math.abs(sel.h * imgAr - sel.w) > 0.5 : false;

  if (!zones.length) return <p className="text-[11px] text-slate-400">ยังไม่มีส่วนพิมพ์ — เปิดสวิตช์ด้านบนก่อน</p>;
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {images
            .filter((o) => o.key === cur || zones.some((z) => keyOf(z) === o.key))
            .map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => openImage(o.key)}
                className={`flex items-center gap-1.5 rounded-md border py-0.5 pl-0.5 pr-2 text-[11px] ${o.key === cur ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(o.key, 80)} alt="" className="h-7 w-7 rounded object-cover" />
                {o.label} · {zones.filter((z) => keyOf(z) === o.key).length} ส่วน
              </button>
            ))}
          {images.length > 1 && (
            <select value="" onChange={(e) => e.target.value && openImage(e.target.value)} className="h-8 rounded-md border border-slate-300 px-2 text-[11px] text-slate-600">
              <option value="">เปิดรูปอื่น…</option>
              {images.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_17rem]">
        <ZoneCanvas imageKey={cur} zones={zones} keyOf={keyOf} selId={selId} pen={pen} setPen={setPen} onFinishPen={finishPen} onSelect={setSelId} onZone={setZone} onImageAr={setImgAr} />
        <div className="space-y-2">
          <div className="space-y-1">
            {zones.map((z, i) => (
              <button
                key={z.id}
                type="button"
                onClick={() => pick(z)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${z.id === selId ? "border-slate-500 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: zoneColor(i) }} />
                <span className="min-w-0 flex-1 truncate">
                  {i + 1}. {z.label}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">{keyOf(z) === cur ? printZoneShapeLabel(z.shape) : `อยู่${labelOf(keyOf(z))}`}</span>
              </button>
            ))}
            {zones.length < PRINT_MAX_ZONES && (
              <button type="button" onClick={add} className="w-full rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-blue-400">
                ＋ เพิ่มอีกส่วน (บนรูปนี้ สีใหม่)
              </button>
            )}
          </div>

          {sel && (
            <div className="space-y-2 rounded-lg border p-2" style={{ borderColor: zoneColor(selIdx) }}>
              <label className="block space-y-0.5">
                <span className="text-[11px] text-slate-500">ชื่อส่วน (ลูกค้าเห็น)</span>
                <input value={sel.label} onChange={(e) => setZone(selIdx, { label: e.target.value.slice(0, 40) })} className="h-8 w-full rounded-md border border-slate-300 px-2" />
              </label>
              <label className="block space-y-0.5">
                <span className="text-[11px] text-slate-500">ชื่ออังกฤษ (ไม่ใส่ก็ได้)</span>
                <input value={sel.labelEn} onChange={(e) => setZone(selIdx, { labelEn: e.target.value.slice(0, 40) })} className="h-8 w-full rounded-md border border-slate-300 px-2" />
              </label>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-500">ทรง (ลายที่เกินขอบทรงจะไม่ถูกพิมพ์)</span>
                <div className="grid grid-cols-5 gap-1">
                  {PRINT_ZONE_SHAPES.map((s) => {
                    const on = pen ? s.id === "pen" : sel.shape === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        title={s.label}
                        onClick={() => setShape(s.id)}
                        className={`grid justify-items-center gap-0.5 rounded-md border px-0.5 py-1 text-[10px] leading-tight ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}
                      >
                        <svg viewBox="-6 -6 112 112" className="h-5 w-5" aria-hidden>
                          <path d={SHAPE_ICON[s.id]} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={8} strokeLinejoin="round" />
                        </svg>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                {pen ? (
                  <div className="space-y-1.5 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">
                    <p>คลิกบนรูปเพื่อวางจุด = มุมแหลม · กดค้างแล้วลาก = เส้นโค้ง · คลิกจุดแรก (วงใหญ่) เพื่อปิดรูป · Enter = เสร็จ · Esc = ยกเลิก</p>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={finishPen} disabled={pen.pts.length < 3} className="rounded border border-blue-300 bg-white px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">
                        ปิดรูป (เสร็จ) · {pen.pts.length} จุด
                      </button>
                      <button type="button" onClick={() => setPen(null)} className="rounded px-2 py-0.5 text-slate-600 hover:bg-white">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">{SHAPE_TIP[sel.shape]}</p>
                )}
                {notRound && !pen && (
                  <button type="button" onClick={() => setZone(selIdx, { h: r2(clamp(sel.w / imgAr!, 1, 100 - sel.y)), heightCm: sel.widthCm })} className="text-[11px] text-blue-600 hover:underline">
                    ทำเป็นวงกลมพอดี
                  </button>
                )}
              </div>

              <label className="block space-y-0.5">
                <span className="text-[11px] text-slate-500">อยู่บนรูป</span>
                <select
                  value={sel.imageKey ?? ""}
                  onChange={(e) => {
                    setZone(selIdx, { imageKey: e.target.value || null });
                    openImage(e.target.value || fallbackImageKey);
                  }}
                  className="h-8 w-full rounded-md border border-slate-300 px-2"
                >
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
                  <StepInput value={sel.widthCm} onChange={(n) => setZone(selIdx, { widthCm: clamp(n ?? 2, 2, 120) })} step={0.5} min={2} max={120} unit="ซม." className="h-8 w-full" />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[11px] text-slate-500">สูงจริง</span>
                  <StepInput value={sel.heightCm} onChange={(n) => setZone(selIdx, { heightCm: clamp(n ?? 2, 2, 120) })} step={0.5} min={2} max={120} unit="ซม." className="h-8 w-full" />
                </label>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>หมุนกรอบ</span>
                  {sel.rot !== 0 && (
                    <button type="button" onClick={() => setZone(selIdx, { rot: 0 })} className="text-blue-600 hover:underline">
                      ตั้งตรง (0°)
                    </button>
                  )}
                </div>
                <StepInput value={sel.rot} onChange={(n) => setZone(selIdx, { rot: normRot(n ?? 0) })} step={1} min={-180} max={180} integer unit="°" className="h-8 w-full" />
              </div>
              {off && boxRatio && (
                <div className="space-y-1 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                  <p>
                    สัดส่วนกรอบบนรูป (กว้าง:สูง ≈ {boxRatio.toFixed(2)}) ไม่ตรงกับขนาดจริง ({cmRatio.toFixed(2)}) — ลายบนเว็บจะดูยืดหรือบีบ
                  </p>
                  <button type="button" onClick={() => setZone(selIdx, { heightCm: fitH })} className="rounded border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100">
                    ปรับความสูงจริงให้ตรงกรอบ ({fitH} ซม.)
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-400">
                วัดพื้นที่ที่รีดได้จริงบนกระเป๋า (เว้นตะเข็บ/หูหิ้ว) · ทรงอื่นวัดจากกรอบสี่เหลี่ยมที่ครอบทรง · รูปทุกสีควรถ่ายมุมเดียวกัน เว็บจะสลับรูปตามสีที่ลูกค้าเลือกให้เอง
              </p>
              <button type="button" onClick={() => remove(selIdx)} className="text-xs text-rose-600 hover:underline">
                ลบส่วนนี้
              </button>
            </div>
          )}
        </div>
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

type ZoneDrag = {
  i: number;
  mode: "move" | "rot" | "size" | "pt" | "edge" | "hnd";
  h?: Handle;
  k?: number;
  mirror?: boolean;
  px: number;
  py: number;
  /** ค่าส่วนพิมพ์ตอนเริ่มลาก — คิดจากค่านี้ทุกครั้ง (ไม่สะสมเศษปัดระหว่างลาก) */
  z: PrintZone;
  l0: { x: number; y: number };
  W: number;
  H: number;
  L: number;
  T: number;
};

/**
 * รูปหนึ่งรูป + ทุกส่วนพิมพ์ที่อยู่บนรูปนั้น (สีตามลำดับ)
 * ส่วนที่เลือก: ลากข้างใน = ย้าย · จุดเหลี่ยม 8 จุด = ย่อ/ขยาย (ฝั่งตรงข้ามอยู่กับที่ — คิดตามแนวที่กรอบหมุน) · วงกลมด้านบน = หมุน
 * ทรงที่ใช้จุด: จุดขาว = ขยับทีละมุม · จุดสีกลางด้าน = เลื่อนทั้งด้าน · ปากกา: ก้านดัดโค้ง + ดับเบิลคลิกสลับมุมแหลม/โค้ง
 */
function ZoneCanvas({
  imageKey,
  zones,
  keyOf,
  selId,
  pen,
  setPen,
  onFinishPen,
  onSelect,
  onZone,
  onImageAr,
}: {
  imageKey: string | null;
  zones: PrintZone[];
  keyOf: (z: PrintZone) => string | null;
  selId: string | null;
  pen: PenDraft | null;
  setPen: Dispatch<SetStateAction<PenDraft | null>>;
  onFinishPen: () => void;
  onSelect: (id: string) => void;
  onZone: (i: number, patch: Partial<PrintZone>) => void;
  onImageAr: (ar: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<ZoneDrag | null>(null);
  const penDrag = useRef<{ k: number; W: number; H: number; L: number; T: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  // รูปที่โหลดจากแคชก่อนหน้าจอพร้อม = onLoad ไม่ยิง → อ่านสัดส่วนเองหลังวาด
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth) onImageAr(el.naturalHeight / el.naturalWidth);
  }, [imageKey, onImageAr]);

  const capture = (e: React.PointerEvent) => {
    try {
      wrap.current?.setPointerCapture(e.pointerId);
    } catch {
      /* บางเบราว์เซอร์ไม่ให้จับ — ยังลากได้ตราบที่เมาส์อยู่ในกรอบรูป */
    }
  };
  const start =
    (i: number, mode: ZoneDrag["mode"], extra?: { h?: Handle; k?: number; mirror?: boolean }) =>
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const z = zones[i];
      onSelect(z.id);
      drag.current = { i, mode, ...extra, px: e.clientX, py: e.clientY, z, l0: toLocal(zoneGeo(z, r.width, r.height), e.clientX - r.left, e.clientY - r.top), W: r.width, H: r.height, L: r.left, T: r.top };
      capture(e);
    };

  const penDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const r = box.current?.getBoundingClientRect();
    if (!pen || !r) return;
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const fy = clamp((e.clientY - r.top) / r.height, 0, 1);
    const p0 = pen.pts[0];
    if (pen.pts.length >= 3 && Math.hypot((fx - p0.x) * r.width, (fy - p0.y) * r.height) <= 10) {
      onFinishPen();
      return;
    }
    if (pen.pts.length >= PRINT_ZONE_MAX_POINTS) return;
    setPen({ ...pen, pts: [...pen.pts, pt(r3(fx), r3(fy))] });
    penDrag.current = { k: pen.pts.length, W: r.width, H: r.height, L: r.left, T: r.top };
    capture(e);
  };

  const move = (e: React.PointerEvent) => {
    if (pen) {
      const r = box.current?.getBoundingClientRect();
      if (r) setHover({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      const pd = penDrag.current;
      if (!pd) return;
      // กดค้างแล้วลาก = ดึงก้านโค้งของจุดที่เพิ่งวาง
      const fx = (e.clientX - pd.L) / pd.W;
      const fy = (e.clientY - pd.T) / pd.H;
      setPen((p) => {
        const q = p?.pts[pd.k];
        if (!p || !q || Math.hypot((fx - q.x) * pd.W, (fy - q.y) * pd.H) < 5) return p;
        const pts = p.pts.slice();
        pts[pd.k] = { ...q, hx: r3(fx - q.x), hy: r3(fy - q.y) };
        return { ...p, pts };
      });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const { z, W, H } = d;
    const g = zoneGeo(z, W, H);
    const px = e.clientX - d.L;
    const py = e.clientY - d.T;
    if (d.mode === "move") {
      onZone(d.i, { x: r2(clamp(z.x + ((e.clientX - d.px) / W) * 100, 0, 100 - z.w)), y: r2(clamp(z.y + ((e.clientY - d.py) / H) * 100, 0, 100 - z.h)) });
    } else if (d.mode === "rot") {
      let deg = normRot((Math.atan2(py - g.cy, px - g.cx) * 180) / Math.PI + 90);
      for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(deg - snap) <= 3) deg = snap === -180 ? 180 : snap;
      onZone(d.i, { rot: deg });
    } else if (d.mode === "size" && d.h) {
      const { sx, sy } = d.h;
      const { cos, sin, zw, zh, cx, cy } = g;
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
      onZone(d.i, { w: r2(w), h: r2(h), x: r2(clamp((ncx / W) * 100 - w / 2, 0, 100 - w)), y: r2(clamp((ncy / H) * 100 - h / 2, 0, 100 - h)) });
    } else if (d.k !== undefined) {
      // แก้จุดของทรง (px ในแนวกรอบ) แล้วให้กรอบครอบทรงใหม่พอดี
      const l = toLocal(g, px, py);
      const dx = l.x - d.l0.x;
      const dy = l.y - d.l0.y;
      const P = z.pts.map((p) => pt(p.x * g.zw, p.y * g.zh, p.hx * g.zw, p.hy * g.zh));
      const k = d.k;
      const nudge = (j: number) => (P[j] = { ...P[j], x: P[j].x + dx, y: P[j].y + dy });
      if (d.mode === "pt") nudge(k);
      else if (d.mode === "edge") {
        nudge(k);
        nudge((k + 1) % P.length);
      } else if (d.mode === "hnd") {
        const s = d.mirror ? -1 : 1;
        P[k] = { ...P[k], hx: s * (l.x - P[k].x), hy: s * (l.y - P[k].y) };
      }
      onZone(d.i, reshapeZone(z, W, H, P));
    }
  };
  const end = () => {
    drag.current = null;
    penDrag.current = null;
  };
  /** ดับเบิลคลิกจุดของปากกา = สลับมุมแหลม ↔ โค้ง */
  const toggleSmooth = (i: number, k: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const z = zones[i];
    const g = zoneGeo(z, r.width, r.height);
    const P = z.pts.map((p) => pt(p.x * g.zw, p.y * g.zh, p.hx * g.zw, p.hy * g.zh));
    const q = P[k];
    if (q.hx || q.hy) P[k] = { ...q, hx: 0, hy: 0 };
    else {
      const a = P[(k - 1 + P.length) % P.length];
      const b = P[(k + 1) % P.length];
      P[k] = { ...q, hx: (b.x - a.x) / 4, hy: (b.y - a.y) / 4 };
    }
    onZone(i, reshapeZone(z, r.width, r.height, P));
  };

  if (!imageKey) return <div className="grid min-h-40 place-items-center rounded-md bg-slate-100 text-xs text-slate-400">ยังไม่มีรูปสินค้า — เพิ่มรูปเว็บก่อน</div>;
  const here = zones
    .map((z, i) => ({ z, i }))
    .filter(({ z, i }) => keyOf(z) === imageKey && !(pen && pen.idx === i))
    .sort((a, b) => Number(a.z.id === selId) - Number(b.z.id === selId));
  const penColor = pen ? zoneColor(pen.idx) : "";
  const penPath = (pen?.pts ?? [])
    .map((b, i, all) => {
      if (!i) return `M${b.x * 100} ${b.y * 100}`;
      const a = all[i - 1];
      return a.hx || a.hy || b.hx || b.hy ? `C${(a.x + a.hx) * 100} ${(a.y + a.hy) * 100} ${(b.x - b.hx) * 100} ${(b.y - b.hy) * 100} ${b.x * 100} ${b.y * 100}` : `L${b.x * 100} ${b.y * 100}`;
    })
    .join("");
  const lastPen = pen?.pts[pen.pts.length - 1];
  return (
    <div className="space-y-1">
      {/* เว้นขอบรอบรูป ให้จุดจับที่อยู่ริมรูปกดได้ */}
      <div ref={wrap} className="select-none rounded-md bg-slate-100 p-5" style={{ touchAction: "none" }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={() => setHover(null)}>
        <div ref={box} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={img}
            src={imgUrl(imageKey)}
            alt=""
            className="block w-full rounded"
            draggable={false}
            onLoad={(e) => e.currentTarget.naturalWidth && onImageAr(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
          />
          {here.map(({ z, i }) => {
            const on = z.id === selId && !pen;
            const c = zoneColor(i);
            const usesPts = z.shape === "tri" || z.shape === "quad" || z.shape === "pen";
            return (
              <div key={z.id} className="pointer-events-none absolute" style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, transform: `rotate(${z.rot}deg)`, zIndex: on ? 2 : 1 }}>
                <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {on && z.shape !== "rect" && <rect width="100" height="100" fill="none" stroke={c} strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                  <path
                    d={printZonePath(z)}
                    fill={c}
                    fillOpacity={on ? 0.15 : 0.08}
                    stroke={c}
                    strokeWidth={on ? 2 : 1.5}
                    strokeDasharray={on ? undefined : "6 4"}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className={pen ? "" : "pointer-events-auto cursor-move"}
                    onPointerDown={start(i, "move")}
                  />
                  {on &&
                    z.shape === "pen" &&
                    z.pts.map((p, k) =>
                      p.hx || p.hy ? <line key={k} x1={(p.x - p.hx) * 100} y1={(p.y - p.hy) * 100} x2={(p.x + p.hx) * 100} y2={(p.y + p.hy) * 100} stroke={c} strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null,
                    )}
                </svg>
                <span className="pointer-events-none absolute -bottom-6 left-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: c }}>
                  {i + 1}. {z.label}
                  {on ? ` · ${z.widthCm}×${z.heightCm} ซม.${z.rot ? ` · ${z.rot}°` : ""}` : ""}
                </span>
                {on && (
                  <>
                    <span className="pointer-events-none absolute left-1/2 top-0 h-5 w-px -translate-y-full" style={{ background: c }} />
                    <span
                      onPointerDown={start(i, "rot")}
                      title="ลากเพื่อหมุน"
                      className="pointer-events-auto absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 -translate-y-[calc(100%+18px)] cursor-grab rounded-full border-2 bg-white shadow"
                      style={{ borderColor: c }}
                    />
                    {HANDLES.map((h) => (
                      <span
                        key={`${h.sx}${h.sy}`}
                        onPointerDown={start(i, "size", { h })}
                        title="ลากเพื่อย่อ/ขยาย"
                        className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white shadow"
                        style={{ left: `${(h.sx + 1) * 50}%`, top: `${(h.sy + 1) * 50}%`, cursor: handleCursor(h), background: c }}
                      />
                    ))}
                    {(z.shape === "tri" || z.shape === "quad") &&
                      z.pts.map((p, k) => {
                        const q = z.pts[(k + 1) % z.pts.length];
                        return (
                          <span
                            key={`e${k}`}
                            onPointerDown={start(i, "edge", { k })}
                            title="ลากเพื่อเลื่อนทั้งด้าน"
                            className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-white shadow"
                            style={{ left: `${((p.x + q.x) / 2) * 100}%`, top: `${((p.y + q.y) / 2) * 100}%`, background: c }}
                          />
                        );
                      })}
                    {z.shape === "pen" &&
                      z.pts.flatMap((p, k) =>
                        p.hx || p.hy
                          ? [1, -1].map((s) => (
                              <span
                                key={`h${k}${s}`}
                                onPointerDown={start(i, "hnd", { k, mirror: s < 0 })}
                                title="ลากเพื่อดัดโค้ง"
                                className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-white shadow"
                                style={{ left: `${(p.x + s * p.hx) * 100}%`, top: `${(p.y + s * p.hy) * 100}%`, background: c }}
                              />
                            ))
                          : [],
                      )}
                    {usesPts &&
                      z.pts.map((p, k) => (
                        <span
                          key={`p${k}`}
                          onPointerDown={start(i, "pt", { k })}
                          onDoubleClick={z.shape === "pen" ? toggleSmooth(i, k) : undefined}
                          title={z.shape === "pen" ? "ลากเพื่อย้ายจุด · ดับเบิลคลิก = สลับมุมแหลม/โค้ง" : "ลากเพื่อขยับมุมนี้"}
                          className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 bg-white shadow"
                          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, borderColor: c }}
                        />
                      ))}
                  </>
                )}
              </div>
            );
          })}
          {pen && (
            <div className="absolute inset-0 z-10 cursor-crosshair" onPointerDown={penDown}>
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={penPath} fill="none" stroke={penColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {lastPen && hover && <line x1={lastPen.x * 100} y1={lastPen.y * 100} x2={hover.x * 100} y2={hover.y * 100} stroke={penColor} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                {pen.pts.map((p, k) =>
                  p.hx || p.hy ? <line key={k} x1={(p.x - p.hx) * 100} y1={(p.y - p.hy) * 100} x2={(p.x + p.hx) * 100} y2={(p.y + p.hy) * 100} stroke={penColor} strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null,
                )}
              </svg>
              {pen.pts.map((p, k) => (
                <span
                  key={k}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white ${k === 0 ? "h-5 w-5" : "h-3 w-3"}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, borderColor: penColor }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        {pen ? "กำลังวาดด้วยปากกา — คลิกวางจุด · กดค้างลาก = โค้ง · คลิกจุดแรกเพื่อปิดรูป" : "คลิกที่กรอบเพื่อเลือก · ลากกลางกรอบ = ย้าย · จุดเหลี่ยม = ย่อ/ขยาย · วงกลมด้านบน = หมุน (ใกล้ 0°/90° จะดีดเข้าเอง)"}
      </p>
    </div>
  );
}
