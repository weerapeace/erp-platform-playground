"use client";
// สีแบรนด์ (brands.color) เป็นปุ่มสีลัดในตัวเลือกสีกลาง — <ColorInput swatches={useBrandSwatches()} />
// โหลดครั้งเดียวต่อหน้า (จำในหน่วยความจำ) · ไม่มีสิทธิ์/โหลดไม่ได้ = ไม่มีปุ่มสีแบรนด์ (ตัวเลือกสียังใช้ได้)
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ColorSwatch } from "@/components/color-picker";

let cache: Promise<ColorSwatch[]> | null = null;
function loadBrandSwatches(): Promise<ColorSwatch[]> {
  cache ??= apiFetch("/api/brands").then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j: { data?: { name?: string; color?: string | null }[] }) =>
      (j.data ?? []).filter((b) => b.color && /^#[0-9a-f]{3,8}$/i.test(b.color)).map((b) => ({ color: String(b.color), label: String(b.name ?? "") })))
    .catch(() => { cache = null; return []; });
  return cache;
}

export function useBrandSwatches(enabled = true): ColorSwatch[] {
  const [list, setList] = useState<ColorSwatch[]>([]);
  useEffect(() => { if (enabled) void loadBrandSwatches().then(setList); }, [enabled]);
  return list;
}
