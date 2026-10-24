"use client";

/**
 * PersonalizeEditor — ตั้งค่า "ปั๊มชื่อ" ของรุ่นในร้านหนึ่ง (ใช้ในแท็บ 🛍 เว็บไซต์ ของ Parent SKU)
 *   - เปิด/ปิด · จำนวนตัวอักษรสูงสุด · แบบที่อนุญาต (จม/เงิน/ทอง) · รูปฉาก
 *   - ตำแหน่ง 2 จุด (ตรงกลาง / มุมขวาล่าง): ลากข้อความบนรูปเพื่อวาง + จัดชิดซ้าย/กลาง/ขวา + ขนาด + เอียง · เปิด/ปิดแต่ละจุด
 *   - ตัวอักษร: ความห่าง · กลุ่มตัวที่ปั๊มได้ · เปลี่ยนเป็นตัวใหญ่อัตโนมัติ · ตัวพิเศษ (♥ ★ …)
 *   - 🎨 แท็บ ⭐ ค่าหลัก (ทุกสี) / รายสี: ติ๊ก "ตั้งค่าแยกสำหรับสีนี้" = ตำแหน่ง (x/y/ขนาด/เอียง/จัดชิด) + เอฟเฟกต์ ของสีนั้นเอง
 *        ไม่ติ๊ก = ใช้ค่าหลัก · ค่าที่ใช้ร่วม (เปิด/ปิดตำแหน่ง · ชื่อตำแหน่ง · ตัวอักษร) แก้ที่แท็บค่าหลักเท่านั้น
 *   - 🎚 เอฟเฟกต์ตัวอักษรแบบ Photoshop แยกแท็บ พิมพ์จม (Bevel & Emboss · Inner Shadow · Outer Glow)
 *        / เงิน · ทอง (สีเดียว/ไล่สี 2–6 ระดับ + Bevel & Emboss · Drop Shadow · Inner Shadow) — พรีวิวด้วย SVG ตัวเดียวกับเว็บร้าน
 *   - พรีวิวเหมือนเว็บจริง (ฟอนต์ Times New Roman + เอฟเฟกต์เดียวกัน)
 *   - 🖼 แท็บฉากพรีวิว: ⭐ ฉากหลัก / ฉากเพิ่ม (รูปมุมอื่น สูงสุด 8) — ฉากเพิ่มมีรูป · ชื่อ · ตำแหน่งของตัวเอง (ลากบนรูป) · ติ๊กว่าตำแหน่งไหนเห็นในฉากนั้น
 *        ใช้ร่วมทุกสี (แท็บสี = ดูรูปมุมเดียวกันของสีนั้น + เอฟเฟกต์ของสีนั้น)
 * ของกลาง: lib/website-personalize.ts (ชนิดข้อมูล/ค่าเริ่มต้น/ตัวกรอง/ตำแหน่งข้อความ)
 */
import { useCallback, useId, useRef, useState } from "react";
import { RangeInput } from "@/components/range-input";
import { ColorInput } from "@/components/color-picker";
import { askConfirm } from "@/components/modal/ask-dialog";
import {
  PERSONALIZE_ALIGNS,
  PERSONALIZE_ALIGN_OFFSET,
  PERSONALIZE_CHARSETS,
  PERSONALIZE_STYLES,
  DEFAULT_EMBOSS_FX,
  DEFAULT_FOIL_FX,
  EMBOSS_FX_RANGE,
  FOIL_FX_RANGE,
  FOIL_MAX_STOPS,
  FOIL_PRESETS,
  PERSONALIZE_MAX_SCENES,
  applyColorOverride,
  cleanPersonalizeText,
  makeColorOverride,
  makeScene,
  personalizeEmbossFilter,
  personalizeFoilCss,
  personalizeFoilFilter,
  personalizeFoilGradientEnds,
  parsePersonalizeSymbols,
  personalizeSplitLast,
  personalizeTextPlacement,
  sameAngleImage,
  type PersonalizeAlign,
  type PersonalizeConfig,
  type PersonalizeEmbossFx,
  type PersonalizeFoilFx,
  type PersonalizeFoilStyle,
  type PersonalizePosition,
  type PersonalizeScene,
  type PersonalizeStyle,
} from "@/lib/website-personalize";

const keyUrl = (key: string, w = 900) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
/** ชุดตัวพิเศษแนะนำ (มีในฟอนต์ทั่วไป) */
const SYMBOL_PRESET = "♥ ★ ✦ ∞ ✿ ☺";

/** เอฟเฟกต์ตัวอักษร (เหมือน storefront globals.css .pz-fx-*) */
export const PZ_STYLE: Record<PersonalizeStyle, React.CSSProperties> = {
  emboss: { color: "rgba(20,10,0,0.42)", mixBlendMode: "multiply", textShadow: "1px 1px 0 rgba(255,255,255,0.45), -1px -1px 1px rgba(0,0,0,0.55)" },
  silver: { color: "transparent", backgroundImage: "linear-gradient(180deg,#fdfdfd 0%,#c9ccd1 30%,#8e939a 48%,#eef0f2 58%,#a7abb1 78%,#6f747a 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.6))" },
  gold: { color: "transparent", backgroundImage: "linear-gradient(180deg,#fff1b8 0%,#f0cf6a 20%,#b98a2c 44%,#f9e08f 54%,#d4a640 70%,#8f6519 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.65)) drop-shadow(0 0 1px rgba(255,214,120,0.35))" },
};

