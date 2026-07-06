"use client";

/**
 * ตั้งค่าแจ้งเตือน LINE ของบอร์ดจ่ายงาน + โกดัง QC (ของกลาง)
 * ตั้งกลุ่ม 2 slot (production/qc) — จับ group id ล่าสุดจาก webhook หรือวางเอง + ทดสอบ + แก้ข้อความแม่แบบ
 * ใช้ /api/board-line-group · เปิดจากปุ่ม "🔔 แจ้งเตือน" บนบอร์ด
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";

type Ev = { key: string; label: string; slot: string; vars: string[] };
type Data = { captured: string; captured_at: string | null; groups: Record<string, string>; has_token: boolean; templates: Record<string, string>; events: Ev[] };
const SLOTS = ["production", "qc"] as const;
const SLOT_LABEL: Record<string, string> = { production: "🏭 กลุ่มผลิต (บอร์ดจ่ายงาน)", qc: "🔍 กลุ่ม QC (โกดัง QC)" };

export function BoardLineSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState<Record<string, string>>({});
  const [tpl, setTpl] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/board-line-group"); const j = await r.json(); if (j.error) throw new Error(j.error); setData(j as Data); setTpl((j.templates ?? {}) as Record<string, string>); setPaste({}); }
    catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [toast]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try { const r = await apiFetch("/api/board-line-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success(okMsg); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="board-line-settings" title="🔔 ตั้งค่าแจ้งเตือน LINE (บอร์ดจ่ายงาน + QC)"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>}>
      {!data ? <div className="text-center py-10 text-slate-400">กำลังโหลด…</div> : (
        <div className="space-y-4">
          {!data.has_token && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">⚠️ ยังไม่มีโทเคนบอท LINE ในระบบ (ต้องตั้งที่ตั้งค่า LINE ของ china-pay ก่อน)</div>}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <b>วิธีตั้งกลุ่ม:</b> 1) เชิญบอท LINE เข้ากลุ่ม → 2) พิมพ์อะไรก็ได้ในกลุ่ม → 3) กด <button onClick={() => void load()} className="underline text-indigo-600">รีเฟรช</button> แล้วกด "ใช้กลุ่มล่าสุด" ที่ช่องกลุ่มที่ต้องการ
            {data.captured && <div className="mt-1 text-slate-400">กลุ่มล่าสุดที่บอทเห็น: <code className="text-[10px]">{data.captured}</code>{data.captured_at ? ` · ${new Date(data.captured_at).toLocaleString("th-TH")}` : ""}</div>}
          </div>

          {SLOTS.map((slot) => {
            const cur = data.groups[slot] ?? "";
            return (
              <div key={slot} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-slate-700">{SLOT_LABEL[slot]}</span>
                  {cur ? <span className="text-[11px] text-emerald-600">✓ ตั้งแล้ว</span> : <span className="text-[11px] text-slate-400">ยังไม่ตั้ง</span>}
                </div>
                {cur && <div className="text-[11px] text-slate-400 mb-1.5 truncate">กลุ่มปัจจุบัน: <code className="text-[10px]">{cur}</code></div>}
                <div className="flex items-center gap-2 flex-wrap">
                  {data.captured && data.captured !== cur && <button disabled={busy} onClick={() => post({ slot, group_id: data.captured }, "ตั้งกลุ่มแล้ว")} className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">ใช้กลุ่มล่าสุด</button>}
                  <input value={paste[slot] ?? ""} onChange={(e) => setPaste((p) => ({ ...p, [slot]: e.target.value }))} placeholder="วาง group id เอง (Cxxxx…)" className="h-8 px-2 text-xs border border-slate-200 rounded-lg flex-1 min-w-[140px] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <button disabled={busy || !(paste[slot] ?? "").trim()} onClick={() => post({ slot, group_id: paste[slot] }, "บันทึกกลุ่มแล้ว")} className="h-8 px-3 text-xs border border-slate-200 rounded-lg disabled:opacity-40">บันทึก</button>
                  {cur && <button disabled={busy} onClick={() => post({ slot, test: true }, "ส่งข้อความทดสอบแล้ว")} className="h-8 px-3 text-xs border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40">ทดสอบ</button>}
                  {cur && <button disabled={busy} onClick={() => post({ slot, clear: true }, "ล้างกลุ่มแล้ว")} className="h-8 px-3 text-xs border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-40">ล้าง</button>}
                </div>
              </div>
            );
          })}

          <details className="border border-slate-200 rounded-lg">
            <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">✏️ แก้ข้อความแจ้งเตือน (ไม่บังคับ — เว้นว่าง = ใช้ข้อความเริ่มต้น)</summary>
            <div className="p-3 space-y-3 border-t border-slate-100">
              {data.events.map((ev) => (
                <div key={ev.key}>
                  <div className="text-[12px] font-medium text-slate-600 mb-1">{ev.label}</div>
                  <textarea value={tpl[ev.key] ?? ""} onChange={(e) => setTpl((t) => ({ ...t, [ev.key]: e.target.value }))} rows={3} placeholder="(เว้นว่าง = ใช้ข้อความเริ่มต้น)"
                    className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <div className="flex flex-wrap gap-1 mt-1">{ev.vars.map((v) => (
                    <button key={v} type="button" onClick={() => setTpl((t) => ({ ...t, [ev.key]: (t[ev.key] ?? "") + `{${v}}` }))} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600">{`{${v}}`}</button>
                  ))}</div>
                </div>
              ))}
              <button disabled={busy} onClick={() => post({ templates: tpl }, "บันทึกข้อความแล้ว")} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">💾 บันทึกข้อความ</button>
            </div>
          </details>
        </div>
      )}
    </ERPModal>
  );
}
