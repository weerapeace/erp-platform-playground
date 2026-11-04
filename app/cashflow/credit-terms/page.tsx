"use client";

/**
 * 🗓️ ตั้งเครดิตลูกค้า / ร้านค้า (หลายรายพร้อมกัน)
 * URL: /cashflow/credit-terms
 *
 * ทำไมต้องมีหน้านี้: หน้ากระแสเงินสดต้องรู้ว่า "เงินจะเข้า/ออกวันไหน"
 * แต่ข้อมูลจริงตั้งเครดิตไว้แค่ลูกค้า 1/125 ราย · ร้านค้า 2/80 ราย → ระบบต้องเดาเกือบทั้งหมด
 * หน้านี้เรียงจาก "ยอดค้างมากสุด" ให้ตั้งไล่จากบนลงล่างรวดเดียว แล้วกดบันทึกครั้งเดียว
 *
 * ทั้งสองฝั่งใช้ช่องกรอกเครดิตของกลาง (components/purchase-credit-term-input) — เลือกแบบ + ใส่ตัวเลข X เอง
 *   (X วัน · ทุกวันที่ X เดือนที่สั่ง · วันที่ X เดือนถัดไป) · รายที่ตั้งแล้ว = อ่านอย่างเดียว กด "แก้ไข" ก่อนถึงเปลี่ยนได้
 * ลูกค้าเก็บที่ partners_v2.sales_credit_term · ร้านค้าเก็บที่ purchase_credit_term
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { InfoHint } from "@/components/info-hint";
import { usePermission, AccessDenied, useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { THB } from "@/lib/cashflow";
import { CREDIT_TERM_QUICK, formatCreditTerm } from "@/lib/credit-term";
import { CreditTermView, PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import type { CreditTermRow } from "@/app/api/cashflow/credit-terms/route";

type Side = "customer" | "supplier";


export default function CreditTermsPage() {
  const canView = usePermission("cashflow.view");
  const canManage = usePermission("cashflow.manage");
  const { permsReady } = useAuth();

  const [side, setSide] = useState<Side>("customer");
  const [rows, setRows] = useState<CreditTermRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string | null>>({});   // id → ค่าใหม่ (null = ยังไม่ตั้ง)
  const [editing, setEditing] = useState<Set<string>>(new Set());           // รายที่ตั้งแล้ว แต่กด "แก้ไข" อยู่
  const [incomplete, setIncomplete] = useState<Set<string>>(new Set());     // เลือกแบบแล้ว แต่ตัวเลขยังไม่ครบ/ผิด
  const [customFill, setCustomFill] = useState<string | null>(null);        // ค่า "กำหนดเอง" ของตัวช่วยเติมทีเดียว
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const load = useCallback((s: Side) => {
    setLoading(true); setErr(null); setMsg(null); setEdits({}); setEditing(new Set()); setIncomplete(new Set());
    apiFetch(`/api/cashflow/credit-terms?side=${s}`)
      .then((r) => r.json())
      .then((j) => { if (j?.error) setErr(j.error); else setRows((j.data ?? []) as CreditTermRow[]); })
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (canView) load(side); }, [canView, side, load]);

  const shown = useMemo(
    () => (onlyMissing ? rows.filter((r) => !r.current) : rows),
    [rows, onlyMissing],
  );

  const valueOf = (r: CreditTermRow): string | null => (r.id in edits ? edits[r.id] : (r.current ?? null));
  const changed = Object.entries(edits).filter(([id, v]) => {
    const row = rows.find((r) => r.id === id);
    return row && !incomplete.has(id) && (v ?? null) !== (row.current ?? null);
  });
  const setRowValue = (id: string, v: string | null, isIncomplete = false) => {
    setEdits((e) => ({ ...e, [id]: v }));
    setIncomplete((s0) => { const n = new Set(s0); if (isIncomplete) n.add(id); else n.delete(id); return n; });
  };
  const startEdit = (id: string) => setEditing((s0) => new Set(s0).add(id));
  const cancelEdit = (id: string) => {
    setEditing((s0) => { const n = new Set(s0); n.delete(id); return n; });
    setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
    setIncomplete((s0) => { const n = new Set(s0); n.delete(id); return n; });
  };

  /** เติมค่าเดียวกันให้ทุกรายที่ "ยังไม่ได้ตั้ง" — ตัวช่วยหลักของหน้านี้ */
  const fillMissing = (value: string) => {
    const next = { ...edits };
    const ids = shown.filter((r) => !r.current).map((r) => r.id);
    for (const id of ids) next[id] = value;
    setEdits(next);
    setIncomplete((s0) => { const n = new Set(s0); ids.forEach((id) => n.delete(id)); return n; });
  };

  const save = async () => {
    if (incomplete.size) { setErr(`ใส่ตัวเลขเครดิตไม่ครบ ${incomplete.size} ราย — แก้ช่องที่เป็นสีแดงก่อน`); return; }
    if (!changed.length) return;
    setSaving(true); setErr(null); setMsg(null);
    try {
      const res = await apiFetch("/api/cashflow/credit-terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, items: changed.map(([id, value]) => ({ id, value: value || null })) }),
      });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      const { updated, failed } = j.data as { updated: number; failed: number };
      setMsg(`บันทึกแล้ว ${updated} ราย${failed ? ` · ไม่สำเร็จ ${failed} ราย` : ""}`);
      load(side);
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (permsReady && !canView) {
    return <PlaygroundShell><AccessDenied message="หน้านี้เปิดให้เฉพาะผู้ที่มีสิทธิ์ดูข้อมูลการเงิน" /></PlaygroundShell>;
  }

  const missingCount = rows.filter((r) => !r.current).length;

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🗓️ ตั้งเครดิตลูกค้า / ร้านค้า</h1>
            <p className="text-slate-500 mt-1 text-sm">
              บอกระบบว่าแต่ละรายจ่ายกันกี่วัน — หน้า <Link href="/cashflow" className="text-blue-600 underline">กระแสเงินสด</Link> จะได้รู้ว่าเงินเข้า/ออกวันไหนจริง ๆ ไม่ต้องเดา
            </p>
          </div>
          <Link href="/cashflow" className="h-9 px-3.5 inline-flex items-center text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
            ← กลับหน้ากระแสเงินสด
          </Link>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {([["customer", "🧑‍💼 ลูกค้า (เงินเข้า)"], ["supplier", "🛒 ร้านค้า (เงินออก)"]] as [Side, string][]).map(([s, label]) => (
            <button key={s} onClick={() => setSide(s)}
                    className={`h-9 px-4 text-sm rounded-lg border transition-colors ${
                      side === s ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            แสดงเฉพาะที่ยังไม่ได้ตั้ง ({missingCount})
          </label>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-4">
        {err && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {err}</div>}
        {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">✅ {msg}</div>}

        {/* ---- ตัวช่วยเติมทีเดียว ---- */}
        {canManage && missingCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-blue-800">
              เติมให้ทุกรายที่ยังไม่ได้ตั้ง ({shown.filter((r) => !r.current).length} ราย) เป็น
            </span>
            {CREDIT_TERM_QUICK.map((t) => (
              <button key={t} onClick={() => fillMissing(t)}
                      className="h-8 px-3 text-xs bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100">
                {formatCreditTerm(t)}
              </button>
            ))}
            <span className="text-xs text-blue-700/70">หรือกำหนดเอง</span>
            <PurchaseCreditTermInput size="sm" value={customFill} onChange={(v) => setCustomFill(v)} />
            <button type="button" onClick={() => customFill && fillMissing(customFill)} disabled={!customFill}
                    className="h-8 px-3 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40">
              เติม
            </button>
            <InfoHint>เติมลงช่องให้ก่อนเฉย ๆ ยังไม่บันทึก — ปรับรายที่ไม่ตรงได้ แล้วค่อยกดปุ่มบันทึกด้านล่าง</InfoHint>
          </div>
        )}

        {loading && <div className="text-center text-slate-400 py-16">กำลังโหลด…</div>}

        {!loading && shown.length === 0 && (
          <div className="text-center text-slate-400 py-16 border border-dashed border-slate-200 rounded-xl">
            {onlyMissing ? "ตั้งครบทุกรายแล้ว 🎉" : "ไม่มีรายที่มีเอกสารค้างอยู่"}
          </div>
        )}

        {!loading && shown.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-[11px] text-slate-500">
                  <th className="text-left font-medium px-4 py-2.5">{side === "customer" ? "ลูกค้า" : "ร้านค้า"}</th>
                  <th className="text-right font-medium px-4 py-2.5">ใบค้าง</th>
                  <th className="text-right font-medium px-4 py-2.5">
                    {side === "customer" ? "ยอดค้างรับ" : "ยอดค้างจ่าย"}
                  </th>
                  <th className="text-left font-medium px-4 py-2.5 min-w-[340px]">เครดิต</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => {
                  const v = valueOf(r);
                  const bad = incomplete.has(r.id);
                  const isChanged = bad || (v ?? null) !== (r.current ?? null);
                  const isEditing = canManage && (!r.current || editing.has(r.id));
                  return (
                    <tr key={r.id} className={bad ? "bg-red-50/40" : isChanged ? "bg-amber-50/50" : ""}>
                      <td className="px-4 py-2">
                        <span className="font-medium text-slate-700">{r.name}</span>
                        {r.code && <span className="ml-1.5 text-[11px] text-slate-400 font-mono">{r.code}</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.openDocs}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-700">
                        {side === "supplier" ? THB(r.openAmount) + " *" : THB(r.openAmount)}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <div className="space-y-1">
                            <PurchaseCreditTermInput size="sm" value={v}
                              onChange={(nv, info) => setRowValue(r.id, nv, info?.incomplete ?? false)} />
                            <div className="flex items-center gap-2 text-[11px]">
                              {r.current ? (
                                <>
                                  <span className="text-slate-400">เดิม: {formatCreditTerm(r.current)}</span>
                                  <button type="button" onClick={() => cancelEdit(r.id)} className="text-slate-500 underline hover:text-slate-700">ยกเลิก</button>
                                </>
                              ) : <span className="text-amber-600">ยังไม่ตั้ง (ระบบเดาให้)</span>}
                            </div>
                          </div>
                        ) : r.current ? (
                          <CreditTermView value={r.current} onEdit={canManage ? () => startEdit(r.id) : undefined} />
                        ) : (
                          <span className="text-amber-600 text-xs">ยังไม่ตั้ง (ระบบเดาให้)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {side === "supplier" && !loading && shown.length > 0 && (
          <p className="text-xs text-slate-400">
            * ยอดค้างจ่ายของร้านจีนแสดงเป็นหยวนตามที่บันทึกในใบซื้อ (ใช้จัดอันดับว่าร้านไหนค้างเยอะ) — ยอดบาทจริงดูที่หน้ากระแสเงินสด
          </p>
        )}

        {canManage && (
          <div className="sticky bottom-0 bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-lg">
            <span className="text-sm text-slate-600">
              {changed.length ? `แก้ไว้ ${changed.length} ราย ยังไม่ได้บันทึก` : "ยังไม่มีการแก้"}
              {incomplete.size > 0 && <span className="ml-2 text-red-600">· ใส่ตัวเลขไม่ครบ {incomplete.size} ราย</span>}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setEdits({}); setEditing(new Set()); setIncomplete(new Set()); }} disabled={!changed.length && !incomplete.size && !editing.size}
                      className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                ล้างที่แก้
              </button>
              <button onClick={save} disabled={saving || !changed.length || incomplete.size > 0}
                      className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : `บันทึก ${changed.length || ""} ราย`}
              </button>
            </div>
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}
