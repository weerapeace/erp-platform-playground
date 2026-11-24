"use client";
/**
 * ธีมที่ใช้อยู่ (ฝั่งเบราว์เซอร์) — โหลด /api/themes/active ครั้งเดียวต่อหน้า + จำใน localStorage (เปิดหน้าใหม่ไม่กระพริบ)
 *   useActiveThemes() → ActiveThemes | null · refreshActiveThemes() = โหลดใหม่ (หลังบันทึกธีมของแอป)
 *   ensureThemeFont(fontKey) = โหลดฟอนต์ Google ของธีม (ครั้งเดียว)
 */
import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { FONT_OPTIONS, normalizeThemeConfig, type FontKey } from "@/lib/erp-theme-config";
import type { ActiveThemes } from "@/lib/erp-theme-assign";

const LS_KEY = "erp-theme-active-v1";
let current: ActiveThemes | null = null;
let loading: Promise<void> | null = null;
let loadedAt = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function clean(raw: unknown): ActiveThemes | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { company?: { theme_id: string; config: unknown } | null; apps?: Record<string, { theme_id: string; config: unknown }> };
  const apps: ActiveThemes["apps"] = {};
  for (const [k, v] of Object.entries(r.apps ?? {})) if (v?.theme_id) apps[k] = { theme_id: v.theme_id, config: normalizeThemeConfig(v.config) };
  return { company: r.company?.theme_id ? { theme_id: r.company.theme_id, config: normalizeThemeConfig(r.company.config) } : null, apps };
}

function readCache() {
  if (current || typeof window === "undefined") return;
  try { const s = localStorage.getItem(LS_KEY); if (s) current = clean(JSON.parse(s)); } catch { /* ไม่มี/เสีย = ข้าม */ }
}

export function refreshActiveThemes(): Promise<void> {
  loading = (async () => {
    try {
      const r = await apiFetch("/api/themes/active");
      if (!r.ok) return;
      const j = await r.json();
      current = clean(j) ?? { company: null, apps: {} };
      loadedAt = Date.now();
      try { localStorage.setItem(LS_KEY, JSON.stringify(j)); } catch { /* เต็ม/ปิด = ข้าม */ }
      emit();
    } catch { /* ออฟไลน์ = ใช้ค่าเดิม */ } finally { loading = null; }
  })();
  return loading;
}

function subscribe(fn: () => void) {
  subs.add(fn);
  readCache();
  if (!loading && Date.now() - loadedAt > 5 * 60_000) void refreshActiveThemes();
  return () => { subs.delete(fn); };
}

export function useActiveThemes(): ActiveThemes | null {
  return useSyncExternalStore(subscribe, () => { readCache(); return current; }, () => null);
}

const fontsLoaded = new Set<string>();
export function ensureThemeFont(key: FontKey) {
  const f = FONT_OPTIONS.find((x) => x.key === key);
  if (!f?.google || fontsLoaded.has(f.google) || typeof document === "undefined") return;
  fontsLoaded.add(f.google);
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(l);
}
