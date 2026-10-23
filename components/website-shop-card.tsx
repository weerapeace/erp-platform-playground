"use client";

/**
 * 🏪 การ์ดเว็บร้าน (หน้ารวม /website) — หัวการ์ด = ภาพย่อเว็บจริงแบบสด + โลโก้ร้าน
 *   เจ้าของขอ 2026-10-23 "โชว์เป็น Preview ร้าน + ใส่ Logo ให้เลยจะได้สวย ๆ"
 *   ภาพย่อ = ของกลาง SiteThumb (หน้าแรกเว็บจริง · มีรหัสพรีวิว = ร้านปิดเว็บก็เห็น) · รอโหลด/ไม่มีโดเมน = สีแบรนด์ + โลโก้กลางกรอบ
 *   โลโก้ = ธีมของร้าน (โหมดรูป = รูป · อื่น ๆ = ตัวอักษรในกล่องสีแบรนด์ + ข้อความ แบบหัวเว็บ)
 * ข้อมูล: /api/website/shops
 */
import Link from "next/link";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { SiteThumb } from "@/components/website-site-thumb";

export type WebsiteShopCardData = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  status: string;
  total: number;
  published: number;
  domain: string | null;
  /** เว็บจริง (https://…) + รหัสพรีวิว — ไม่มีโดเมน = null */
  siteUrl?: string | null;
  previewKey?: string | null;
  logo?: { mode: string; imageUrl: string | null; mark: string; text: string };
  colors?: { brand: string; brandDeep: string; ink: string };
};

/** สีหัวการ์ดสำรอง (ร้านที่ยังไม่มีธีม · ไล่ตามลำดับ) */
const ACCENTS = [
  "linear-gradient(135deg,#f97316,#c2410c)",
  "linear-gradient(135deg,#ec4899,#9d174d)",
  "linear-gradient(135deg,#0f172a,#334155)",
  "linear-gradient(135deg,#0ea5e9,#0369a1)",
];

/** โลโก้ร้าน — big = กลางกรอบตอนรอโหลด · เล็ก = ป้ายข้างชื่อร้าน */
export function ShopLogo({ s, big }: { s: WebsiteShopCardData; big?: boolean }) {
  const lg = s.logo;
  if (lg?.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={lg.imageUrl} alt={s.name} className={`${big ? "max-h-12 max-w-[180px]" : "max-h-6 max-w-[110px]"} w-auto object-contain`} />;
  }
  const mark = (lg?.mark || s.name.slice(0, 2)).slice(0, 3);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${big ? "h-10 min-w-10 text-base" : "h-6 min-w-6 text-[11px]"} inline-flex items-center justify-center rounded-md px-1 font-bold text-white`}
        style={{ background: s.colors?.brand ?? "#0f172a" }}
      >
        {mark}
      </span>
      {lg?.text && <span className={`${big ? "text-base" : "text-xs"} font-semibold text-slate-800`}>{lg.text}</span>}
    </span>
  );
}

export function WebsiteShopCard({ s, index }: { s: WebsiteShopCardData; index: number }) {
  return (
    <Link
      href={`/website/${encodeURIComponent(s.slug)}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-400 hover:shadow-md"
    >
      {/* หัวการ์ด = หน้าต่างเบราว์เซอร์จิ๋ว (ภาพย่อเว็บจริง) */}
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        <div className="absolute inset-x-0 top-0 z-[2] flex h-5 items-center gap-1 border-b border-slate-200 bg-white/95 px-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          <span className="ml-1.5 truncate text-[9px] text-slate-400">{s.domain ?? "ยังไม่ผูกโดเมน"}</span>
        </div>
        <div
          className="absolute inset-x-0 bottom-0 top-5 flex items-center justify-center pb-8"
          style={{ background: s.colors ? `linear-gradient(135deg,${s.colors.brand},${s.colors.brandDeep})` : ACCENTS[index % ACCENTS.length] }}
        >
          <span className="rounded-xl bg-white px-4 py-3 shadow-sm">
            <ShopLogo s={s} big />
          </span>
        </div>
        {s.siteUrl && (
          <div className="absolute inset-x-0 bottom-0 top-5 z-[1] transition-transform duration-500 group-hover:scale-[1.02]">
            <SiteThumb url={withPreviewKey(`${s.siteUrl}/`, s.previewKey)} title={`ตัวอย่างเว็บ ${s.name}`} />
          </div>
        )}
        {/* แถบล่าง: โลโก้ + ชื่อร้าน + ป้าย */}
        <div className="absolute inset-x-0 bottom-0 z-[2] flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-10">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 shrink-0 items-center rounded-lg bg-white px-2 shadow-sm">
              <ShopLogo s={s} />
            </span>
            <span className="truncate text-base font-semibold text-white drop-shadow">{s.name}</span>
          </span>
          <span className="flex shrink-0 gap-1">
            {s.status !== "active" && <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] text-amber-950">ปิดอยู่</span>}
            {s.isDefault && <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">ร้านหลัก</span>}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <p className="text-lg font-semibold leading-none text-slate-900">{s.total}</p>
            <p className="mt-1 text-[11px] text-slate-500">สินค้าบนเว็บ</p>
          </div>
          <div>
            <p className="text-lg font-semibold leading-none text-emerald-600">{s.published}</p>
            <p className="mt-1 text-[11px] text-slate-500">เผยแพร่แล้ว</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="truncate text-xs text-slate-400">{s.slug}</span>
          <span className="text-xs text-blue-600 group-hover:underline">จัดการ →</span>
        </div>
      </div>
    </Link>
  );
}
