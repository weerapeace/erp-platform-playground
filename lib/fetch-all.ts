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
 *
 * 🐛 กับดักที่ 2 (2026-11-11): ฐานข้อมูลช้าชั่วคราว (เช่น 2–3 นาทีหลังขึ้นเว็บใหม่) → คำขอโดนตัดที่เพดานเวลา
 *    ของเดิม "คืนเท่าที่ได้" เงียบ ๆ → หน้า "สินค้าบนเว็บ" ได้ SKU ลูก 0 ตัว → ขึ้น "ยังไม่มีราคา" 379 จาก 389 รุ่น ทั้งที่ข้อมูลครบ
 *    - ทุกคนที่เรียก: หน้าไหนพัง จะ "ลองซ้ำ" ให้เอง 1 ครั้ง (retries) ก่อนยอมแพ้
 *    - ที่ที่ "ข้อมูลไม่ครบ = คำตอบผิด" (ป้ายเตือน / ตัวเลขสรุป / สิ่งที่ลูกค้าเห็น) → ใส่ strict: true
 *      แล้วจับ FetchAllError ไปตอบ "โหลดไม่ครบ ลองใหม่" แทนการแสดงข้อมูลครึ่ง ๆ กลาง ๆ
 */

export type PageResult<T> = { data: T[] | null; error: unknown };

/** ดึงไม่ครบ (หลังลองซ้ำแล้ว) — โยนเฉพาะเมื่อผู้เรียกใส่ strict: true · got = จำนวนแถวที่ได้ก่อนพัง */
export class FetchAllError extends Error {
  readonly cause: unknown;
  readonly got: number;
  constructor(cause: unknown, got: number) {
    const detail = cause && typeof cause === "object" && "message" in cause ? String((cause as { message?: unknown }).message ?? "") : String(cause ?? "");
    super(`ดึงข้อมูลไม่ครบ (ได้ ${got} แถวก่อนพัง)${detail ? `: ${detail}` : ""}`);
    this.name = "FetchAllError";
    this.cause = cause;
    this.got = got;
  }
}

export type FetchAllOptions = {
  page?: number;
  maxRows?: number;
  /** หน้าไหนพัง ลองซ้ำกี่ครั้ง (ค่าเริ่มต้น 1) — ฐานข้อมูลช้าชั่วคราวมักผ่านในรอบสอง */
  retries?: number;
  /** รอก่อนลองซ้ำ (ms · ครั้งที่ n รอ n เท่า) */
  retryDelayMs?: number;
  /** true = ลองซ้ำแล้วยังพัง → โยน FetchAllError (ห้ามใช้ข้อมูลไม่ครบ) · false (เดิม) = คืนเท่าที่ได้ */
  strict?: boolean;
};

export async function fetchAllPages<T = Record<string, unknown>>(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: FetchAllOptions = {},
): Promise<T[]> {
  const page = Math.max(1, Math.min(1000, opts.page ?? 1000));
  const maxRows = opts.maxRows ?? 100_000;   // กันวนไม่รู้จบถ้าข้อมูลผิดปกติ
  const retries = Math.max(0, Math.min(3, opts.retries ?? 1));
  const delay = Math.max(0, opts.retryDelayMs ?? 400);
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += page) {
    let res = await makeQuery(from, from + page - 1);
    for (let i = 0; res.error && i < retries; i++) {
      if (delay) await new Promise((r) => setTimeout(r, delay * (i + 1)));
      res = await makeQuery(from, from + page - 1);
    }
    const { data, error } = res;
    if (error) {
      if (opts.strict) throw new FetchAllError(error, out.length);
      break;                              // พังกลางทาง → คืนเท่าที่ได้ (ผู้เรียกเห็นจำนวนน้อยลง ไม่ใช่พังทั้งหน้า)
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;        // หน้าสุดท้าย
  }
  return out;
}
