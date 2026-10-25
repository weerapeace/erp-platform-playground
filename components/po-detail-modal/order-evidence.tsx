"use client";

/**
 * แถบ "🧾 หลักฐานคำสั่งซื้อ" ในป๊อปใบสั่งซื้อ — รูปหน้าคำสั่งซื้อ Shopee/Taobao ที่ยืนยันผูกกับใบนี้แล้ว
 * (มาจากกล่องพัก "คำสั่งซื้อจากไลน์" /purchasing/line-orders) · ไม่มี = ไม่โชว์อะไร · ไม่มีสิทธิ์ดู = ไม่โชว์
 */
import { useEffect, useState } from "react";
import { ImageLightbox } from "@/components/image-lightbox";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { PLATFORM_LABEL, curSym, type CaptureRow } from "@/lib/order-capture-shared";

export function PoOrderEvidence({ poId }: { poId: string }) {
  const [rows, setRows] = useState<CaptureRow[]>([]);
  const [lightbox, setLightbox] = useState<{ urls: string[]; i: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/purchasing/line-orders?po_id=${encodeURIComponent(poId)}`);
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Array.isArray(j.rows)) setRows(j.rows as CaptureRow[]);
      } catch { /* ไม่มีแถบนี้ก็ใช้ป๊อปได้ */ }
    })();
    return () => { alive = false; };
  }, [poId]);

  if (rows.length === 0) return null;
  return (
    <div className="border border-slate-200 rounded-lg px-3 py-2">
      <div className="text-[11px] font-medium text-slate-500 mb-1.5">🧾 หลักฐานคำสั่งซื้อ ({rows.length})</div>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => {
          const urls = r.image_keys.map((k) => r2ImageUrl(k) ?? "").filter(Boolean);
          return (
            <div key={r.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-1.5 pr-2.5">
              {r.image_keys[0] && (
                <button type="button" onClick={() => setLightbox({ urls, i: 0 })} title="ดูรูปคำสั่งซื้อ">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r2ImageUrl(r.image_keys[0], 120) ?? undefined} alt="" className="w-10 h-12 object-cover object-top rounded" />
                </button>
              )}
              <div className="text-xs leading-tight">
                <div className="font-medium text-slate-700">{r.platform ? PLATFORM_LABEL[r.platform] : "คำสั่งซื้อ"}{r.order_no ? ` #${r.order_no}` : ""}</div>
                <div className="text-slate-500">
                  {r.total_paid !== null ? `${curSym(r.currency)}${Number(r.total_paid).toLocaleString("th-TH", { maximumFractionDigits: 2 })}` : ""}
                  {r.tracking_no ? ` · พัสดุ ${r.tracking_no}` : ""}
                </div>
                <a href={`/purchasing/line-orders?open=${r.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">เปิดดู ↗</a>
              </div>
            </div>
          );
        })}
      </div>
      {lightbox && (
        <ImageLightbox images={lightbox.urls.map((url) => ({ url }))} index={lightbox.i}
          onClose={() => setLightbox(null)} onIndex={(i) => setLightbox((l) => (l ? { ...l, i } : l))} />
      )}
    </div>
  );
}
