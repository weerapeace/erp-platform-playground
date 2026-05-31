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

export type TableLayout = {
  table_id:           string;
  label:              string;
  description:        string | null;
  columns:            TableLayoutColumn[];
  default_density:    "normal" | "compact";
  default_page_size:  number;
  default_view_mode:  "table" | "cards";
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
