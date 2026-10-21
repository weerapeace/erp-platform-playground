import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditLogPermissionFor } from "@/lib/audit-log-access";

// ---- Types ----

export type AuditLogEntry = {
  id:          string;
  action:      string;   // create | update | delete | ...
  entity_type: string;
  entity_id:   string | null;
  actor_name:  string;
  metadata:    Record<string, unknown>;
  created_at:  string;
  total_count: number;
};

export type AuditLogsResponse = {
  data:  AuditLogEntry[];
  total: number;
  error: string | null;
};

// ---- GET /api/audit-logs ----
//
// Query params:
//   entity_type — filter (เช่น erp_playground_product)
//   entity_id   — เฉพาะ record เดียว (uuid)
//   action      — create | update | delete
//   limit / offset
// สิทธิ์: ดูทั้งระบบ/หมวดอ่อนไหว = admin.audit_log · ประวัติรายการเดียว/หมวดทั่วไป = พนักงานที่ล็อกอิน (lib/audit-log-access)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const entityId   = searchParams.get("entity_id");
  const action     = searchParams.get("action");
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const denied = await guardApi(request, auditLogPermissionFor({ entityType, entityId })); if (denied) return denied;

  const { data, error } = await supabaseAdmin().rpc("erp_playground_get_audit_logs", {
    p_entity_type: entityType || null,
    p_entity_id:   entityId   || null,
    p_action:      action     || null,
    p_limit:       limit,
    p_offset:      offset,
  });

  if (error) {
    console.error("[api/audit-logs] GET", error);
    return NextResponse.json(
      { data: [], total: 0, error: error.message } satisfies AuditLogsResponse,
      { status: 500 }
    );
  }

  const rows = (data as AuditLogEntry[]) ?? [];
  return NextResponse.json({
    data:  rows,
    total: Number(rows[0]?.total_count ?? 0),
    error: null,
  } satisfies AuditLogsResponse);
}
