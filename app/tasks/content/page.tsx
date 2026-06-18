"use client";

// หน้า /tasks/content — ครอบ ContentPageView (เนื้อหาจริง + ContentDrawer อยู่ใน content.tsx เพื่อให้ import ฝังที่อื่นได้)
import { ContentPageView } from "./content";

export default function ContentPage() {
  return <ContentPageView />;
}
