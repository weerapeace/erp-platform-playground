"use client";
/**
 * ThemePreview (ของกลาง · ธีมกลาง ERP เฟส 2) — หน้าตัวอย่าง ERP ที่วาดตามค่าธีมครบ 9 หมวด
 *   แถบบน · เมนูข้าง · แบนเนอร์ · การ์ดตัวเลข · ตาราง · ช่องกรอก · แท็บ · ป้ายสถานะ (ล็อก) · ป๊อปอัป · มาสคอต
 *   device="mobile" ใช้โหมดเบาอัตโนมัติ (mobileLiteConfig) · replayKey เปลี่ยน = เล่นแอนิเมชันเข้าหน้าใหม่
 * ใช้ที่: /admin/themes (การ์ด = compact) · /admin/themes/[id] (ตัวแก้)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FONT_OPTIONS, DENSITY_SCALE, SPEED_FACTOR, effectiveBgOpacity, mobileLiteConfig, scaleOf, type ErpThemeConfig,
} from "@/lib/erp-theme-config";

export type PreviewSample = "purchase" | "products" | "tasks";

const SAMPLES: Record<PreviewSample, { app: string; title: string; stats: [string, number][]; cols: string[]; rows: [string, string, string, "wait" | "ok" | "bad" | "draft", string][] }> = {
  purchase: { app: "จัดซื้อ", title: "ใบขอซื้อ", stats: [["เดือนนี้", 86], ["รออนุมัติ", 9], ["ยอดรวม (บาท)", 412500]], cols: ["เลขที่", "รายการ", "ยอด", "สถานะ"],
    rows: [["PR-00118", "ผ้าใบ 10 ม้วน", "12,400", "wait", "รออนุมัติ"], ["PR-00117", "หนังแท้", "48,000", "ok", "อนุมัติแล้ว"], ["PR-00116", "กาวยาง", "1,250", "bad", "ไม่อนุมัติ"], ["PR-00115", "ด้ายไนลอน", "3,600", "draft", "ร่าง"]] },
  products: { app: "สินค้า", title: "สินค้าทั้งหมด", stats: [["สินค้า", 1284], ["ใกล้หมด", 37], ["รอตรวจรับ", 12]], cols: ["รหัส", "ชื่อสินค้า", "สต๊อก", "สถานะ"],
    rows: [["SKU-0012", "กระเป๋าหนังวัว", "48", "ok", "ใช้งาน"], ["SKU-0031", "เข็มขัด TTM130", "6", "wait", "ใกล้หมด"], ["SKU-0044", "ป้ายหนังปั๊มโลโก้", "0", "draft", "ร่าง"], ["SKU-0050", "ซิปทองเหลือง", "120", "ok", "ใช้งาน"]] },
  tasks: { app: "Creative", title: "งานออกแบบ", stats: [["งานทั้งหมด", 214], ["รอตรวจ", 18], ["เสร็จสัปดาห์นี้", 41]], cols: ["งาน", "หัวข้อ", "กำหนด", "สถานะ"],
    rows: [["T-881", "ปกโปร 12.12", "28 พ.ย.", "wait", "รอตรวจ"], ["T-880", "รูปสินค้า TTM130", "26 พ.ย.", "ok", "เสร็จ"], ["T-879", "แบนเนอร์หน้าร้าน", "25 พ.ย.", "bad", "ตีกลับ"], ["T-878", "คลิปรีวิว", "30 พ.ย.", "draft", "ร่าง"]] },
};
// สีสถานะล็อก — ไม่ตามธีม (เหมือนป้ายจริงในระบบ)
const STATUS: Record<string, [string, string, string]> = {
  draft: ["#f1f5f9", "#475569", "#64748b"], wait: ["#fef3c7", "#92400e", "#d97706"],
  ok: ["#dcfce7", "#166534", "#16a34a"], bad: ["#fee2e2", "#991b1b", "#dc2626"],
};
const img = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

let fontLoaded = new Set<string>();
function useGoogleFont(google: string | null) {
  useEffect(() => {
    if (!google || fontLoaded.has(google) || typeof document === "undefined") return;
    fontLoaded = new Set(fontLoaded).add(google);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
    document.head.appendChild(l);
  }, [google]);
}

const CSS = `
@keyframes tmpEnter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes tmpShine{0%{left:-60%}60%,100%{left:130%}}
@keyframes tmpGrad{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes tmpFloat{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-7px) rotate(-6deg)}}
.tmp-enter .tmp-en{animation:tmpEnter calc(.55s*var(--spd)) cubic-bezier(.22,1,.36,1) both}
.tmp-shine{position:relative;overflow:hidden}
.tmp-shine::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:rgba(255,255,255,.45);transform:skewX(-20deg);animation:tmpShine calc(2.4s*var(--spd)) infinite}
.tmp-ganim{background-size:200% 200%!important;animation:tmpGrad calc(6s*var(--spd)) ease infinite}
.tmp-hov .tmp-card{transition:transform .15s,box-shadow .15s}
.tmp-hov .tmp-card:hover{transform:translateY(-3px);box-shadow:0 8px 18px -8px rgba(0,0,0,.3)}
.tmp-hov .tmp-row:hover td{background:var(--ps)}
.tmp-mascot{animation:tmpFloat calc(3s*var(--spd)) ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.tmp-root *{animation:none!important;transition:none!important}}
`;

export function ThemePreview({
  config, device = "pc", sample = "purchase", dark = false, replayKey = 0, compact = false,
}: {
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
  useGoogleFont(compact ? null : font.google);
  const p = scaleOf(c.colors.primary), a = scaleOf(c.colors.accent);
  const s = SAMPLES[sample];
  const g = c.gradient, sp = g.spots;
  const grad = `linear-gradient(${g.angle}deg, ${p[600]}, ${g.color2})`;
  const R = c.shape.radius;
  const shadow = c.shape.shadow === "none" ? "none" : c.shape.shadow === "soft" ? "0 1px 3px rgba(15,23,42,.08)" : "0 6px 16px -4px rgba(15,23,42,.18)";
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

  // ปุ่ม 3 แบบ
  const btn = (primary = true): React.CSSProperties => {
    if (!primary) return { background: P.surf, color: P.tx, border: `1px solid ${P.bd}`, borderRadius: R, padding: "4px 10px", fontSize: fs };
    const base: React.CSSProperties = { borderRadius: R, padding: "4px 11px", fontSize: fs, fontWeight: 500 };
    if (c.components.button === "soft") return { ...base, background: p[100], color: p[700], border: `1px solid ${p[200]}` };
    if (c.components.button === "outline") return { ...base, background: "transparent", color: p[600], border: `1.5px solid ${p[600]}` };
    return { ...base, background: sp.button ? grad : p[600], color: "#fff", border: "none" };
  };
  const shineCls = anim && c.animation.shine && c.components.button === "solid" ? "tmp-shine" : "";
  const ganim = anim && g.animate ? "tmp-ganim" : "";
  const badge = (k: string, label: string) => {
    const [bg, tx, solid] = STATUS[k];
    return <span style={{ fontSize: fs - 2, padding: "1px 7px", borderRadius: 999, whiteSpace: "nowrap", ...(c.components.badge === "solid" ? { background: solid, color: "#fff" } : { background: bg, color: tx }) }}>{label}</span>;
  };

  const sideBg = c.components.sidebar === "dark" ? "#1e293b" : c.components.sidebar === "brand" ? p[700] : P.surf;
  const sideTx = c.components.sidebar === "light" ? P.mut : "#e2e8f0";
  const hasBanner = sp.banner || (bgKey && c.background.where === "banner");

  // ตัวเลขนับขึ้น
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!anim || !c.animation.countUp || !rootRef.current) return;
    const els = rootRef.current.querySelectorAll<HTMLElement>("[data-cnt]");
    const dur = 800 * SPEED_FACTOR[c.animation.speed], t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      els.forEach((el) => { el.textContent = Math.round(Number(el.dataset.cnt) * (1 - (1 - k) ** 3)).toLocaleString(); });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [replayKey, anim, c.animation.countUp, c.animation.speed, sample, device]);

  const delay = (i: number) => ({ animationDelay: `${i * 70}ms` });
  const enterCls = anim && c.animation.enter ? "tmp-enter" : "";
  const pageBg = sp.page ? `linear-gradient(${g.angle}deg, ${p[500]}2e, ${g.color2}47), ${P.page}` : P.page;

  const top = (
    <div className={sp.top ? ganim : ""} style={{ position: "relative", background: sp.top ? grad : p[600], color: "#fff", padding: mob ? "9px 12px" : "8px 12px" }}>
      {bgLayer("top")}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: c.typography.headingWeight }}>{mob ? s.app : `ERP · ${s.app}`}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, opacity: 0.9, fontSize: fs - 1 }}>ค้นหา · แจ้งเตือน</span>
      </div>
    </div>
  );

  const head = hasBanner ? (
    <div className={`tmp-en ${sp.banner ? ganim : ""}`} style={{ position: "relative", overflow: "hidden", borderRadius: R + 2, background: sp.banner ? grad : p[600], color: "#fff", padding: "12px 14px", marginBottom: gap, display: "flex", alignItems: "center", gap: 8 }}>
      {bgLayer("banner")}
      <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
        <div style={{ fontSize: fs + 4, fontWeight: c.typography.headingWeight }}>{s.title}</div>
        <div style={{ fontSize: fs - 2 }}>อัปเดตล่าสุด 5 นาทีที่แล้ว</div>
      </div>
      <button type="button" className={shineCls} style={{ ...btn(), position: "relative", zIndex: 1, border: "1px solid rgba(255,255,255,.7)" }}>+ สร้างใหม่</button>
    </div>
  ) : (
    <div className="tmp-en" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: gap }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fs + 4, fontWeight: c.typography.headingWeight }}>{s.title}</div>
        <div style={{ fontSize: fs - 2, color: P.mut }}>อัปเดตล่าสุด 5 นาทีที่แล้ว</div>
      </div>
      {!mob && <button type="button" style={btn(false)}>ส่งออก</button>}
      <button type="button" className={shineCls} style={btn()}>{mob ? "+" : "+ สร้างใหม่"}</button>
    </div>
  );

  const stats = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: gap - 4, marginBottom: gap }}>
      {s.stats.map(([l, v], i) => (
        <div key={l} className="tmp-card tmp-en" style={{ ...delay(i + 1), background: P.surf, border: `1px solid ${P.bd}`, borderRadius: R, boxShadow: shadow, padding: `${pad}px 10px` }}>
          <div style={{ fontSize: fs - 2, color: P.mut }}>{l}</div>
          <div data-cnt={v} style={{ fontSize: fs + (mob ? 2 : 5), fontWeight: c.typography.headingWeight }}>{v.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );

  const tabs = (
    <div className="tmp-en" style={{ ...delay(4), display: "flex", gap: 8, alignItems: "center", marginBottom: gap - 4 }}>
      <div style={{ flex: 1, padding: "4px 9px", borderRadius: R, color: P.mut, fontSize: fs - 1, ...(c.components.input === "filled" ? { background: dark ? "#0b1220" : "#f1f5f9", border: "1px solid transparent" } : { background: P.surf, border: `1px solid ${P.bd}` }) }}>ค้นหา…</div>
      {["ทั้งหมด", "ของฉัน"].map((t, i) =>
        c.components.tabs === "pill"
          ? <span key={t} style={{ fontSize: fs - 1, padding: "2px 10px", borderRadius: 999, ...(i === 0 ? { background: a[600], color: "#fff" } : { color: P.mut }) }}>{t}</span>
          : <span key={t} style={{ fontSize: fs - 1, paddingBottom: 2, ...(i === 0 ? { color: a[600], borderBottom: `2px solid ${a[600]}` } : { color: P.mut }) }}>{t}</span>,
      )}
    </div>
  );

  const table = mob ? (
    <div>
      {s.rows.slice(0, compact ? 2 : 4).map((r, i) => (
        <div key={r[0]} className="tmp-card tmp-en" style={{ ...delay(i + 5), background: P.surf, border: `1px solid ${P.bd}`, borderRadius: R, boxShadow: shadow, padding: `${pad}px 10px`, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: fs - 2, color: P.mut }}>{r[0]}</div><div>{r[1]}</div></div>
          {badge(r[3], r[4])}
        </div>
      ))}
    </div>
  ) : (
    <div className="tmp-en" style={{ ...delay(5), background: P.surf, border: `1px solid ${P.bd}`, borderRadius: R, boxShadow: shadow, overflow: "hidden" }}>
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
      <div style={{ flex: 1, background: P.surf, border: `1px solid ${P.bd}`, borderRadius: R, padding: 10 }}>
        <div style={{ fontSize: fs - 2, color: P.mut, marginBottom: 4 }}>ช่องกรอก</div>
        <div style={{ padding: "4px 8px", borderRadius: R, ...(c.components.input === "filled" ? { background: dark ? "#0b1220" : "#f1f5f9" } : { border: `1px solid ${P.bd}` }) }}>ผ้าใบ 10 ม้วน</div>
        <div style={{ marginTop: 6, padding: "4px 8px", borderRadius: R, border: `2px solid ${p[500]}`, boxShadow: `0 0 0 3px ${p[500]}33` }}>กำลังพิมพ์…</div>
      </div>
      <div style={{ flex: 1, background: P.surf, border: `1px solid ${P.bd}`, borderRadius: R + 2, padding: 10, boxShadow: "0 10px 24px -8px rgba(15,23,42,.25)" }}>
        <div style={{ fontWeight: c.typography.headingWeight }}>ยืนยันอนุมัติ?</div>
        <div style={{ fontSize: fs - 2, color: P.mut, margin: "4px 0 8px" }}>ใบขอซื้อ PR-00118 ยอด 12,400 บาท</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><button type="button" style={btn(false)}>ยกเลิก</button><button type="button" className={shineCls} style={btn()}>อนุมัติ</button></div>
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

  const rootStyle = {
    "--spd": String(SPEED_FACTOR[c.animation.speed]), "--ps": P.ps,
    position: "relative", overflow: "hidden", background: pageBg, color: P.tx, fontFamily: font.family, fontSize: fs, lineHeight: 1.45,
    borderRadius: 12, border: `1px solid ${dark ? "#334155" : "#cbd5e1"}`,
  } as React.CSSProperties;
  const cls = `tmp-root ${anim && c.animation.hover ? "tmp-hov" : ""} ${enterCls} ${sp.page ? ganim : ""}`;

  const body = mob ? (
    <div key={replayKey} ref={rootRef} className={cls} style={{ ...rootStyle, width: compact ? "100%" : 300 }}>
      {top}
      <div style={{ position: "relative" }}>
        {bgLayer("page")}
        <div style={{ position: "relative", zIndex: 1, padding: 10 }}>{head}{stats}{!compact && tabs}{table}</div>
      </div>
      {!compact && (
        <div style={{ position: "relative", zIndex: 1, display: "flex", borderTop: `1px solid ${P.bd}`, background: P.surf }}>
          {["หน้าแรก", s.app, "งาน", "ฉัน"].map((t, i) => <div key={t} style={{ flex: 1, textAlign: "center", fontSize: fs - 2, padding: "6px 0", color: i === 1 ? p[600] : P.mut }}>{t}</div>)}
        </div>
      )}
      {mascot}
    </div>
  ) : (
    <div key={replayKey} ref={rootRef} className={cls} style={rootStyle}>
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
              return <div key={t} style={{ padding: "5px 8px", borderRadius: R, marginBottom: 2, fontWeight: on ? 500 : 400, ...st }}>{t}</div>;
            })}
          </div>
        )}
        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, padding: compact ? 8 : 12 }}>
          {head}{stats}{!compact && tabs}{table}{modal}
        </div>
      </div>
      {mascot}
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
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => { const k = o.clientWidth / width; setBox({ k, h: i.offsetHeight * k }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o); ro.observe(i);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} style={{ width: "100%", height: box.h, overflow: "hidden" }}>
      <div ref={inner} style={{ width, transform: `scale(${box.k})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}
