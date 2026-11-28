/**
 * ผู้ช่วยเสียง — ด่าน "ใครใช้ได้" (ฝั่งเซิร์ฟเวอร์) · ใช้ทั้ง /api/voice-assistant/command และ /transcribe
 *
 * ช่วงทดลอง (เจ้าของสั่งเริ่ม 2026-11-27): ค่าเริ่ม = เฉพาะแอดมิน (คนที่มีสิทธิ์ admin.paid_services)
 * เปิดให้คนอื่น = ศูนย์ AI (/admin/paid-services) → "ผู้ช่วยเสียง — เข้าใจคำสั่ง" → ใครใช้ได้ = เฉพาะที่เลือก → เลือกบทบาท/คน
 * (กติกาเดียวกับฟีเจอร์ AI อื่น: ตั้ง "เฉพาะที่เลือก" = รายชื่อตัดสิน · "ทุกคน" = ต้องมีสิทธิ์พื้นฐาน ซึ่งของผู้ช่วยเสียง = แอดมิน)
 */
import { apiCan } from "@/lib/api-auth";
import { featureAccess } from "@/lib/paid-services-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeVoiceSettings, VOICE_SETTINGS_KEY, type VoiceSettings } from "@/lib/voice-assistant";

export const VOICE_FEATURE_KEY = "ai.voice_assistant";

export async function voiceAllowed(request: Request, userId: string): Promise<boolean> {
  return featureAccess(VOICE_FEATURE_KEY, { request, userId }, await apiCan(request, "admin.paid_services"));
}


/** ค่าตั้งผู้ช่วยเสียง (หน้า /admin/voice-assistant) — ยังไม่เคยตั้ง/อ่านไม่ได้ = ค่าเริ่มต้น (ทุกคำสั่งเปิด · โหมดเปิดฟอร์ม) */
export async function loadVoiceSettings(): Promise<VoiceSettings> {
  try {
    const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", VOICE_SETTINGS_KEY).maybeSingle();
    return normalizeVoiceSettings((data as { value?: unknown } | null)?.value ?? null);
  } catch {
    return normalizeVoiceSettings(null);
  }
}
