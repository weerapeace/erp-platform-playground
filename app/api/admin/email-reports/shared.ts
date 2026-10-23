/**
 * ของใช้ร่วมของ /api/admin/email-reports (แยกจาก route.ts — route ต้อง export แค่ handler)
 */
import { normalizeReportDiscord, type EmailRecipient, type EmailReport } from "@/lib/email-report/shared";

/** แถวในฐานข้อมูล → EmailReport (เวลา "08:00:00" → "08:00") */
export function toEmailReport(r: Record<string, unknown>): EmailReport {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    source_key: String(r.source_key ?? ""),
    filters: (r.filters ?? {}) as EmailReport["filters"],
    options: (r.options ?? {}) as EmailReport["options"],
    days: Array.isArray(r.days) ? (r.days as unknown[]).map(Number) : [],
    send_time: String(r.send_time ?? "08:00").slice(0, 5),
    recipients: Array.isArray(r.recipients) ? (r.recipients as EmailRecipient[]) : [],
    discord: normalizeReportDiscord(r.discord),
    skip_if_empty: r.skip_if_empty !== false,
    is_enabled: r.is_enabled === true,
    last_sent_on: (r.last_sent_on as string) ?? null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

/** ใครเรียก API นี้ — ย้ายไปของกลาง lib/request-actor แล้ว (คงชื่อเดิมไว้ให้ไฟล์ในโฟลเดอร์นี้) */
export { requestActor } from "@/lib/request-actor";
