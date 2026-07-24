"use client";

/**
 * ศูนย์จัดการ LINE รวมทุกระบบ (ของกลาง) — เปิดจากปุ่ม "🔔 ศูนย์ LINE" บนหน้าผู้บริหาร
 * คุม china_app_settings.line_config ก้อนเดียว: โทเคนบอท · กลุ่มปลายทางทุกระบบ · เปิด/ปิดต่อเหตุการณ์
 * ใช้ /api/admin/line-console (gate admin.users) — สวิตช์ปิด = ตัวส่งจริงหยุดส่งทั้ง ERP
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import type { LineSystemDef, LineSlotDef, LineSlotKey } from "@/lib/line-registry";

type ConsoleData = {
  has_token: boolean; token_hint: string;
  captured: string; captured_at: string | null;
  groups: Record<string, string>;
  disabled_events: Record<string, boolean>;
  systems: LineSystemDef[];
  slots: Record<LineSlotKey, LineSlotDef>;
  error: string | null;
};

export function LineConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ConsoleData | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState<Record<string, string>>({});
  const [editToken, setEditToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/line-console"); const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j as ConsoleData); setPaste({}); setEditToken(false); setTokenInput("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [toast]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/line-console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(okMsg); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  // เปิด/ปิดเหตุการณ์ — optimistic (สลับทันที แล้วค่อยเซฟ, error ค่อยดึงใหม่)
  const toggleEvent = async (ev: string, enabled: boolean) => {
    setData((d) => d ? { ...d, disabled_events: { ...d.disabled_events, [ev]: !enabled } } : d);
    try {
      const r = await apiFetch("/api/admin/line-console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: ev, enabled }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สลับไม่สำเร็จ"); void load(); }
  };

  const slotList = data ? (Object.keys(data.slots) as LineSlotKey[]) : [];

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="line-console" title="🔔 ศูนย์จัดการ LINE — ทุกระบบ"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>}>
      {!data ? <div className="text-center py-10 text-slate-400">กำลังโหลด…</div> : (
        <div className="space-y-5">

          {/* ---- สถานะบอท + โทเคน ---- */}
          <div className={`rounded-xl border px-3 py-2.5 ${data.has_token ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🤖</span>
              <div className="flex-1 min-w-0">
                {data.has_token
                  ? <div className="text-sm font-semibold text-emerald-800">บอทพร้อมใช้ · มีโทเคนแล้ว <span className="font-normal text-emerald-600">({data.token_hint})</span></div>
                  : <div className="text-sm font-semibold text-amber-800">ยังไม่มีโทเคนบอท — ตั้งก่อนถึงจะส่งได้</div>}
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {data.captured
                    ? <>กลุ่มล่าสุดที่บอทเห็น: <code className="text-[10px]">{data.captured}</code>{data.captured_at ? ` · ${new Date(data.captured_at).toLocaleString("th-TH")}` : ""}</>
                    : "ยังไม่เห็นกลุ่ม — เชิญบอทเข้ากลุ่มแล้วพิมพ์อะไรก็ได้ 1 ครั้ง → กดรีเฟรช"}
                </div>
              </div>
              <button onClick={() => void load()} className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shrink-0">🔄</button>
              <button onClick={() => setEditToken((v) => !v)} className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shrink-0">{data.has_token ? "เปลี่ยนโทเคน" : "ตั้งโทเคน"}</button>
            </div>
            {editToken && (
              <div className="flex items-center gap-2 mt-2">
                <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="วาง Channel access token ของบอท"
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                <button disabled={busy || !tokenInput.trim()} onClick={() => post({ token: tokenInput }, "บันทึกโทเคนแล้ว")}
                  className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">บันทึก</button>
              </div>
            )}
          </div>

          {/* ---- กลุ่มปลายทาง (ทุก slot) ---- */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">กลุ่มปลายทาง ({slotList.length} ระบบ)</div>
            <div className="space-y-1.5">
              {slotList.map((slot) => {
                const def = data.slots[slot];
                const cur = data.groups[slot] ?? "";
                return (
                  <div key={slot} className="border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">{def.icon}</span>
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">{def.label}</span>
                      {cur ? <span className="text-[11px] text-emerald-600 shrink-0">✓ ตั้งแล้ว</span> : <span className="text-[11px] text-slate-400 shrink-0">ยังไม่ตั้ง</span>}
                    </div>
                    {cur && <div className="text-[11px] text-slate-400 mt-1 truncate pl-7">กลุ่ม: <code className="text-[10px]">{cur}</code></div>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 pl-7">
                      {data.captured && data.captured !== cur && (
                        <button disabled={busy} onClick={() => post({ slot, group_id: data.captured }, "ตั้งกลุ่มแล้ว")}
                          className="h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">ใช้กลุ่มล่าสุด</button>
                      )}
                      <input value={paste[slot] ?? ""} onChange={(e) => setPaste((p) => ({ ...p, [slot]: e.target.value }))} placeholder="วาง group id เอง (Cxxxx…)"
                        className="h-7 px-2 text-xs border border-slate-200 rounded-lg flex-1 min-w-[120px] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      <button disabled={busy || !(paste[slot] ?? "").trim()} onClick={() => post({ slot, group_id: paste[slot] }, "บันทึกกลุ่มแล้ว")}
                        className="h-7 px-2.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40">บันทึก</button>
                      {cur && <button disabled={busy} onClick={() => post({ slot, test: true }, "ส่งข้อความทดสอบแล้ว")}
                        className="h-7 px-2.5 text-xs border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40">ทดสอบ</button>}
                      {cur && <button disabled={busy} onClick={() => post({ slot, clear: true }, "ล้างกลุ่มแล้ว")}
                        className="h-7 px-2.5 text-xs border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-40">ล้าง</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- เปิด/ปิดแจ้งเตือนต่อเหตุการณ์ ---- */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">เปิด-ปิดแจ้งเตือนต่อเหตุการณ์</div>
            <div className="text-[11px] text-slate-400 mb-2">ปิดแล้ว &ldquo;หยุดส่งจริง&rdquo; ทั้ง ERP (กลุ่มยังตั้งไว้เหมือนเดิม)</div>
            <div className="space-y-3">
              {data.systems.filter((sys) => sys.events.length > 0).map((sys) => (
                <div key={sys.key}>
                  <div className="text-[12px] font-medium text-slate-600 mb-1 px-0.5">{sys.icon} {sys.label}</div>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {sys.events.map((ev) => {
                      const on = data.disabled_events[ev.key] !== true;
                      const groupSet = !!data.groups[ev.slot];
                      return (
                        <div key={ev.key} className="flex items-center gap-2.5 px-3 py-2">
                          <span className="text-sm shrink-0">{ev.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm truncate ${on ? "text-slate-700" : "text-slate-400"}`}>{ev.label}</div>
                            {!groupSet && on && <div className="text-[10px] text-amber-600">⚠️ ยังไม่ได้ตั้งกลุ่ม {data.slots[ev.slot].label} — จะยังไม่ส่งจนกว่าจะตั้ง</div>}
                          </div>
                          <button role="switch" aria-checked={on} aria-label={ev.label} onClick={() => toggleEvent(ev.key, !on)}
                            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </ERPModal>
  );
}
