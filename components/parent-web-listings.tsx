"use client";

/**
 * ParentWebListings — ส่วน "🛍 เว็บไซต์ (ร้านออนไลน์)" ใน Parent SKU drawer/หน้าเต็ม
 * โชว์ว่ารุ่นนี้ขึ้นเว็บร้านไหนบ้าง (Pixiedustie/Louis ฯลฯ) สถานะ ราคาเว็บ ชื่อเว็บ ยอดขาย
 * อ่านอย่างเดียว — จัดการ (ราคา/รูป/ชื่อเว็บ) ทำที่หลังบ้านร้าน (ลิงก์ให้)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type WebListing = {
  shopName: string;
  slug: string;
  isDefault: boolean;
  published: boolean;
  featured: boolean;
  webPrice: number | null;
  webName: string | null;
  webImagesCount: number;
  soldQty: number;
  updatedAt: string | null;
  productUrl: string;
};

type Resp = { code: string; adminUrl: string; listings: WebListing[] };

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export function ParentWebListings({ parentId }: { parentId: string | null }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!parentId) return;
    let alive = true;
    setLoading(true);
    apiFetch(`/api/parent-web-listings?parentId=${encodeURIComponent(parentId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setData(j?.listings ? (j as Resp) : null);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [parentId]);

  if (!parentId) return null; // ยังไม่บันทึกรุ่น → ยังไม่มีข้อมูลเว็บ

  return (
    <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
        <div className="text-sm font-medium text-slate-700">🛍 เว็บไซต์ (ร้านออนไลน์)</div>
        {data && (
          <a
            href={data.adminUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            จัดการที่หลังบ้านร้าน ↗
          </a>
        )}
      </div>

      {loading ? (
        <div className="px-3 py-4 text-sm text-slate-400">กำลังโหลด…</div>
      ) : !data || data.listings.length === 0 ? (
        <div className="px-3 py-4 text-sm text-slate-400">
          ยังไม่ขึ้นร้านออนไลน์ — เพิ่มได้ที่หลังบ้านร้าน (ปุ่มขวาบน)
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {data.listings.map((l) => (
            <div key={l.slug} className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-800 font-medium">{l.shopName}</span>
                  {l.published ? (
                    <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                      ขึ้นร้านอยู่
                    </span>
                  ) : (
                    <span className="text-[11px] bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
                      ปิดอยู่
                    </span>
                  )}
                  {l.featured && <span className="text-[11px] text-amber-500">★ แนะนำ</span>}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>ราคาเว็บ: {l.webPrice != null ? baht(l.webPrice) : "ตามราคาปกติ"}</span>
                  {l.webName && <span className="truncate max-w-[220px]">· ชื่อเว็บ: {l.webName}</span>}
                  {l.webImagesCount > 0 && <span>· รูปเว็บ {l.webImagesCount} รูป</span>}
                  <span>· ขายแล้ว {l.soldQty} ชิ้น</span>
                </div>
              </div>
              {l.published && (
                <a
                  href={l.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  ดูหน้าเว็บ ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
