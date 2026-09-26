"use client";

import { useParams } from "next/navigation";
import { DesignSheetMobileView } from "@/components/design-sheet-mobile";

// หน้ารายละเอียดใบงานออกแบบ "แบบหน้าเต็ม" (มือถือ/แท็บเล็ตเปิดหน้านี้แทนป๊อปอัป) — ใช้ของกลาง DesignSheetMobileView
export default function Page() {
  const params = useParams<{ id: string }>();
  return <DesignSheetMobileView id={String(params?.id ?? "")} />;
}
