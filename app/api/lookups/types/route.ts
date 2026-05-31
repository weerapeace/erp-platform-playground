/**
 * Lookup Types — GET list ของ type ทั้งหมด (สำหรับ admin UI dropdown)
 * POST — สร้าง type ใหม่ (admin only — ใส่ permission ทีหลัง)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type LookupType = {
  lookup_type: string;
  label:       string;
  icon:        string | null;
  description: string | null;
  is_system:   boolean;
  has_parent:  boolean;
  created_at:  string;
};

const SAFE = /^[a-z_][a-z0-9_]*$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from("erp_lookup_types")
    .select("lookup_type, label, icon, description, is_system, has_parent, created_at")
    .order("is_system", { ascending: false })
    .order("label",     { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<LookupType> & { lookup_type?: string; label?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const type  = (body.lookup_type ?? "").toLowerCase().trim();
  const label = (body.label ?? "").trim();
  if (!type || !SAFE.test(type)) return NextResponse.json({ error: "invalid lookup_type — ใช้ตัวอักษร a-z + _" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from("erp_lookup_types")
    .insert({
      lookup_type: type,
      label,
      icon:        body.icon ?? null,
      description: body.description ?? null,
      is_system:   false,
      has_parent:  body.has_parent ?? false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
