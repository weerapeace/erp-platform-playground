"use client";
import { useParams } from "next/navigation";
import { PatternEditor } from "@/components/fabric-lay/pattern-editor";

// ✂️ วางแบบบนผ้าลาย — แบบตัดของสินค้า 1 ตัว (ชิ้นหน้า/หลัง/ข้าง + ขนาดจริง)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PatternEditor id={id} />;
}
