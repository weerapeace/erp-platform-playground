import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

// ทะเบียนเดิม (ตาราง erp_plugins กรอกมือ 19 ตัว) — อ่านอย่างเดียว ใช้ที่แท็บ "ทะเบียนเดิม" ของ /admin/plugins
// 2026-11-07 เอา PATCH (สวิตช์เปิด/ปิด + แก้ settings) ออกแล้ว ตามที่เจ้าของสั่ง — ไม่มีโค้ดไหนอ่าน enabled/settings
// ตาราง + RPC ในฐานข้อมูลยังอยู่ครบ (ไม่ได้ลบ) · ทะเบียนตัวจริงย้ายไป lib/shared-parts-registry.ts

// ---- Types ----

export type Plugin = {
  key:            string;
  label:          string;
  description:    string | null;
  category:       "UI" | "Data" | "Workflow" | "Integration" | "Admin";
  icon:           string;
  version:        string;
  enabled:        boolean;
  used_in:        string[];
  permission_key: string | null;
  settings:       Record<string, unknown>;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
};

export type PluginsResponse = {
  data:  Plugin[];
  error: string | null;
};

// ---- GET ?category= ----

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "plugins.view");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const { data, error } = await supabaseFromRequest(request).rpc("erp_plugins_list", {
    p_category: category || null, p_enabled_only: false,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies PluginsResponse, { status: 500 });
  return NextResponse.json({ data: (data as Plugin[]) ?? [], error: null } satisfies PluginsResponse);
}
