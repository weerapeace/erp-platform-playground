/**
 * ค่าตั้งของกระแสเงินสดที่ "ใช้ร่วมทั้งระบบ" (ไม่ใช่ต่อเครื่อง) — เงินกันขั้นต่ำ + การแจ้งเตือนเงินจะขาด
 * เก็บใน china_app_settings skey "cashflow_settings" (ที่เก็บค่าตั้งกลางแบบ key/value เดียวกับ line_config · web_push) — ไม่มีตารางใหม่
 * pure (ไม่ import อะไร) — ใช้ทั้งหน้าเว็บ · API /api/cashflow/settings · cron /api/cron/cashflow-alert
 */

export const CASHFLOW_SETTINGS_KEY = "cashflow_settings";

export type CashflowSettings = {
  /** เงินที่ต้องเหลือในบัญชีอย่างน้อย (บาท) — กราฟมีเส้นนี้ · ต่ำกว่า = เตือน · 0 = เตือนเมื่อติดลบ */
  safetyBuffer: number;
  /** เตือนทุกเช้าไหม */
  alertEnabled: boolean;
  /** มองล่วงหน้ากี่วัน */
  alertDays: number;
};

export const DEFAULT_CASHFLOW_SETTINGS: CashflowSettings = { safetyBuffer: 0, alertEnabled: true, alertDays: 14 };
export const ALERT_DAY_OPTIONS = [7, 14, 30, 60];

/** ตรวจ/ทำความสะอาดค่าที่รับมา (ผิดรูปแบบ = ใช้ค่าตั้งต้น) */
export function cleanCashflowSettings(raw: unknown): CashflowSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const buf = Number(r.safetyBuffer);
  const days = Number(r.alertDays);
  return {
    safetyBuffer: Number.isFinite(buf) && buf >= 0 ? Math.min(Math.round(buf * 100) / 100, 1e12) : DEFAULT_CASHFLOW_SETTINGS.safetyBuffer,
    alertEnabled: typeof r.alertEnabled === "boolean" ? r.alertEnabled : DEFAULT_CASHFLOW_SETTINGS.alertEnabled,
    alertDays: ALERT_DAY_OPTIONS.includes(days) ? days : DEFAULT_CASHFLOW_SETTINGS.alertDays,
  };
}
