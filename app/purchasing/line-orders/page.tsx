"use client";

/**
 * คำสั่งซื้อจากไลน์ — /purchasing/line-orders
 * แคปหน้าคำสั่งซื้อ Shopee/Taobao ส่งเข้ากลุ่มไลน์ → AI อ่าน → พักไว้ที่นี่ให้คนตรวจแล้วกดยืนยัน (ผูก PO เดิม / เปิด PO ใหม่)
 * ตัวหน้าอยู่ใน ./inbox (ไฟล์ page ต้อง export เฉพาะ default)
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { LineOrdersInbox } from "./inbox";

export default function LineOrdersPage() {
  return (
    <PlaygroundShell>
      <LineOrdersInbox />
    </PlaygroundShell>
  );
}
