"use client";
/**
 * ชิปลิงก์ร้านแบบย่อ ในการ์ดสินค้าของ drawer โพสต์ Contents (เจ้าของเลือกแบบ A · 2026-11-20)
 *   สีเข้ม = สินค้านี้มีบนร้านนั้น → กด = เปิดหน้าสินค้าบนร้าน · ชี้ = ปุ่มคัดลอกลิงก์ (CopyButton)
 *   สีเทา = ยังไม่ลงร้านนี้
 * ข้อมูล: GET /api/creative-content/shop-links (ของกลาง lib/product-shop-links — ตัวเดียวกับการ์ดสินค้าในห้องแชท)
 * หน้าตาชิป/ไอคอน/สี = ตั้งค่าแพลตฟอร์มกลาง (platformMeta) — ร้านที่ไม่มีในตั้งค่าใช้ชื่อสำรอง
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { Icon } from "@/components/icon";
import { CopyButton } from "@/components/copy-button";
import { r2ImageUrl } from "@/lib/r2-image";
import { platformMeta, platformLabel } from "../use-options";

export type ShopLink = { platform: string; url: string | null; price: number | null };

const FALLBACK: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE", get website() { return tr("เว็บ", "Web"); } };
const isHex = (c?: string | null) => !!c && /^#[0-9a-f]{6}$/i.test(c);

/** โหลดลิงก์ร้านของ Parent SKU (ไม่มี parent = ว่าง) */
export function useShopLinks(parentId: string | null | undefined, brandId: string | null | undefined): ShopLink[] | null {
  const [links, setLinks] = useState<ShopLink[] | null>(null);
  useEffect(() => {
    if (!parentId) { setLinks(null); return; }
    let alive = true;
    setLinks(null);
    apiFetch(`/api/creative-content/shop-links?parent_id=${parentId}${brandId ? `&brand_id=${brandId}` : ""}`)
      .then((r) => r.json()).then((j) => { if (alive) setLinks(Array.isArray(j?.data) ? j.data : []); })
      .catch(() => { if (alive) setLinks([]); });
    return () => { alive = false; };
  }, [parentId, brandId]);
  return links;
}

export function ShopLinkChips({ links, className = "" }: { links: ShopLink[] | null; className?: string }) {
  const t = useT();
  if (!links) return <div className={`h-6 ${className}`} aria-hidden />;
  if (!links.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {links.map((l) => {
        const meta = platformMeta(l.platform);
        const label = platformLabel(l.platform) || FALLBACK[l.platform] || l.platform;
        const color = isHex(meta?.color) ? meta!.color! : "#475569";
        const img = meta?.icon_key ? r2ImageUrl(meta.icon_key, 32) : null;
        if (!l.url) {
          return (
            <span key={l.platform} title={t(`ยังไม่ลง ${label}`, `Not on ${label} yet`)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 text-[11px] text-slate-400">
              {label}
            </span>
          );
        }
        return (
          <span key={l.platform} className="group/link inline-flex items-center">
            <a href={l.url} target="_blank" rel="noreferrer" title={t(`เปิดหน้าสินค้าบน ${label}`, `Open on ${label}`)}
              className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-white hover:opacity-90" style={{ backgroundColor: color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img ? <img src={img} alt="" className="h-3.5 w-3.5 rounded-sm bg-white object-contain" /> : <Icon name="open" size={12} />}
              {label}
            </a>
            <CopyButton value={l.url} title={t(`คัดลอกลิงก์ ${label}`, `Copy ${label} link`)} className="ml-0.5 sm:hidden sm:group-hover/link:inline-flex" />
          </span>
        );
      })}
    </div>
  );
}
