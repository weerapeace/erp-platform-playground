"use client";
/**
 * ปุ่ม "ดูหน้าร้าน" + "หลังร้าน (Seller Center)" ของสินค้า 1 รายการบนร้าน — ใช้ได้ทุกแพลตฟอร์ม
 *
 *   <ListingLinks platformCode="lazada" externalProductId="16196625125" shopRef={detail.shop_ref} />
 *
 * ลิงก์มาจากของกลาง lib/platform-links (listingLinks) — แก้รูปแบบลิงก์ที่นั่นที่เดียว
 * หลังร้านที่ไม่มีลิงก์เข้าสินค้าตรง (LINE / TikTok) → เปิดหน้าแรกหลังร้าน + ปุ่มคัดลอกรหัสไว้ค้น
 * สร้างลิงก์หน้าร้านไม่ได้ (เช่น ยังไม่ตั้งลิงก์ร้าน LINE / Shop ID Shopee) → ป้ายบอกว่าต้องไปตั้งอะไร
 * ของกลางที่ใช้: Icon · CopyButton
 */
import { Icon } from "@/components/icon";
import { CopyButton } from "@/components/copy-button";
import { listingLinks } from "@/lib/platform-links";

const BTN = "inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50 hover:text-violet-700";

export function ListingLinks({ platformCode, externalProductId, shopRef, className = "" }: {
  platformCode: string;
  externalProductId: string | null | undefined;
  /** platform_accounts.external_shop_id ของแบรนด์ (ลิงก์ร้าน / @handle / Shop ID) */
  shopRef?: string | null;
  className?: string;
}) {
  const l = listingLinks(platformCode, externalProductId, shopRef);
  if (!l.storefront && !l.sellerCenter && !l.storefrontHint) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {l.storefront
        ? <a href={l.storefront} target="_blank" rel="noopener noreferrer" className={BTN} title={`เปิดหน้าสินค้าที่ลูกค้าเห็น — ${l.storefront}`}><Icon name="open" />ดูหน้าร้าน</a>
        : l.storefrontHint && <span className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-50 px-2 text-[11px] text-amber-700" title={l.storefrontHint}><Icon name="info" />ดูหน้าร้านไม่ได้ — {l.storefrontHint}</span>}
      {l.sellerCenter && (
        <a href={l.sellerCenter} target="_blank" rel="noopener noreferrer" className={BTN}
          title={l.sellerExact ? `เปิดหน้าแก้สินค้านี้ใน ${l.sellerLabel}` : `${l.sellerLabel} ไม่มีลิงก์เข้าสินค้าตรง — เปิดหน้าแรก แล้วค้นรหัส #${externalProductId ?? ""}`}>
          <Icon name="open" />{l.sellerLabel}{l.sellerExact ? "" : " (ค้นรหัสเอง)"}
        </a>
      )}
      {l.sellerCenter && !l.sellerExact && externalProductId && <CopyButton value={String(externalProductId)} label={`คัดลอกรหัส #${externalProductId}`} title="คัดลอกรหัสสินค้าไว้ค้นในหลังร้าน" />}
    </div>
  );
}
