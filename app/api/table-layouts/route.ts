import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type TableLayoutColumn = {
  key:     string;
  label:   string;
  visible: boolean;
  order:   number;
  width?:  number;
  pinned?: "left" | "right" | null;
};

// ค่าเริ่มต้นตารางแบบขยายได้ (เก็บใน settings jsonb) — ของกลาง
export type SortSpec = { column: string; dir: "asc" | "desc" };
export type SummaryType = "sum" | "count" | "avg";
export type RowColorOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "empty" | "not_empty";
export type RowColorRule = {
  column: string;
  op:     RowColorOp;
  value?: string;                 // ไม่ใช้กับ empty/not_empty
  color:  string;                 // คีย์สี: red|orange|amber|green|blue|purple|slate
};
export type TableLayoutSettings = {
  default_sort?:               SortSpec | null;
  secondary_sort?:             SortSpec | null;
  default_filter_active_only?: boolean;            // เปิดมาเห็นเฉพาะที่ใช้งานอยู่ (ซ่อน archived)
  group_by?:                   string | null;      // คอลัมน์จัดกลุ่มเริ่มต้น
  summaries?:                  Record<string, SummaryType>;  // column → ชนิดสรุปท้ายตาราง
  row_color_rules?:            RowColorRule[];      // ระบายสีแถวตามเงื่อนไข (กฎแรกที่เข้าเงื่อนไขชนะ)
  actions?:                    { export?: boolean; import?: boolean; create?: boolean; bulk?: boolean }; // undefined/true = แสดง
};

export type TableLayout = {
  table_id:           string;
  label:              string;
  description:        string | null;
  columns:            TableLayoutColumn[];
  default_density:    "normal" | "compact";
  default_page_size:  number;
  default_view_mode:  "table" | "cards";
  settings:           TableLayoutSettings;
  notes:              string | null;
  created_at:         string;
  updated_at:         string;
};

export type TableLayoutResponse = {
  data:  TableLayout | null;
  error: string | null;
};

// ---- GET ?table_id=... — DataTable เรียก ----

export async function GET(request: NextRequest) {
  const tableId = new URL(request.url).searchParams.get("table_id");
  if (!tableId) return NextResponse.json({ data: null, error: "table_id required" } satisfies TableLayoutResponse, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_table_layouts_get", {
    p_table_id: tableId,
  });
  if (error) {
    return NextResponse.json({ data: null, error: error.message } satisfies TableLayoutResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as TableLayout | null) ?? null, error: null } satisfies TableLayoutResponse);
}
