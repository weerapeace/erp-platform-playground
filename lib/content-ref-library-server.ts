/**
 * คลัง Reference กลาง — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ของ /api/content-refs)
 *   ตาราง content_ref_library · "ใช้กี่ครั้ง" = จำนวน Reference ในรายการที่ library_id ชี้มา
 *   ชนิด/กรอง/เรียง (pure) อยู่ lib/content-ref-library
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { refDedupeKey, type LibraryRef } from "@/lib/content-ref-library";

type Admin = ReturnType<typeof supabaseAdmin>;
export const LIBRARY_COLS = "id, kind, r2_key, url, provider, title, thumb_url, body, note, tags, brand_id, created_by, created_at, updated_at";
const MAX_LIBRARY = 3000;

type Row = Omit<LibraryRef, "brand" | "used_count">;

/** ทั้งคลัง (ใหม่ก่อน) พร้อมแบรนด์ + ใช้กี่ครั้ง */
export async function loadRefLibrary(admin: Admin): Promise<LibraryRef[]> {
  const { data, error } = await admin.from("content_ref_library").select(LIBRARY_COLS).order("created_at", { ascending: false }).limit(MAX_LIBRARY);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];
  const brandIds = [...new Set(rows.map((r) => r.brand_id).filter((x): x is string => !!x))];
  const [{ data: brands }, { data: uses }] = await Promise.all([
    brandIds.length ? admin.from("brands").select("id, name, color").in("id", brandIds) : Promise.resolve({ data: [] as unknown[] }),
    // ไม่ใช้ .in(ids) — คลังใหญ่แล้ว URL ยาวเกิน · ดึงเฉพาะแถวที่หยิบจากคลังมา (เล็ก)
    admin.from("content_album_refs").select("library_id").not("library_id", "is", null).limit(50000),
  ]);
  const brandMap = new Map(((brands ?? []) as { id: string; name: string; color: string | null }[]).map((b) => [b.id, b]));
  const used = new Map<string, number>();
  for (const u of (uses ?? []) as { library_id: string }[]) used.set(u.library_id, (used.get(u.library_id) ?? 0) + 1);
  return rows.map((r) => ({ ...r, tags: r.tags ?? [], brand: r.brand_id ? brandMap.get(r.brand_id) ?? null : null, used_count: used.get(r.id) ?? 0 }));
}

/** หาชิ้นที่มีในคลังแล้ว (รูป/ลิงก์/ข้อความเดียวกัน) — กันเก็บซ้ำ · ไม่เจอ = null */
export async function findLibraryDuplicate(admin: Admin, ref: { kind: string; r2_key?: string | null; url?: string | null; body?: string | null }): Promise<string | null> {
  const key = refDedupeKey(ref);
  if (!key) return null;
  if (ref.kind === "image") {
    const { data } = await admin.from("content_ref_library").select("id").eq("kind", "image").eq("r2_key", ref.r2_key ?? "").limit(1).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }
  // ลิงก์/ข้อความ: เทียบแบบตัด www / # / ช่องว่าง (คลังเล็ก ดึงเฉพาะชนิดเดียวกันมาเทียบ)
  const { data } = await admin.from("content_ref_library").select("id, kind, url, body").eq("kind", ref.kind).limit(MAX_LIBRARY);
  const hit = ((data ?? []) as { id: string; kind: string; url: string | null; body: string | null }[]).find((r) => refDedupeKey(r) === key);
  return hit?.id ?? null;
}
