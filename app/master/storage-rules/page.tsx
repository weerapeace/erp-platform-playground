"use client";

/**
 * กฎที่เก็บไฟล์ — ไฟล์หมวดไหนเก็บที่ R2 / Supabase / Google Drive
 * ใช้ของกลาง: StorageRulesManager (components/storage-rules)
 */
import { StorageRulesManager } from "@/components/storage-rules";

export default function StorageRulesPage() {
  return <StorageRulesManager />;
}
