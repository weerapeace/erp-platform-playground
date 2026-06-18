"use client";

import { usePermission } from "@/components/auth";

export const FILE_UPLOAD_PERMISSION = "files.upload";

export function useFileUploadAccess(disabled?: boolean) {
  const canUpload = usePermission(FILE_UPLOAD_PERMISSION);
  const uploadDisabled = Boolean(disabled) || !canUpload;
  const uploadDeniedMessage = !disabled && !canUpload
    ? "ต้องมีสิทธิ์ files.upload เพื่ออัปโหลดไฟล์"
    : null;

  return { canUpload, uploadDisabled, uploadDeniedMessage };
}
