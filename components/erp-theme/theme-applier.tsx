"use client";
/**
 * ThemeApplier (ธีมกลาง ERP เฟส 3–4) — ทาธีมของแอปที่เปิดอยู่ลงทั้งหน้า
 *   ลำดับ: ธีมของแอป → ธีมบริษัท → ไม่มี (ล้างทุกอย่าง = หน้าตาเดิม)
 *   - ตัวแปร --tm-* ที่ <html> (สี ฟอนต์ ไล่สี แถบบน) → ป๊อปอัป/ลิ้นชักที่ลอยออกนอกกล่องได้สีเดียวกัน
 *   - attr data-tm-* ที่ <html> → CSS ใน app/globals.css "ธีมกลาง เฟส 4" (ปุ่มหลักไล่สี/แสงวิ่ง · แถบบน · เมนูข้าง · แถวตาราง · เข้าหน้า)
 *   - วาดชั้นพื้นหลังทั้งหน้า (fixed หลังเนื้อหา) + มาสคอตมุมขวาล่าง (กดทะลุได้)
 *   มือถือ = โหมดเบา · ปิดแอนิเมชัน (เมนูบัญชี / เครื่องตั้งลดการเคลื่อนไหว) = ไม่เล่นอะไรเลย
 *   ไม่ทำอะไรถ้าหน้านี้อยู่ในพรีวิวของตัวแก้ธีม (ThemePreviewBridge ตั้ง data-theme-preview)
 * วางที่: components/playground-shell (ปกติ + embed) · app/app/[appKey] · แบนเนอร์ = ThemeBanner (ใน <main>)
 */
import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { themeCssVars, type ErpThemeConfig } from "@/lib/erp-theme-config";
import { themeForApp } from "@/lib/erp-theme-assign";
import { EFFECT_ATTRS, themeEffects, type ThemeEffects, type ThemeLayer } from "@/lib/erp-theme-effects";
import { ensureThemeFont, useActiveThemes } from "./active-themes";
import { useIsMobileScreen, useMotionPref } from "./motion-pref";

let appliedVars: string[] = [];

/** ธีม + เอฟเฟกต์ของแอปนี้ (ใช้ร่วมกันระหว่างตัวทาธีมกับแบนเนอร์) */
export function useThemeEffects(appKey: string | null | undefined): { cfg: ErpThemeConfig | null; fx: ThemeEffects; scope: string | null } {
  const active = useActiveThemes();
  const mobile = useIsMobileScreen();
  const motion = useMotionPref();
  const cfg = themeForApp(active, appKey ?? null);
  const sig = cfg ? JSON.stringify(cfg) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fx = useMemo(() => themeEffects(cfg, { mobile, motionOff: motion !== "on" }), [sig, mobile, motion]);
  const scope = !cfg ? null : appKey && active?.apps[appKey] ? `app:${appKey}` : "company";
  return { cfg, fx, scope };
}

export function layerStyle(l: ThemeLayer): React.CSSProperties {
  return {
    backgroundImage: [l.image ? `url("${l.image}")` : null, l.gradient].filter(Boolean).join(", ") || undefined,
    backgroundSize: "cover", backgroundPosition: "center",
    opacity: l.opacity, filter: l.blur ? `blur(${l.blur}px)` : undefined,
  };
}

export function ThemeApplier({ appKey, decor = true }: { appKey: string | null | undefined; decor?: boolean }) {
  const { cfg, fx, scope } = useThemeEffects(appKey);
  const pathname = usePathname();
  const sig = cfg ? JSON.stringify(cfg) + JSON.stringify(fx.attrs) : "";

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.themePreview === "1") return;
    appliedVars.forEach((k) => root.style.removeProperty(k));
    appliedVars = [];
    for (const a of EFFECT_ATTRS) root.removeAttribute(`data-${a}`);
    if (!cfg) { delete root.dataset.erpTheme; return; }
    ensureThemeFont(cfg.typography.font);
    for (const [k, v] of Object.entries({ ...themeCssVars(cfg), ...fx.vars })) { root.style.setProperty(k, v); appliedVars.push(k); }
    for (const [k, v] of Object.entries(fx.attrs)) root.setAttribute(`data-${k}`, v);
    root.dataset.erpTheme = scope ?? "company";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, scope]);

  // แอนิเมชันเข้าหน้า: เปลี่ยนหน้าแล้วเนื้อหาค่อย ๆ โผล่ (จางเข้าอย่างเดียว ไม่ขยับตำแหน่ง — กันป๊อปลอยเพี้ยน)
  useEffect(() => {
    if (!fx.attrs["tm-enter"]) return;
    const el = document.querySelector<HTMLElement>("[data-tm-page]");
    if (!el) return;
    el.classList.remove("tm-enter");
    void el.offsetWidth;
    el.classList.add("tm-enter");
    const t = setTimeout(() => el.classList.remove("tm-enter"), 900);
    return () => clearTimeout(t);
  }, [pathname, fx.attrs]);

  if (!decor || !cfg) return null;
  return (
    <>
      {fx.page && <div aria-hidden className="tm-page-layer" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", ...layerStyle(fx.page) }} />}
      {fx.mascot && (
        <div aria-hidden className="tm-mascot" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 40, width: 64, height: 64, pointerEvents: "none" }}>
          {fx.mascot.image
            ? <img src={fx.mascot.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: fx.mascot.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>☺</div>}
        </div>
      )}
    </>
  );
}

/** แถบตกแต่งบนสุดของทุกหน้า (วางเป็นลูกแรกของ <main> ที่เป็น relative) — เนื้อหาลอยทับ */
export function ThemeBanner({ appKey }: { appKey: string | null | undefined }) {
  const { fx } = useThemeEffects(appKey);
  if (!fx.banner) return null;
  const b = fx.banner;
  return (
    <div aria-hidden className={`tm-banner ${b.animate ? "tm-ganim" : ""}`} style={{
      position: "absolute", left: 0, right: 0, top: 0, height: 220, pointerEvents: "none", overflow: "hidden",
      WebkitMaskImage: "linear-gradient(to bottom, #000 35%, transparent)", maskImage: "linear-gradient(to bottom, #000 35%, transparent)",
      ...layerStyle(b),
    }} />
  );
}
