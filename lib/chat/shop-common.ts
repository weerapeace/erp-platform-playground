/**
 * ห้องแชทรวม — ของใช้ร่วมของตัวต่อร้านค้าออนไลน์ (server เท่านั้น)
 *   - ดึงรูปที่ลูกค้าส่ง (ลิงก์ของแพลตฟอร์ม) ลง R2 ทันที — ลิงก์บางเจ้าหมดอายุ (TikTok) · ใช้ตัวเก็บรูปกลาง lib/line-intake putLineImage
 *   - อ่านรูปที่พนักงานแนบ (R2) เป็นไฟล์ เพื่อฝากขึ้นแพลตฟอร์มก่อนส่ง
 *   - รหัสแพลตฟอร์มในตาราง erp_platforms (จำไว้ในหน่วยความจำ)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { putLineImage } from "@/lib/line-intake";
import { r2GetObject } from "@/lib/r2";
import type { ShopChatChannel } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

const MAX_IMAGE = 8 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** ดึงรูปจากลิงก์ของแพลตฟอร์มลง R2 → กุญแจ R2 · ไม่ได้ = null (ข้อความยังบันทึกได้ บอกให้เปิดดูในแอป) */
export async function storeRemoteImage(channel: ShopChatChannel, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_IMAGE) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE) return null;
    return await putLineImage(`chat/${channel}`, bytes, OK_TYPES.has(type) ? type : "image/jpeg");
  } catch { return null; }
}

/** รูปที่พนักงานแนบ (R2) → ไฟล์สำหรับฝากขึ้นแพลตฟอร์ม */
export async function r2ImageFile(key: string): Promise<{ bytes: Uint8Array; type: string; name: string } | null> {
  try {
    const obj = await r2GetObject(key);
    if (!obj) return null;
    // อ่านจนจบไฟล์ (ห้ามยกเลิกกลางทางบน Vercel — เคยค้าง)
    const bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
    const type = obj.httpMetadata?.contentType || (/\.png$/i.test(key) ? "image/png" : "image/jpeg");
    return { bytes, type, name: key.split("/").pop() || "image.jpg" };
  } catch { return null; }
}

const pfCache = new Map<string, string>();
/** id ของแพลตฟอร์มใน erp_platforms (shopee / lazada / tiktok) */
export async function platformIdOf(admin: Admin, code: ShopChatChannel): Promise<string | null> {
  const hit = pfCache.get(code);
  if (hit) return hit;
  const { data } = await admin.from("erp_platforms").select("id").eq("code", code).maybeSingle();
  const id = (data as { id?: string } | null)?.id ?? null;
  if (id) pfCache.set(code, id);
  return id;
}
