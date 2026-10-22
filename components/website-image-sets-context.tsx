"use client";

/**
 * 🖼 ชุดรูปกลาง — รายชื่อชุดของร้านให้ช่องรูปกลาง (ImageUploadField) โชว์ปุ่ม "🔗 ชุดรูป" และรูปของชุดที่ผูกไว้
 * ครอบที่หน้าเว็บไซต์ของร้าน (app/website/[shop]) — นอกหน้านี้ไม่มี context = ช่องรูปเหมือนเดิม (ไม่มีปุ่มชุดรูป)
 * แผงชุดรูปแก้แล้วเรียก notifyImageSetsChanged() → ทุกช่องรูปโหลดรายชื่อใหม่
 */
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export interface ImageSetLite {
  id: string;
  name: string;
  /** รูปปัจจุบัน (คอม / มือถือ) — ไว้โชว์รูปย่อในช่องที่ผูก */
  desk: string | null;
  mob: string | null;
}
export interface ImageSetsCtx {
  shopSlug: string;
  sets: ImageSetLite[];
  loaded: boolean;
  reload: () => void;
}

export const ImageSetsContext = createContext<ImageSetsCtx | null>(null);

const EVT = "website-image-sets-changed";
/** แผงชุดรูปบันทึกแล้ว → ให้ช่องรูปทุกช่องโหลดรายชื่อใหม่ */
export const notifyImageSetsChanged = () => window.dispatchEvent(new Event(EVT));

export function ImageSetsProvider({ shopSlug, children }: { shopSlug: string; children: ReactNode }) {
  const [sets, setSets] = useState<ImageSetLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    if (!shopSlug) return;
    apiFetch(`/api/website/image-sets?shop=${encodeURIComponent(shopSlug)}&lite=1`)
      .then((r) => r.json())
      .then((j: { sets?: { id: string; name: string; cur?: { desk?: string | null; mob?: string | null } }[] }) => {
        setSets((j.sets ?? []).map((s) => ({ id: s.id, name: s.name, desk: s.cur?.desk ?? null, mob: s.cur?.mob ?? null })));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [shopSlug]);
  useEffect(() => {
    reload();
    window.addEventListener(EVT, reload);
    return () => window.removeEventListener(EVT, reload);
  }, [reload]);
  return <ImageSetsContext.Provider value={{ shopSlug, sets, loaded, reload }}>{children}</ImageSetsContext.Provider>;
}
