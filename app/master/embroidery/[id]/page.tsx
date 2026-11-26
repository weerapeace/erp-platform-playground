"use client";
import { useParams } from "next/navigation";
import { EmbroideryEditor } from "@/components/embroidery/editor";

// 🧵 ไฟล์ปัก — หน้าทำงาน (ขนาด · ฝีเข็มตามสี · ตัวอย่าง · ดาวน์โหลด .DST)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <EmbroideryEditor id={id} />;
}
