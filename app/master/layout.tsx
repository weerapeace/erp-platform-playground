/**
 * Layout ร่วมของ Master Data — เรนเดอร์ PlaygroundShell (sidebar/topbar) "ครั้งเดียว"
 * พอเปลี่ยนเมนูในกลุ่มนี้ Next.js เก็บ layout ไว้ สลับแค่เนื้อหา
 * → sidebar ไม่ remount, ไม่เด้งขึ้นบนสุด, ไม่ขึ้น "กำลังโหลด" ทั้งหน้า
 *
 * หน้าใต้ /master/* เรนเดอร์ผ่าน MasterCRUDPage/MasterPage ซึ่งจะตรวจ ShellPresentContext
 * แล้วไม่เรนเดอร์ shell ซ้อน (ดู components/master-crud/index.tsx)
 */
import { PlaygroundShell } from "@/components/playground-shell";

export default function MasterSectionLayout({ children }: { children: React.ReactNode }) {
  return <PlaygroundShell>{children}</PlaygroundShell>;
}
