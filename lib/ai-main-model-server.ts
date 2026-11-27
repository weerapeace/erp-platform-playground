/**
 * อ่าน "รุ่นหลักของทั้งระบบ" + ระดับการคิด (ฝั่งเซิร์ฟเวอร์) — ตั้งที่ศูนย์ AI /admin/paid-services
 * แยกไฟล์ไว้เพื่อให้ทั้ง lib/ai-caption (productDetailModel) และ lib/paid-services-server (ด่านกลาง) ใช้ได้โดยไม่ import วนกัน
 * แคช 30 วินาที (เท่าค่าตั้งศูนย์ AI) · บันทึกค่าใหม่แล้วเรียก invalidateMainSetting()
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AI_MAIN_MODEL_KEY, cleanMainSetting, LEGACY_PRODUCT_MODEL_KEY, type AiMainSetting } from "@/lib/ai-caption-models";

export type MainSettingRow = AiMainSetting & { updated_at: string | null; saved: boolean };

let cache: { at: number; value: MainSettingRow } | null = null;
const TTL_MS = 30_000;

export function invalidateMainSetting(): void { cache = null; }

/** รุ่นหลัก — ยังไม่เคยตั้ง = ค่าเดิมของป๊อป AI รายละเอียดสินค้า (ai_product_model) → gpt-4.1-mini · อ่านไม่ได้ = ค่าเริ่ม */
export async function loadMainSetting(force = false): Promise<MainSettingRow> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const { data } = await supabaseAdmin().from("ui_config").select("key, value, updated_at").in("key", [AI_MAIN_MODEL_KEY, LEGACY_PRODUCT_MODEL_KEY]);
    const rows = (data ?? []) as Array<{ key: string; value: Record<string, unknown> | null; updated_at: string | null }>;
    const main = rows.find((r) => r.key === AI_MAIN_MODEL_KEY);
    const legacy = rows.find((r) => r.key === LEGACY_PRODUCT_MODEL_KEY);
    const value: MainSettingRow = { ...cleanMainSetting(main?.value, String(legacy?.value?.model ?? "")), updated_at: main?.updated_at ?? null, saved: !!main };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return { ...cleanMainSetting(null), updated_at: null, saved: false };
  }
}
