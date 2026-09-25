import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type NumberingRule = {
  key:               string;
  label:             string;
  pattern:           string;
  reset_policy:      "never" | "yearly" | "monthly";
  current_value:     number;
  last_reset_period: string | null;
  notes:             string | null;
  active:            boolean;
  created_at:        string;
  updated_at:        string;
  /** ♻️ นำเลขของใบที่ยกเลิกกลับมาใช้ — เลขถัดไป = เลขว่างที่เล็กสุดในงวด (ไม่นับใบ status=cancelled)
   *  ตั้งได้เฉพาะชุดที่ผูกตารางเอกสารไว้ (recycle_table/recycle_column ตั้งจาก migration) · optional เผื่อ DB ยังไม่ได้อัปเดต */
  recycle_cancelled?: boolean;
  recycle_table?:     string | null;
  recycle_column?:    string | null;
};

export type NumberingResponse = {
  data:    NumberingRule[];
  preview: Record<string, string | null>;   // key → next number (without consuming)
  /** key → เลขว่างในงวดนี้ที่จะถูกหยิบใช้ก่อน (เฉพาะชุดที่เปิด recycle) */
  gaps:    Record<string, string[]>;
  error:   string | null;
};

// ---- GET /api/numbering — list rules + preview next number ----

export async function GET(request: NextRequest) {
  const client = supabaseFromRequest(request);
  const { data, error } = await client.rpc("erp_numbering_rules_list");
  if (error) {
    return NextResponse.json({ data: [], preview: {}, gaps: {}, error: error.message } satisfies NumberingResponse, { status: 500 });
  }
  const rules = (data as NumberingRule[]) ?? [];
  // preview each + เลขว่างของชุดที่เปิด recycle
  const preview: Record<string, string | null> = {};
  const gaps: Record<string, string[]> = {};
  for (const r of rules) {
    const { data: p } = await client.rpc("erp_numbering_preview", { p_key: r.key });
    preview[r.key] = (p as string) ?? null;
    if (r.recycle_table && r.recycle_cancelled) {
      const { data: g } = await client.rpc("erp_numbering_gaps", { p_key: r.key });
      gaps[r.key] = (g as string[]) ?? [];
    }
  }
  return NextResponse.json({ data: rules, preview, gaps, error: null } satisfies NumberingResponse);
}

// ---- PATCH /api/numbering — upsert rule ----

type UpsertBody = {
  key:                string;
  label:              string;
  pattern:            string;
  reset_policy:       "never" | "yearly" | "monthly";
  active?:            boolean;
  notes?:             string;
  recycle_cancelled?: boolean;
};

export async function PATCH(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.key || !body.label || !body.pattern) {
    return NextResponse.json({ error: "key, label, pattern จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_numbering_rules_upsert", {
    p_key:          body.key,
    p_label:        body.label,
    p_pattern:      body.pattern,
    p_reset_policy: body.reset_policy,
    p_active:       body.active ?? true,
    p_notes:        body.notes ?? null,
    // ส่งเฉพาะตอนหน้าจอตั้งค่ามา (ไม่ส่ง = คงค่าเดิมใน DB)
    ...(typeof body.recycle_cancelled === "boolean" ? { p_recycle_cancelled: body.recycle_cancelled } : {}),
  });

  if (error) {
    console.error("[api/numbering] PATCH", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}
