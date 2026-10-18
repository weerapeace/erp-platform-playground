"use client";

/**
 * ของกลาง — บอกขนาดจริงของรูป (px) ใต้ช่องรูป + เตือนเมื่อเล็กกว่าที่ควร (รูปจะถูกขยายจนไม่คมบนเว็บ)
 * อ่านขนาดจาก /api/r2-image?meta=1 (ERP อ่านจากไฟล์ต้นฉบับใน R2) · อ่านไม่ได้ = ไม่โชว์อะไร
 * ใช้: <ImageSizeNote imageKey={key} minPx={2400} /> · ฟอร์มตัวจัดหน้าโชว์เองเมื่อ FieldDef.minPx ตั้งไว้
 */
import { useEffect, useState } from "react";

const cache = new Map<string, { width: number; height: number } | null>();

export function ImageSizeNote({ imageKey, minPx, what = "ใช้เต็มจอ" }: { imageKey: string | null; minPx: number; what?: string }) {
  const [dim, setDim] = useState<{ width: number; height: number } | null>(imageKey ? (cache.get(imageKey) ?? null) : null);

  useEffect(() => {
    if (!imageKey) return setDim(null);
    if (cache.has(imageKey)) return setDim(cache.get(imageKey) ?? null);
    let live = true;
    fetch(`/api/r2-image?key=${encodeURIComponent(imageKey)}&meta=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { width?: number; height?: number } | null) => {
        const d = j?.width && j?.height ? { width: j.width, height: j.height } : null;
        cache.set(imageKey, d);
        if (live) setDim(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [imageKey]);

  if (!imageKey || !dim) return null;
  const small = dim.width < minPx;
  return (
    <p className={`mt-1 text-[11px] ${small ? "text-amber-700" : "text-slate-400"}`}>
      {small ? "⚠️ " : ""}รูปนี้ {dim.width.toLocaleString()} × {dim.height.toLocaleString()} px
      {small && ` — เล็กไปสำหรับ${what} (แนะนำกว้าง ${minPx.toLocaleString()}px ขึ้นไป) รูปจะถูกขยายจนไม่คม`}
    </p>
  );
}
