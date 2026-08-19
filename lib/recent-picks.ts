"use client";

/**
 * Recent Picks (ของกลาง) — "เคยใช้ล่าสุด" + "ปักหมุด (รายการโปรด)" ของทุก Picker/Dropdown
 *
 * ปัญหาเดิม: แต่ละ picker เขียนโค้ดจำ "ของที่เพิ่งเลือก" เองคนละชุด (pickers/index, pickers/master)
 * และ dropdown บางตัว (เช่น ช่องเลือกร้านในหน้าสั่งซื้อ) ไม่มีเลย → ต้องเลื่อนหาร้านเดิมซ้ำ ๆ ทุกครั้ง
 *
 * ที่นี่คือที่เดียวที่เก็บ/อ่านรายการเหล่านี้ (เก็บในเครื่องผู้ใช้ = localStorage)
 *   - loadRecent / pushRecent   → เคยใช้ล่าสุด (เก็บ 6 ล่าสุด)
 *   - loadFav / toggleFav       → ปักหมุดไว้บนสุด (เก็บ 12)
 *   - useRecentPicks(key, open) → hook พร้อมใช้: คืน recent/favs + ฟังก์ชัน remember/toggle
 *
 * CLAUDE.md §21 (Picker ต้องมี recently used / favorite)
 *
 * วิธีใช้ใน picker ใหม่:
 *   const { recent, remember } = useRecentPicks<MyItem>(RECENT_KEYS.suppliers, open);
 *   // ตอนเลือก: remember({ id, name })
 *   // ตอนไม่มีคำค้น: โชว์ recent ไว้บนสุดพร้อมหัวข้อ "⏱ เคยใช้ล่าสุด"
 */

import { useCallback, useEffect, useState } from "react";

export const RECENT_LIMIT = 6;
export const FAV_LIMIT = 12;

/** ทะเบียน key กลาง — ใช้ key เดียวกัน = picker คนละตัวที่เลือก "ของชนิดเดียวกัน" แชร์ประวัติกันได้ */
export const RECENT_KEYS = {
  products:   "erp-recent-products",
  suppliers:  "erp-recent-suppliers",
  skus:       "erp-recent-skus",
  parentSkus: "erp-recent-parent-skus",
  materials:  "erp-recent-materials",
} as const;

type WithId = { id: string };

// ---- เคยใช้ล่าสุด ----

export function loadRecent<V>(key: string): V[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? (raw as V[]) : [];
  } catch { return []; }
}

/** จำของที่เพิ่งเลือก (ตัวล่าสุดอยู่บนสุด · ไม่ซ้ำ · เก็บได้ RECENT_LIMIT) — คืน list ใหม่ */
export function pushRecent<V extends WithId>(key: string, v: V, limit = RECENT_LIMIT): V[] {
  if (!v?.id) return loadRecent<V>(key);
  try {
    const next = [v, ...loadRecent<V>(key).filter((x) => x?.id !== v.id)].slice(0, limit);
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch { return loadRecent<V>(key); }
}

/** เอาออกจากประวัติ (เช่น ของถูกลบไปแล้ว) */
export function removeRecent<V extends WithId>(key: string, id: string): V[] {
  try {
    const next = loadRecent<V>(key).filter((x) => x?.id !== id);
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch { return loadRecent<V>(key); }
}

export function clearRecent(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ---- ปักหมุด (รายการโปรด) ----

export const favKey = (key: string) => `${key}-fav`;

export function loadFav<V>(key: string): V[] {
  try {
    const raw = JSON.parse(localStorage.getItem(favKey(key)) ?? "[]");
    return Array.isArray(raw) ? (raw as V[]) : [];
  } catch { return []; }
}

export function isFav(key: string, id: string): boolean {
  return loadFav<WithId>(key).some((x) => x?.id === id);
}

/** ปักหมุด/เอาหมุดออก — คืน list ใหม่ */
export function toggleFav<V extends WithId>(key: string, v: V, limit = FAV_LIMIT): V[] {
  try {
    const list = loadFav<V>(key);
    const next = list.some((x) => x?.id === v.id)
      ? list.filter((x) => x?.id !== v.id)
      : [v, ...list].slice(0, limit);
    localStorage.setItem(favKey(key), JSON.stringify(next));
    return next;
  } catch { return loadFav<V>(key); }
}

// ---- hook พร้อมใช้ ----

/**
 * @param key  key จาก RECENT_KEYS (หรือ key ของ picker นั้น ๆ)
 * @param open dropdown เปิดอยู่ไหม — เปิดทีไรอ่านค่าล่าสุดใหม่ (กันค้างค่าเก่าเมื่อเลือกจาก picker อื่น)
 */
export function useRecentPicks<V extends WithId>(key: string, open = true) {
  const [recent, setRecent] = useState<V[]>([]);
  const [favs, setFavs] = useState<V[]>([]);

  useEffect(() => {
    if (!open) return;
    setRecent(loadRecent<V>(key));
    setFavs(loadFav<V>(key));
  }, [key, open]);

  const remember = useCallback((v: V) => { setRecent(pushRecent(key, v)); }, [key]);
  const toggle = useCallback((v: V) => { setFavs(toggleFav(key, v)); }, [key]);
  const forget = useCallback((id: string) => { setRecent(removeRecent<V>(key, id)); }, [key]);

  return { recent, favs, remember, toggle, forget };
}
