"use client";

/**
 * 🔁 โหมดทำงานสินค้าในงาน Creative (ต่อประเภทงาน) — ของกลางของหน้า /tasks
 *   legacy = โหมดเดิม: อัปรูปในงาน → เลือกตัวแทน → อนุมัติแล้วระบบค่อยส่งเข้าสินค้า
 *   direct = โหมดใหม่: กด "แก้ที่สินค้า" ในงาน → แก้ SKU/Parent ตัวจริงเลย · ระบบเก็บเวอร์ชันเก่า + สรุปสิ่งที่แก้ให้ผู้ตรวจ
 * ตั้งค่าที่ /tasks/settings แท็บ "ส่งงาน" (เก็บ ui_config key tasks_product_edit_mode)
 * ใช้โหมดใหม่เฉพาะงานที่ "สร้างหลังเปิดโหมด" (since) — งานเก่าที่ทำค้างใช้วิธีเดิมจนจบ
 * งานย่อยที่เคยเริ่มแบบใหม่แล้ว (config.edit_mode = "direct") อยู่แบบใหม่ตลอด แม้ปิดโหมดทีหลัง
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export const PRODUCT_MODE_KEY = "tasks_product_edit_mode";
export type ProductEditMode = "legacy" | "direct";
export type ProductModeCfg = { types: Record<string, { mode: ProductEditMode; since: string | null }> };

/** ชนิดงานย่อยที่ "แก้ที่สินค้า" ได้ (ปลายทาง = รูปสินค้า / รูป Description / ข้อความคำอธิบาย) */
export const DIRECT_TARGETS = new Set(["sku_media", "description_media", "sku_description"]);

let cache: Promise<ProductModeCfg> | null = null;

export function loadProductModeCfg(force = false): Promise<ProductModeCfg> {
  if (!cache || force) {
    cache = apiFetch(`/api/ui-config?key=${PRODUCT_MODE_KEY}`)
      .then((r) => r.json())
      .then((j) => ({ types: ((j?.value?.types ?? {}) as ProductModeCfg["types"]) }))
      .catch(() => ({ types: {} }));
  }
  return cache;
}

export async function saveProductModeCfg(cfg: ProductModeCfg): Promise<void> {
  const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: PRODUCT_MODE_KEY, value: cfg }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
  cache = Promise.resolve(cfg);
}

export function useProductModeCfg(): ProductModeCfg | null {
  const [cfg, setCfg] = useState<ProductModeCfg | null>(null);
  useEffect(() => { let live = true; loadProductModeCfg().then((c) => { if (live) setCfg(c); }); return () => { live = false; }; }, []);
  return cfg;
}

/** งานนี้ใช้โหมดใหม่ไหม (ตามประเภทงาน + สร้างหลังวันที่เปิดโหมด) */
export function isDirectTask(cfg: ProductModeCfg | null, taskType: string | null | undefined, createdAt: string | null | undefined): boolean {
  if (!cfg || !taskType) return false;
  const m = cfg.types[taskType];
  if (m?.mode !== "direct") return false;
  return !m.since || !createdAt || createdAt >= m.since;
}
