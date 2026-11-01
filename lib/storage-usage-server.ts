/**
 * พื้นที่ที่ใช้นอก R2 (ฝั่งเซิร์ฟเวอร์เท่านั้น) — Supabase Storage แยกตาม bucket + จำนวนที่ผูกกับ Google Drive
 * ใช้โดย /api/assets/storage (การ์ดพื้นที่ในคลังไฟล์ + หน้ากฎที่เก็บไฟล์) · ชนิดข้อมูลอยู่ lib/storage-policy.ts
 * อ่านไม่ได้ส่วนไหน = ส่วนนั้นเป็น null (ไม่ให้การ์ดพังทั้งใบ)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { OtherStorageUsage } from "@/lib/storage-policy";

type Admin = ReturnType<typeof supabaseAdmin>;

async function supabaseUsage(admin: Admin): Promise<OtherStorageUsage["supabase"]> {
  const { data, error } = await admin.rpc("erp_storage_bucket_usage");
  if (error) { console.error("[storage-usage] supabase:", error.message); return null; }
  const buckets = ((data ?? []) as { bucket_id: string; total_bytes: number | string; total_objects: number | string }[])
    .map((b) => ({ bucket_id: b.bucket_id, total_bytes: Number(b.total_bytes) || 0, total_objects: Number(b.total_objects) || 0 }))
    .sort((a, b) => b.total_bytes - a.total_bytes);
  return {
    buckets,
    total_bytes: buckets.reduce((s, b) => s + b.total_bytes, 0),
    total_objects: buckets.reduce((s, b) => s + b.total_objects, 0),
  };
}

async function driveUsage(admin: Admin): Promise<OtherStorageUsage["drive"]> {
  const [assets, folders, files] = await Promise.all([
    admin.from("assets").select("id", { count: "exact", head: true }).eq("status", "active").ilike("master_url", "%drive.google.com%"),
    admin.from("erp_creative_tasks").select("id", { count: "exact", head: true }).not("drive_folder_id", "is", null),
    admin.from("erp_creative_attachments").select("id", { count: "exact", head: true }).not("drive_file_id", "is", null),
  ]);
  const err = assets.error ?? folders.error ?? files.error;
  if (err) { console.error("[storage-usage] drive:", err.message); return null; }
  return { asset_links: assets.count ?? 0, task_folders: folders.count ?? 0, task_files: files.count ?? 0 };
}

export async function loadOtherStorageUsage(admin: Admin): Promise<OtherStorageUsage> {
  const [supabase, drive] = await Promise.all([supabaseUsage(admin), driveUsage(admin)]);
  return { supabase, drive };
}
