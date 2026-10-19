"use client";

/**
 * 🧩 ป๊อปตั้งค่าชิ้นส่วนหัวเว็บ (⚙ ในแท็บ Header → ตำแหน่งชิ้นส่วน) — ตะกร้า · ค้นหา
 * ข้อมูล/ตัวกรอง: lib/website-header-els (มิเรอร์ storefront src/lib/header-els.ts) · เว็บร้านวาดที่ Navbar
 * มีตัวอย่างสดบนพื้นสีหัวเว็บจริง (สีพื้น/สีตัวอักษรของ Header + สีหลัก)
 */
import { LangInput } from "@/components/bilingual-field";
import type { ReactNode } from "react";
import { WheelSelect } from "@/components/wheel-select";
import { Seg } from "@/components/website-block-editor";
import { ColorInput } from "@/components/color-picker";
import { CART_BADGES, CART_ICONS, HEADER_ICON_PATHS, ICON_SIZES, SEARCH_STYLES, SEARCH_WIDTHS, type CartIcon, type HeaderCart, type HeaderSearch } from "@/lib/website-header-els";

type ThemeLike = { colors: { brand: string; ink: string; page: string; surface: string; muted: string }; header: { bg: string; bgKind: string; bgColor: string; textColor: string } };

const lbl = "block text-[11px] font-medium text-slate-500 mb-1";
const input = "w-full h-8 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400";

