export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Type ----

export type FieldRegistryEntry = {
  field_key:     string;
  field_label:   string;
  ui_type:       string;   // "text" | "currency" | "number" | "boolean" | "date"
  group_key:     string;   // "core" | "relation" | "product" | "pricing" | "status" | "system" | "content" | "supplier"
  is_visible:    boolean;
  is_filterable: boolean;
  is_sortable:   boolean;
  is_sensitive:  boolean;
  col_width:     number;
};

export type FieldRegistryResponse = {
  data:  FieldRegistryEntry[];
  error: string | null;
};

// ---- GET /api/field-registry/product-skus ----

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_get_product_skus_fields");

  if (error) {
    console.error("[api/field-registry/product-skus] GET", error);
    return NextResponse.json(
      { data: [], error: error.message } satisfies FieldRegistryResponse,
      { status: 500 }
    );
  }

  return NextResponse.json({
    data:  data as FieldRegistryEntry[],
    error: null,
  } satisfies FieldRegistryResponse);
}

// ---- PATCH /api/field-registry/product-skus ----
//
// Body: { field_key, field_label?, group_key?, is_visible?,
//         is_filterable?, is_sortable?, col_width?, display_order? }
//
// อัปเดตได้เฉพาะ field metadata — แตะข้อมูลสินค้าไม่ได้
// ผ่าน erp_playground_update_product_field() (SECURITY DEFINER)

type UpdateBody = {
  field_key:      string;
  field_label?:   string;
  group_key?:     string;
  is_visible?:    boolean;
  is_filterable?: boolean;
  is_sortable?:   boolean;
  col_width?:     number;
  display_order?: number;
};

export async function PATCH(request: NextRequest) {
  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.field_key) {
    return NextResponse.json({ error: "field_key is required" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_update_product_field", {
    p_field_key:     body.field_key,
    p_field_label:   body.field_label   ?? null,
    p_group_key:     body.group_key     ?? null,
    p_is_visible:    body.is_visible    ?? null,
    p_is_filterable: body.is_filterable ?? null,
    p_is_sortable:   body.is_sortable   ?? null,
    p_col_width:     body.col_width     ?? null,
    p_display_order: body.display_order ?? null,
  });

  if (error) {
    console.error("[api/field-registry/product-skus] PATCH", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null });
}
