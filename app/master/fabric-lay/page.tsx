import { Suspense } from "react";
import { FabricLayHome } from "@/components/fabric-lay";
import { LoadingState } from "@/components/state-views";

// ✂️ วางแบบบนผ้าลาย — หน้ารวม (แผนวาง · อัลบั้มผ้า · แบบตัด) · ของจริงอยู่ที่ components/fabric-lay
export default function Page() {
  return <Suspense fallback={<LoadingState />}><FabricLayHome /></Suspense>;
}
