"use client";

/**
 * ส่งเป็นของขวัญ — กล่องในลิ้นชักสินค้าบนร้าน (แท็บข้อมูล) · แสดงค่าบน LINE อย่างเดียว
 * ทดสอบแล้ว 2026-11-10 (LMTS05 · audit line_listing_gift): LINE ไม่รับการตั้งของขวัญผ่าน API
 *   (ตอบ 200 แต่ค่าไม่เปลี่ยน ทั้ง 3 รูปแบบ) → ไม่มีปุ่มส่ง · บอกให้ไปตั้งใน LINE Seller Center
 *   (endpoint /api/line-shopping/listing-gift + lib/line-gift-server เก็บไว้ทดสอบซ้ำ ถ้า LINE เพิ่ม API ภายหลัง)
 */
import { LineGiftPicker } from "@/components/platform-listing/line-gift-picker";
import type { GiftSetting } from "@/lib/line-gift";

export function LineGiftSection({ current }: {
  /** ค่าบน LINE ตอนนี้ (จากข้อมูลที่ดึงมา) */
  current: GiftSetting;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="mb-1.5 text-xs text-slate-500">ส่งเป็นของขวัญ (ค่าบน LINE ตอนนี้)</div>
      <LineGiftPicker value={current} onChange={() => {}} disabled />
      <p className="mt-1.5 text-[11px] text-amber-700">LINE ไม่ให้ตั้งของขวัญผ่านระบบ (ทดสอบแล้ว) — ตั้งใน LINE Seller Center แล้วกด “ดึงสินค้าจาก LINE” เพื่ออัปเดตตรงนี้</p>
    </div>
  );
}
