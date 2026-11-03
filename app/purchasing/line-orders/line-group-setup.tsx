"use client";

/**
 * แถบตั้ง "กลุ่มไลน์สำหรับส่งรูปคำสั่งซื้อ" (แอดมินเท่านั้น) — ห่อของกลาง components/line-group-setup
 * ตั้งค่าเก็บที่ line_config.groups.purchase_capture ผ่าน API ศูนย์จัดการ LINE กลาง (/api/admin/line-console)
 */
import { LineGroupSetup as SharedLineGroupSetup } from "@/components/line-group-setup";

export function LineGroupSetup({ reloadKey, onOpenConsole }: { reloadKey: number; onOpenConsole: () => void }) {
  return (
    <SharedLineGroupSetup
      slot="purchase_capture"
      setupUrl="/api/purchasing/line-orders?line_setup=1"
      reloadKey={reloadKey}
      onOpenConsole={onOpenConsole}
      text={{
        purpose: "ส่งรูปคำสั่งซื้อ",
        readyNote: "ส่งรูปคำสั่งซื้อในกลุ่มนี้ได้เลย บอทจะตอบกลับให้ · รูปที่ไม่ใช่คำสั่งซื้อ บอทเงียบและย้ายไปแท็บ \"ตีตก\" ให้เอง",
        pickHint: "ใช้กลุ่มที่บอทอยู่แล้วได้เลย (ทุกรูปในกลุ่มที่เลือก AI จะอ่าน · รูปที่ไม่ใช่คำสั่งซื้อ บอทเงียบและตีตกเอง)",
        busyWarn: "กลุ่มนี้มีรูปอื่นเยอะ — AI จะอ่านทุกรูป (เสียค่า AI ~0.1 บาท/รูป)",
      }}
    />
  );
}
