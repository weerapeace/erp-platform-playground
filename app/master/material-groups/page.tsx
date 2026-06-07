"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="material-groups" moduleKey="material-groups" title="กลุ่มวัตถุดิบ" icon="🧶"
    description="ชนิดวัตถุดิบ + วิธีคำนวณ (area_face/area_100/length/count) + %เผื่อเสีย + ตัวหาร — ใช้ใน BOM" />;
}
