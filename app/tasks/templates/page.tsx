"use client";

// ============================================================
// /tasks/templates — ย้ายเข้าหน้าตั้งค่าแล้ว (เจ้าของขอ 2026-11-22)
//   เทมเพลต → /tasks/settings?tab=templates · Prompt ต่อแบรนด์ → ?tab=brand_prompts · งานประจำ → ปฏิทินในหน้าจัดการงาน
// หน้านี้เหลือแค่พาไปที่ใหม่ (ลิงก์/บุ๊กมาร์กเก่าไม่พัง) · ตัวฟอร์มอยู่ที่ ./templates-tabs
// ============================================================
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/state-views";

export default function TemplatesMovedPage() {
  const router = useRouter();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    router.replace(q === "recurring" ? "/tasks?view=calendar&recurring=1" : q === "prompts" ? "/tasks/settings?tab=brand_prompts" : "/tasks/settings?tab=templates");
  }, [router]);
  return <LoadingState label="กำลังพาไปหน้าตั้งค่า…" />;
}
