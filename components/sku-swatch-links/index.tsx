"use client";

/**
 * SkuSwatchLinks — ของกลาง: แถบ "🎨 อยู่บนแผ่น Swatch" ในหน้า SKU
 *
 * เปิดหน้า SKU แล้วเห็นว่าชิ้นนี้อยู่บนแผ่นตัวอย่างแผ่นไหน ตรงไหนของแผ่น (มีจุดบอกตำแหน่งบนรูปย่อ)
 * กด = เปิดแผ่นนั้นในแท็บใหม่ พร้อมจุดกะพริบบอกตำแหน่งชิ้น — เป็นลิงก์ย้อนกลับของแท็บ 🎨 Swatch
 *
 * ไม่ได้อยู่บนแผ่นไหนเลย = ไม่โชว์อะไร (ไม่รกหน้า SKU ทั่วไป)
 *
 * ใช้ที่: MasterRecordDrawer (moduleKey=skus-v2) และหน้า /master/skus — แท็บ "ความสัมพันธ์"
 * ของกลางที่ใช้: apiFetch · r2ImageUrl
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { SkuSwatchLink } from "@/app/api/sku-swatches/route";

/** ลิงก์ตรงไปแผ่น Swatch (หน้า SKU → แท็บ Swatch → เปิดแผ่น + ชี้จุด) */
export function swatchHref(swatchId: string, spotId?: string | null): string {
  return `/master/skus?swatch=${encodeURIComponent(swatchId)}${spotId ? `&spot=${encodeURIComponent(spotId)}` : ""}`;
}

export function SkuSwatchLinks({ skuId }: { skuId: string }) {
  const [rows, setRows] = useState<SkuSwatchLink[]>([]);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/sku-swatches?sku_id=${encodeURIComponent(skuId)}`).then((r) => r.json())
      .then((j) => { if (alive) setRows(Array.isArray(j.data) ? (j.data as SkuSwatchLink[]) : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [skuId]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-pink-100 bg-pink-50/40 p-2.5">
      <p className="text-[12.5px] font-medium text-slate-700 mb-2">🎨 อยู่บนแผ่น Swatch <span className="font-normal text-slate-400">({rows.length} ตำแหน่ง)</span></p>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <a key={r.spot_id} href={swatchHref(r.swatch_id, r.spot_id)} target="_blank" rel="noopener noreferrer"
            title="เปิดแผ่นนี้ (แท็บใหม่) — มีจุดกะพริบบอกตำแหน่งชิ้น"
            className="group flex items-center gap-2 pr-3 rounded-lg border border-slate-200 bg-white hover:border-pink-300 hover:shadow-sm overflow-hidden max-w-full">
            <span className="relative block w-16 h-16 shrink-0 bg-slate-100 overflow-hidden">
              {r.image_key
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r2ImageUrl(r.image_key, 160) ?? ""} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-fill" />
                : <span className="absolute inset-0 flex items-center justify-center text-slate-300">🎨</span>}
              {/* จุดบอกตำแหน่งชิ้นบนแผ่น (รูปย่อยืดเต็มกรอบ → ใช้ % เดียวกับรูปจริงได้) */}
              <span className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-pink-500 ring-2 ring-white shadow"
                style={{ left: `${r.x + r.w / 2}%`, top: `${r.y + r.h / 2}%` }} />
            </span>
            <span className="min-w-0 py-1">
              <span className="block text-[12.5px] text-slate-800 truncate group-hover:text-pink-700">{r.swatch_name}</span>
              <span className="block text-[11px] text-slate-400 truncate">{r.label ? `ตำแหน่ง ${r.label} · ` : ""}เปิดแผ่น ↗</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
