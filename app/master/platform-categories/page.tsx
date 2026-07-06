"use client";

/**
 * /master/platform-categories — จับคู่หมวดหมู่แพลตฟอร์ม (หน้าเต็ม)
 * เนื้อหาอยู่ในของกลาง <PlatformCategoryMapper /> — ใช้ซ้ำใน Popup ได้ (เปิดจาก CentralCategoryPicker)
 * layout /master ครอบ PlaygroundShell ให้แล้ว — หน้านี้ไม่ต้องครอบเอง
 */
import { PlatformCategoryMapper } from "@/components/platform-category-mapper";

export default function PlatformCategoryMapPage() {
  return <PlatformCategoryMapper />;
}
