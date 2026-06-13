import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { SOLine } from "../route";

// ---- POST — สร้าง SO จากหลายแหล่ง ----
// รับ header + lines (UI รวมรายการจากใบเสนอราคา/ใบสั่งผลิตมาแล้ว) + quote_ids ที่จะปิดเป็น "ผ่าน"
// เรียก RPC กลาง erp_playground_so_create_with_quotes: สร้าง SO + เปลี่ยนใบเสนอราคาเป็น converted แบบ atomic
// ตรรกะ/สิทธิ์ (so.create, qt.accept) ตรวจในตัว RPC

type Body = {
  header:    Record<string, unknown>;
  lines:     SOLine[];
  quote_ids?: string[];
  actor?:    string;
};

export async function POST(request: NextRequest) {
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_so_create_with_quotes", {
    p_header:    body.header ?? {},
    p_lines:     body.lines ?? [],
    p_quote_ids: body.quote_ids ?? [],
    p_actor:     body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
