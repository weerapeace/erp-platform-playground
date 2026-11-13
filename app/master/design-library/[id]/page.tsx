"use client";
import { useParams } from "next/navigation";
import { TemplateView } from "@/components/design-library/library";

// 📚 Design Library — หน้าแม่แบบ (สูตรทั้งหมดของแม่แบบนี้)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TemplateView id={id} />;
}
