"use client";
/**
 * ThemePreview (ของกลาง · ธีมกลาง ERP) — หน้าตัวอย่าง ERP ที่วาดตามค่าธีมครบทุกหมวด
 *   แถบบน · เมนูข้าง · แบนเนอร์ · การ์ดตัวเลข · ตาราง · ช่องกรอก · แท็บ · ป้ายสถานะ (สีล็อก) · ป๊อปอัป · กระดิ่ง · มาสคอต
 *   + เอฟเฟกต์ต่อจุด (pulse/กระพริบ/เปลี่ยนสี/ไล่สีวิ่ง/เรือง/แสงวิ่ง/ยกตัว/แถบเน้น/นับขึ้น/สั่น — lib/erp-theme-fx)
 *   + เส้นขอบ (หนา/สี/ลาย/ไล่สี/วิ่ง/แถบซ้าย) · เงา (ระดับ/สี/เรืองตอนชี้/ด้านใน) · ชี้/กด (ขยาย/คลื่นน้ำ/ขีดเส้นใต้/ไอคอนขยับ)
 *   + เข้าหน้า 4 แบบ · การ์ดโผล่ทีละใบ · อนุภาค 4 แบบ
 *   device="mobile" ใช้โหมดเบาอัตโนมัติ (mobileLiteConfig) · replayKey เปลี่ยน = เล่นแอนิเมชันเข้าหน้าใหม่
 * ใช้ที่: /admin/themes (การ์ด = compact) · /admin/themes/[id] (ตัวแก้)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FONT_OPTIONS, DENSITY_SCALE, SPEED_FACTOR, effectiveBgOpacity, mobileLiteConfig, scaleOf, type ErpThemeConfig,
} from "@/lib/erp-theme-config";
import { blinkMinOpacity, fxDuration, fxSpread, hasFx, type EffectKey, type EffectTarget } from "@/lib/erp-theme-fx";
import { Icon } from "@/components/icon";
import { ensureThemeFont } from "./active-themes";
import { ThemeParticles } from "./particles";
import { PART_INFO } from "@/lib/erp-theme-easy";
const PART_LABEL = Object.fromEntries(Object.entries(PART_INFO).map(([k, v]) => [k, v.label])) as Record<EffectTarget, string>;

export type PreviewSample = "purchase" | "products" | "tasks";

const SAMPLES: Record<PreviewSample, { app: string; title: string; stats: [string, number][]; cols: string[]; rows: [string, string, string, "wait" | "ok" | "bad" | "draft", string][] }> = {
  purchase: { app: "จัดซื้อ", title: "ใบขอซื้อ", stats: [["เดือนนี้", 86], ["รออนุมัติ", 9], ["ยอดรวม (บาท)", 412500]], cols: ["เลขที่", "รายการ", "ยอด", "สถานะ"],
    rows: [["PR-00118", "ผ้าใบ 10 ม้วน", "12,400", "wait", "รออนุมัติ"], ["PR-00117", "หนังแท้", "48,000", "ok", "อนุมัติแล้ว"], ["PR-00116", "กาวยาง", "1,250", "bad", "ไม่อนุมัติ"], ["PR-00115", "ด้ายไนลอน", "3,600", "draft", "ร่าง"]] },
  products: { app: "สินค้า", title: "สินค้าทั้งหมด", stats: [["สินค้า", 1284], ["ใกล้หมด", 37], ["รอตรวจรับ", 12]], cols: ["รหัส", "ชื่อสินค้า", "สต๊อก", "สถานะ"],
    rows: [["SKU-0012", "กระเป๋าหนังวัว", "48", "ok", "ใช้งาน"], ["SKU-0031", "เข็มขัด TTM130", "6", "wait", "ใกล้หมด"], ["SKU-0044", "ป้ายหนังปั๊มโลโก้", "0", "draft", "ร่าง"], ["SKU-0050", "ซิปทองเหลือง", "120", "ok", "ใช้งาน"]] },
  tasks: { app: "Creative", title: "งานออกแบบ", stats: [["งานทั้งหมด", 214], ["รอตรวจ", 18], ["เสร็จสัปดาห์นี้", 41]], cols: ["งาน", "หัวข้อ", "กำหนด", "สถานะ"],
    rows: [["T-881", "ปกโปร 12.12", "28 พ.ย.", "wait", "รอตรวจ"], ["T-880", "รูปสินค้า TTM130", "26 พ.ย.", "ok", "เสร็จ"], ["T-879", "แบนเนอร์หน้าร้าน", "25 พ.ย.", "bad", "ตีกลับ"], ["T-878", "คลิปรีวิว", "30 พ.ย.", "draft", "ร่าง"]] },
};
// สีสถานะล็อก — ไม่ตามธีม (เหมือนป้ายจริงในระบบ) · "wait" = ป้ายด่วน (รับเอฟเฟกต์จุด "ป้ายด่วน")
const STATUS: Record<string, [string, string, string]> = {
  draft: ["#f1f5f9", "#475569", "#64748b"], wait: ["#fef3c7", "#92400e", "#d97706"],
  ok: ["#dcfce7", "#166534", "#16a34a"], bad: ["#fee2e2", "#991b1b", "#dc2626"],
};
const img = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

const CSS = `
@keyframes tmpFade{from{opacity:0}to{opacity:1}}
@keyframes tmpUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes tmpZoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes tmpBlur{from{opacity:0;filter:blur(6px)}to{opacity:1;filter:none}}
@keyframes tmpShine{0%{left:-60%}60%,100%{left:130%}}
@keyframes tmpGrad{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes tmpFloat{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-7px) rotate(-6deg)}}
@keyframes tmpPulse{0%{box-shadow:0 0 0 0 var(--ring)}100%{box-shadow:0 0 0 var(--spread) transparent}}
@keyframes tmpGlow{0%,100%{box-shadow:0 0 2px var(--ring)}50%{box-shadow:0 0 var(--spread) var(--ring)}}
@keyframes tmpTextGlow{0%,100%{text-shadow:0 0 0 transparent}50%{text-shadow:0 0 calc(var(--spread) * .8) var(--ring)}}
@keyframes tmpNumPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes tmpBlink{0%,100%{opacity:1}50%{opacity:var(--blink-min)}}
@keyframes tmpShift{0%,100%{background-color:var(--c1)}50%{background-color:var(--c2)}}
@keyframes tmpShiftText{0%,100%{color:var(--c1)}50%{color:var(--c2)}}
@keyframes tmpShake{0%,20%,100%{transform:rotate(0)}4%{transform:rotate(-16deg)}8%{transform:rotate(14deg)}12%{transform:rotate(-10deg)}16%{transform:rotate(6deg)}}
@keyframes tmpWig{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}
@keyframes tmpRipple{from{transform:scale(0);opacity:.55}to{transform:scale(4);opacity:0}}
@keyframes tmpUnder{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes tmpFall{from{transform:translateY(-12px) rotate(0)}to{transform:translateY(var(--fall)) rotate(260deg)}}
@keyframes tmpRise{from{transform:translateY(var(--fall));opacity:.0}15%{opacity:.8}to{transform:translateY(-12px);opacity:0}}
@keyframes tmpTwinkle{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
.tmp-root .tmp-en{animation:var(--enter) calc(.55s*var(--spd)) cubic-bezier(.22,1,.36,1) both}
.tmp-shine{position:relative;overflow:hidden}
.tmp-shine::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:rgba(255,255,255,.45);transform:skewX(-20deg);animation:tmpShine var(--shine-dur,2.4s) infinite;pointer-events:none}
.tmp-ganim{background-size:200% 200%!important;animation:tmpGrad calc(6s*var(--spd)) ease infinite}
.tmp-lift{transition:transform .15s,box-shadow .15s}
.tmp-lift:hover{transform:translateY(-3px)}
.tmp-hglow{transition:box-shadow .15s}
.tmp-hglow:hover{box-shadow:0 0 0 3px var(--hring),0 10px 20px -8px var(--hring)!important}
.tmp-scale{transition:transform .15s}
.tmp-scale:hover{transform:scale(1.05)}
.tmp-wig:hover{animation:tmpWig .5s}
.tmp-under{position:relative}
.tmp-under::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .25s}
.tmp-under:hover::after,.tmp-under.on::after{transform:scaleX(1)}
.tmp-under.on::after{animation:tmpUnder .5s ease-out}
.tmp-row:hover td{background:var(--ps)}
.tmp-mascot{animation:tmpFloat calc(3s*var(--spd)) ease-in-out infinite}
.tmp-edit [data-part]{cursor:pointer}
.tmp-edit [data-part]:hover{outline:2px dashed #a78bfa;outline-offset:2px}
.tmp-edit [data-part-sel]{outline:2px solid #7c3aed!important;outline-offset:2px}
@media (prefers-reduced-motion: reduce){.tmp-root *,.tmp-root *::after{animation:none!important;transition:none!important}}
`;

const ENTER: Record<string, string> = { none: "none", fade: "tmpFade", up: "tmpUp", zoom: "tmpZoom", blur: "tmpBlur" };

export function ThemePreview({
  config, device = "pc", sample = "purchase", dark = false, replayKey = 0, compact = false, editMode = false, selectedPart = null, onPartClick,
}: {
  /** โหมดคลิกแก้: ชี้ชิ้นแล้วเห็นชื่อ + กรอบประ · คลิก = onPartClick (ปุ่มในพรีวิวไม่ทำงานจริงระหว่างนี้) */
  editMode?: boolean;
  selectedPart?: EffectTarget | null;
  onPartClick?: (part: EffectTarget, el: HTMLElement) => void;
  config: ErpThemeConfig;
  device?: "pc" | "mobile";
  sample?: PreviewSample;
  dark?: boolean;
  replayKey?: number;
  /** การ์ดในคลังธีม: ย่อ ไม่มีแอนิเมชัน */
  compact?: boolean;
}) {
  const mob = device === "mobile";
  const c = useMemo(() => (mob ? mobileLiteConfig(config) : config), [config, mob]);
  const font = FONT_OPTIONS.find((f) => f.key === c.typography.font) ?? FONT_OPTIONS[0];
  useEffect(() => { if (!compact) ensureThemeFont(c.typography.font); }, [compact, c.typography.font]);
  const p = scaleOf(c.colors.primary), a = scaleOf(c.colors.accent);
  const s = SAMPLES[sample];
  const g = c.gradient, sp = g.spots, fx = c.effects, o = c.outline, el = c.elevation;
  const grad = `linear-gradient(${g.angle}deg, ${p[600]}, ${g.color2})`;
  const flowGrad = `linear-gradient(90deg, ${p[600]}, ${g.color2}, ${a[600]}, ${p[600]})`;
  const R = c.shape.radius;
  const spd = SPEED_FACTOR[c.animation.speed];
  const pad = DENSITY_SCALE[c.density].rowPad, gap = DENSITY_SCALE[c.density].gap;
  const fs = c.typography.baseSize - 1;
  const P = dark
    ? { page: "#0f172a", surf: "#1e293b", tx: "#f1f5f9", mut: "#94a3b8", bd: "#334155", ps: p[500] + "40" }
    : { page: "#f8fafc", surf: "#ffffff", tx: "#0f172a", mut: "#64748b", bd: "#e2e8f0", ps: p[50] };
  const anim = !compact;
  const bgOp = effectiveBgOpacity(c) / 100;
  const bgKey = dark && c.background.darkImage ? c.background.darkImage : c.background.image;
  const bgLayer = (where: "page" | "top" | "banner") =>
    bgKey && c.background.where === where ? (
      <>
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${img(bgKey, mob ? 600 : 1200)})`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgOp, filter: c.background.blur ? `blur(${c.background.blur}px)` : undefined }} />
        {where !== "page" && c.background.veil && <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: "rgba(0,0,0,.28)" }} />}
      </>
    ) : null;

  // ── เงา + เส้นขอบ (ข้อ 8–17) ──
  const shColor = el.color === "theme" ? p[600] : el.color === "black" ? "#000000" : "#0f172a";
  const shadow = el.depth === "none" ? "none"
    : el.depth === "soft" ? `0 1px 3px ${rgba(shColor, 0.1)}`
    : el.depth === "medium" ? `0 6px 16px -4px ${rgba(shColor, el.color === "black" ? 0.35 : 0.22)}`
    : `0 18px 30px -10px ${rgba(shColor, el.color === "black" ? 0.45 : 0.3)}`;
  const bdColor = o.color === "theme" ? p[500] : o.color === "soft" ? p[200] : P.bd;
  const cardBox = (extra: React.CSSProperties = {}): React.CSSProperties => {
    const w = o.gradient ? Math.max(1, o.width) : o.width;
    const base: React.CSSProperties = o.gradient
      ? { border: `${w}px solid transparent`, background: `linear-gradient(${P.surf}, ${P.surf}) padding-box, ${flowGrad} border-box`, backgroundSize: o.running && anim ? "100% 100%, 300% 300%" : undefined, animation: o.running && anim ? `tmpGrad ${3 * spd}s linear infinite` : undefined }
      : { border: w ? `${w}px ${o.style} ${bdColor}` : "none", background: P.surf };
    return { ...base, ...(o.accentBar ? { borderLeft: `4px solid ${p[600]}` } : {}), borderRadius: R, boxShadow: shadow, ...extra };
  };

  // ── เอฟเฟกต์ต่อจุด (ข้อ 1–5, 13, 19, 29 ฯลฯ) ──
  const fxOf = (t: EffectTarget) => (anim ? c.effects.targets[t] : { fx: [] as EffectKey[], strength: 2 as const });
  const fxStyle = (t: EffectTarget, kind: "box" | "text" = "box"): { cls: string; style: React.CSSProperties } => {
    const v = fxOf(t);
    const ring = rgba(t === "badge" ? "#d97706" : p[500], 0.6);
    const vars = { "--ring": ring, "--spread": `${fxSpread(v.strength)}px`, "--blink-min": String(blinkMinOpacity(v.strength)), "--c1": p[600], "--c2": a[600], "--shine-dur": `${fxDuration("shine", v.strength, spd)}s` } as React.CSSProperties;
    const anims: string[] = [];
    let cls = "";
    const extra: React.CSSProperties = {};
    for (const e of v.fx) {
      const d = fxDuration(e, v.strength, spd);
      if (e === "pulse") anims.push(kind === "text" ? `tmpNumPulse ${d}s ease-in-out infinite` : `tmpPulse ${d}s ease-out infinite`);
      if (e === "glow") anims.push(kind === "text" ? `tmpTextGlow ${d}s ease-in-out infinite` : `tmpGlow ${d}s ease-in-out infinite`);
      if (e === "blink") anims.push(`tmpBlink ${d}s ease-in-out infinite`);
      if (e === "colorShift") anims.push(kind === "text" ? `tmpShiftText ${d}s ease-in-out infinite` : `tmpShift ${d}s ease-in-out infinite`);
      if (e === "flow") { anims.push(`tmpGrad ${d}s ease infinite`); Object.assign(extra, { backgroundImage: flowGrad, backgroundSize: "300% 100%" }); }
      if (e === "shine") cls += " tmp-shine";
      if (e === "lift") cls += " tmp-lift";
      if (e === "accentBar") Object.assign(extra, { boxShadow: `inset 3px 0 0 ${p[600]}` });
      if (e === "shake") anims.push(`tmpShake ${Math.max(2.4, d * 4)}s ease-in-out infinite`);
    }
    return { cls, style: { ...vars, ...extra, ...(anims.length ? { animation: anims.join(", ") } : {}) } };
  };
  const hglow = anim && el.hoverGlow ? " tmp-hglow" : "";
  const hringVar = { "--hring": rgba(p[500], 0.35) } as React.CSSProperties;

  // ปุ่ม 3 แบบ + เอฟเฟกต์จุด "ปุ่มหลัก"
  const btnFx = fxStyle("button");
  const ripple = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!anim || !fx.ripple) return;
    const b = e.currentTarget, r = b.getBoundingClientRect(), sp2 = document.createElement("span");
    const size = Math.max(r.width, r.height) / 2;
    Object.assign(sp2.style, { position: "absolute", left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: "rgba(255,255,255,.65)", pointerEvents: "none", animation: "tmpRipple .6s ease-out forwards" });
    b.appendChild(sp2);
    setTimeout(() => sp2.remove(), 650);
  };
  const btn = (primary = true): React.CSSProperties => {
    if (!primary) return { background: P.surf, color: P.tx, border: `1px solid ${P.bd}`, borderRadius: R, padding: "4px 10px", fontSize: fs };
    const base: React.CSSProperties = { borderRadius: R, padding: "4px 11px", fontSize: fs, fontWeight: 500, position: "relative", overflow: "hidden" };
    if (c.components.button === "soft") return { ...base, background: p[100], color: p[700], border: `1px solid ${p[200]}` };
    if (c.components.button === "outline") return { ...base, background: "transparent", color: p[600], border: `1.5px solid ${p[600]}` };
    return { ...base, backgroundColor: p[600], backgroundImage: sp.button ? grad : undefined, color: "#fff", border: "none", ...btnFx.style };
  };
  const btnCls = `${c.components.button === "solid" ? btnFx.cls : ""}${anim && fx.scaleHover ? " tmp-scale" : ""}`;
  const PrimaryBtn = ({ children, onBanner }: { children: React.ReactNode; onBanner?: boolean }) => (
    <button type="button" {...pp("button")} className={btnCls} onClick={ripple} style={{ ...btn(), ...(onBanner ? { zIndex: 1, border: "1px solid rgba(255,255,255,.7)" } : {}) }}>{children}</button>
  );

  const badgeFx = fxStyle("badge");
  const badge = (k: string, label: string) => {
    const [bg, tx, solid] = STATUS[k];
    const urgent = k === "wait";
    return <span {...(urgent ? pp("badge") : {})} className={urgent ? badgeFx.cls : ""} style={{ display: "inline-block", fontSize: fs - 2, padding: "1px 7px", borderRadius: 999, whiteSpace: "nowrap", ...(c.components.badge === "solid" ? { background: solid, color: "#fff" } : { background: bg, color: tx }), ...(urgent ? badgeFx.style : {}) }}>{label}</span>;
  };

  const sideBg = c.components.sidebar === "dark" ? "#1e293b" : c.components.sidebar === "brand" ? p[700] : P.surf;
  const sideTx = c.components.sidebar === "light" ? P.mut : "#e2e8f0";
  const hasBanner = sp.banner || (bgKey && c.background.where === "banner");

  // ตัวเลขนับขึ้น (จุด "ตัวเลขสรุป" มี countUp)
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverLbl, setHoverLbl] = useState<{ label: string; x: number; y: number } | null>(null);
  const editing = editMode && !compact;
  const pp = (part: EffectTarget): Record<string, string> => (editing ? { "data-part": part, "data-part-label": PART_LABEL[part], ...(selectedPart === part ? { "data-part-sel": "" } : {}) } : {});
  const onRootClickCapture = (e: React.MouseEvent) => {
    if (!editing) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-part]");
    if (!el || !rootRef.current?.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    onPartClick?.(el.dataset.part as EffectTarget, el);
  };
  const onRootMove = (e: React.MouseEvent) => {
    if (!editing || !rootRef.current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-part]");
    if (!el) { if (hoverLbl) setHoverLbl(null); return; }
    const r = el.getBoundingClientRect(), R0 = rootRef.current.getBoundingClientRect();
    const next = { label: el.dataset.partLabel ?? "", x: r.left - R0.left, y: Math.max(0, r.top - R0.top - 18) };
    if (!hoverLbl || hoverLbl.label !== next.label || hoverLbl.x !== next.x || hoverLbl.y !== next.y) setHoverLbl(next);
  };
  const counting = anim && hasFx(c.effects, "number", "countUp");
  useEffect(() => {
    if (!counting || !rootRef.current) return;
    const els = rootRef.current.querySelectorAll<HTMLElement>("[data-cnt]");
    const dur = 800 * spd, t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      els.forEach((el2) => { el2.textContent = Math.round(Number(el2.dataset.cnt) * (1 - (1 - k) ** 3)).toLocaleString(); });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [replayKey, counting, spd, sample, device]);

  const delay = (i: number) => ({ animationDelay: anim && fx.stagger ? `${i * 90}ms` : "0ms" });
  const pageBg = sp.page ? `linear-gradient(${g.angle}deg, ${p[500]}2e, ${g.color2}47), ${P.page}` : P.page;
  const wig = anim && fx.iconWiggle ? "tmp-wig" : "";

  // แถบบน + กระดิ่ง
  const topFx = fxStyle("topbar");
  const bellFx = fxStyle("bell");
  const top = (
    <div {...pp("topbar")} className={topFx.cls} style={{ position: "relative", background: sp.top ? grad : p[600], color: "#fff", padding: mob ? "9px 12px" : "8px 12px", ...topFx.style, ...(topFx.style.animation?.toString().includes("tmpShift") ? { backgroundImage: "none" } : {}) }}>
      {bgLayer("top")}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: c.typography.headingWeight }}>{mob ? s.app : `ERP · ${s.app}`}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", fontSize: fs + 2 }}>
          <span className={wig} style={{ display: "inline-flex" }}><Icon name="search" /></span>
          <span {...pp("bell")} className={bellFx.cls} style={{ position: "relative", display: "inline-flex", borderRadius: 999, transformOrigin: "50% 10%", ...bellFx.style }}>
            <span className={wig} style={{ display: "inline-flex" }}><Icon name="bell" /></span>
            <span style={{ position: "absolute", top: -1, right: -2, width: 7, height: 7, borderRadius: 99, background: "#ef4444", border: "1.5px solid #fff" }} />
          </span>
        </span>
      </div>
    </div>
  );

  const head = hasBanner ? (
    <div className="tmp-en" style={{ position: "relative", overflow: "hidden", borderRadius: R + 2, background: sp.banner ? grad : p[600], color: "#fff", padding: "12px 14px", marginBottom: gap, display: "flex", alignItems: "center", gap: 8 }}>
      {bgLayer("banner")}
      <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
        <div style={{ fontSize: fs + 4, fontWeight: c.typography.headingWeight }}>{s.title}</div>
        <div style={{ fontSize: fs - 2 }}>อัปเดตล่าสุด 5 นาทีที่แล้ว</div>
      </div>
      <PrimaryBtn onBanner>+ สร้างใหม่</PrimaryBtn>
    </div>
  ) : (
    <div className="tmp-en" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: gap }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fs + 4, fontWeight: c.typography.headingWeight }}>{s.title}</div>
        <div style={{ fontSize: fs - 2, color: P.mut }}>อัปเดตล่าสุด 5 นาทีที่แล้ว</div>
      </div>
      {!mob && <button type="button" style={btn(false)}>ส่งออก</button>}
      <PrimaryBtn>{mob ? "+" : "+ สร้างใหม่"}</PrimaryBtn>
    </div>
  );

  const cardFx = fxStyle("card");
  const numFx = fxStyle("number", "text");
  const cardCls = `tmp-en ${cardFx.cls}${hglow}`;
  const stats = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: gap - 4, marginBottom: gap }}>
      {s.stats.map(([l, v], i) => (
        <div key={l} {...pp("card")} className={cardCls} style={{ ...cardBox({ padding: `${pad}px 10px` }), ...cardFx.style, ...hringVar, ...delay(i + 1) }}>
          <div style={{ fontSize: fs - 2, color: P.mut }}>{l}</div>
          <div data-cnt={v} {...pp("number")} className={numFx.cls} style={{ display: "inline-block", fontSize: fs + (mob ? 2 : 5), fontWeight: c.typography.headingWeight, ...numFx.style }}>{v.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );

  const inputBase: React.CSSProperties = { borderRadius: R, ...(c.components.input === "filled" ? { background: dark ? "#0b1220" : "#f1f5f9", border: "1px solid transparent" } : { background: P.surf, border: `1px solid ${P.bd}` }), ...(el.inset ? { boxShadow: `inset 0 2px 4px ${rgba("#0f172a", dark ? 0.4 : 0.12)}` } : {}) };
  const tabs = (
    <div className="tmp-en" style={{ ...delay(4), display: "flex", gap: 10, alignItems: "center", marginBottom: gap - 4 }}>
      <div style={{ flex: 1, padding: "4px 9px", color: P.mut, fontSize: fs - 1, ...inputBase }}>ค้นหา…</div>
      {["ทั้งหมด", "ของฉัน"].map((t, i) =>
        c.components.tabs === "pill"
          ? <span key={t} style={{ fontSize: fs - 1, padding: "2px 10px", borderRadius: 999, ...(i === 0 ? { background: a[600], color: "#fff" } : { color: P.mut }) }}>{t}</span>
          : anim && fx.underline
            ? <span key={`${t}-${replayKey}`} className={`tmp-under${i === 0 ? " on" : ""}`} style={{ fontSize: fs - 1, color: i === 0 ? a[600] : P.mut, cursor: "pointer" }}>{t}</span>
            : <span key={t} style={{ fontSize: fs - 1, paddingBottom: 2, ...(i === 0 ? { color: a[600], borderBottom: `2px solid ${a[600]}` } : { color: P.mut }) }}>{t}</span>,
      )}
    </div>
  );

  const table = mob ? (
    <div>
      {s.rows.slice(0, compact ? 2 : 4).map((r, i) => (
        <div key={r[0]} {...pp("card")} className={cardCls} style={{ ...cardBox({ padding: `${pad}px 10px`, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }), ...cardFx.style, ...hringVar, ...delay(i + 5) }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: fs - 2, color: P.mut }}>{r[0]}</div><div>{r[1]}</div></div>
          {badge(r[3], r[4])}
        </div>
      ))}
    </div>
  ) : (
    <div {...pp("card")} className={`tmp-en${hglow}`} style={{ ...cardBox({ overflow: "hidden" }), ...hringVar, ...delay(5) }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{s.cols.map((h) => <th key={h} style={{ textAlign: "left", fontWeight: 500, fontSize: fs - 2, color: P.mut, padding: `${pad}px 10px`, borderBottom: `1px solid ${P.bd}`, background: c.components.table === "lines" ? (dark ? "#0b1220" : "#f8fafc") : undefined }}>{h}</th>)}</tr></thead>
        <tbody>
          {s.rows.slice(0, compact ? 2 : 4).map((r, i) => (
            <tr key={r[0]} className="tmp-row" style={{ background: c.components.table === "zebra" && i % 2 ? (dark ? "#172033" : "#f8fafc") : undefined }}>
              {[r[0], r[1], r[2]].map((v, j) => <td key={j} style={{ padding: `${pad}px 10px`, borderBottom: i < 3 ? `1px solid ${P.bd}` : undefined, borderRight: c.components.table === "lines" ? `1px solid ${P.bd}` : undefined, color: j === 0 ? P.mut : P.tx, whiteSpace: "nowrap" }}>{v}</td>)}
              <td style={{ padding: `${pad}px 10px`, borderBottom: i < 3 ? `1px solid ${P.bd}` : undefined }}>{badge(r[3], r[4])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const modal = !compact && !mob && (
    <div className="tmp-en" style={{ ...delay(7), display: "flex", gap: gap, marginTop: gap }}>
      <div style={{ flex: 1, ...cardBox({ padding: 10 }) }}>
        <div style={{ fontSize: fs - 2, color: P.mut, marginBottom: 4 }}>ช่องกรอก</div>
        <div style={{ padding: "4px 8px", ...inputBase }}>ผ้าใบ 10 ม้วน</div>
        <div style={{ marginTop: 6, padding: "4px 8px", borderRadius: R, border: `2px solid ${p[500]}`, boxShadow: `0 0 0 3px ${p[500]}33` }}>กำลังพิมพ์…</div>
      </div>
      <div style={{ flex: 1, ...cardBox({ padding: 10, borderRadius: R + 2, boxShadow: el.depth === "none" ? "none" : `0 10px 24px -8px ${rgba(shColor, 0.3)}` }) }}>
        <div style={{ fontWeight: c.typography.headingWeight }}>ยืนยันอนุมัติ?</div>
        <div style={{ fontSize: fs - 2, color: P.mut, margin: "4px 0 8px" }}>ใบขอซื้อ PR-00118 ยอด 12,400 บาท</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button type="button" style={btn(false)}>ยกเลิก</button><PrimaryBtn>อนุมัติ</PrimaryBtn></div>
      </div>
    </div>
  );

  const mascot = anim && c.animation.mascot && (
    <div aria-hidden className="tmp-mascot" style={{ position: "absolute", right: 12, bottom: mob ? 52 : 10, zIndex: 3, width: 44, height: 44 }}>
      {c.animation.mascotImage
        ? <img src={`/api/r2-image?key=${encodeURIComponent(c.animation.mascotImage)}`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: a[500], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>☺</div>}
    </div>
  );

  // อนุภาค (ข้อ 27)
  const particles = anim && fx.particles !== "none" && <ThemeParticles kind={fx.particles} speed={spd} color={a[300]} />;

  const menuFx = fxStyle("menu");
  const rootStyle = {
    "--spd": String(spd), "--ps": P.ps, "--enter": anim ? ENTER[fx.enter] : "none",
    position: "relative", overflow: "hidden", background: pageBg, color: P.tx, fontFamily: font.family, fontSize: fs, lineHeight: 1.45,
    borderRadius: 12, border: `1px solid ${dark ? "#334155" : "#cbd5e1"}`,
  } as React.CSSProperties;
  const cls = `tmp-root ${sp.page && anim && g.animate ? "tmp-ganim" : ""} ${editing ? "tmp-edit" : ""}`;
  const rootEvents = editing ? { onClickCapture: onRootClickCapture, onMouseMove: onRootMove, onMouseLeave: () => setHoverLbl(null) } : {};
  const lbl = editing && hoverLbl && <div aria-hidden style={{ position: "absolute", left: hoverLbl.x, top: hoverLbl.y, zIndex: 9, pointerEvents: "none", fontSize: 10, background: "#4c1d95", color: "#fff", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{hoverLbl.label} · คลิกเพื่อแก้</div>;

  const body = mob ? (
    <div key={replayKey} ref={rootRef} className={cls} style={{ ...rootStyle, width: compact ? "100%" : 300 }} {...rootEvents}>
      {top}
      <div style={{ position: "relative" }}>
        {bgLayer("page")}
        <div style={{ position: "relative", zIndex: 1, padding: 10 }}>{head}{stats}{!compact && tabs}{table}</div>
      </div>
      {!compact && (
        <div style={{ position: "relative", zIndex: 1, display: "flex", borderTop: `1px solid ${P.bd}`, background: P.surf }}>
          {["หน้าแรก", s.app, "งาน", "ฉัน"].map((t, i) => <div key={t} {...(i === 1 ? pp("menu") : {})} className={i === 1 ? menuFx.cls : ""} style={{ flex: 1, textAlign: "center", fontSize: fs - 2, padding: "6px 0", color: i === 1 ? p[600] : P.mut, ...(i === 1 ? { ...menuFx.style, color: menuFx.style.backgroundImage ? "#fff" : p[600] } : {}) }}>{t}</div>)}
        </div>
      )}
      {particles}
      {mascot}
      {lbl}
    </div>
  ) : (
    <div key={replayKey} ref={rootRef} className={cls} style={rootStyle} {...rootEvents}>
      {top}
      <div style={{ position: "relative", display: "flex" }}>
        {bgLayer("page")}
        {!compact && (
          <div style={{ position: "relative", zIndex: 1, width: 128, flex: "none", background: sideBg, color: sideTx, borderRight: `1px solid ${P.bd}`, padding: "10px 6px" }}>
            {["หน้าแรก", s.app, "รายงาน", "ตั้งค่า"].map((t, i) => {
              const on = i === 1;
              const st: React.CSSProperties = on
                ? sp.sidebar ? { background: grad, color: "#fff" } : c.components.sidebar === "light" ? { background: P.ps, color: p[700] } : { background: "rgba(255,255,255,.14)", color: "#fff" }
                : {};
              const icon = ["home", "file-text", "chart-bar", "settings"][i];
              return (
                <div key={t} {...(on ? pp("menu") : {})} className={on ? menuFx.cls : ""} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: R, marginBottom: 2, fontWeight: on ? 500 : 400, ...st, ...(on ? { ...menuFx.style, ...(menuFx.style.backgroundImage ? { color: "#fff" } : {}) } : {}) }}>
                  <span className={wig} style={{ display: "inline-flex" }}><Icon name={icon} /></span>{t}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, padding: compact ? 8 : 12 }}>
          {head}{stats}{!compact && tabs}{table}{modal}
        </div>
      </div>
      {particles}
      {mascot}
      {lbl}
    </div>
  );

  return (
    <>
      {!compact && <style>{CSS}</style>}
      {compact ? <ScaleToFit width={560}>{body}</ScaleToFit>
        : mob ? <div style={{ display: "flex", justifyContent: "center", background: dark ? "#020617" : "#e2e8f0", borderRadius: 12, padding: 14 }}>{body}</div> : body}
    </>
  );
}

/** วาดเนื้อหาที่ความกว้างคงที่ แล้วย่อให้พอดีกล่อง (การ์ดในคลังธีม — ไม่ให้ตัวหนังสือห่อเพี้ยน) */
function ScaleToFit({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ k: number; h: number }>({ k: 0.5, h: 160 });
  useLayoutEffect(() => {
    const o2 = outer.current, i = inner.current;
    if (!o2 || !i) return;
    const measure = () => { const k = o2.clientWidth / width; setBox({ k, h: i.offsetHeight * k }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o2); ro.observe(i);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} style={{ width: "100%", height: box.h, overflow: "hidden" }}>
      <div ref={inner} style={{ width, transform: `scale(${box.k})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}
