/**
 * ของกลาง — ไฟล์เอกสาร (รูป / PDF หลายไฟล์) → ชิ้นส่วนที่ส่งให้ AI อ่าน (OpenAI chat: image_url / file)
 *   ใช้ร่วม: บิลร้านจีน (lib/seller-bill · lib/seller-bill-intake) + ใบส่งของจากขนส่ง (lib/delivery-bill)
 *   ★ 2026-11-14 แยกออกมาจาก lib/seller-bill เพื่อให้ใบส่งของอ่าน PDF ได้ด้วย (เจ้าของขอ "ลากรูป, PDF มาใส่ได้เลย")
 *   ref = ที่อยู่ไฟล์กลาง (lib/file-ref) — R2 key เดิม หรือ "sb:…" (Supabase ส่วนตัว)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileRef } from "@/lib/file-ref-server";

type Admin = SupabaseClient;

/** ไฟล์ (รูป/PDF หลายไฟล์ = หลายหน้า เรียงตามลำดับ) → ชิ้นส่วนที่ส่งให้ AI · อ่านไฟล์ไม่ได้ = โยน Error ภาษาคน */
export async function billFileParts(admin: Admin, refs: string[], label = "บิล"): Promise<unknown[]> {
  const parts: unknown[] = [];
  for (const [i, ref] of refs.entries()) {
    const f = await readFileRef(admin, ref);
    if (!f) throw new Error(`อ่านไฟล์${label}ที่ ${i + 1} ไม่ได้ (ไฟล์อาจยังอัปโหลดไม่เสร็จ) — ลองแนบใหม่อีกครั้ง`);
    const isPdf = /pdf/i.test(f.contentType) || /\.pdf$/i.test(ref);
    const b64 = Buffer.from(f.bytes).toString("base64");
    parts.push(isPdf
      ? { type: "file", file: { filename: `page-${i + 1}.pdf`, file_data: `data:application/pdf;base64,${b64}` } }
      : { type: "image_url", image_url: { url: `data:${f.contentType.startsWith("image/") ? f.contentType : "image/jpeg"};base64,${b64}`, detail: "high" } });
  }
  return parts;
}