export function HeaderIcon({ name, size = 20 }: { name: CartIcon | "search"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {HEADER_ICON_PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** พื้น/สีตัวอักษรของหัวเว็บโดยประมาณ (ตัวอย่างสด) */
function headerColors(t: ThemeLike): { bg: string; fg: string } {
  const bg = t.header.bgKind === "custom" ? t.header.bgColor : t.header.bg === "ink" ? t.colors.ink : t.header.bg === "brand" ? t.colors.brand : t.header.bg === "surface" ? t.colors.surface : t.colors.page;
  const dark = t.header.bgKind === "custom" ? false : t.header.bg === "ink" || t.header.bg === "brand";
  return { bg, fg: t.header.textColor || (dark ? "#ffffff" : t.colors.ink) };
}

function Preview({ t, children }: { t: ThemeLike; children: ReactNode }) {
  const c = headerColors(t);
  return (
    <div className="rounded-lg border border-slate-200 px-4 h-14 flex items-center justify-end gap-3" style={{ background: c.bg, color: c.fg }}>
      <span className="mr-auto text-[11px] opacity-60">ตัวอย่างบนหัวเว็บ</span>
      {children}
    </div>
  );
}

export function HeaderCartSettings({ value, onChange, theme }: { value: HeaderCart; onChange: (p: Partial<HeaderCart>) => void; theme: ThemeLike }) {
  const badgeBg = value.badgeColor || theme.colors.brand;
  return (
    <div className="space-y-4">
      <Preview t={theme}>
        <span className="relative inline-flex items-center gap-1.5 p-1.5">
          <HeaderIcon name={value.icon} size={value.size} />
          {value.label && <span className="text-sm">{value.label}</span>}
          {value.badge === "count" && (
            <span className="absolute -top-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center" style={{ left: value.size - 6, background: badgeBg }}>
              2
            </span>
          )}
          {value.badge === "dot" && <span className="absolute top-0.5 rounded-full" style={{ left: value.size - 2, width: 8, height: 8, background: badgeBg }} />}
        </span>
      </Preview>
      <div>
        <span className={lbl}>แบบไอคอน</span>
        <div className="grid grid-cols-4 gap-2">
          {CART_ICONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange({ icon: o.value })}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] ${value.icon === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              <HeaderIcon name={o.value} size={22} />
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>คำข้างไอคอน (ไม่ใส่ = ไอคอนอย่างเดียว · มือถือซ่อนคำ)</span>
          <LangInput className={input} obj={value} k="label" maxLength={20} placeholder="เช่น ตะกร้า / Cart" onPatch={onChange} />
        </label>
        <label className="block">
          <span className={lbl}>ขนาดไอคอน</span>
          <WheelSelect value={value.size} onChange={(e) => onChange({ size: Number(e.target.value) })}>
            {ICON_SIZES.map((n) => (
              <option key={n} value={n}>{n}px{n === 21 ? " (เดิม)" : ""}</option>
            ))}
          </WheelSelect>
        </label>
        <div>
          <span className={lbl}>ป้ายบนไอคอน (เมื่อมีของในตะกร้า)</span>
          <Seg value={value.badge} onChange={(v) => onChange({ badge: v })} options={CART_BADGES.map((o) => ({ v: o.value, l: o.label }))} />
        </div>
        <div>
          <span className={lbl}>สีป้าย</span>
          <div className="flex items-center gap-1.5">
            <span className="w-32">
              <ColorInput value={value.badgeColor || theme.colors.brand} onChange={(v) => onChange({ badgeColor: v })} />
            </span>
            {value.badgeColor ? (
              <button type="button" onClick={() => onChange({ badgeColor: "" })} className="text-[11px] text-slate-400 hover:text-rose-600">
                ✕ ใช้สีหลัก
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">= สีหลักของธีม</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeaderSearchSettings({ value, onChange, theme }: { value: HeaderSearch; onChange: (p: Partial<HeaderSearch>) => void; theme: ThemeLike }) {
  const w = SEARCH_WIDTHS.find((x) => x.value === value.width)?.px ?? 220;
  return (
    <div className="space-y-4">
      <Preview t={theme}>
        {value.style === "box" ? (
          <span className="inline-flex items-center gap-2 h-9 rounded-full border px-3 text-sm opacity-90" style={{ width: Math.min(w, 300), borderColor: "currentColor" }}>
            <HeaderIcon name="search" size={Math.min(value.size, 18)} />
            <span className="opacity-60 truncate">{value.placeholder}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 p-1.5">
            <HeaderIcon name="search" size={value.size} />
            {value.style === "iconText" && <span className="text-sm">{value.label}</span>}
          </span>
        )}
      </Preview>
      <div>
        <span className={lbl}>หน้าตา</span>
        <Seg value={value.style} onChange={(v) => onChange({ style: v })} options={SEARCH_STYLES.map((o) => ({ v: o.value, l: o.label }))} />
        <p className="mt-1 text-[11px] text-slate-400">กดแล้วเปิดหน้าค้นหาเต็มจอเหมือนเดิมทุกแบบ · มือถือแสดงเป็นไอคอนเสมอ (ที่แคบ)</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {value.style === "iconText" && (
          <label className="block">
            <span className={lbl}>คำข้างไอคอน</span>
            <LangInput className={input} obj={value} k="label" maxLength={20} placeholder="ค้นหา" onPatch={onChange} />
          </label>
        )}
        {value.style === "box" && (
          <>
            <label className="block">
              <span className={lbl}>ข้อความในช่อง</span>
              <LangInput className={input} obj={value} k="placeholder" maxLength={40} placeholder="ค้นหาสินค้า…" onPatch={onChange} />
            </label>
            <label className="block">
              <span className={lbl}>ความกว้างช่อง</span>
              <WheelSelect value={value.width} onChange={(e) => onChange({ width: e.target.value as HeaderSearch["width"] })}>
                {SEARCH_WIDTHS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} ({o.px}px)</option>
                ))}
              </WheelSelect>
            </label>
          </>
        )}
        <label className="block">
          <span className={lbl}>ขนาดไอคอน</span>
          <WheelSelect value={value.size} onChange={(e) => onChange({ size: Number(e.target.value) })}>
            {ICON_SIZES.map((n) => (
              <option key={n} value={n}>{n}px{n === 20 ? " (เดิม)" : ""}</option>
            ))}
          </WheelSelect>
        </label>
      </div>
    </div>
  );
}