type FxNum = keyof typeof EMBOSS_FX_RANGE;
/** ช่องตัวเลขของเอฟเฟกต์พิมพ์จม แบ่งตามชั้นของ Photoshop */
const FX_LAYERS: { key: "bevel" | "inner" | "glow" | null; title: string; th: string; rows: [FxNum, string, string][] }[] = [
  {
    key: "bevel",
    title: "Bevel & Emboss",
    th: "ขอบนูน/ยุบ",
    rows: [
      ["depth", "ความลึก (Depth)", "%"],
      ["size", "ขนาด (Size)", "px"],
      ["soften", "นุ่ม (Soften)", "px"],
      ["angle", "มุมแสง (Angle)", "°"],
      ["altitude", "ความสูงแสง (Altitude)", "°"],
      ["highlight", "ไฮไลต์ (Highlight)", "%"],
      ["shadow", "เงา (Shadow)", "%"],
    ],
  },
  { key: "inner", title: "Inner Shadow", th: "เงาในร่อง", rows: [["innerOpacity", "ความเข้ม (Opacity)", "%"], ["innerDistance", "ระยะ (Distance)", "px"], ["innerSize", "ขนาด (Size)", "px"]] },
  { key: "glow", title: "Outer Glow", th: "ขอบเข้มรอบตัว", rows: [["glowOpacity", "ความเข้ม (Opacity)", "%"], ["glowSpread", "กระจาย (Spread)", "%"], ["glowSize", "ขนาด (Size)", "px"]] },
  { key: null, title: "Fill", th: "เนื้อตัวอักษร", rows: [["fill", "ความทึบ (Fill)", "%"]] },
];

type FoilNum = keyof typeof FOIL_FX_RANGE;
/** ชั้นเอฟเฟกต์ของเงิน/ทอง (ชื่อตาม Photoshop + คำไทย) */
const FOIL_LAYERS: { key: "bevel" | "drop" | "inner"; title: string; th: string; rows: [FoilNum, string, string][] }[] = [
  {
    key: "bevel",
    title: "Bevel & Emboss",
    th: "ขอบนูน",
    rows: [
      ["depth", "ความลึก (Depth)", "%"],
      ["size", "ขนาด (Size)", "px"],
      ["angle", "มุมแสง (Angle)", "°"],
      ["altitude", "ความสูงแสง (Altitude)", "°"],
      ["highlight", "ไฮไลต์ (Highlight)", "%"],
      ["shadow", "เงาขอบ (Shadow)", "%"],
    ],
  },
  { key: "drop", title: "Drop Shadow", th: "เงาใต้ตัวอักษร", rows: [["dropOpacity", "ความเข้ม (Opacity)", "%"], ["dropDistance", "ระยะ (Distance)", "px"], ["dropSize", "ความฟุ้ง (Size)", "px"]] },
  { key: "inner", title: "Inner Shadow", th: "เงาด้านใน", rows: [["innerOpacity", "ความเข้ม (Opacity)", "%"], ["innerDistance", "ระยะ (Distance)", "px"], ["innerSize", "ขนาด (Size)", "px"]] },
];

