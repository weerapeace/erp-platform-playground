/**
 * ตัวช่วยฝั่งเซิร์ฟเวอร์ของ LINE SHOPPING (ของกลาง) — กุญแจ API ต่อแบรนด์
 * เดิมทุก route ถอดกุญแจเองซ้ำ ๆ (push-prices / push-details / set-display / sync-products / create-product / test)
 * route ใหม่ใช้ตัวนี้ · route เดิมย้ายมาใช้ได้เมื่อแตะ
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptSecret } from "@/lib/secret-box";

type Admin = ReturnType<typeof supabaseAdmin>;

/** กุญแจ API ของแบรนด์บนร้านนี้ (ถอดรหัสแล้ว) · error = ข้อความภาษาคน */
export async function lineApiKey(admin: Admin, brandId: string | null, platformId: string): Promise<{ apiKey: string | null; error: string | null }> {
  if (!brandId) return { apiKey: null, error: "รายการนี้ไม่มีแบรนด์ — ไม่รู้จะใช้กุญแจร้านไหน" };
  const { data } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brandId).eq("platform_id", platformId).maybeSingle();
  const stored = (data as { api_key?: string } | null)?.api_key;
  if (!stored) return { apiKey: null, error: "ยังไม่ได้ใส่ API Key ของแบรนด์นี้ (ตั้งค่าที่บัญชีร้าน)" };
  try { return { apiKey: await decryptSecret(stored), error: null }; }
  catch { return { apiKey: null, error: "ถอดรหัสคีย์ไม่ได้ (กุญแจหลักไม่ตรง/หาย?)" }; }
}
