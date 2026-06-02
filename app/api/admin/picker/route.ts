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

  // build select
  const selectCols = ["id", label];
  if (secondary && secondary !== label) selectCols.push(secondary);
  // try is_active (best effort — fail silently if not exist)
  selectCols.push("is_active");

  let query = supabase.from(table).select(selectCols.join(", ")).limit(limit);
  if (hasFilter) query = query.eq(filterCol, filterVal);

  // search filter
  if (search) {
    const fields = (searchIn && searchIn.length > 0 ? searchIn : [label])
      .filter((f) => SAFE_FIELD.test(f));
    if (fields.length > 0) {
      const orFilter = fields.map((f) => `${f}.ilike.%${search}%`).join(",");
      query = query.or(orFilter);
    }
  }

  // include extra ids (current value of relation) — append as separate query
  let { data, error } = await query;

  // retry without is_active if column doesn't exist
  if (error && error.message.includes("is_active")) {
    let fb = supabase.from(table)
      .select(selectCols.filter((c) => c !== "is_active").join(", "))
      .limit(limit);
    if (hasFilter) fb = fb.eq(filterCol, filterVal);
    if (search) {
      const fields = (searchIn && searchIn.length > 0 ? searchIn : [label]).filter((f) => SAFE_FIELD.test(f));
      if (fields.length > 0) fb = fb.or(fields.map((f) => `${f}.ilike.%${search}%`).join(","));
    }
    const fallback = await fb;
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  let rows = (data ?? []) as unknown as Record<string, unknown>[];

  // เติม "include_ids" — load extra records ที่ไม่ match search แต่ต้องการโชว์เป็น current value
  if (includeIds && includeIds.length > 0) {
    const missingIds = includeIds.filter((id) => !rows.some((r) => r.id === id));
    if (missingIds.length > 0) {
      const sel = selectCols.filter((c) => c !== "is_active").join(", ");
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