export function PersonalizeEditor({
  value,
  onChange,
  imageOptions,
  fallbackImageKey,
  colors = [],
}: {
  value: PersonalizeConfig;
  onChange: (next: PersonalizeConfig) => void;
  /** รูปให้เลือกเป็นฉาก (key + ป้าย) */
  imageOptions: { key: string; label: string }[];
  /** รูปที่เว็บจะใช้เมื่อไม่ได้เลือก (รูปแรกของสินค้า) */
  fallbackImageKey: string | null;
  /** 🎨 สีของรุ่น (SKU ลูก) — id = คีย์ค่าแยกตามสี · imageKey = รูปที่เว็บใช้ตอนเลือกสีนั้น · images = รูปทั้งหมดของสี (ฉากเพิ่มใช้รูปลำดับเดียวกัน) */
  colors?: { id: string; label: string; imageKey: string | null; images?: string[] }[];
}) {
  const [preview, setPreview] = useState<PersonalizeStyle>(value.styles[0] ?? "emboss");
  const [active, setActive] = useState<PersonalizePosition["key"]>("center");
  const [sample, setSample] = useState("YOUR NAME");
  const [symDraft, setSymDraft] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // 🎚 พรีวิวพิมพ์จมเป็น SVG ต้องรู้ขนาดกรอบจริง (px) — วัดตอนกรอบโผล่ + รูปโหลด/จอเปลี่ยน
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const setStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const measure = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
    measure();
  }, []);
  const fxId = `pzfx-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // 🎨 แท็บสี: null = ค่าหลัก · ov = ค่าแยกของสีนั้น (ไม่มี = ใช้ค่าหลัก → ล็อกช่อง) · eff = ค่าที่ใช้จริงของแท็บนี้
  const [colorTab, setColorTab] = useState<string | null>(null);
  const tabColor = colors.find((c) => c.id === colorTab) ?? null;
  const ov = tabColor ? value.colorOverrides[tabColor.id] : undefined;
  const locked = !!tabColor && !ov;
  const eff = applyColorOverride(value, ov);
  const setOv = (p: Partial<NonNullable<typeof ov>>) => {
    if (!tabColor || !ov) return;
    set({ colorOverrides: { ...value.colorOverrides, [tabColor.id]: { ...ov, ...p } } });
  };
  const setFx = (p: Partial<PersonalizeEmbossFx>) => {
    if (tabColor) setOv({ embossFx: { ...eff.embossFx, ...p } });
    else set({ embossFx: { ...value.embossFx, ...p } });
  };
  const svgStamp = stageSize.w > 0 && stageSize.h > 0;
  const setFoil = (style: PersonalizeFoilStyle, p: Partial<PersonalizeFoilFx>) => {
    const foilFx = { ...eff.foilFx, [style]: { ...eff.foilFx[style], ...p } };
    if (tabColor) setOv({ foilFx });
    else set({ foilFx });
  };
  const previewFoil = preview === "emboss" ? null : eff.foilFx[preview];
  // 🖼 ฉากพรีวิว: null = ฉากหลัก · ฉากเพิ่ม = ตำแหน่งของฉากนั้น (ใช้ร่วมทุกสี → ไม่ล็อกตามแท็บสี)
  const [sceneId, setSceneId] = useState<string | null>(null);
  const scene = value.scenes.find((x) => x.id === sceneId) ?? null;
  const sceneNo = scene ? value.scenes.indexOf(scene) + 2 : 1;
  const posLocked = !scene && locked;
  /** ตำแหน่งที่วาด/แก้: ฉากหลัก = ค่าของแท็บสี · ฉากเพิ่ม = ค่าของฉาก (เห็น = เปิดในค่าหลัก + ติ๊กโชว์ในฉาก) */
  const stagePositions: PersonalizePosition[] = scene
    ? eff.positions.map((p) => {
        const sp = scene.positions.find((x) => x.key === p.key);
        return sp ? { ...p, x: sp.x, y: sp.y, size: sp.size, rotate: sp.rotate, align: sp.align, enabled: p.enabled && sp.show } : { ...p, enabled: false };
      })
    : eff.positions;
  const setScene = (p: Partial<PersonalizeScene>) => {
    if (scene) set({ scenes: value.scenes.map((x) => (x.id === scene.id ? { ...x, ...p } : x)) });
  };
  const addScene = () => {
    const used = new Set([value.imageKey ?? fallbackImageKey, ...value.scenes.map((x) => x.imageKey)]);
    const img = imageOptions.find((o) => !used.has(o.key))?.key ?? imageOptions[0]?.key;
    if (!img || value.scenes.length >= PERSONALIZE_MAX_SCENES) return;
    const sc = makeScene(value, img);
    set({ scenes: [...value.scenes, sc] });
    setSceneId(sc.id);
  };
  const removeScene = async () => {
    if (!scene) return;
    if (!(await askConfirm({ title: `ลบ "${scene.label || `ฉาก ${sceneNo}`}"?`, message: "ตำแหน่งที่ตั้งไว้ในฉากนี้จะหายไป (มีผลเมื่อกดบันทึก)", variant: "danger", confirmText: "ลบฉาก" }))) return;
    set({ scenes: value.scenes.filter((x) => x.id !== scene.id) });
    setSceneId(null);
  };
  const textRefs = useRef<Partial<Record<PersonalizePosition["key"], HTMLDivElement | null>>>({});
  const [imgW, setImgW] = useState(600);
  const set = (p: Partial<PersonalizeConfig>) => onChange({ ...value, ...p });
  /** ตำแหน่ง: เปิด/ปิด + ชื่อ = ใช้ร่วมทุกสี (ค่าหลัก) · x/y/ขนาด/เอียง/จัดชิด = ของแท็บที่เปิด (สีที่แยกค่า หรือค่าหลัก) */
  const setPos = (key: PersonalizePosition["key"], p: Partial<PersonalizePosition>) => {
    const { enabled, label, ...geo } = p;
    if (scene) {
      setScene({ positions: scene.positions.map((x) => (x.key === key ? { ...x, ...geo, ...(enabled !== undefined ? { show: enabled } : {}) } : x)) });
      return;
    }
    if (enabled !== undefined || label !== undefined) {
      if (tabColor) return;
      set({ positions: value.positions.map((x) => (x.key === key ? { ...x, ...(enabled !== undefined ? { enabled } : {}), ...(label !== undefined ? { label } : {}) } : x)) });
    }
    if (!Object.keys(geo).length || locked) return;
    if (tabColor && ov) setOv({ positions: ov.positions.map((x) => (x.key === key ? { ...x, ...geo } : x)) });
    else if (!tabColor) set({ positions: value.positions.map((x) => (x.key === key ? { ...x, ...geo } : x)) });
  };
  // ฉากเพิ่ม + แท็บสี = รูปลำดับเดียวกันของสีนั้น (เหมือนที่เว็บร้านสลับให้ลูกค้า)
  const imagesOf = (c: (typeof colors)[number]) => ({ images: c.images?.length ? c.images : c.imageKey ? [c.imageKey] : [] });
  const imageKey = scene ? sameAngleImage(scene.imageKey, colors.map(imagesOf), tabColor ? imagesOf(tabColor) : null) : (tabColor?.imageKey ?? value.imageKey ?? fallbackImageKey);
  const shown = cleanPersonalizeText(sample, value) ?? "YOUR NAME";

  /** เปลี่ยนการจัด → ขยับจุดยึดให้ข้อความตัวอย่างอยู่ที่เดิม (ไม่กระโดด) */
  const setAlign = (p: PersonalizePosition, align: PersonalizeAlign) => {
    const el = textRefs.current[p.key];
    const stageW = stageRef.current?.clientWidth ?? 0;
    const w = el && stageW ? (el.offsetWidth / stageW) * 100 : 0;
    const x = Math.round(Math.min(100, Math.max(0, p.x + (PERSONALIZE_ALIGN_OFFSET[align] - PERSONALIZE_ALIGN_OFFSET[p.align]) * w)) * 10) / 10;
    setPos(p.key, { align, x });
  };

  // ลากข้อความบนรูป → x/y เป็น % ของรูป
  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    if (posLocked) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = Math.round(Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)) * 10) / 10;
    const y = Math.round(Math.max(2, Math.min(98, ((e.clientY - r.top) / r.height) * 100)) * 10) / 10;
    setPos(active, { x, y });
  };
  const onUp = () => {
    dragging.current = false;
  };

  const chip = (on: boolean) => `px-2.5 py-1 rounded-full border text-xs ${on ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
  const [head, last] = personalizeSplitLast(shown);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <button type="button" role="switch" aria-checked={value.enabled} onClick={() => set({ enabled: !value.enabled })} className={`relative w-10 h-6 rounded-full transition-colors ${value.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value.enabled ? "translate-x-4" : ""}`} />
          </button>
          ปั๊มชื่อได้ (Personalized)
        </label>
        <label className="text-xs text-slate-600 flex items-center gap-1.5">
          สูงสุด
          <input type="number" min={1} max={30} value={value.maxChars} onChange={(e) => set({ maxChars: Math.min(30, Math.max(1, Number(e.target.value) || 10)) })} className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right" />
          ตัวอักษร
        </label>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          แบบที่ให้เลือก:
          {PERSONALIZE_STYLES.map((s) => {
            const on = value.styles.includes(s.value);
            return (
              <button key={s.value} type="button" onClick={() => set({ styles: on ? value.styles.filter((x) => x !== s.value) : [...value.styles, s.value] })} className={chip(on)}>
                {on ? "✓ " : ""}{s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 🎨 แท็บ ค่าหลัก / รายสี */}
      {value.enabled && colors.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setColorTab(null)} className={chip(!tabColor)}>
              ⭐ ค่าหลัก (ทุกสี)
            </button>
            {colors.map((c) => (
              <button key={c.id} type="button" onClick={() => setColorTab(c.id)} className={`${chip(colorTab === c.id)} inline-flex items-center gap-1.5`}>
                {c.imageKey && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={keyUrl(c.imageKey, 80)} alt="" className="w-4 h-4 rounded-full object-cover" />
                )}
                {c.label}
                {value.colorOverrides[c.id] && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">แยก</span>}
              </button>
            ))}
          </div>
          {tabColor ? (
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-orange-500"
                  checked={!!ov}
                  onChange={(e) => {
                    const next = { ...value.colorOverrides };
                    if (e.target.checked) next[tabColor.id] = makeColorOverride(value);
                    else delete next[tabColor.id];
                    set({ colorOverrides: next });
                  }}
                />
                ตั้งค่าแยกสำหรับสี &quot;{tabColor.label}&quot; <span className="text-slate-400">(ตำแหน่ง + เอฟเฟกต์)</span>
              </label>
              {ov ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...value.colorOverrides };
                    delete next[tabColor.id];
                    set({ colorOverrides: next });
                  }}
                  className="text-[11px] text-orange-600 hover:underline"
                >
                  ↺ กลับไปใช้ค่าหลัก
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">ตอนนี้ = ตามค่าหลัก (แก้ค่าหลักแล้วสีนี้เปลี่ยนตาม)</span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">ค่าหลักใช้กับทุกสีที่ไม่ได้ตั้งแยก · กดแท็บสีเพื่อดูบนรูปของสีนั้น หรือตั้งค่าแยกเฉพาะสี</p>
          )}
        </div>
      )}

      {value.enabled && (
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          {/* พรีวิว + ลากวางตำแหน่ง */}
          <div>
            {/* 🖼 ฉากพรีวิว — ฉากหลัก + รูปมุมอื่นที่ลูกค้ากดดูรอยปั๊มได้ */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5 text-[11px] text-slate-500">
              ฉากพรีวิว:
              <button type="button" onClick={() => setSceneId(null)} className={chip(!scene)}>
                ⭐ ฉากหลัก
              </button>
              {value.scenes.map((sc, i) => (
                <button key={sc.id} type="button" onClick={() => setSceneId(sc.id)} className={`${chip(scene?.id === sc.id)} inline-flex items-center gap-1.5`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={keyUrl(sc.imageKey, 80)} alt="" className="w-4 h-4 rounded object-cover" />
                  {sc.label || `ฉาก ${i + 2}`}
                </button>
              ))}
              {value.scenes.length < PERSONALIZE_MAX_SCENES && imageOptions.length > 0 && (
                <button type="button" onClick={addScene} className="text-orange-600 hover:underline" title="เพิ่มรูปมุมอื่นให้ลูกค้าดูรอยปั๊ม (ตั้งตำแหน่งแยกต่อรูป)">
                  + เพิ่มฉาก
                </button>
              )}
            </div>
            {scene && (
              <div className="flex items-center gap-2 mb-1.5">
                <input value={scene.label} onChange={(e) => setScene({ label: e.target.value.slice(0, 40) })} placeholder={`ชื่อฉาก เช่น มุมข้าง (ว่าง = ฉาก ${sceneNo})`} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                <button type="button" onClick={removeScene} className="text-[11px] text-red-600 hover:underline">
                  ลบฉากนี้
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              {scene ? (
                <select value={scene.imageKey} onChange={(e) => e.target.value && setScene({ imageKey: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs max-w-[60%]">
                  {!imageOptions.some((o) => o.key === scene.imageKey) && <option value={scene.imageKey}>รูปที่เลือกไว้ (ไม่อยู่ในรายการแล้ว)</option>}
                  {imageOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              ) : (
              <select value={value.imageKey ?? ""} onChange={(e) => set({ imageKey: e.target.value || null })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs max-w-[60%]">
                <option value="">รูปฉาก: รูปแรกของสินค้า (อัตโนมัติ)</option>
                {imageOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              )}
              <div className="flex items-center gap-1">
                {PERSONALIZE_STYLES.filter((s) => value.styles.includes(s.value)).map((s) => (
                  <button key={s.value} type="button" onClick={() => setPreview(s.value)} className={chip(preview === s.value)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div ref={setStage} className="relative rounded-xl overflow-hidden bg-slate-100 select-none" style={{ touchAction: "none" }}>
              {imageKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={keyUrl(imageKey)} alt="" className="block w-full h-auto pointer-events-none" onLoad={(e) => setImgW(e.currentTarget.clientWidth)} />
              ) : (
                <div className="aspect-square flex items-center justify-center text-sm text-slate-400">ยังไม่มีรูปสินค้า</div>
              )}
              {stagePositions.filter((p) => p.enabled).map((p) => (
                <div
                  key={p.key}
                  ref={(el) => {
                    textRefs.current[p.key] = el;
                  }}
                  onPointerDown={(e) => { setActive(p.key); onDown(e); }}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  title={`${p.label} — ลากเพื่อย้าย`}
                  className={`absolute whitespace-nowrap cursor-move leading-none ${active === p.key ? "outline outline-1 outline-dashed outline-orange-400 rounded" : ""}`}
                  style={{
                    ...personalizeTextPlacement(p),
                    padding: "0.1em 0",
                    fontFamily: '"Times New Roman", Times, serif',
                    letterSpacing: `${value.letterSpacing}em`,
                    fontSize: `${(imgW * p.size) / 100}px`,
                    ...(svgStamp ? { color: "transparent" } : PZ_STYLE[preview]),
                  }}
                >
                  {head}
                  <span style={{ letterSpacing: 0 }}>{last}</span>
                </div>
              ))}
              {/* 🎚 วาดด้วย SVG ตัวเดียวกับเว็บร้าน — พิมพ์จม (personalizeEmbossFilter) · เงิน/ทอง (สี + personalizeFoilFilter) */}
              {svgStamp && (
                <svg className="absolute left-0 top-0 pointer-events-none overflow-visible" width={stageSize.w} height={stageSize.h} viewBox={`0 0 ${stageSize.w} ${stageSize.h}`} aria-hidden>
                  {stagePositions.filter((p) => p.enabled).map((p) => {
                    const fontPx = (stageSize.w * p.size) / 100;
                    const x = (stageSize.w * p.x) / 100;
                    const y = (stageSize.h * p.y) / 100;
                    return (
                      <g key={p.key}>
                        <defs>
                          <filter
                            id={`${fxId}-${p.key}`}
                            x="-30%"
                            y="-60%"
                            width="160%"
                            height="220%"
                            colorInterpolationFilters="sRGB"
                            dangerouslySetInnerHTML={{ __html: previewFoil ? personalizeFoilFilter(previewFoil, fontPx) : personalizeEmbossFilter(eff.embossFx, fontPx) }}
                          />
                          {previewFoil?.mode === "gradient" && (
                            <linearGradient id={`${fxId}-g-${p.key}`} {...personalizeFoilGradientEnds(previewFoil.gradAngle)}>
                              {[...previewFoil.stops].sort((a, b) => a.pos - b.pos).map((st, i) => (
                                <stop key={i} offset={`${st.pos}%`} stopColor={st.color} />
                              ))}
                            </linearGradient>
                          )}
                        </defs>
                        <text
                          x={x}
                          y={y}
                          textAnchor={p.align === "left" ? "start" : p.align === "right" ? "end" : "middle"}
                          dominantBaseline="central"
                          transform={p.rotate ? `rotate(${p.rotate} ${x} ${y})` : undefined}
                          fontFamily='"Times New Roman", Times, serif'
                          fontSize={fontPx}
                          letterSpacing={`${value.letterSpacing}em`}
                          fill={!previewFoil ? "#000" : previewFoil.mode === "solid" ? previewFoil.solid : `url(#${fxId}-g-${p.key})`}
                          filter={`url(#${fxId}-${p.key})`}
                        >
                          {head}
                          <tspan letterSpacing="0">{last}</tspan>
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              {/* จุดยึดของตำแหน่งที่กำลังแก้ (ข้อความเริ่ม/กลาง/จบที่จุดนี้ตามการจัด) */}
              {stagePositions.filter((p) => p.enabled && p.key === active).map((p) => (
                <span key={`dot-${p.key}`} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-orange-500 ring-2 ring-white pointer-events-none" style={{ left: `${p.x}%`, top: `${p.y}%` }} title="จุดยึด" />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-slate-500">ข้อความตัวอย่าง</span>
              <input value={sample} onChange={(e) => setSample(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">จุดสีส้ม = จุดยึดของตำแหน่งที่เลือก · ชิดขวา = ชื่อยาวขึ้นจะงอกไปทางซ้าย ปลายชื่ออยู่ที่จุดเสมอ</p>
            {scene && <p className="text-[11px] text-sky-600 mt-1">🖼 ฉากนี้ใช้ร่วมทุกสี — เว็บสลับเป็นรูปมุมเดียวกันของสีที่ลูกค้าเลือกให้เอง · เอฟเฟกต์ใช้ของค่าหลัก/ค่าแยกสี · ตำแหน่งที่ไม่ติ๊ก &quot;โชว์ในฉากนี้&quot; = ฉากนี้เป็นรูปเปล่า</p>}
          </div>

          <div className="space-y-2">
            {/* ตำแหน่ง 2 จุด — แท็บสีที่ยังไม่แยกค่า = ล็อก (ดูค่าหลัก) · เปิด/ปิด + ชื่อ แก้ที่ค่าหลักเท่านั้น */}
            <fieldset disabled={posLocked} className={`space-y-2 ${posLocked ? "opacity-60" : ""}`}>
            {stagePositions.filter((p) => !scene || value.positions.find((m) => m.key === p.key)?.enabled).map((p) => {
              const shown = scene ? !!scene.positions.find((x) => x.key === p.key)?.show : p.enabled;
              return (
              <div key={p.key} className={`rounded-lg border p-2 space-y-1.5 ${active === p.key ? "border-orange-300 bg-orange-50/40" : "border-slate-200"}`} onClick={() => setActive(p.key)}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={shown} disabled={!scene && !!tabColor} onChange={(e) => setPos(p.key, { enabled: e.target.checked })} title={scene ? "โชว์รอยปั๊มตำแหน่งนี้ในฉากนี้ (ไม่เห็นในรูปนี้ = เอาติ๊กออก)" : tabColor ? "เปิด/ปิดตำแหน่ง แก้ที่แท็บค่าหลัก (ใช้ร่วมทุกสี)" : "ให้ลูกค้าเลือกตำแหน่งนี้ได้"} />
                  <input value={p.label} disabled={!!tabColor || !!scene} onChange={(e) => setPos(p.key, { label: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50" placeholder={p.key === "center" ? "ตรงกลาง" : "มุมขวาล่าง"} />
                  {scene && <span className="text-[11px] text-sky-600 whitespace-nowrap">{shown ? "โชว์ในฉากนี้" : "ไม่โชว์ในฉากนี้"}</span>}
                  <span className="text-[11px] text-slate-400">x {p.x}% · y {p.y}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  จัดข้อความ:
                  {PERSONALIZE_ALIGNS.map((a) => (
                    <button key={a.value} type="button" onClick={(e) => { e.stopPropagation(); setActive(p.key); setAlign(p, a.value); }} className={chip(p.align === a.value)}>{a.label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <RangeInput label={<span className="text-[11px] text-slate-500">ขนาดตัวอักษร (% ของความกว้างรูป)</span>} min={1} max={20} step={0.5} hardMax={30} unit="%" value={p.size} onChange={(v) => setPos(p.key, { size: v })} />
                  <RangeInput label={<span className="text-[11px] text-slate-500">เอียง</span>} min={-30} max={30} step={1} hardMin={-45} hardMax={45} unit="°" value={p.rotate} onChange={(v) => setPos(p.key, { rotate: v })} />
                </div>
              </div>
              );
            })}
            </fieldset>

            {/* ตัวอักษร — ใช้ร่วมทุกสี (แก้ที่แท็บค่าหลัก) */}
            <fieldset disabled={!!tabColor} className={`rounded-lg border border-slate-200 p-2 space-y-2 ${tabColor ? "opacity-60" : ""}`}>
              <p className="text-xs font-medium text-slate-700">ตัวอักษร</p>
              <RangeInput label={<span className="text-[11px] text-slate-500">ความห่างตัวอักษร</span>} min={0} max={0.5} step={0.01} unit="em" value={value.letterSpacing} onChange={(v) => set({ letterSpacing: Math.min(0.5, Math.max(0, v)) })} />
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
                ปั๊มได้:
                {PERSONALIZE_CHARSETS.map((c) => {
                  const on = value.charset[c.key];
                  return (
                    <button key={c.key} type="button" onClick={() => set({ charset: { ...value.charset, [c.key]: !on } })} className={chip(on)}>
                      {on ? "✓ " : ""}{c.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={value.autoUpper} onChange={(e) => set({ autoUpper: e.target.checked })} />
                เปลี่ยนเป็นตัวพิมพ์ใหญ่ให้อัตโนมัติ (ลูกค้าพิมพ์ ann → ANN)
              </label>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">ตัวพิเศษ (ลูกค้ากดเลือกจากปุ่ม &quot;ตัวพิเศษ&quot;)</span>
                  {!value.symbols.length && (
                    <button type="button" onClick={() => set({ symbols: parsePersonalizeSymbols(SYMBOL_PRESET) })} className="text-[11px] text-orange-600 hover:underline">
                      ใส่ชุดแนะนำ {SYMBOL_PRESET}
                    </button>
                  )}
                </div>
                <input
                  value={symDraft ?? value.symbols.join(" ")}
                  onChange={(e) => setSymDraft(e.target.value)}
                  onBlur={() => {
                    if (symDraft !== null) set({ symbols: parsePersonalizeSymbols(symDraft) });
                    setSymDraft(null);
                  }}
                  placeholder="พิมพ์หรือวาง เช่น ♥ ★ ✦"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  style={{ fontFamily: '"Times New Roman", Times, serif' }}
                />
                <p className="text-[11px] text-slate-400 mt-1">ตัวละ 1 ตัวอักษร · สูงสุด 24 ตัว · ใส่เฉพาะตัวที่โรงงานมีบล็อกปั๊ม · ตัวที่ไม่ได้ติ๊ก/ไม่ได้ใส่ ลูกค้าจะพิมพ์ไม่ได้และขึ้นเตือน</p>
              </div>
              {tabColor && <p className="text-[11px] text-slate-400">ตัวอักษรใช้ร่วมทุกสี — แก้ที่แท็บ ⭐ ค่าหลัก</p>}
            </fieldset>

            {/* 🎚 เอฟเฟกต์ตัวอักษร (แบบ Photoshop Layer Style) — แท็บตามแบบที่เปิด · เลือกแท็บ = พรีวิวซ้ายเป็นแบบนั้น */}
            {value.styles.length > 0 && (
              <fieldset disabled={locked} className={`rounded-lg border border-slate-200 p-2 space-y-2 ${locked ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">🎚 เอฟเฟกต์ตัวอักษร <span className="font-normal text-slate-400">(แบบ Photoshop · ตั้งต่อรุ่น)</span></p>
                  {preview === "emboss" ? (
                    <button type="button" onClick={() => setFx({ ...DEFAULT_EMBOSS_FX })} className="text-[11px] text-orange-600 hover:underline" title="ค่าที่ตั้งใน Photoshop (Depth 136 · Angle 119 · Inner Shadow 18/12/21 · Outer Glow 61/5/5)">
                      ↺ กลับค่า Photoshop
                    </button>
                  ) : (
                    <button type="button" onClick={() => setFoil(preview, { ...DEFAULT_FOIL_FX[preview], stops: DEFAULT_FOIL_FX[preview].stops.map((x) => ({ ...x })) })} className="text-[11px] text-orange-600 hover:underline">
                      ↺ ค่าเริ่มต้น{preview === "gold" ? "ทอง" : "เงิน"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {PERSONALIZE_STYLES.filter((x) => value.styles.includes(x.value)).map((x) => (
                    <button key={x.value} type="button" onClick={() => setPreview(x.value)} className={chip(preview === x.value)}>
                      {x.label}
                    </button>
                  ))}
                </div>
                {preview === "emboss" ? (
                <>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  ทิศ (Direction):
                  {(["down", "up"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setFx({ dir: d })} className={chip(eff.embossFx.dir === d)}>
                      {d === "down" ? "Down · ยุบลง" : "Up · นูนขึ้น"}
                    </button>
                  ))}
                </div>
                {FX_LAYERS.map((layer) => {
                  const on = layer.key ? eff.embossFx[layer.key] : true;
                  return (
                    <div key={layer.title} className={`rounded-md border px-2 py-1.5 ${on ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
                      <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
                        {layer.key && <input type="checkbox" className="w-3.5 h-3.5 accent-orange-500" checked={on} onChange={(e) => setFx({ [layer.key as "bevel"]: e.target.checked })} />}
                        {layer.title} <span className="font-normal text-slate-400">· {layer.th}</span>
                      </label>
                      {on && (
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
                          {layer.rows.map(([k, label, unit]) => (
                            <RangeInput
                              key={k}
                              label={<span className="text-[11px] text-slate-500">{label}</span>}
                              min={EMBOSS_FX_RANGE[k][0]}
                              max={EMBOSS_FX_RANGE[k][1]}
                              step={1}
                              unit={unit}
                              value={eff.embossFx[k]}
                              onChange={(v) => setFx({ [k]: Math.round(Math.min(EMBOSS_FX_RANGE[k][1], Math.max(EMBOSS_FX_RANGE[k][0], v))) })}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                </>
                ) : (
                  previewFoil && (
                    <>
                      {/* สีตัวอักษร: สีเดียว / ไล่สี */}
                      <div className="rounded-md border border-slate-200 px-2 py-1.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-700">สีตัวอักษร <span className="font-normal text-slate-400">· Color / Gradient Overlay</span></span>
                          <div className="flex gap-1">
                            {(["solid", "gradient"] as const).map((m) => (
                              <button key={m} type="button" onClick={() => setFoil(preview, { mode: m })} className={chip(previewFoil.mode === m)}>
                                {m === "solid" ? "สีเดียว" : "ไล่สี"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="h-4 rounded" style={{ backgroundImage: personalizeFoilCss(previewFoil) }} aria-hidden />
                        {previewFoil.mode === "solid" ? (
                          <ColorInput value={previewFoil.solid} onChange={(v) => setFoil(preview, { solid: v })} />
                        ) : (
                          <>
                            {previewFoil.stops.map((st, i) => (
                              <div key={i} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_24px] items-end gap-2">
                                <ColorInput value={st.color} onChange={(v) => setFoil(preview, { stops: previewFoil.stops.map((x, j) => (j === i ? { ...x, color: v } : x)) })} />
                                <RangeInput
                                  label={<span className="text-[11px] text-slate-500">ระดับที่ {i + 1}</span>}
                                  min={0}
                                  max={100}
                                  step={1}
                                  unit="%"
                                  value={st.pos}
                                  onChange={(v) => setFoil(preview, { stops: previewFoil.stops.map((x, j) => (j === i ? { ...x, pos: Math.round(Math.min(100, Math.max(0, v))) } : x)) })}
                                />
                                <button
                                  type="button"
                                  disabled={previewFoil.stops.length <= 2}
                                  onClick={() => setFoil(preview, { stops: previewFoil.stops.filter((_, j) => j !== i) })}
                                  className="h-7 rounded border border-slate-200 text-xs text-slate-500 hover:border-red-300 hover:text-red-600 disabled:opacity-30"
                                  title="ลบระดับสีนี้"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                disabled={previewFoil.stops.length >= FOIL_MAX_STOPS}
                                onClick={() => setFoil(preview, { stops: [...previewFoil.stops, { color: "#ffffff", pos: 100 }] })}
                                className="text-[11px] text-orange-600 hover:underline disabled:opacity-40"
                              >
                                + เพิ่มระดับสี (สูงสุด {FOIL_MAX_STOPS})
                              </button>
                            </div>
                            <RangeInput label={<span className="text-[11px] text-slate-500">มุมไล่สี (90 = บนลงล่าง)</span>} min={0} max={180} step={1} unit="°" value={previewFoil.gradAngle} onChange={(v) => setFoil(preview, { gradAngle: Math.round(Math.min(180, Math.max(0, v))) })} />
                          </>
                        )}
                        <div className="flex items-center gap-1 flex-wrap text-[11px] text-slate-500">
                          ชุดสำเร็จรูป:
                          {FOIL_PRESETS[preview].map((p) => (
                            <button key={p.name} type="button" onClick={() => setFoil(preview, { mode: "gradient", stops: p.stops.map((x) => ({ ...x })) })} className={chip(false)}>
                              <span className="inline-block w-3 h-3 rounded-full align-[-2px] mr-1" style={{ backgroundImage: personalizeFoilCss({ ...previewFoil, mode: "gradient", stops: p.stops }) }} />
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* นูน / เงา */}
                      {FOIL_LAYERS.map((layer) => {
                        const on = previewFoil[layer.key];
                        return (
                          <div key={layer.title} className={`rounded-md border px-2 py-1.5 ${on ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
                            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
                              <input type="checkbox" className="w-3.5 h-3.5 accent-orange-500" checked={on} onChange={(e) => setFoil(preview, { [layer.key]: e.target.checked })} />
                              {layer.title} <span className="font-normal text-slate-400">· {layer.th}</span>
                            </label>
                            {on && layer.key === "bevel" && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                                ทิศ:
                                {(["up", "down"] as const).map((d) => (
                                  <button key={d} type="button" onClick={() => setFoil(preview, { dir: d })} className={chip(previewFoil.dir === d)}>
                                    {d === "up" ? "Up · นูนขึ้น" : "Down · ยุบลง"}
                                  </button>
                                ))}
                              </div>
                            )}
                            {on && (
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
                                {layer.rows.map(([k, label, unit]) => (
                                  <RangeInput
                                    key={k}
                                    label={<span className="text-[11px] text-slate-500">{label}</span>}
                                    min={FOIL_FX_RANGE[k][0]}
                                    max={FOIL_FX_RANGE[k][1]}
                                    step={1}
                                    unit={unit}
                                    value={previewFoil[k]}
                                    onChange={(v) => setFoil(preview, { [k]: Math.round(Math.min(FOIL_FX_RANGE[k][1], Math.max(FOIL_FX_RANGE[k][0], v))) })}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )
                )}
                <p className="text-[11px] text-slate-400">ค่า px อ้างอิงตัวอักษรสูง 100px แล้วย่อ/ขยายตามขนาดจริงบนรูป · ตั้งต่อรุ่น/แยกตามสีได้ (แท็บสีด้านบน) · ปรับแล้วพรีวิวซ้ายเปลี่ยนทันที</p>
              </fieldset>
            )}
            <p className="text-[11px] text-slate-400">ลากข้อความบนรูปซ้ายมือเพื่อวางตำแหน่ง · ลูกค้าจะเลือกได้เฉพาะจุดที่ติ๊กไว้ · ขนาดเป็น % ของรูป จะได้เท่ากันทุกจอ · รูปทุกสีของรุ่นนี้ควรถ่ายมุมเดียวกัน</p>
          </div>
        </div>
      )}
    </div>
  );
}
