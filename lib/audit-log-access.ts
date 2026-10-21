/**
 * สิทธิ์ดูประวัติการแก้ไข (audit log) — ของกลาง
 *
 * - ดูทั้งระบบ (ไม่ระบุหมวด/รายการ) หรือดูหมวดอ่อนไหว (เงินเดือน การเข้างาน พนักงาน เงินกู้
 *   การเงิน สิทธิ์ผู้ใช้ ข้อมูลลูกค้า) → ต้องมี admin.audit_log
 * - ดูประวัติของรายการเดียว (entity_id) หรือหมวดทั่วไป เช่น ใบขอซื้อ สินค้า ใบงานออกแบบ
 *   → พนักงานที่ล็อกอินทุกคน (products.view — สิทธิ์ที่ทุกบทบาทมี)
 */

export const AUDIT_LOG_ADMIN_PERMISSION = "admin.audit_log";
export const AUDIT_LOG_STAFF_PERMISSION = "products.view";

const SENSITIVE_ENTITY_TYPE =
  /(payroll|attendance|leave|employee|salary|contract|loan|^od_|cash|bank|china|user|role|perm|partner|customer|member)/i;

export function isSensitiveAuditEntityType(entityType: string): boolean {
  return SENSITIVE_ENTITY_TYPE.test(entityType);
}

export function auditLogPermissionFor(filter: { entityType?: string | null; entityId?: string | null }): string {
  const entityType = filter.entityType?.trim() ?? "";
  const entityId = filter.entityId?.trim() ?? "";
  if (!entityType && !entityId) return AUDIT_LOG_ADMIN_PERMISSION;
  if (entityType && isSensitiveAuditEntityType(entityType)) return AUDIT_LOG_ADMIN_PERMISSION;
  return AUDIT_LOG_STAFF_PERMISSION;
}
