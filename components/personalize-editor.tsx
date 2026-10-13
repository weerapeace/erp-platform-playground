"use client";

/**
 * PersonalizeEditor — ตั้งค่า "ปั๊มชื่อ" ของรุ่นในร้านหนึ่ง (ใช้ในแท็บ 🛍 เว็บไซต์ ของ Parent SKU)
 *   - เปิด/ปิด · จำนวนตัวอักษรสูงสุด · แบบที่อนุญาต (จม/เงิน/ทอง) · รูปฉาก
 *   - ตำแหน่ง 2 จุด (ตรงกลาง / มุมขวาล่าง): ลากข้อความบนรูปเพื่อวาง + ขนาด + เอียง · เปิด/ปิดแต่ละจุด
 *   - พรีวิวเหมือนเว็บจริง (ฟอนต์ Times New Roman + เอฟเฟกต์เดียวกัน)
 * ของกลาง: lib/website-personalize.ts (ชนิดข้อมูล/ค่าเริ่มต้น/ตัวกรอง)
 */
import { useRef, useState } from "react";
import { PERSONALIZE_STYLES, type PersonalizeConfig, type PersonalizePosition, type PersonalizeStyle } from "@/lib/website-personalize";

const keyUrl = (key: string, w = 900) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** เอฟเฟกต์ตัวอักษร (เหมือน storefront globals.css .pz-text) */
export const PZ_STYLE: Record<PersonalizeStyle, React.CSSProperties> = {
  emboss: { color: "rgba(20,10,0,0.42)", mixBlendMode: "multiply", textShadow: "1px 1px 0 rgba(255,255,255,0.45), -1px -1px 1px rgba(0,0,0,0.55)" },
  silver: { color: "transparent", backgroundImage: "linear-gradient(170deg,#ffffff 0%,#b8bcc3 40%,#f2f3f5 55%,#8d9298 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" },
  gold: { color: "transparent", backgroundImage: "linear-gradient(170deg,#fff3c4 0%,#d9a520 40%,#fff5c9 55%,#9c7200 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" },
};

export function PersonalizeEditor({
  value,
  onChange,
  imageOptions,
  fallbackImageKey,
}: {
  value: PersonalizeConfig;
  onChange: (next: PersonalizeConfig) => void;
  /** รูปให้เลือกเป็นฉาก (key + ป้าย) */
  imageOptions: { key: string; label: string }[];
  /** รูปที่เว็บจะใช้เมื่อไม่ได้เลือก (รูปแรกของสินค้า) */
  fallbackImageKey: string | null;
}) {
  const [preview, setPreview] = useState<PersonalizeStyle>(value.styles[0] ?? "emboss");
  const [active, setActive] = useState<PersonalizePosition["key"]>("center");
  const [sample, setSample] = useState("YOUR NAME");
  const stageRef = useRef<HTMLDivElement>(null);
  const [imgW, setImgW] = useState(600);
  const set = (p: Partial<PersonalizeConfig>) => onChange({ ...value, ...p });
  const setPos = (key: PersonalizePosition["key"], p: Partial<PersonalizePosition>) =>
    set({ positions: value.positions.map((x) => (x.key === key ? { ...x, ...p } : x)) });
  const imageKey = value.imageKey ?? fallbackImageKey;
  const pos = value.positions.find((p) => p.key === active) ?? value.positions[0];

  // ลากข้อความบนรูป → x/y เป็น % ของรูป
  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
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

      {value.enabled && (
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          {/* พรีวิว + ลากวางตำแหน่ง */}
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <select value={value.imageKey ?? ""} onChange={(e) => set({ imageKey: e.target.value || null })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs max-w-[60%]">
                <option value="">รูปฉาก: รูปแรกของสินค้า (อัตโนมัติ)</option>
                {imageOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <div className="flex items-center gap-1">
                {PERSONALIZE_STYLES.filter((s) => value.styles.includes(s.value)).map((s) => (
                  <button key={s.value} type="button" onClick={() => setPreview(s.value)} className={chip(preview === s.value)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div ref={stageRef} className="relative rounded-xl overflow-hidden bg-slate-100 select-none" style={{ touchAction: "none" }}>
              {imageKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={keyUrl(imageKey)} alt="" className="block w-full h-auto pointer-events-none" onLoad={(e) => setImgW(e.currentTarget.clientWidth)} />
              ) : (
                <div className="aspect-square flex items-center justify-center text-sm text-slate-400">ยังไม่มีรูปสินค้า</div>
              )}
              {value.positions.filter((p) => p.enabled).map((p) => (
                <div
                  key={p.key}
                  onPointerDown={(e) => { setActive(p.key); onDown(e); }}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  title={`${p.label} — ลากเพื่อย้าย`}
                  className={`absolute whitespace-nowrap cursor-move leading-none px-1 ${active === p.key ? "outline outline-1 outline-dashed outline-orange-400 rounded" : ""}`}
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    transform: `translate(-50%, -50%) rotate(${p.rotate}deg)`,
                    fontFamily: '"Times New Roman", Times, serif',
                    letterSpacing: "0.08em",
                    fontSize: `${(imgW * p.size) / 100}px`,
                    ...PZ_STYLE[preview],
                  }}
                >
                  {sample || "YOUR NAME"}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-slate-500">ข้อความตัวอย่าง</span>
              <input value={sample} maxLength={value.maxChars} onChange={(e) => setSample(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
            </div>
          </div>

          {/* ตำแหน่ง 2 จุด */}
          <div className="space-y-2">
            {value.positions.map((p) => (
              <div key={p.key} className={`rounded-lg border p-2 space-y-1.5 ${active === p.key ? "border-orange-300 bg-orange-50/40" : "border-slate-200"}`} onClick={() => setActive(p.key)}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={p.enabled} onChange={(e) => setPos(p.key, { enabled: e.target.checked })} title="ให้ลูกค้าเลือกตำแหน่งนี้ได้" />
                  <input value={p.label} onChange={(e) => setPos(p.key, { label: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" placeholder={p.key === "center" ? "ตรงกลาง" : "มุมขวาล่าง"} />
                  <span className="text-[11px] text-slate-400">x {p.x}% · y {p.y}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500">
                    ขนาดตัวอักษร ({p.size}% ของความกว้างรูป)
                    <input type="range" min={1} max={20} step={0.5} value={p.size} onChange={(e) => setPos(p.key, { size: Number(e.target.value) })} className="w-full" />
                  </label>
                  <label className="text-[11px] text-slate-500">
                    เอียง ({p.rotate}°)
                    <input type="range" min={-30} max={30} step={1} value={p.rotate} onChange={(e) => setPos(p.key, { rotate: Number(e.target.value) })} className="w-full" />
                  </label>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-slate-400">ลากข้อความบนรูปซ้ายมือเพื่อวางตำแหน่ง · ลูกค้าจะเลือกได้เฉพาะจุดที่ติ๊กไว้ · ขนาดเป็น % ของรูป จะได้เท่ากันทุกจอ · รูปทุกสีของรุ่นนี้ควรถ่ายมุมเดียวกัน</p>
          </div>
        </div>
      )}
    </div>
  );
}
