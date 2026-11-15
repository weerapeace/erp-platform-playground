"use client";

/**
 * ทะเบียน Description ของใบส่งของจากขนส่ง — แต่ละแบบคิดค่าส่งจาก "คิว" หรือ "กก."
 * ★ 2026-11-15 เจ้าของ: "Description คือตัวบอกว่าคำนวนจาก คิว หรือ กก · ต้องมีหน้าบันทึกกลางว่าแต่ละอันคำนวนแบบไหน"
 *   - ดึง Description ทุกแบบที่ AI เคยอ่านเจอในใบส่งของ (กี่ครั้ง · ล่าสุด · เคยเลือกคิว/กก. กี่ครั้ง) — ยังไม่ตั้ง ขึ้นก่อน
 *   - กด คิว / กก. = บันทึกเป็นกฎกลาง (ตาราง freight_description_rules เดิม) + เติมกล่องที่ยังว่างในใบส่งของที่ยังไม่ได้ใช้
 * วางที่: หน้า /m/freight-description-rules (เหนือตารางกฎ) · API /api/purchasing/freight-descriptions
 * ยังไม่ทำ: อัปโหลดประวัติเดือนก่อน ๆ (รอดูไฟล์ตัวอย่างจากเจ้าของ)
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { LoadingState, ErrorState } from "@/components/state-views";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { triggerRefresh, useRefresh } from "@/lib/refresh-bus";
import { formatDate } from "@/lib/date";

type Seen = { description: string; count: number; last: string | null; cube: number; weight: number; rule: { keyword: string; method: "cube" | "weight" } | null };
const M_LABEL = { cube: "คิว", weight: "กก." } as const;
const M_CLS = { cube: "bg-sky-50 text-sky-700 border-sky-200", weight: "bg-violet-50 text-violet-700 border-violet-200" } as const;

export function FreightDescriptionRegistry() {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("products.edit");
  const [rows, setRows] = useState<Seen[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiFetch("/api/purchasing/freight-descriptions");
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setRows((j.data ?? []) as Seen[]);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useRefresh(() => { void load(); });   // แก้กฎในตารางด้านล่าง (ป๊อปกลาง) → ทะเบียนนี้โหลดใหม่

  const setMethod = async (description: string, method: "cube" | "weight") => {
    setBusy(description);
    try {
      const res = await apiFetch("/api/purchasing/freight-descriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, method, source: "registry" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`บันทึกแล้ว: ${description} = ${M_LABEL[method]}${j.backfilled ? ` · เติมให้ใบส่งของที่ยังไม่ได้ใช้ ${j.backfilled} กล่อง` : ""}`);
      triggerRefresh();   // ตารางกฎด้านล่าง + ทะเบียนนี้โหลดใหม่
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  const cols: MiniColumn<Seen>[] = [
    { key: "d", header: "Description", width: "minmax(10rem,2fr)", sortValue: (r) => r.description, cell: (r) => <span className="font-mono text-xs text-slate-800">{r.description}</span> },
    { key: "n", header: "เจอ (กล่อง)", align: "right", width: "6rem", sortValue: (r) => r.count, cell: (r) => <span className="tabular-nums">{r.count.toLocaleString()}</span> },
    { key: "last", header: "ล่าสุด", width: "7rem", sortValue: (r) => r.last ?? "", cell: (r) => <span className="text-xs text-slate-500">{r.last ? formatDate(r.last) : "—"}</span> },
    { key: "hist", header: "เคยเลือกในใบ", width: "8rem", cell: (r) => (r.cube || r.weight)
      ? <span className="text-[11px] text-slate-500" title="กล่องในใบส่งของที่เคยเลือกวิธีคิดไว้">คิว {r.cube} · กก. {r.weight}</span>
      : <span className="text-[11px] text-slate-300">—</span> },
    { key: "rule", header: "คิดจาก", width: "9.5rem", sortValue: (r) => (r.rule ? 1 : 0), cell: (r) => r.rule ? (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <span className={`text-[11px] px-1.5 py-0.5 rounded border ${M_CLS[r.rule.method]}`}>{M_LABEL[r.rule.method]}</span>
        {r.rule.keyword !== r.description && <span className="text-[10px] text-slate-400" title="ใช้กฎที่มีคำนี้อยู่">ตามกฎ {r.rule.keyword}</span>}
      </span>
    ) : <span className="text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">ยังไม่ตั้ง</span> },
    ...(canEdit ? [{ key: "set", header: "ตั้งเป็น", width: "8rem", cell: (r: Seen) => {
      const exact = r.rule && r.rule.keyword === r.description ? r.rule.method : null;
      return (
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
          {(["cube", "weight"] as const).map((m, k) => (
            <button key={m} type="button" disabled={busy === r.description} onClick={() => void setMethod(r.description, m)}
              title={`บันทึกเป็นกฎ: ${r.description} = ${M_LABEL[m]}`}
              className={`h-7 px-2.5 text-[11px] ${k ? "border-l border-slate-200" : ""} ${exact === m ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-50`}>{M_LABEL[m]}</button>
          ))}
        </div>
      );
    } }] : []),
  ];

  const todo = (rows ?? []).filter((r) => !r.rule).length;
  return (
    <div className="px-4 pt-4 md:px-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">ทะเบียน Description (ใบส่งของจากขนส่ง)</span>
          {rows && <span className={`text-[11px] px-1.5 py-0.5 rounded border ${todo ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{todo ? `ยังไม่ตั้ง ${todo}` : "ตั้งครบแล้ว"}</span>}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Description ทุกแบบที่ AI เคยอ่านเจอในใบส่งของ — ตั้งว่าคิดค่าส่งจาก คิว หรือ กก. แล้วใบส่งของใหม่ระบบเลือกให้เอง · ในหน้าใบสำคัญรับกด &quot;จำ&quot; ข้างช่องคิดค่าส่งจาก ก็มาลงที่นี่</p>
        <div className="mt-3">
          {rows == null && !err ? <LoadingState className="!py-6" />
            : err ? <ErrorState hint={err} onRetry={() => void load()} className="!p-6" />
            : <MiniTable rows={rows ?? []} rowKey={(r) => r.description} columns={cols} hideToolbar zebra={false} dense
                emptyText={<span className="text-xs">ยังไม่มีใบส่งของที่อ่านแล้ว — แนบใบส่งของในหน้าใบสำคัญรับ แล้ว Description จะขึ้นที่นี่</span>} />}
        </div>
      </div>
    </div>
  );
}
