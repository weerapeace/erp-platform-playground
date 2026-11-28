"use client";
import { useParams, useRouter } from "next/navigation";
import { FabricLayPrintSheet } from "@/components/fabric-lay/print-sheet";

// ✂️ ใบตัดผ้าลาย — /print/fabric-lay/<planId> (ตัวทำงานอยู่ที่ components/fabric-lay/print-sheet)
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <FabricLayPrintSheet id={id} onBack={() => router.back()} />;
}
