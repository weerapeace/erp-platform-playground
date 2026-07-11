"use client";

/**
 * ParentIssuesPanel — แผง "ปัญหาของสินค้า" (ผูกที่ Parent SKU, แชร์ทุกสี/ตัวลูก)
 *
 * ของกลาง วางได้ทุกจุด: ป๊อป QC (รายละเอียด/ส่งงาน/รับเข้า) · หน้า Parent SKU · ใบสั่งผลิต
 * ส่ง sku (ตัวลูก) หรือ parentSkuId ก็ได้ — API หา parent ให้เอง
 * editable=true → เพิ่ม/ลบได้ (เลือกจากสาเหตุกลาง หรือพิมพ์เอง)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { ParentIssue } from "@/app/api/parent-sku-issues/route";

type Reason = { id: string; name: string };

export function ParentIssuesPanel({ sku, parentSkuId, editable = false }: {
  sku?: string | null;
  parentSkuId?: string | null;
  editable?: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ParentIssue[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const q = parentSkuId ? `parent_sku_id=${encodeURIComponent(parentSkuId)}` : sku ? `sku=${encodeURIComponent(sku)}` : "";

  const load = useCallback(async () => {
    if (!q) { setItems([]); return; }
    setLoading(true);
    try { const j = await apiFetch(`/api/parent-sku-issues?${q}`).then((r) => r.json()); setItems((j.data ?? []) as ParentIssue[]); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { void load(); }, [load]);
  // โหลดสาเหตุกลาง (เฉพาะโหมดแก้ไข — ทำ dropdown)
  useEffect(() => {
    if (!editable) return;
    apiFetch("/api/qc-warehouse/reasons").then((r) => r.json()).then((j) => setReasons((j.data ?? []) as Reason[])).catch(() => {});
  }, [editable]);

  const add = async (payload: { reason_id?: string; problem_text?: string }) => {
    if (!q) return;
    setSaving(true);
    try {
      const body = { ...(parentSkuId ? { parent_sku_id: parentSkuId } : { sku }), ...payload };
      const j = await apiFetch("/api/parent-sku-issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      if (j.duplicated) toast.info("ปัญหานี้มีอยู่แล้ว");
      else toast.success("เพิ่มปัญหาแล้ว");
      setText("");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("ลบปัญหานี้ออกจากรายการ?")) return;
    try {
      const j = await apiFetch(`/api/parent-sku-issues?id=${id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  if (!sku && !parentSkuId) return null;

  return (
    <div className="pt-1 border-t border-slate-100">
      <div className="text-[11px] text-slate-500 mb-1.5">⚠️ ปัญหาของสินค้านี้ (รวมทุกสี){items.length > 0 ? ` (${items.length})` : ""}</div>
      {items.length === 0 && !loading && <div className="text-[11px] text-slate-300 mb-1">— ยังไม่มีปัญหาที่บันทึกไว้ —</div>}
      {items.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {items.map((it) => (
            <div key={it.id} className="text-[12px] flex items-center justify-between gap-2 rounded-md bg-amber-50/60 border border-amber-100 px-2 py-1">
              <span className="text-amber-800 truncate">⚠️ {it.problem_text}{it.source === "qc" ? <span className="text-[10px] text-amber-500"> · จาก QC</span> : null}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {it.created_by_name && <span className="text-[10px] text-slate-400 whitespace-nowrap">{it.created_by_name.split("@")[0]}</span>}
                {editable && <button onClick={() => void remove(it.id)} title="ลบ" className="text-slate-300 hover:text-rose-500 text-xs leading-none">✕</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div className="mt-1.5 flex items-center gap-1">
          <select value="" onChange={(e) => { if (e.target.value) void add({ reason_id: e.target.value }); }} disabled={saving}
            className="h-7 px-1.5 text-[11px] border border-slate-200 rounded-md bg-white text-slate-600 max-w-[42%]">
            <option value="">＋ เลือกสาเหตุ…</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) void add({ problem_text: text.trim() }); }}
            placeholder="หรือพิมพ์ปัญหาเอง…" disabled={saving}
            className="flex-1 min-w-0 h-7 px-2 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <button onClick={() => { if (text.trim()) void add({ problem_text: text.trim() }); }} disabled={saving || !text.trim()}
            className="h-7 px-2.5 text-[11px] font-medium bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-40 shrink-0">เพิ่ม</button>
        </div>
      )}
    </div>
  );
}
