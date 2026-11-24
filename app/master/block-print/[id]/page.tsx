"use client";
import { useParams } from "next/navigation";
import { BlockPrintEditor } from "@/components/block-print/editor";

// 🧱 บล็อกพิมพ์ — หน้าทำงาน (เลือกชิ้น · ตั้งขนาด · ส่งออก PDF)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <BlockPrintEditor id={id} />;
}
