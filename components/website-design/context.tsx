"use client";

/**
 * ตัวกลางหน้าดีไซน์ (DesignCtx) — เชลล์ components/website-theme-panel.tsx ถือธีม/ร่าง/พรีวิว
 * แล้วส่งให้แท็บย่อยในโฟลเดอร์นี้ผ่าน useDesign() (แท็บไม่ต้องรับ props ยาว ๆ)
 */
import { createContext, useContext, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useToast } from "@/components/toast";
import type { MegaEditorCtx } from "@/components/website-mega-menu-editor";
import type { useThemeSchedules } from "@/components/website-theme-schedule";
import type { FooterConfig, MenuConfig, Shape } from "@/lib/website-theme";
import type { Choices, ColorKey, SampleItem, Theme } from "./shared";

type Schedules = ReturnType<typeof useThemeSchedules>;

export interface DesignCtxValue {
  shopSlug: string;
  shopId: string;
  /** ธีมที่กำลังแก้ (ร่างบนจอ) */
  theme: Theme;
  /** ธีมที่เผยแพร่อยู่ — ใช้กับปุ่ม ↺ คืนค่า */
  published: Theme;
  choices: Choices;
  /** โหลดรายการฟิลด์รูปใหม่หลังสร้างฟิลด์ (แท็บหน้าสินค้า) */
  setChoices: Dispatch<SetStateAction<Choices | null>>;
  /** เปลี่ยนธีมทั้งก้อน (เก็บประวัติ ↶ ให้) */
  apply: (next: Theme) => void;
  toast: ReturnType<typeof useToast>;
  setColor: (k: ColorKey, v: string) => void;
  setLogo: (p: Partial<Theme["logo"]>) => void;
  setHeader: (p: Partial<Theme["header"]>) => void;
  setMenu: (p: Partial<MenuConfig>) => void;
  setFooter: (p: Partial<FooterConfig>) => void;
  setCard: (p: Partial<Theme["card"]>) => void;
  setShape: (p: Partial<Shape>) => void;
  setProduct: (p: Partial<Theme["product"]>) => void;
  /** หน้าที่พรีวิวเปิดอยู่ (path) */
  page: string;
  setPage: Dispatch<SetStateAction<string>>;
  setDevice: Dispatch<SetStateAction<"desktop" | "tablet" | "mobile">>;
  /** slug สินค้าตัวแรกของร้าน (พรีวิวหน้าสินค้า) */
  sampleProduct: string | null;
  sampleItems: SampleItem[];
  storePages: { slug: string; title: string; help?: string; status?: string }[];
  iframeRef: RefObject<HTMLIFrameElement | null>;
  linkCtx: { shopSlug: string; shopId: string; categories: { key: string; label: string }[] };
  megaCtx: MegaEditorCtx;
  schedules: Schedules["list"];
  reloadSchedules: Schedules["reload"];
  setScheduleOpen: Dispatch<SetStateAction<boolean>>;
  campPreview: { id: string; name: string; theme: unknown } | null;
  setCampPreview: Dispatch<SetStateAction<{ id: string; name: string; theme: unknown } | null>>;
  versions: { versionNo: number; createdAt: string; theme: Theme }[];
  restore: (versionNo: number) => Promise<void>;
  /** 🖥/📱 หน้าสินค้ากำลังตั้งค่าให้จอไหน (จำข้ามแท็บ) */
  editDevice: "pc" | "mobile";
  setEditDevice: Dispatch<SetStateAction<"pc" | "mobile">>;
}

export const DesignCtx = createContext<DesignCtxValue | null>(null);

export function useDesign(): DesignCtxValue {
  const v = useContext(DesignCtx);
  if (!v) throw new Error("useDesign ต้องใช้ภายใน WebsiteThemePanel");
  return v;
}
