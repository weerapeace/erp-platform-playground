"use client";

/**
 * นับสต๊อก (/inventory/count) — เปิดรอบนับ → ถ่ายยอดปัจจุบัน → กรอกจำนวนจริง → เทียบส่วนต่าง → ปรับอัตโนมัติ
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { WarehousePicker, SkuPicker } from "@/components/pickers";
import type { WarehousePickerValue } from "@/components/pickers";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { CountSession, CountLine } from "@/app/api/inventory/count/route";

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

const STATUS: Record<string, { label: string; cls: string }> = {
  counting: { label: "กำลังนับ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  applied:  { label: "ปรับแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled:{ label: "ยกเลิก",  cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export default function CountPage() {
  const canView = usePermission("stock.view");
  const canAdjust = usePermission("stock.adjust");

  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // เปิดรอบใหม่
  const [openWh, setOpenWh] = useState<WarehousePickerValue | null>(null);
  const [opening, setOpening] = useState(false);

  // รอบที่กำลังดู
  const [active, setActive] = useState<{ session: CountSession; lines: CountLine[] } | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [addKey, setAddKey] = useState(0);
  const scanRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/inventory/count");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setSessions(j.sessions as CountSession[]);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) loadSessions(); }, [canView, loadSessions]);

  const openSession = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/inventory/count?id=${id}`);
    const j = await res.json();
    if (j.error) { setError(j.error); return; }
    setActive({ session: j.session, lines: j.lines });
    const init: Record<string, string> = {};
    (j.lines as CountLine[]).forEach((l) => { init[l.id] = l.counted_qty == null ? "" : String(l.counted_qty); });
    setCounted(init);
  }, []);

  const openNew = async () => {
    if (!openWh) { setError("เลือกคลังก่อน"); return; }
    setOpening(true); setError(null);
    try {
      const res = await apiFetch("/api/inventory/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", warehouse_id: openWh.id }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      flash("เปิดรอบนับแล้ว — ถ่ายยอดปัจจุบันเรียบร้อย");
      await loadSessions();
      await openSession(j.id);
    } catch (e) { setError(e instanceof Error ? e.message : "เปิดรอบไม่สำเร็จ"); }
    finally { setOpening(false); }
  };

  const saveLine = async (line: CountLine, raw: string) => {
    const val = raw.trim() === "" ? null : Number(raw);
    if (val != null && !isFinite(val)) return;
    await apiFetch("/api/inventory/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", line_id: line.id, counted_qty: val }) }).catch(() => {});
  };

  const applyCount = async () => {
    if (!active) return;
    setApplying(true);
    try {
      const res = await apiFetch("/api/inventory/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", count_id: active.session.id }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      flash(`ปรับสต๊อกแล้ว ${j.adjusted} รายการ`);
      setConfirmApply(false);
      await loadSessions();
      await openSession(active.session.id);
    } catch (e) { setError(e instanceof Error ? e.message : "ปรับไม่สำเร็จ"); }
    finally { setApplying(false); }
  };

  const upsertLine = (line: CountLine) => {
    setActive((a) => {
      if (!a) return a;
      const has = a.lines.some((l) => l.id === line.id);
      return { ...a, lines: has ? a.lines.map((l) => (l.id === line.id ? line : l)) : [line, ...a.lines] };
    });
    setCounted((m) => ({ ...m, [line.id]: line.counted_qty == null ? "" : String(line.counted_qty) }));
  };
  const doScan = async () => {
    const code = scanCode.trim();
    if (!code || !active) return;
    setScanCode("");
    try {
      const res = await apiFetch("/api/inventory/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", count_id: active.session.id, code }) });
      const j = await res.json();
      if (j.error) { setError(j.error); return; }
      if (!j.found) { setError(`ไม่พบบาร์โค้ด/รหัส: ${code}`); return; }
      upsertLine(j.line); setError(null);
      flash(`✓ ${j.line.product_sku} — นับแล้ว ${fmt(j.line.counted_qty)}`);
    } catch { setError("สแกนไม่สำเร็จ"); }
    finally { scanRef.current?.focus(); }
  };
  const addLine = async (productId: string) => {
    if (!active) return;
    try {
      const res = await apiFetch("/api/inventory/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_line", count_id: active.session.id, product_id: productId }) });
      const j = await res.json();
      if (j.error) { setError(j.error); return; }
      upsertLine(j.line); setAddKey((k) => k + 1); flash("เพิ่มสินค้าแล้ว");
    } catch { setError("เพิ่มไม่สำเร็จ"); }
  };
  const deleteLine = async (lineId: string) => {
    if (!active) return;
    setActive((a) => (a ? { ...a, lines: a.lines.filter((l) => l.id !== lineId) } : a));
    setCounted((m) => { const n = { ...m }; delete n[lineId]; return n; });
    try {
      const res = await apiFetch("/api/inventory/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_line", line_id: lineId }) });
      const j = await res.json();
      if (j.error) { setError(j.error); await openSession(active.session.id); }
    } catch { await openSession(active.session.id); }
  };

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  // ส่วนต่างของรอบที่กำลังดู
  const diffCount = active ? active.lines.filter((l) => { const c = counted[l.id]; return c !== "" && c != null && Number(c) !== l.system_qty; }).length : 0;
  const isApplied = active?.session.status === "applied";

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🔢 นับสต๊อก</h1>
            <p className="text-sm text-slate-500 mt-0.5">เปิดรอบนับ → ถ่ายยอด → กรอกจำนวนจริง → ปรับให้ตรง (อัตโนมัติ + มีประวัติ)</p>
          </div>
          <a href="/inventory" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">📦 รายการสต๊อก</a>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {!active ? (
          <>
            {/* เปิดรอบใหม่ */}
            <div className="mb-5 p-4 bg-white border border-slate-200 rounded-xl">
              <div className="text-sm font-medium text-slate-700 mb-2">เปิดรอบนับใหม่</div>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="w-64">
                  <span className="text-xs text-slate-500">เลือกคลังที่จะนับ</span>
                  <div className="mt-1"><WarehousePicker value={openWh} onChange={setOpenWh} /></div>
                </div>
                <button onClick={openNew} disabled={opening || !openWh}
                  className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {opening ? "กำลังเปิด…" : "เปิดรอบนับ"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">💡 ระบบจะ &ldquo;ถ่ายยอดปัจจุบัน&rdquo; ของคลังไว้ แล้วให้เดินนับกรอกจำนวนจริง</p>
            </div>

            {/* ลิสต์รอบนับ */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left font-medium px-3 py-2">เลขรอบ</th>
                  <th className="text-left font-medium px-3 py-2">คลัง</th>
                  <th className="text-left font-medium px-3 py-2">สถานะ</th>
                  <th className="text-left font-medium px-3 py-2">วันที่</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">กำลังโหลด…</td></tr>
                  ) : sessions.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">ยังไม่มีรอบนับ — เปิดรอบใหม่ด้านบน</td></tr>
                  ) : sessions.map((s) => {
                    const st = STATUS[s.status] ?? STATUS.counting;
                    return (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-mono text-xs">{s.count_no}</td>
                        <td className="px-3 py-2">{s.warehouse_name ?? s.warehouse_code ?? "—"}</td>
                        <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span></td>
                        <td className="px-3 py-2 text-xs text-slate-500">{s.created_at?.slice(0, 10)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => openSession(s.id)} className="text-xs px-2.5 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50">
                            {s.status === "applied" ? "ดู" : "นับต่อ"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* หัวรอบนับ */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => { setActive(null); loadSessions(); }} className="text-sm text-slate-500 hover:text-slate-700">← กลับรายการรอบนับ</button>
              {!isApplied && canAdjust && (
                <button onClick={() => setConfirmApply(true)} disabled={diffCount === 0}
                  className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                  ✔ ยืนยันปรับตามนับ {diffCount > 0 && `(${diffCount} รายการต่าง)`}
                </button>
              )}
            </div>
            <div className="mb-3 p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-4 flex-wrap">
              <div><span className="text-[11px] text-slate-400">เลขรอบ</span><div className="font-mono text-sm">{active.session.count_no}</div></div>
              <div><span className="text-[11px] text-slate-400">คลัง</span><div className="text-sm">{active.session.warehouse_name ?? active.session.warehouse_code}</div></div>
              <div><span className="text-[11px] text-slate-400">สถานะ</span><div><span className={`text-[11px] px-2 py-0.5 rounded border ${(STATUS[active.session.status] ?? STATUS.counting).cls}`}>{(STATUS[active.session.status] ?? STATUS.counting).label}</span></div></div>
              <div><span className="text-[11px] text-slate-400">รายการ</span><div className="text-sm">{active.lines.length} SKU</div></div>
            </div>

            {/* สแกนบาร์โค้ด + เพิ่มสินค้า */}
            {!isApplied && (
              <div className="mb-3 p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <span className="text-xs font-medium text-slate-600">📷 สแกนบาร์โค้ด (นับ +1 อัตโนมัติ)</span>
                  <input ref={scanRef} value={scanCode} autoFocus
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void doScan(); } }}
                    placeholder="ยิงบาร์โค้ด หรือพิมพ์รหัส SKU แล้วกด Enter"
                    className="mt-1 w-full h-10 px-3 border border-blue-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div className="w-60">
                  <span className="text-xs font-medium text-slate-600">➕ หรือค้นหาเพิ่มสินค้า</span>
                  <div className="mt-1"><SkuPicker key={addKey} value={null} onChange={(v) => { if (v) void addLine(v.id); }} /></div>
                </div>
              </div>
            )}

            {/* ตารางนับ */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left font-medium px-3 py-2">SKU</th>
                  <th className="text-left font-medium px-3 py-2">สินค้า</th>
                  <th className="text-right font-medium px-3 py-2">ยอดระบบ</th>
                  <th className="text-right font-medium px-3 py-2 w-28">นับได้จริง</th>
                  <th className="text-right font-medium px-3 py-2">ส่วนต่าง</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr></thead>
                <tbody>
                  {active.lines.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">คลังนี้ไม่มีสินค้าให้นับ</td></tr>
                  ) : active.lines.map((l) => {
                    const c = counted[l.id];
                    const has = c !== "" && c != null;
                    const diff = has ? Number(c) - l.system_qty : 0;
                    return (
                      <tr key={l.id} className="border-b border-slate-50">
                        <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{l.product_sku}</td>
                        <td className="px-3 py-1.5">{l.product_name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-mono text-slate-600">{fmt(l.system_qty)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" step="any" disabled={isApplied}
                            value={c ?? ""}
                            onChange={(e) => setCounted((m) => ({ ...m, [l.id]: e.target.value }))}
                            onBlur={(e) => saveLine(l, e.target.value)}
                            className="w-24 h-8 px-2 text-right text-sm border border-slate-200 rounded tabular-nums disabled:bg-slate-50 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none" />
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-mono text-xs ${!has ? "text-slate-300" : diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {has ? (diff > 0 ? `+${fmt(diff)}` : fmt(diff)) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {!isApplied && <button onClick={() => deleteLine(l.id)} title="ลบรายการนี้ออกจากรอบนับ" className="text-slate-300 hover:text-red-500 transition-colors p-1">🗑</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!isApplied && <p className="text-[11px] text-slate-400 mt-2">💡 กรอกจำนวนจริงที่นับได้ในแต่ละช่อง (บันทึกอัตโนมัติ) แล้วกด &ldquo;ยืนยันปรับตามนับ&rdquo; — ระบบจะปรับเฉพาะรายการที่ต่าง + บันทึกประวัติ</p>}
          </>
        )}

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      <ConfirmDialog open={confirmApply} onClose={() => setConfirmApply(false)} onConfirm={applyCount} loading={applying}
        title="ยืนยันปรับสต๊อกตามที่นับ?"
        message={`ระบบจะปรับยอดคงเหลือให้ตรงกับที่นับ เฉพาะ ${diffCount} รายการที่ต่างจากระบบ · การกระทำนี้จะสร้างประวัติการปรับ (ย้อนกลับได้ด้วยการปรับใหม่)`}
        confirmText="ยืนยันปรับ" variant="default" />
    </PlaygroundShell>
  );
}
