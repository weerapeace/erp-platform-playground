"use client";

/**
 * คลังไฟล์กลาง (Assets Library / DAM)
 * อัปไฟล์ครั้งเดียว เก็บที่เดียว ค้น/แท็ก/จัดอัลบั้ม แล้วหยิบไปใช้ซ้ำได้ทุกโมดูล
 * ใช้ของกลาง: AssetLibrary (components/asset-library)
 */
import { AssetLibrary } from "@/components/asset-library";

export default function AssetsPage() {
  return <AssetLibrary />;
}
