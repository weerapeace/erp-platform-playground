"use client";

// 📸 SAMPLE Images — หน้า /tasks/samples (ทางเข้า: ปุ่มทางลัดบนหน้าแรก "จัดการงาน")
// ตัวหน้าอยู่ที่ components/sample-images (หน้านี้แค่ห่อด้วย StandaloneShell ของแอปจัดการงาน)
import { StandaloneShell } from "@/components/standalone-shell";
import { SampleImagesPage } from "@/components/sample-images";

export default function SamplesPage() {
  return (
    <StandaloneShell title="SAMPLE Images" icon="📸" accent="violet">
      <SampleImagesPage />
    </StandaloneShell>
  );
}
