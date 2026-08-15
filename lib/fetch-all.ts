/**
 * fetchAllPages — ของกลาง: ดึงแถวจาก Supabase "ให้ครบจริง"
 *
 * 🐛 กับดักที่แก้ (เจอซ้ำแล้วซ้ำอีกในโปรเจกต์นี้):
 *    PostgREST ตัดผลลัพธ์ที่ 1,000 แถว **เงียบ ๆ ไม่มี error** และการใส่ `.limit(20000)`
 *    ก็ไม่ช่วย (limit ที่ใหญ่กว่าเพดานถูกลดลงมาเท่าเพดาน)
 *    → query ที่จำนวนแถวโตตามจำนวนใบ/รายการ จะได้ข้อมูลไม่ครบโดยไม่รู้ตัว
 *
 *    เคสจริงที่เคยเจอ:
 *      - บอร์ดจ่ายงาน: วัตถุดิบ 1,205 แถว → 21 ใบขึ้น "ไม่มีสูตร" ผิด ๆ
 *      - หน้าขอซื้อ/เตรียม: วัตถุดิบ 1,981 แถว → ใบที่เพิ่งสร้าง 80 ใบหายทั้งหมด (กลุ่มใหม่ไม่โผล่)
 *      - ค้นหา SKU: ดึงทั้งตาราง 12,829 ตัว ได้มาแค่ 1,000 → หา "ไม่เจอ" 80%
 *
 * ใช้:
 *   const rows = await fetchAllPages((from, to) =>
 *     admin.from("mo_material_summary").select("...")
 *       .in("mo_no", moNos).eq("is_active", true)
 *       .order("mo_no", { ascending: true })   // ⚠️ ต้อง order ไม่งั้นหน้าเหลื่อมกัน/ซ้ำ
 *       .range(from, to));
 *
 * กฎ:
 *   1) ทุก query ที่ "จำนวนแถวโตตามข้อมูล" ต้องใช้ตัวนี้ (หรือไล่ range เอง)
 *   2) ต้องมี .order() ที่ผลลัพธ์เรียงคงที่ ไม่งั้นแบ่งหน้าแล้วข้อมูลเหลื่อม
 *   3) ถ้าอยากได้แค่ "ไม่กี่แถว" ให้ใส่ filter ให้แคบแทน — ไม่ใช่ดึงทั้งตารางมากรองใน JS
 */

export type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllPages<T = Record<string, unknown>>(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { page?: number; maxRows?: number } = {},
): Promise<T[]> {
  const page = Math.max(1, Math.min(1000, opts.page ?? 1000));
  const maxRows = opts.maxRows ?? 100_000;   // กันวนไม่รู้จบถ้าข้อมูลผิดปกติ
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += page) {
    const { data, error } = await makeQuery(from, from + page - 1);
    if (error) break;                     // พังกลางทาง → คืนเท่าที่ได้ (ผู้เรียกเห็นจำนวนน้อยลง ไม่ใช่พังทั้งหน้า)
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;        // หน้าสุดท้าย
  }
  return out;
}
