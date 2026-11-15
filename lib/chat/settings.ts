/**
 * ห้องแชทรวม — อ่าน/บันทึกค่าตั้ง (server เท่านั้น) · ui_config key "chat_settings"
 *   line_bots: บอท LINE ตัวไหนรับแชทลูกค้า + แบรนด์ · quick_replies: ข้อความสำเร็จรูป
 *   แยกจาก line_config (ค่าบอท/กลุ่มของศูนย์ LINE) เพื่อไม่ให้การบันทึกของศูนย์ LINE ทับค่าแชท
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { CHAT_SETTINGS_KEY, EMPTY_CHAT_SETTINGS, cleanChatSettings } from "./rules";
import type { ChatSettings } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function loadChatSettings(admin: Admin): Promise<ChatSettings> {
  try {
    const { data } = await admin.from("ui_config").select("value").eq("key", CHAT_SETTINGS_KEY).maybeSingle();
    return cleanChatSettings((data as { value?: unknown } | null)?.value ?? EMPTY_CHAT_SETTINGS);
  } catch { return EMPTY_CHAT_SETTINGS; }
}

export async function saveChatSettings(admin: Admin, next: ChatSettings): Promise<string | null> {
  const value = cleanChatSettings(next);
  const { error } = await admin.from("ui_config").upsert({ key: CHAT_SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? "บันทึกค่าตั้งแชทไม่สำเร็จ กรุณาลองใหม่" : null;
}
