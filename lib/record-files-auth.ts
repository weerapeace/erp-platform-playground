/**
 * ด่านสิทธิ์ของไฟล์แนบราย record (ฝั่งเซิร์ฟเวอร์เท่านั้น) — ใช้กับทุก /api/record-files/*
 *   สิทธิ์ต่อชนิดรายการอยู่ที่ RECORD_FILE_PERMS (lib/record-files.ts) · ต้องผ่านทุกตัว
 *   ⚠️ ห้าม import จากหน้าจอ (ใช้ guardApi ฝั่งเซิร์ฟเวอร์)
 */
import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { recordFilePerms } from "@/lib/record-files";

export async function guardRecordFiles(request: Request, entityType: string, mode: "view" | "edit"): Promise<NextResponse | null> {
  for (const perm of recordFilePerms(entityType, mode)) {
    const denied = await guardApi(request, perm);
    if (denied) return denied;
  }
  return null;
}

/** หลายชนิดรายการพร้อมกัน (เช่น ก๊อปไฟล์ไปหลาย record) — ไม่ซ้ำชนิด */
export async function guardRecordFilesMany(request: Request, entityTypes: string[], mode: "view" | "edit"): Promise<NextResponse | null> {
  for (const t of [...new Set(entityTypes)]) {
    const denied = await guardRecordFiles(request, t, mode);
    if (denied) return denied;
  }
  return null;
}
