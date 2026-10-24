"use client";

// จัดเรียงงานพิมพ์ — หน้างาน 1 งาน (/tasks/nesting/new = งานใหม่) · เนื้อหาอยู่ที่ ../editor.tsx
import { useParams } from "next/navigation";
import { NestingEditor } from "../editor";

export default function NestingJobPage() {
  const { id } = useParams<{ id: string }>();
  return <NestingEditor id={id} />;
}
