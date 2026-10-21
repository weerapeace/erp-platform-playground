/**
 * 🔑 ต่อรหัสพรีวิว (pk) เข้าลิงก์พรีวิวเว็บร้าน — ของกลางฝั่งหน้าจอ (ไม่มีความลับในไฟล์นี้)
 * รหัสมาจาก API ฝั่ง ERP (shop.previewKey · lib/storefront-preview-key) · ไม่มีรหัส = คืนลิงก์เดิม
 * ใช้: withPreviewKey(`${siteUrl}/?preview=1`, previewKey)
 */
export function withPreviewKey(url: string, pk: string | null | undefined): string {
  if (!pk) return url;
  const hashAt = url.indexOf("#");
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  return `${base}${base.includes("?") ? "&" : "?"}pk=${encodeURIComponent(pk)}${hash}`;
}
