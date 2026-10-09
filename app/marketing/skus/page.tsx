"use client";

// 🎯 SKU การตลาด — เปลือกหน้า: เชลล์ + สิทธิ์ · ตัวหน้าจออยู่ที่ view.tsx
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { MarketingSkusView } from "./view";

export default function MarketingSkusPage() {
  const { can } = useAuth();
  return (
    <PlaygroundShell>
      <MarketingSkusView canManage={can("marketing.sku.manage" as never)} canLabels={can("marketing.label.manage" as never)} />
    </PlaygroundShell>
  );
}
