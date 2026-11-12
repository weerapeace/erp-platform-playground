"use client";

/**
 * ลิ้นชัก "ประวัติของรายการนี้" (ของกลาง) — กดชื่อรายการในหน้าประวัติ แล้วเห็นทุกอย่างที่เคยเกิดกับรายการนั้น เรียงตามเวลา
 * ใช้ได้ทุกหน้า: <RecordHistoryDrawer target={{ entityType, entityId, title, href }} onClose={...} />
 * ข้อมูลจาก /api/audit-logs?entity_type&entity_id (ค่าอ่อนไหวซ่อนตามสิทธิ์ที่ API แล้ว)
 * ฝังในฟอร์ม/ป๊อป (ไม่เปิดลิ้นชักซ้อน): <RecordHistoryInline entityType entityId /> · โหลดเอง: useRecordHistory(target) — ตัวโหลดเดียวกัน
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/modal";
import { Icon } from "@/components/icon";
import { ErrorState } from "@/components/state-views";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import { apiFetch } from "@/lib/api";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";

export type RecordHistoryTarget = {
  entityType: string;
  entityId: string;
  /** หัวลิ้นชัก เช่น "PR-2026-00872 · หัวซิปฟันเหล็ก#5" */
  title: string;
  /** "จัดซื้อ · ใบขอซื้อ" */
  subtitle?: string;
  /** ลิงก์เปิดหน้ารายการ (ถ้ามี) */
  href?: string | null;
};

/** โหลดประวัติของรายการเดียว (ใช้ร่วม: ลิ้นชัก + แบบฝัง) · target = null = ไม่โหลด */
export function useRecordHistory(target: { entityType: string; entityId: string } | null) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ entity_type: target.entityType, entity_id: target.entityId, limit: "200", noise: "1" });
      const res = await apiFetch(`/api/audit-logs?${p}`);
      const json: AuditLogsResponse = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "โหลดประวัติไม่สำเร็จ");
      setEntries(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => { if (target) { setEntries([]); void load(); } }, [target, load]);
  return { entries, loading, error, reload: load };
}

/** ประวัติแบบฝังในป๊อป/ฟอร์ม (ไม่มีลิ้นชัก) — ใหม่สุดอยู่บน */
export function RecordHistoryInline({ entityType, entityId, emptyMessage = "ยังไม่มีประวัติ" }: { entityType: string; entityId: string; emptyMessage?: string }) {
  const target = useMemo(() => ({ entityType, entityId }), [entityType, entityId]);
  const { entries, loading, error, reload } = useRecordHistory(target);
  return error ? <ErrorState hint={error} onRetry={reload} retrying={loading} />
    : <ActivityFeed entries={entries} loading={loading} hideRecord compact emptyMessage={emptyMessage} />;
}

export function RecordHistoryDrawer({ target, onClose }: { target: RecordHistoryTarget | null; onClose: () => void }) {
  const { entries, loading, error, reload: load } = useRecordHistory(target);

  return (
    <Drawer open={!!target} onClose={onClose} size="lg" storageKey="audit-record-history"
      title={target ? `ประวัติ: ${target.title}` : "ประวัติ"}
      description={target?.subtitle}
      headerActions={target?.href ? () => (
        <a href={target.href ?? undefined} target="_blank" rel="noreferrer"
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700">
          <Icon name="open" size={14} /> เปิดหน้ารายการ
        </a>
      ) : undefined}>
      <div className="p-5">
        {error ? (
          <ErrorState hint={error} onRetry={load} retrying={loading} />
        ) : (
          <>
            {!loading && entries.length > 0 && (
              <p className="text-xs text-slate-500 mb-3">ทั้งหมด {entries.length.toLocaleString("th-TH")} รายการ · ใหม่สุดอยู่บน</p>
            )}
            <ActivityFeed entries={entries} loading={loading} hideRecord emptyMessage="ยังไม่มีประวัติของรายการนี้" />
          </>
        )}
      </div>
    </Drawer>
  );
}
