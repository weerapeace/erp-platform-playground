"use client";
import { useParams } from "next/navigation";
import { PlanEditor } from "@/components/fabric-lay/plan-editor";

// ✂️ วางแบบบนผ้าลาย — กระดานวางชิ้นบนผ้า 1 แผน
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PlanEditor id={id} />;
}
