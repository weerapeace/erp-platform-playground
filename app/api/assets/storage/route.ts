/**
 * /api/assets/storage — พื้นที่ที่ใช้จริงใน Cloudflare R2
 *   GET            → ผลที่คำนวณไว้ล่าสุด (จาก ui_config key='r2_storage_usage') · ไม่นับใหม่ = เร็ว
 *   GET ?refresh=1 → ไล่นับใหม่ทั้งบัคเก็ต (ListObjectsV2 ทีละ 1000) แล้วเก็บผลไว้
 *
 * แยกยอดตาม "โฟลเดอร์ชั้นแรก" ของ key (เช่น products/, creative-tasks/, avatars/)
 * → เห็นว่าอะไรกินพื้นที่ · ไฟล์ที่ไม่มีโฟลเดอร์นับรวมเป็น "(root)"
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getR2Binding, r2ListObjects, R2_BUCKET } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;   // ไล่นับหลายหมื่นไฟล์ใช้เวลา — กัน timeout

const CFG_KEY = "r2_storage_usage";
const MAX_PAGES = 500;            // กันวนไม่รู้จบ (500 × 1000 = 500,000 ไฟล์)

export type R2Usage = {
  bucket: string;
  total_bytes: number;
  total_objects: number;
  folders: { prefix: string; bytes: number; count: number }[];
  computed_at: string;
  truncated: boolean;             // true = ไฟล์เยอะเกิน MAX_PAGES (ตัวเลขยังไม่ครบ)
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  if (!refresh) {
    const { data } = await admin.from("ui_config").select("value").eq("key", CFG_KEY).maybeSingle();
    return NextResponse.json({ data: (data?.value as R2Usage | undefined) ?? null, error: null });
  }

  // นับใหม่ — ต้องมีสิทธิ์จัดการคลัง (งานหนัก ไม่ให้ใครกดก็ได้)
  const deniedManage = await guardApi(request, "assets.manage"); if (deniedManage) return deniedManage;

  const bucket = await getR2Binding();
  if (!bucket) return NextResponse.json({ data: null, error: "ยังไม่ได้ตั้งค่า R2 (ไม่มี binding/กุญแจ S3)" }, { status: 400 });

  const byFolder = new Map<string, { bytes: number; count: number }>();
  let totalBytes = 0, totalObjects = 0, pages = 0;
  let cursor: string | null | undefined = undefined;

  try {
    do {
      const page: Awaited<ReturnType<typeof r2ListObjects>> = await r2ListObjects(bucket, { cursor: cursor ?? undefined, limit: 1000 });
      if (!page) return NextResponse.json({ data: null, error: "runtime นี้ยังไล่รายชื่อไฟล์ใน R2 ไม่ได้" }, { status: 400 });
      for (const o of page.objects) {
        const slash = o.key.indexOf("/");
        const folder = slash > 0 ? o.key.slice(0, slash) : "(root)";
        const cur = byFolder.get(folder) ?? { bytes: 0, count: 0 };
        cur.bytes += o.size; cur.count += 1;
        byFolder.set(folder, cur);
        totalBytes += o.size; totalObjects += 1;
      }
      cursor = page.cursor;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);
  } catch (e) {
    return NextResponse.json({ data: null, error: `อ่านรายชื่อไฟล์จาก R2 ไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }

  const usage: R2Usage = {
    bucket: R2_BUCKET,
    total_bytes: totalBytes,
    total_objects: totalObjects,
    folders: [...byFolder.entries()].map(([prefix, v]) => ({ prefix, bytes: v.bytes, count: v.count })).sort((a, b) => b.bytes - a.bytes),
    computed_at: new Date().toISOString(),
    truncated: !!cursor,
  };
  await admin.from("ui_config").upsert({ key: CFG_KEY, value: usage, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return NextResponse.json({ data: usage, error: null });
}
