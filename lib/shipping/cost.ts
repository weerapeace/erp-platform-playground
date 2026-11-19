/**
 * 💸 บันทึกค่าส่งจริงลงศูนย์ค่าใช้จ่าย (/admin/paid-services · key "shippop.shipping") — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * จองโหมดจริงเท่านั้น (จำลอง = ไม่บันทึก) · ระบบทดลอง (sandbox) บันทึกเป็น ฿0 ไว้ดูว่าระบบทำงาน
 * ใช้ที่: app/api/platform-orders/ship · app/api/website/orders/shippop
 */
import { logServiceUse } from "@/lib/paid-services-server";
import { normalizeCourier } from "@/lib/shippop";

export function shippingCostThb(price: number, sandbox: boolean): number {
  return sandbox ? 0 : Math.max(0, Math.round((Number(price) || 0) * 100) / 100);
}

export async function logShippingCost(args: { mode: "sim" | "live"; sandbox: boolean; courier: string; price: number; ok: boolean; error?: string; userId?: string | null }): Promise<void> {
  if (args.mode !== "live") return;
  await logServiceUse("shippop.shipping", {
    model: `${normalizeCourier(args.courier)}${args.sandbox ? " (ทดลอง)" : ""}`,
    costThb: args.ok ? shippingCostThb(args.price, args.sandbox) : 0,
    ok: args.ok, error: args.error ?? null, userId: args.userId ?? null,
  });
}
