/**
 * Layout ร่วมของโมดูลที่สร้างจากเว็บ (/m/*) — เรนเดอร์ PlaygroundShell ครั้งเดียว
 * เปลี่ยนโมดูลแล้ว sidebar อยู่นิ่ง ไม่เด้งขึ้นบนสุด (ดู app/master/layout.tsx)
 */
import { PlaygroundShell } from "@/components/playground-shell";

export default function GenericModuleLayout({ children }: { children: React.ReactNode }) {
  return <PlaygroundShell>{children}</PlaygroundShell>;
}
