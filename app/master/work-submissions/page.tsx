"use client";

/**
 * ตารางส่งงาน — รายการที่ช่างส่งงานเสร็จกลับมา (จาก wo_submissions)
 * คอลัมน์: ช่างที่ผลิต · วันที่ส่ง · กำหนดส่ง · จำนวน · ค่าแรง (+ SKU/สินค้า/ใบผลิต/ใบจ่ายงาน)
 * ข้อมูลชุดนี้คือสิ่งที่ไหลเข้าโกดัง QC
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { WoSubmission } from "@/app/api/mo/submissions/route";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const dueText = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";

export default function WorkSubmissionsPage() {
  const canView = usePermission("products.view");
  const toast = useToast();
  const [rows, setRows] = useState<WoSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [undoRow, setUndoRow] = useState<WoSubmission | null>(null);
  // แท็บ: ทั้งหมด / ⏳ ยังไม่ครบ (ส่งไว้ก่อน ยังไม่ลงวันที่-ค่าแรง)
  const [tab, setTab] = useState<"all" | "pending">("all");
  const [pendingCount, setPendingCount] = useState(0);
  // ป๊อปเติมข้อมูลที่ค้าง
  const [fillRow, setFillRow] = useState<WoSubmission | null>(null);
  const [fillDate, setFillDate] = useState("");
  const [fillRate, setFillRate] = useState("");
  const [fillSaving, setFillSaving] = useState(false);
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const canEdit = usePermission("products.edit");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `search=${encodeURIComponent(search)}${tab === "pending" ? "&pending=1" : ""}`;
      const r = await apiFetch(`/api/mo/submissions?${qs}`); const j = await r.json(); if (j.error) throw new Error(j.error);
      setRows(j.data ?? []);
      // นับ "ยังไม่ครบ" ไว้โชว์บนแท็บเสมอ
      const rp = await apiFetch("/api/mo/submissions?pending=1").then((x) => x.json()).catch(() => ({ data: [] }));
      setPendingCount((rp.data ?? []).length);
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [search, tab, toast]);
  useEffect(() => { void load(); }, [load]);

  const totalQty = useMemo(() => rows.reduce((s, r) => s + Number(r.qty || 0), 0), [rows]);
  const totalWage = useMemo(() => rows.reduce((s, r) => s + Number(r.wage || 0), 0), [rows]);

  const saveFill = async () => {
    if (!fillRow) return;
    const rate = Number(fillRate) || 0;
    if (!(rate > 0)) { toast.error("ใส่ค่าแรงต่อใบก่อน"); return; }
    setFillSaving(true);
    try {
      const wage = Math.round(rate * Number(fillRow.qty) * 100) / 100;   // เก็บเป็นยอดรวมเหมือนรายการปกติ
      const r = await apiFetch("/api/mo/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fillRow.id, submitted_at: fillDate || undefined, wage, info_pending: false }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`เติมข้อมูลแล้ว · ค่าแรงรวม ฿${fmt(wage)}`);
      setFillRow(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setFillSaving(false); }
  };

  const confirmUndo = async () => {
    if (!undoRow) return;
    try { const r = await apiFetch(`/api/mo/submissions?id=${undoRow.id}`, { method: "DELETE" }); const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success("ย้อนกลับแล้ว — งานกลับไปที่บอร์ดจ่ายงาน"); setUndoRow(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); setUndoRow(null); }
  };

  if (!canView) return <AccessDenied />;

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">📤 ตารางส่งงาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">รายการที่ช่างส่งงานเสร็จกลับมา · ข้อมูลชุดนี้ไหลเข้าโกดัง QC</p>
        </div>
        <a href="/master/work-board" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">← บอร์ดจ่ายงาน</a>
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          <button onClick={() => setTab("all")} className={`h-9 px-3 font-medium ${tab === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 ทั้งหมด</button>
          <button onClick={() => setTab("pending")} title="ส่งงานไว้ก่อน ยังไม่ลงวันที่/ค่าแรง"
            className={`h-9 px-3 font-medium border-l border-slate-200 ${tab === "pending" ? "bg-amber-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            ⏳ ยังไม่ครบ{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="ค้นหา ช่าง / SKU / ใบผลิต / ใบจ่ายงาน… (Enter)" className="w-full max-w-sm h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">รวม {fmt(totalQty)} ชิ้น · ค่าแรง {fmt(totalWage)} บาท</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[12px] text-slate-500"><tr className="text-left">
            <th className="px-3 py-2 font-medium">ช่างที่ผลิต</th>
            <th className="px-3 py-2 font-medium">สินค้า (SKU)</th>
            <th className="px-3 py-2 font-medium">ใบผลิต / ใบจ่ายงาน</th>
            <th className="px-3 py-2 font-medium">วันที่ส่ง</th>
            <th className="px-3 py-2 font-medium">กำหนดส่ง</th>
            <th className="px-3 py-2 font-medium text-right">จำนวน</th>
            <th className="px-3 py-2 font-medium text-right">ค่าแรง</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">กำลังโหลด…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">{tab === "pending" ? "ไม่มีรายการค้าง — ลงวันที่/ค่าแรงครบหมดแล้ว 🎉" : "ยังไม่มีการส่งงาน"}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700">👷 {r.craftsman_name ?? r.department_name ?? "—"}</td>
                <td className="px-3 py-2"><div className="text-slate-700">{r.sku_name ?? "—"}</div><div className="text-[11px] text-slate-400 font-mono">{r.sku}</div></td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{r.mo_no ?? "—"}<br />{r.wo_no ?? ""}</td>
                <td className="px-3 py-2 text-slate-600">
                  {r.info_pending
                    ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">⏳ รอลงวันที่</span>
                    : dueText(r.submitted_at)}
                </td>
                <td className="px-3 py-2 text-slate-600">{dueText(r.due_date)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(Number(r.qty))}</td>
                <td className="px-3 py-2 text-right text-slate-700">{r.wage != null ? fmt(Number(r.wage)) : <span className="text-amber-600 text-[11px]">รอลง</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {canEdit && r.info_pending && (
                    <button onClick={() => { setFillRow(r); setFillDate(r.submitted_at || todayStr()); setFillRate(""); }}
                      className="text-[12px] px-2 py-1 mr-1 rounded-md bg-amber-500 text-white hover:bg-amber-600">✏️ เติมข้อมูล</button>
                  )}
                  {canEdit && <button onClick={() => setUndoRow(r)} className="text-[12px] px-2 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50">↩️ ย้อนกลับ</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✏️ เติมข้อมูลที่ค้าง (วันที่ + ค่าแรงต่อใบ) */}
      <ERPModal open={fillRow !== null} onClose={() => !fillSaving && setFillRow(null)} size="sm" title="✏️ เติมวันที่ + ค่าแรง"
        footer={<>
          <button onClick={() => setFillRow(null)} disabled={fillSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void saveFill()} disabled={fillSaving || !(Number(fillRate) > 0)} className="h-9 px-4 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">{fillSaving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </>}>
        {fillRow && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{fillRow.sku_name ?? fillRow.sku}</div>
              <div className="text-[11px] text-slate-400 font-mono">{fillRow.sku} · {fillRow.mo_no} · 👷 {fillRow.craftsman_name ?? fillRow.department_name ?? "—"}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">ส่งไว้ <b className="text-slate-700">{fmt(Number(fillRow.qty))}</b> ใบ</div>
            </div>
            <label className="block">
              <span className="text-[11px] text-slate-500">วันที่ส่งงานจริง</span>
              <input type="date" value={fillDate} onChange={(e) => setFillDate(e.target.value)} className="w-full h-10 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">ค่าแรง / ใบ (บาท)</span>
              <input type="number" min={0} step="any" autoFocus value={fillRate} onChange={(e) => setFillRate(e.target.value)} placeholder="0"
                className="w-full h-10 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg" />
            </label>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px]">
              <span className="text-emerald-800">ค่าแรงรวมที่จะบันทึก</span>
              <b className="text-emerald-700 tabular-nums">{fmt(Number(fillRow.qty))} × ฿{fmt(Number(fillRate) || 0)} = ฿{fmt(Math.round((Number(fillRate) || 0) * Number(fillRow.qty) * 100) / 100)}</b>
            </div>
            <p className="text-[11px] text-slate-400">บันทึกแล้วรายการจะหลุดจากแท็บ “ยังไม่ครบ” และค่าแรงจะไปอัปเดตที่ใบจ่ายงานให้ด้วย</p>
          </div>
        )}
      </ERPModal>

      {/* ยืนยันย้อนกลับ (ลบรายการส่งงาน) */}
      <ERPModal open={undoRow !== null} onClose={() => setUndoRow(null)} size="sm" title="↩️ ย้อนกลับการส่งงาน"
        footer={<>
          <button onClick={() => setUndoRow(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={confirmUndo} className="h-9 px-4 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">ยืนยันย้อนกลับ</button>
        </>}>
        {undoRow && (
          <div className="space-y-2 text-sm text-slate-600">
            <p>ย้อนการส่งงานนี้กลับ (กรณีส่งผิด)?</p>
            <p className="text-[12px] text-slate-500"><b className="text-slate-700">{undoRow.sku_name}</b> · {undoRow.sku} · จำนวน {fmt(Number(undoRow.qty))} · ค่าแรง {undoRow.wage != null ? fmt(Number(undoRow.wage)) : "—"}</p>
            <p className="text-[11px] text-amber-600">งานจะกลับไปที่บอร์ดจ่ายงาน · ถ้าถูกดึงเข้าโกดัง QC แล้วจะย้อนไม่ได้ (ต้องเอาออกจากโกดัง QC ก่อน)</p>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
