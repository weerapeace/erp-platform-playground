"use client";

/**
 * พรีวิวตัวประกอบสินค้า — วาดรูปพื้นใสซ้อนชั้นตามการเลือก (ของกลาง: สตูดิโอใช้ตอนนี้ · เว็บร้านจะมิเรอร์วิธีเดียวกัน)
 *   รูป       = <img> เต็มผืนผ้าใบ (ทุกไฟล์ขนาดเท่าผืนผ้าใบ จึงซ้อนตรงกันเอง)
 *   ลงสี      = กล่องสีทับรูปกลาง mix-blend multiply + mask ด้วยรูปเดิม (ได้เงา/ลายผิวจากรูปกลาง สีจากตัวเลือก)
 *   ตัวอักษร  = SVG พิมพ์สด (ปั๊มจม / ฟอยล์ทอง / ฟอยล์เงิน / พิมพ์สี)
 *   ยังไม่มีรูป = ไม่วาดชั้นนั้น + ป้าย "ขาดรูป n ชั้น" (กดดูรายชื่อไฟล์ที่ต้องอัป)
 */
import { useMemo, useState } from "react";
import { r2ImageUrl } from "@/lib/r2-image";
import { imageFileName, resolveLayers, VIEW_LABEL, type ConfigData, type ConfigView, type ResolvedLayer, type Selection } from "@/lib/product-configurator";
import { Icon } from "@/components/icon";

const FOIL: Record<string, [string, string, string]> = { gold: ["#fbe8ae", "#c99a3a", "#f0d58a"], silver: ["#ffffff", "#9aa3ad", "#e8ecf0"] };

function TextLayer({ r, w, h, baseHex }: { r: ResolvedLayer; w: number; h: number; baseHex: string | null }) {
  const t = r.text!;
  const size = Math.max(8, t.box.size * w), x = t.box.x * w, y = t.box.y * h;
  const ls = (t.box.letter_spacing ?? 0.16) * size;
  const common = { x, y, fontSize: size, textAnchor: "middle" as const, fontFamily: t.box.font || "Trirong, Georgia, serif", fontWeight: 600, letterSpacing: ls };
  const id = `pc-foil-${r.layer.id}`;
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {t.style === "gold" || t.style === "silver" ? (
        <>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{FOIL[t.style].map((c, i) => <stop key={i} offset={i / 2} stopColor={c} />)}</linearGradient></defs>
          <text {...common} fill="#000" fillOpacity={0.35} transform={`translate(${size * 0.03},${size * 0.05})`}>{t.value}</text>
          <text {...common} fill={`url(#${id})`}>{t.value}</text>
        </>
      ) : t.style === "ink" ? (
        <text {...common} fill={t.color || "#1f1d1c"}>{t.value}</text>
      ) : (
        <>
          <text {...common} fill="#fff" fillOpacity={0.18} transform={`translate(0,${size * 0.045})`}>{t.value}</text>
          <text {...common} fill={baseHex ? darken(baseHex) : "rgba(0,0,0,.45)"}>{t.value}</text>
        </>
      )}
    </svg>
  );
}
/** สีปั๊มจม = สีหนังเข้มลง 45% */
function darken(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return "rgba(0,0,0,.45)";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Math.round(parseInt(x, 16) * 0.55));
  return `rgb(${r},${g},${b})`;
}

export function ConfigPreview({ data, view, selection, focusLayerId, className = "" }: {
  data: ConfigData; view: ConfigView; selection: Selection;
  /** โชว์เฉพาะชั้นนี้ชัด ๆ (ชั้นอื่นจาง) — ใช้ตอนชี้รายการชั้นในสตูดิโอ */
  focusLayerId?: string | null;
  className?: string;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const W = Number(data.model.canvas?.w) || 3000, H = Number(data.model.canvas?.h) || 3000;
  const layers = useMemo(() => resolveLayers(data, view, selection), [data, view, selection]);
  const missing = layers.filter((r) => !r.text && !r.image && r.comboKey != null);
  const drawn = layers.filter((r) => r.image);
  const bodyHex = layers.find((r) => r.placeholderHex)?.placeholderHex ?? null;
  const chips = Array.from(new Set(layers.map((r) => r.placeholderHex).filter((x): x is string => !!x)));

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(110%_85%_at_50%_28%,#fafbf7,#dfe3d9)] ${className}`} style={{ aspectRatio: `${W} / ${H}` }}>
      {layers.map((r) => {
        const dim = focusLayerId && focusLayerId !== r.layer.id ? "opacity-15" : "";
        if (r.text) return r.text.value ? <div key={r.layer.id} className={`absolute inset-0 transition-opacity ${dim}`}><TextLayer r={r} w={W} h={H} baseHex={bodyHex} /></div> : null;
        if (!r.image) return null;
        const src = r2ImageUrl(r.image.image_key, 1200)!;
        return (
          <div key={r.layer.id} className={`absolute inset-0 transition-opacity ${dim}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
            {r.tint && (
              <div className="absolute inset-0" style={{
                background: r.tint, mixBlendMode: "multiply",
                WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
              }} />
            )}
          </div>
        );
      })}

      {drawn.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <Icon name="image" size={34} className="text-slate-400" />
          <div className="text-sm font-medium text-slate-600">ยังไม่มีรูปของ{VIEW_LABEL[view].th}</div>
          <div className="max-w-xs text-xs text-slate-500">โหลดแม่แบบไปถ่ายรูป แล้วอัปโหลดตามชื่อไฟล์ในแท็บ &quot;แม่แบบ &amp; รูปที่ต้องถ่าย&quot; — รูปจะประกอบขึ้นตรงนี้เอง</div>
          {chips.length > 0 && <div className="flex gap-1.5">{chips.map((c) => <span key={c} className="h-5 w-5 rounded-full border border-white shadow" style={{ background: c }} />)}</div>}
        </div>
      )}

      {missing.length > 0 && drawn.length > 0 && (
        <button type="button" onClick={() => setShowMissing((v) => !v)} className="absolute bottom-2 left-2 rounded-full border border-amber-300 bg-amber-50/95 px-2.5 py-1 text-xs font-medium text-amber-800 shadow-sm">
          ขาดรูป {missing.length} ชั้น
        </button>
      )}
      {showMissing && missing.length > 0 && (
        <div className="absolute inset-x-2 bottom-10 max-h-[45%] overflow-auto rounded-lg border border-amber-200 bg-white/95 p-2 text-xs shadow">
          {missing.map((r) => <div key={r.layer.id} className="font-mono text-[11px] text-slate-700">{imageFileName(data.model.code, view, r.layer.code, r.comboKey ?? "")}</div>)}
        </div>
      )}
    </div>
  );
}
