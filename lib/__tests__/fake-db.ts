/**
 * ฐานข้อมูลจำลองในหน่วยความจำ สำหรับ test ตัวเชื่อม DB (ไม่แตะฐานข้อมูลจริง — ห้ามสร้างออเดอร์/คูปองทดสอบใน DB จริง)
 * รองรับเท่าที่โค้ดเราใช้: select (ไม่สนคอลัมน์ · แถวต้องมีตารางลูกที่ embed ใส่มาเอง) · eq/neq/in/gte/is/or/like · order/limit · maybeSingle · count
 * เขียน: insert (แถวเดียว/หลายแถว · ใส่ id/created_at ให้ถ้าไม่มี · ต่อ .select().maybeSingle() ได้) · delete().eq() · update(patch).eq()(.select()) — แก้ตาราง tables ที่ส่งมาเลย (test อ่านผลได้)
 * rpc = ฟังก์ชันที่ test ส่งมาเอง (เลียนแบบฟังก์ชัน DB จริง)
 */
export type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

/** "a.eq.true,b.not.is.null" → เงื่อนไข (รองรับ eq · is.null · not.is.null) */
function orFilter(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const [col, ...rest] = p.split(".");
    const op = rest.join(".");
    if (op === "not.is.null") return (r: Row) => r[col] !== null && r[col] !== undefined;
    if (op === "is.null") return (r: Row) => r[col] === null || r[col] === undefined;
    if (op.startsWith("eq.")) return (r: Row) => String(r[col]) === op.slice(3);
    throw new Error("fake-db or: " + p);
  });
  return (r) => parts.some((f) => f(r));
}

export function fakeDb(tables: Record<string, Row[]>, rpc: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let head = false;
    let inserted: Row[] | null = null;
    let del = false;
    let upd: Row | null = null;
    let updated: Row[] | null = null;
    const rows = () => updated ?? inserted ?? (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (del) tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
      // แก้แถวที่ตรงเงื่อนไข "ครั้งเดียว" (ตอน await) → ผลลัพธ์ = แถวที่ถูกแก้ (เหมือน .update().select())
      if (upd && !updated) {
        updated = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        for (const r of updated) Object.assign(r, upd);
      }
    };
    const q = {
      insert: (v: Row | Row[]) => {
        const list = (Array.isArray(v) ? v : [v]).map((r, i) => ({ id: `${table}-${(tables[table]?.length ?? 0) + i + 1}`, created_at: "2026-10-20T00:00:00Z", ...r }));
        (tables[table] ??= []).push(...list);
        inserted = list;
        return q;
      },
      delete: () => ((del = true), q),
      update: (patch: Row) => ((upd = patch), q),
      like: (c: string, pat: string) => {
        const re = new RegExp("^" + pat.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
        filters.push((r) => re.test(String(r[c] ?? "")));
        return q;
      },
      select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
      is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
      or: (expr: string) => (filters.push(orFilter(expr)), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[] | null; count: number; error: null }) => unknown) => {
        run();
        return res({ data: head || del ? null : rows(), count: rows().length, error: null });
      },
    };
    return q;
  };
  return {
    from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (!rpc[fn]) throw new Error("fake-db rpc " + fn);
      return { data: await rpc[fn](args), error: null };
    },
  };
}
