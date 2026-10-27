/**
 * 🖨 ที่เก็บไฟล์พิมพ์ PNG ตัวจริงในคลังกลาง (R2 `nesting-prints/<sha>.png`) — ของกลางฝั่งเซิร์ฟเวอร์
 *
 * ใช้ร่วม 2 ที่ (ไฟล์เดียวกัน อัปที่ไหนก็เห็นทั้งสองที่):
 *   - หน้าจัดเรียง  → /api/nesting-jobs/print-files (ตัวช่วยในเครื่องส่ง/ดึงตรงกับ R2)
 *   - การ์ดลายในคลัง → /api/assets/[id]/print-file (อัปจากเบราว์เซอร์ / คัดลอกจาก Drive ของการ์ด)
 * เก็บตามรหัสเนื้อไฟล์ (sha256 16 ตัวแรก) → ไฟล์เดิมไม่เก็บซ้ำ · จำไว้กับลายที่ assets.nest_print_file (ไฟล์ใหม่แทนที่ของเดิม)
 * รับเฉพาะ PNG จริง — ไฟล์งานพิมพ์ PDF/EPS อยู่ Google Drive เท่านั้น (lib/print-file-policy)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditFor } from "@/lib/audit";
import { sha256Hex } from "@/lib/assets";
import { r2DeleteObject, r2GetRange, r2HeadSize, r2PutObject } from "@/lib/r2";
import { PRINT_SOURCE_PNG_ONLY, isPngBytes } from "@/lib/print-file-policy";

export type PrintFile = { sha: string; name: string; size: number; saved_at: string };

export const PRINT_SHA = /^[0-9a-f]{16}$/;
export const printKey = (sha: string) => `nesting-prints/${sha}.png`;
export const cleanPrintName = (v: unknown, sha: string) => String(v ?? "").replace(/[\\/]/g, " ").trim().slice(0, 200) || `${sha}.png`;

/** ขนาด + ไบต์แรก ๆ ของไฟล์ในคลัง (ไม่พบ = null) — ไว้ตรวจว่าเป็น PNG จริง */
async function headOf(sha: string): Promise<{ size: number; bytes: Uint8Array } | null> {
  const r = await r2GetRange(printKey(sha), 0, 15);
  if (!r) return null;
  if (r.status === "unsatisfiable") return { size: r.total, bytes: new Uint8Array() };
  return { size: r.total, bytes: new Uint8Array(await new Response(r.body).arrayBuffer()).subarray(0, 16) };
}

/** มีไฟล์นี้ในคลังแล้วไหม (ขนาด · ไม่มี = null) */
export const printSize = (sha: string) => r2HeadSize(printKey(sha));

/**
 * ตรวจไฟล์ที่ส่งตรงเข้า R2 แล้ว (ตัวช่วย / เบราว์เซอร์) — ต้องเป็น PNG จริง (ไม่ใช่ = ลบทิ้ง ไม่ผูกกับลาย)
 * → { size } หรือ { error, status }
 */
export async function verifyPrint(sha: string): Promise<{ size: number } | { error: string; status: number }> {
  const head = await headOf(sha);
  if (!head) return { error: "ยังไม่พบไฟล์ในคลัง — ส่งไฟล์ขึ้นไม่สำเร็จ ลองใหม่อีกครั้ง", status: 409 };
  if (!isPngBytes(head.bytes)) {
    try { await r2DeleteObject(printKey(sha)); } catch { /* ลบไม่ทัน = ค้างใน R2 แต่ไม่ถูกผูกกับลาย */ }
    return { error: PRINT_SOURCE_PNG_ONLY.th, status: 400 };
  }
  return { size: head.size };
}

/** เนื้อไฟล์ (ที่เซิร์ฟเวอร์ได้มาเอง เช่น อัปผ่านเว็บ / โหลดจาก Drive) → คลัง (มีแล้วไม่ส่งซ้ำ) · ไม่ใช่ PNG = throw */
export async function storePrintBytes(buf: ArrayBuffer): Promise<{ sha: string; size: number }> {
  if (!isPngBytes(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)))) throw new Error(PRINT_SOURCE_PNG_ONLY.th);
  const sha = (await sha256Hex(buf)).slice(0, 16);
  if ((await printSize(sha)) == null) await r2PutObject(printKey(sha), new Uint8Array(buf), "image/png");
  return { sha, size: buf.byteLength };
}

/** จำไฟล์พิมพ์ไว้กับลายในคลัง (แทนที่ของเดิม · ไฟล์เก่ายังอยู่ R2) + audit → ไฟล์ที่ผูก (ไม่พบลาย = null) */
export async function linkPrintToAsset(request: Request, assetId: string, f: { sha: string; name: string; size: number }, via: string): Promise<PrintFile | null> {
  const admin = supabaseAdmin();
  const print: PrintFile = { sha: f.sha, name: f.name, size: f.size, saved_at: new Date().toISOString() };
  const { data, error } = await admin.from("assets").update({ nest_print_file: print }).eq("id", assetId).select("id, title").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await writeAuditFor(request, admin, { action: "update", entityType: "asset", entityId: assetId,
    metadata: { field: "nest_print_file", title: data.title, sha: f.sha, name: f.name, size: f.size, via } });
  return print;
}
