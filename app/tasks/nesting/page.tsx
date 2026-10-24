"use client";

// จัดเรียงงานพิมพ์ — หน้ารายการงาน (เนื้อหาอยู่ที่ list-view.tsx · page.tsx ต้อง export แค่ default)
import { NestingListView } from "./list-view";

export default function NestingPage() {
  return <NestingListView />;
}
