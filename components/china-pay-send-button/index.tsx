"use client";
/**
 * 💴 ปุ่ม "ส่งไปโอนเงินจีน" — จากใบสำคัญรับ (ใบสกุลหยวน) ไปหน้า "ลงบิล" ของแอปโอนเงินจีนที่เติมให้ครบ
 *   ร้าน · ยอด ¥ (บิลร้านที่ AI อ่าน หรือยอดสินค้าในใบ) · ใบสั่งซื้อที่อยู่ในใบ · รูปบิลร้าน (ไฟล์ R2)
 *   → แอปเปิด /app/china-pay?from_voucher=<id> · ข้อมูลจาก /api/china-pay/voucher-prefill · คนตรวจแล้วกดบันทึกเอง (ไม่บันทึกอัตโนมัติ)
 * โชว์เฉพาะ: ใบสกุลหยวน + คนที่มีสิทธิ์ใช้แอปโอนเงินจีน (app.china_pay) · ใบยกเลิกไม่โชว์
 * ★ ใบสำคัญที่ "ออกจากบิลโอนเงินจีน" (purchase_vouchers_v2.china_bill_id) → ไม่ให้ส่งซ้ำ โชว์ลิงก์เปิดบิลเดิมแทน (กันลงบิลซ้ำ = จ่ายซ้ำ)
 * ใช้ที่: app/purchasing/vouchers/[id] (การ์ดขวาตอนร่าง + การ์ดงานถัดไป)
 */
import { usePermission } from "@/components/auth";
import { isRmbCurrency } from "@/lib/china-bill-po";

export function SendToChinaPayButton({ voucherId, currency, status, chinaBillId, variant = "card" }: {
  voucherId: string; currency: string | null | undefined; status?: string | null;
  /** ใบนี้ออกจากบิลโอนเงินจีนใบไหน (มี = ไม่ต้องส่งซ้ำ) */
  chinaBillId?: string | null;
  variant?: "card" | "inline";
}) {
  const can = usePermission("app.china_pay");
  if (!can || !isRmbCurrency(currency) || status === "cancelled") return null;
  if (chinaBillId) {
    const billHref = `/app/china-pay?bill=${encodeURIComponent(chinaBillId)}`;
    const link = (
      <a href={billHref} target="_blank" rel="noopener noreferrer"
        className="h-9 w-full rounded-md border border-orange-300 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 inline-flex items-center justify-center">
        💴 เปิดบิลโอนเงินจีนของใบนี้ →
      </a>
    );
    if (variant === "inline") return link;
    return (
      <div className="bg-white border border-orange-200 rounded-xl p-4">
        <div className="text-sm font-semibold text-slate-700">💴 จ่ายร้านจีน</div>
        <div className="text-[11px] text-slate-400 mt-0.5 mb-2">ใบนี้ออกจากบิลโอนเงินจีนแล้ว — ไม่ต้องลงบิลซ้ำ · ใบสั่งซื้อเป็น “จ่ายแล้ว” เองเมื่อบิลนั้นโอนเข้าจีนครบ</div>
        {link}
      </div>
    );
  }
  const href = `/app/china-pay?from_voucher=${encodeURIComponent(voucherId)}`;
  if (variant === "inline") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="h-9 w-full rounded-md bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 inline-flex items-center justify-center">
        💴 ส่งไปโอนเงินจีน →
      </a>
    );
  }
  return (
    <div className="bg-white border border-orange-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-slate-700">💴 จ่ายร้านจีน</div>
      <div className="text-[11px] text-slate-400 mt-0.5 mb-2">เปิดหน้าลงบิลในแอปโอนเงินจีน เติมร้าน ยอด ¥ ใบสั่งซื้อ และรูปบิลร้านให้ — ตรวจแล้วกดบันทึกบิลเอง · ใบสั่งซื้อจะขึ้น “ลงบิลแล้ว รอโอน” และเป็น “จ่ายแล้ว” เองเมื่อโอนเข้าจีนครบ</div>
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="h-9 w-full rounded-md bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 inline-flex items-center justify-center">
        ส่งไปโอนเงินจีน →
      </a>
    </div>
  );
}

export default SendToChinaPayButton;
