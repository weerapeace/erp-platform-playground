/**
 * Payroll — ตั้งค่าหน้าตาการ์ดในผังพนักงาน (สีการ์ด / ระบายสีตามอะไร)
 *
 * GET   /api/payroll/board/config → { config }
 * PATCH /api/payroll/board/config { color_by, colors, show_photo }
 *
 * เก็บใน ui_config (key-value jsonb ของกลาง) key = payroll_board_card
 * เป็น "ค่าส่วนกลาง" — ตั้งครั้งเดียวทุกคนเห็นเหมือนกัน (เจ้าของเลือกไว้แบบนี้)
 * ต้องมีสิทธิ์ employees.edit ถึงจะแก้ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "payroll_board_card";

/** ระบายสีการ์ดตามอะไรได้บ้าง — คีย์นี้ใช้ตรงกันทั้งฝั่งหน้าจอและ API */
const COLOR_BY = new Set(["contract_type", "employment_status", "department", "position"]);

export type BoardCardConfig = {
  color_by: string;
  colors: Record<string, string>;   // ค่าของหมวด (เช่น permanent) → hex
  show_photo: boolean;
};

const DEFAULTS: BoardCardConfig = {
  color_by: "contract_type",
  colors: {
    permanent: "#8b5cf6",          // ประจำ — ม่วง
    regular_external: "#f97316",   // ประจำ (นอกระบบ) — ส้ม
    daily: "#10b981",              // รายวัน — เขียว
    contractor: "#0ea5e9",         // ช่างเหมา — ฟ้า
    hourly: "#f59e0b",             // รายชั่วโมง — เหลือง
  },
  show_photo: true,
};

const isHex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
    const saved = ((data as { value?: Record<string, unknown> } | null)?.value ?? {}) as Partial<BoardCardConfig>;
    const config: BoardCardConfig = {
      color_by: COLOR_BY.has(String(saved.color_by)) ? String(saved.color_by) : DEFAULTS.color_by,
      colors: { ...DEFAULTS.colors, ...(saved.colors ?? {}) },
      show_photo: saved.show_photo !== false,
    };
    return NextResponse.json({ config, defaults: DEFAULTS, error: null });
  } catch (e) {
    return NextResponse.json({ config: DEFAULTS, error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: Partial<BoardCardConfig>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // กรองเฉพาะค่าที่ยอมรับได้ (กันเขียนอะไรแปลก ๆ ลง jsonb)
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.colors ?? {})) if (isHex(v)) colors[k] = String(v).toLowerCase();
  const value: BoardCardConfig = {
    color_by: COLOR_BY.has(String(body.color_by)) ? String(body.color_by) : DEFAULTS.color_by,
    colors,
    show_photo: body.show_photo !== false,
  };

  try {
    const { error } = await supabaseAdmin().from("ui_config")
      .upsert({ key: KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ config: { ...value, colors: { ...DEFAULTS.colors, ...colors } }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
