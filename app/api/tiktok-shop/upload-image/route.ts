/**
 * ฝากรูปกับ TikTok สำหรับแทรกในรายละเอียดสินค้า (กล่องแก้รายละเอียดในลิ้นชัก — วาง/ลาก/ปุ่มแทรกรูป)
 *  POST multipart { file, listing_id }   (products.platforms.publish)
 *  → { url: "<ลิงก์ TikTok>#tts-w=…&tts-h=…", width, height, error }
 *
 * Upload Product Image 202309 (use_case=DESCRIPTION_IMAGE) — ยังไม่แก้สินค้า (รูปแค่ฝากไว้ จะไปอยู่ในสินค้าเมื่อกดบันทึกขึ้น TikTok)
 * ต่อท้ายขนาดเป็น fragment → ตอนส่งรายละเอียด ระบบใส่ width/height ให้ตามที่ TikTok บังคับ (fixTiktokDescriptionImages)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { ttsErrorText, ttsUploadImage } from "@/lib/tiktok-shop";
import { tiktokDescImageSrc } from "@/lib/tiktok-listing-edit";
import { ttsTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const reply = (body: { url: string | null; width?: number | null; height?: number | null; error: string | null }, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let form: FormData;
  try { form = await request.formData(); } catch { return reply({ url: null, error: "ส่งไฟล์มาไม่ถูกต้อง" }, 400); }
  const file = form.get("file");
  const listingId = String(form.get("listing_id") ?? "").trim();
  if (!(file instanceof Blob) || !listingId) return reply({ url: null, error: "ข้อมูลไม่ครบ (file + listing_id)" }, 400);
  if (!OK_TYPES.has(file.type)) return reply({ url: null, error: "รับเฉพาะรูป JPG / PNG / WEBP" }, 400);
  if (!file.size || file.size > MAX_BYTES) return reply({ url: null, error: `รูปต้องไม่เกิน 10MB (ไฟล์นี้ ${(file.size / 1048576).toFixed(1)}MB)` }, 400);

  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id").eq("id", listingId).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null } | null;
  if (!row?.brand_id) return reply({ url: null, error: "ไม่พบสินค้านี้" }, 404);
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "tiktok") return reply({ url: null, error: "ใช้ได้เฉพาะสินค้าบน TikTok Shop" }, 400);
  const tok = await ttsTokenOrReason(admin, row.brand_id, row.platform_id, user?.id ?? null);
  if (!tok.ok) return reply({ url: null, error: tok.reason }, 400);

  try {
    const name = (file as File).name || `image.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
    const r = await ttsUploadImage(tok.accessToken, await file.arrayBuffer(), name, file.type, "DESCRIPTION_IMAGE");
    if (!r.url) return reply({ url: null, error: "TikTok ไม่ส่งลิงก์รูปกลับมา — ลองใหม่อีกครั้ง" }, 502);
    return reply({ url: tiktokDescImageSrc(r.url, r.width, r.height), width: r.width, height: r.height, error: null });
  } catch (e) {
    return reply({ url: null, error: `ฝากรูปกับ TikTok ไม่สำเร็จ: ${ttsErrorText(e)}` }, 502);
  }
}
