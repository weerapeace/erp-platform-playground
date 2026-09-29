"use client";

/**
 * ParentIssuesPanel — แผง "ปัญหาของสินค้า" (ผูกที่ Parent SKU, แชร์ทุกสี/ตัวลูก)
 *
 * ของกลาง วางได้ทุกจุด: ป๊อป QC (รายละเอียด/ส่งงาน/รับเข้า) · หน้า Parent SKU · ใบสั่งผลิต
 * ส่ง sku (ตัวลูก) หรือ parentSkuId ก็ได้ — API หา parent ให้เอง
 * editable=true → เพิ่ม/แก้/ลบได้ (เลือกจากสาเหตุกลาง หรือพิมพ์เอง) · ปัญหาที่มาจาก QC แก้ข้อความไม่ได้ (ลบได้)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { ParentIssue } from "@/app/api/parent-sku-issues/route";

type Reason = { id: string; name: string };

export function ParentIssuesPanel({ sku, parentSkuId, editable = false, bare = false }: {
  sku?: string | null;
  parentSkuId?: string | null;
  editable?: boolean;
  bare?: boolean;   // true = ไม่มีเส้นคั่นบน (ใช้เป็นแท็บ/หน้าเต็ม) · false = ต่อท้ายเนื้อหาอื่นในป๊อป
}) {
  const toast = useToast();
  const [items, setItems] = useState<ParentIssue[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [ed, setEd] = useState<{ id: string; text: string } | null>(null);   // ✏️ แก้ในแถว
  const [delAsk, setDelAsk] = useState<string | null>(null);                 // 🗑 ถามยืนยันในแถว (ไม่ใช้ป๊อปซ้อน — แผงนี้อยู่ในป๊อปหลายชั้น)

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

  const saveEdit = async () => {
    if (!ed || !ed.text.trim()) return;
    setSaving(true);
    try {
      const j = await apiFetch("/api/parent-sku-issues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ed.id, problem_text: ed.text.trim() }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success("แก้ปัญหาแล้ว");
      setEd(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setDelAsk(null);
    try {
      const j = await apiFetch(`/api/parent-sku-issues?id=${id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  if (!sku && !parentSkuId) return null;

  return (
    <div className={bare ? "" : "pt-1 border-t border-slate-100"}>
      <div className="text-[11px] text-slate-500 mb-1.5">⚠️ ปัญหาของสินค้านี้ (รวมทุกสี){items.length > 0 ? ` (${items.length})` : ""}</div>
      {items.length === 0 && !loading && <div className="text-[11px] text-slate-300 mb-1">— ยังไม่มีปัญหาที่บันทึกไว้ —</div>}
      {items.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {items.map((it) => ed?.id === it.id ? (
            <div key={it.id} className="flex items-center gap-1 rounded-md bg-blue-50/60 border border-blue-200 px-1.5 py-1">
              <input value={ed.text} autoFocus onChange={(e) => setEd({ ...ed, text: e.target.value })} disabled={saving}
                onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); if (e.key === "Escape") setEd(null); }}
                className="flex-1 min-w-0 h-6 px-1.5 text-[12px] border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <button onClick={() => void saveEdit()} disabled={saving || !ed.text.trim()} className="h-6 px-2 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 shrink-0">บันทึก</button>
              <button onClick={() => setEd(null)} disabled={saving} className="h-6 px-1.5 text-[11px] border border-slate-200 bg-white rounded text-slate-500 shrink-0">ยกเลิก</button>
            </div>
          ) : (
            <div key={it.id} className="text-[12px] flex items-center justify-between gap-2 rounded-md bg-amber-50/60 border border-amber-100 px-2 py-1">
              <span className="text-amber-800 truncate">⚠️ {it.problem_text}{it.source === "qc" ? <span className="text-[10px] text-amber-500"> · จาก QC</span> : null}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {it.created_by_name && delAsk !== it.id && <span className="text-[10px] text-slate-400 whitespace-nowrap">{it.created_by_name.split("@")[0]}</span>}
                {editable && it.source !== "qc" && delAsk !== it.id && <button onClick={() => setEd({ id: it.id, text: it.problem_text })} title="แก้ข้อความ" className="text-slate-300 hover:text-blue-600 text-xs leading-none">✏️</button>}
                {editable && (delAsk === it.id ? (
                  <>
                    <button onClick={() => void remove(it.id)} className="h-5 px-1.5 text-[10px] bg-rose-600 text-white rounded hover:bg-rose-700">ยืนยันลบ</button>
                    <button onClick={() => setDelAsk(null)} className="h-5 px-1.5 text-[10px] border border-slate-200 bg-white rounded text-slate-500">ไม่ลบ</button>
                  </>
                ) : <button onClick={() => setDelAsk(it.id)} title="ลบ" className="text-slate-300 hover:text-rose-500 text-xs leading-none">✕</button>)}
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
