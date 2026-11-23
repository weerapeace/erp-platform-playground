/**
 * รูปเมนูไลน์บริษัทที่ออกแบบเอง (เจ้าของเลือกข้อ 3.1-3.4 · 2026-11-23) — กติกา lib/line-company-images
 *   POST multipart { key, count, file }  อัปรูป (หน้าเว็บย่อ/ตัดขอบ/บีบให้ก่อนแล้ว · ที่นี่ตรวจซ้ำ: ขนาดตรงกฎ LINE · JPG/PNG · ≤1MB)
 *        → เก็บ R2 line-richmenu/… · รูปเดิมเข้าประวัติ (ย้อนได้ 5 รูป)
 *   POST json { key, action: "use_drawn" }          กลับไปใช้รูปที่ระบบวาด (รูปเดิมเข้าประวัติ)
 *   POST json { key, action: "revert", index }      ใช้รูปในประวัติ (รูปปัจจุบันเข้าประวัติแทน)
 * คนในไลน์เห็นรูปใหม่หลังกด "สร้างเมนูในไลน์" · ไฟล์ R2 ไม่ลบ (ย้อนกลับได้) · สิทธิ์ admin.users · ลง audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { r2PutObject } from "@/lib/r2";
import { loadLineConfig } from "@/lib/line-send";
import { saveLineConfigPatch } from "@/lib/line-company-server";
import { MAX_MENU_BUTTONS, PUBLISHED_MENU_KEYS, type PublishedMenuKey } from "@/lib/line-company";
import {
  MENU_IMAGE_MAX_BYTES, MENU_IMAGE_TYPES, menuImageTarget, menuImagesOf, revertMenuImage, setMenuImage, type MenuImage, type MenuImagesState,
} from "@/lib/line-company-images";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SharpFn = typeof import("sharp");
const getSharp = async (): Promise<SharpFn> => { const m = (await import("sharp")) as unknown as { default?: SharpFn }; return m.default ?? (m as unknown as SharpFn); };

const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isKey = (v: unknown): v is PublishedMenuKey => PUBLISHED_MENU_KEYS.includes(String(v) as PublishedMenuKey);
const brief = (i: MenuImage | null | undefined) => (i ? `${i.name || "รูป"} (${i.count} ปุ่ม)` : "รูปที่ระบบวาด");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? null;
  const admin = supabaseAdmin();
  const cfg = await loadLineConfig(admin);
  const before = menuImagesOf(cfg.company_images);

  let key: PublishedMenuKey;
  let next: MenuImagesState;
  let op: string;

  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    let form: FormData;
    try { form = await request.formData(); } catch { return err("อ่านไฟล์ไม่ได้ ลองใหม่"); }
    const k = form.get("key"); const file = form.get("file"); const count = Number(form.get("count"));
    if (!isKey(k)) return err("ไม่รู้จักหน้าเมนูนี้");
    if (!(file instanceof File)) return err("ยังไม่ได้เลือกรูป");
    if (!Number.isInteger(count) || count < 1 || count > MAX_MENU_BUTTONS) return err("จำนวนปุ่มไม่ถูกต้อง");
    if (!(MENU_IMAGE_TYPES as readonly string[]).includes(file.type)) return err("ใช้ได้เฉพาะรูป JPG หรือ PNG");
    if (file.size > MENU_IMAGE_MAX_BYTES) return err("รูปใหญ่เกิน 1MB (กฎของ LINE)");
    const buf = Buffer.from(await file.arrayBuffer());
    const target = menuImageTarget(count);
    const meta = await (await getSharp())(buf).metadata().catch(() => null);
    if (!meta?.width || !meta.height) return err("ไฟล์นี้ไม่ใช่รูปที่อ่านได้");
    if (meta.width !== target.width || meta.height !== target.height) return err(`รูปต้องขนาด ${target.width}×${target.height} (ได้ ${meta.width}×${meta.height})`);
    const ext = file.type === "image/png" ? "png" : "jpg";
    const r2Key = `line-richmenu/${k}-${count}b-${Date.now()}.${ext}`;
    try { await r2PutObject(r2Key, buf, file.type); } catch { return err("เก็บรูปไม่สำเร็จ ลองใหม่", 500); }
    const img: MenuImage = { r2_key: r2Key, width: meta.width, height: meta.height, count, bytes: file.size, uploaded_at: new Date().toISOString(), uploaded_by: actor, name: String(file.name || "").slice(0, 80) };
    key = k; next = setMenuImage(before, k, img); op = "upload";
  } else {
    let body: { key?: unknown; action?: unknown; index?: unknown };
    try { body = await request.json(); } catch { return err("invalid JSON"); }
    if (!isKey(body.key)) return err("ไม่รู้จักหน้าเมนูนี้");
    key = body.key;
    if (body.action === "use_drawn") {
      if (!before.slots[key]?.current) return NextResponse.json({ ok: true, error: null });
      next = setMenuImage(before, key, null); op = "use_drawn";
    } else if (body.action === "revert") {
      const r = revertMenuImage(before, key, Number(body.index));
      if (!r) return err("ไม่พบรูปนี้ในประวัติ (อาจมีคนแก้ไปแล้ว) — โหลดหน้าใหม่", 409);
      next = r; op = "revert";
    } else return err("คำสั่งไม่ถูกต้อง");
  }

  const nextSlot = next.slots[key];
  try { await saveLineConfigPatch(admin, (cur) => ({ ...cur, company_images: { ...menuImagesOf(cur.company_images), slots: { ...menuImagesOf(cur.company_images).slots, [key]: nextSlot }, saved_at: next.saved_at } })); }
  catch (e) { return err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", 500); }
  await writeAudit(admin, {
    action: "update", entityType: "line_config", actorId: user?.id ?? null, actorName: actor,
    metadata: { field: "company_images", op, key, changes: { [key]: { from: brief(before.slots[key]?.current), to: brief(nextSlot?.current) } } },
  });
  return NextResponse.json({ ok: true, error: null });
}
