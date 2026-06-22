/**
 * Generic Picker options endpoint — Sprint 5
 *
 * GET /api/admin/picker?table=brands&label=name&search=foo&limit=20
 *   options: secondary=size_text   (โชว์ field รอง)
 *            search_in=name,code   (override default search fields)
 *            include_ids=uuid1,uuid2  (รวม id เหล่านี้แม้ไม่ match search — สำหรับโชว์ค่าปัจจุบัน)
 *
 * Return: [{ id, label, secondary?, active? }]
 *
 * ใช้กับ RelationPicker ที่ admin ติ๊ก relation_config ใน /admin/schema-sync
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type PickerOption = {
  id:         string;
  label:      string;
  secondary?: string;
  active?:    boolean;
};

const SAFE_TABLE = /^[a-z_][a-z0-9_]*$/i;
const SAFE_FIELD = /^[a-z_][a-z0-9_]*$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const table     = searchParams.get("table") ?? "";
  const label     = searchParams.get("label") ?? "name";
  const secondary = searchParams.get("secondary");
  const search    = (searchParams.get("search") ?? "").trim();
  const searchIn  = searchParams.get("search_in")?.split(",").filter(Boolean);
  const includeIds = searchParams.get("include_ids")?.split(",").filter(Boolean);
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  // กรองตายตัวตามคอลัมน์ (เช่น shop_country=จีน) — โชว์เฉพาะที่ตรง
  const filterCol = searchParams.get("filter_col") ?? "";
  const filterVal = searchParams.get("filter_val");
  const hasFilter = !!filterCol && filterVal != null && SAFE_FIELD.test(filterCol);

  if (!SAFE_TABLE.test(table) || !SAFE_FIELD.test(label) || (secondary && !SAFE_FIELD.test(secondary))) {
    return NextResponse.json({ data: [], error: "invalid table/field name" }, { status: 400 });
  }

  const supabase = supabaseFromRequest(request);

  // ฟิลด์ที่ใช้ค้น + แตกคำค้นเป็น token (ค้นกลางคำ/ข้ามตัวคั่นได้)
  const searchFields = (searchIn && searchIn.length > 0 ? searchIn : [label]).filter((f) => SAFE_FIELD.test(f));
  const tokens = search ? search.split(/[\s\-_#/.,()]+/).map((t) => t.replace(/[%_()*,]/g, "")).filter(Boolean).slice(0, 6) : [];
  const searching = tokens.length > 0 && searchFields.length > 0;

  // build select (รวมฟิลด์ค้นไว้ให้คะแนน "ตัวเป๊ะ")
  const selectSet = new Set<string>(["id", label, ...searchFields]);
  if (secondary && secondary !== label) selectSet.add(secondary);
  const selectCols = [...selectSet];

  // ตอนค้น: ดึงผู้สมัครมากกว่า limit แล้วค่อยจัดอันดับ/ตัด · token ทุกตัวต้องเจอ (AND) อยู่ฟิลด์ใดก็ได้ (OR)
  const cap = searching ? Math.max(limit, 60) : limit;
  const buildQuery = (withActive: boolean) => {
    let q = supabase.from(table).select([...(withActive ? [...selectCols, "is_active"] : selectCols)].join(", ")).limit(cap);
    if (hasFilter) q = q.eq(filterCol, filterVal);
    if (searching) for (const t of tokens) q = q.or(searchFields.map((f) => `${f}.ilike.%${t}%`).join(","));
    return q;
  };

  let { data, error } = await buildQuery(true);
  if (error && error.message.includes("is_active")) {   // ตารางไม่มี is_active → ลองใหม่ไม่เอา
    const fallback = await buildQuery(false);
    data = fallback.data; error = fallback.error;
  }

  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  let rows = (data ?? []) as unknown as Record<string, unknown>[];

  // จัดอันดับ "ตัวที่เหมือนที่สุด" ขึ้นก่อน (ตรงเป๊ะ → ขึ้นต้น → มีคำตรง) แล้วตัดเหลือ limit
  if (searching) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]/gi, "");
    const S = norm(search);
    const nTokens = tokens.map(norm).filter(Boolean);
    const scoreOf = (r: Record<string, unknown>): number => {
      let best = 0;
      for (const f of searchFields) {
        const v = norm(String(r[f] ?? "")); if (!v) continue;
        if (S && v === S) best = Math.max(best, 1_000_000);
        else if (S && v.startsWith(S)) best = Math.max(best, 900_000 - v.length);
        else if (S && v.includes(S)) best = Math.max(best, 800_000 - v.length);
        else { let s = 0; nTokens.forEach((t, i) => { if (v.startsWith(t)) s += 200 - i * 5; else if (v.includes(t)) s += 100 - i * 5; }); best = Math.max(best, s); }
      }
      return best;
    };
    rows = rows.map((r) => ({ r, s: scoreOf(r) })).sort((a, b) => b.s - a.s || String(a.r[label] ?? "").localeCompare(String(b.r[label] ?? ""), "th")).slice(0, limit).map((x) => x.r);
  }

  // เติม "include_ids" — load extra records ที่ไม่ match search แต่ต้องการโชว์เป็น current value
  if (includeIds && includeIds.length > 0) {
    const missingIds = includeIds.filter((id) => !rows.some((r) => r.id === id));
    if (missingIds.length > 0) {
      const sel = selectCols.join(", ");
      const extra = await supabase.from(table).select(sel).in("id", missingIds);
      if (extra.data) rows = [...((extra.data as unknown) as Record<string, unknown>[]), ...rows];
    }
  }

  const opts: PickerOption[] = rows.map((r) => ({
    id:        String(r.id),
    label:     String(r[label] ?? ""),
    secondary: secondary ? (r[secondary] != null ? String(r[secondary]) : undefined) : undefined,
    active:    typeof r.is_active === "boolean" ? r.is_active : undefined,
  }));

  return NextResponse.json({ data: opts, error: null });
}
