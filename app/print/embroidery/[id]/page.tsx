"use client";
import { useParams, useRouter } from "next/navigation";
import { EmbroiderySheet } from "@/components/embroidery/sheet";

// 🧵 ใบสั่งปัก — /print/embroidery/<id> (ตัวทำงานอยู่ที่ components/embroidery/sheet)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <EmbroiderySheet id={id} onBack={() => router.back()} />;
}
