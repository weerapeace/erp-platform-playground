"use client";
/**
 * /chat — ห้องแชทรวม (ตอบแชทลูกค้าทุกช่องทางจากที่เดียว · เฟส 1 = LINE)
 * สิทธิ์ chat.view (ตอบ = chat.reply · มอบหมาย/จบ = chat.assign · ตั้งค่า = chat.settings)
 * ตัวหน้าอยู่ที่ components/chat-inbox · คู่มือ docs/chat-inbox.md
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { AccessDenied, useAuth } from "@/components/auth";
import { LoadingState } from "@/components/state-views";
import { ChatInbox } from "@/components/chat-inbox";

export default function ChatPage() {
  const { can, permsReady, ready } = useAuth();
  // สิทธิ์จริงจาก DB ยังโหลดไม่เสร็จ = รอก่อน (กันขึ้น "ไม่มีสิทธิ์" แวบเดียว) · มีสิทธิ์แล้ว (เช่น admin) = เข้าเลย
  if (!ready || (!permsReady && !can("chat.view"))) return <PlaygroundShell><LoadingState label="กำลังโหลด…" className="py-20" /></PlaygroundShell>;
  if (!can("chat.view")) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ ดูห้องแชทลูกค้า (chat.view) — ขอผู้ดูแลระบบติ๊กให้ที่หน้าสิทธิ์" /></PlaygroundShell>;
  return <PlaygroundShell><ChatInbox /></PlaygroundShell>;
}
