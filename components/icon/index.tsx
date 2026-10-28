"use client";

/**
 * 🔣 Icon — ของกลาง: วาดไอคอนตามทะเบียนไอคอนกลาง (lib/icon-registry) + โหมดที่แอดมินเลือกใน /admin/icons
 *
 *   <Icon value={item.icon} />   ค่าเดิม (อีโมจิในเมนู/DB หรือ "i:" / "c:" / "img:") — ระบบดูความหมายแล้ววาดให้
 *   <Icon name="save" />          โค้ดใหม่: เรียกตามความหมาย (ดูชื่อใน ICON_MEANINGS)
 *
 * โหมด "อีโมจิแบบเดิม" = วาดอีโมจิเหมือนเดิมทุกอย่าง (ไม่มีกรอบเพิ่ม) · โหมดไอคอน = SVG เส้น ขนาด 1em ตามตัวหนังสือรอบ ๆ
 * อีโมจิที่ยังไม่มีในทะเบียน = โชว์อีโมจิเดิม (ไม่หาย) · แอดมินจับคู่เพิ่มได้ที่ /admin/icons
 * ค่าตั้งค่าโหลดครั้งเดียวต่อการเปิดเว็บ (+ จำในเครื่อง กันกระพริบตอนเปิดหน้า) · docs/icon-system.md
 */
import { useSyncExternalStore, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api";
import { DEFAULT_ICON_SETTINGS, cleanIconSettings, resolveIcon, type IconMode, type IconSettings } from "@/lib/icon-registry";

export const ICON_SETTINGS_API = "/api/admin/icon-settings";
const LS_KEY = "erp.iconSettings.v1";

// ── ค่าตั้งค่ากลาง (โหลดครั้งเดียว · ทุก <Icon> ใช้ร่วมกัน) ──
let saved: IconSettings = DEFAULT_ICON_SETTINGS;
let current: IconSettings = DEFAULT_ICON_SETTINGS;
let previewing = false;
let started = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function remember(s: IconSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* โหมดส่วนตัว/บล็อกที่เก็บ — ไม่เป็นไร */ }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) current = saved = cleanIconSettings(JSON.parse(raw));
  } catch { /* ค่าในเครื่องเสีย — ใช้ค่าเริ่มต้น */ }
  apiFetch(ICON_SETTINGS_API)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { data?: unknown } | null) => {
      if (!j?.data) return;
      saved = cleanIconSettings(j.data);
      remember(saved);
      if (!previewing) { current = saved; emit(); }
    })
    .catch(() => { /* โหลดไม่ได้ = ใช้ค่าที่จำไว้/ค่าเริ่มต้น (อีโมจิแบบเดิม) */ });
}

function subscribe(f: () => void) {
  subs.add(f);
  start();
  return () => { subs.delete(f); };
}

export function useIconSettings(): IconSettings {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_ICON_SETTINGS);
}

/** ค่าที่บันทึกล่าสุด (หน้า /admin/icons ใช้เป็นจุดเริ่มแก้ / ละทิ้ง) */
export const savedIconSettings = (): IconSettings => saved;

/** ลองดูค่าใหม่ทั้งระบบก่อนบันทึก (เมนูข้างเปลี่ยนตามทันที) · null = กลับไปค่าที่บันทึกไว้ */
export function previewIconSettings(s: IconSettings | null) {
  previewing = !!s;
  current = s ?? saved;
  emit();
}

/** บันทึกสำเร็จแล้ว → ใช้ค่าใหม่ทั้งระบบ + จำในเครื่อง */
export function commitIconSettings(s: IconSettings) {
  saved = current = s;
  previewing = false;
  remember(s);
  emit();
}

// ── วาด ──
export const iconImageUrl = (r2Key: string, w = 96) => `/api/r2-image?key=${encodeURIComponent(r2Key)}&w=${w}`;

export function Icon({
  name,
  value,
  size = "1em",
  className = "",
  title,
  strokeWidth = 1.75,
  mode,
  settings,
}: {
  /** ชื่อความหมายในทะเบียน (เช่น "save") */
  name?: string;
  /** ค่าเดิมที่เก็บไว้ (อีโมจิ / "i:" / "c:" / "img:") */
  value?: string | null;
  /** ขนาด (ค่าเริ่ม 1em = เท่าตัวหนังสือรอบ ๆ) */
  size?: number | string;
  className?: string;
  /** คำอธิบายสำหรับโปรแกรมอ่านหน้าจอ/เมาส์ชี้ (ไม่ใส่ = ไอคอนตกแต่ง) */
  title?: string;
  strokeWidth?: number;
  /** บังคับโหมด (หน้าตั้งค่าใช้วาดตัวอย่างเทียบกัน) — ไม่ใส่ = ตามที่แอดมินตั้ง */
  mode?: IconMode;
  /** ใช้ค่าตั้งค่านี้แทนค่ากลาง (หน้าตั้งค่า) */
  settings?: IconSettings;
}) {
  const shared = useIconSettings();
  const s = settings ?? shared;
  const r = resolveIcon({ name, value }, s, mode ?? s.mode);
  if (!r) return null;
  if (r.kind === "text") return title ? <span title={title}>{r.text}</span> : <>{r.text}</>;
  const cls = className || undefined;
  // สี: ที่แอดมินตั้ง/สีตามความหมาย (โหมดสี) · ไม่มี = ตามตัวหนังสือรอบ ๆ (currentColor)
  const style: CSSProperties = { width: size, height: size, display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...(r.color ? { color: r.color } : null) };
  const a11y = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };
  if (r.kind === "line")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={cls} style={style} {...a11y}>
        {title && <title>{title}</title>}
        {r.d.map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  const url = iconImageUrl(r.src);
  if (r.tint) {
    const mask = `url("${url}") center / contain no-repeat`;
    return <span className={cls} style={{ ...style, backgroundColor: "currentColor", WebkitMask: mask, mask }} title={title} {...a11y} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={title ?? ""} className={cls} style={{ ...style, objectFit: "contain" }} />;
}
