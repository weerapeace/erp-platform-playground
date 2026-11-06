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
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { copyText } from "@/components/copy-button";
import type { LineSystemDef, LineSlotDef, LineSlotKey } from "@/lib/line-registry";

/** บอท 1 ตัว (บอทหลัก + บอทเสริม) — ค่าความลับมาแค่ "…4 ตัวท้าย" */
type BotRow = {
  key: string; label: string; is_main: boolean; bot_name: string; basic_id: string;
  has_token: boolean; token_hint: string; has_secret: boolean;
  captured: string; captured_at: string | null; webhook: string;
  quota: { ok: boolean; limit: number | null; used: number | null };
  slots: string[];
};

type ConsoleData = {
  has_token: boolean; token_hint: string;
  has_secret: boolean; secret_hint: string;
  captured: string; captured_at: string | null;
  bots?: BotRow[];
  groups: Record<string, string>;
  slot_bot?: Record<string, string>;
  slot_members?: Record<string, number | null>;
  disabled_events: Record<string, boolean>;
  systems: LineSystemDef[];
  slots: Record<LineSlotKey, LineSlotDef>;
  error: string | null;
};

/** แถบโควตาเดือนนี้ของบอท 1 ตัว */
function QuotaBar({ q }: { q: BotRow["quota"] }) {
  if (!q.ok) return <div className="text-[11px] text-slate-400">อ่านโควตาจาก LINE ไม่ได้</div>;
  if (q.limit === null) return <div className="text-[11px] text-slate-500">ใช้ไป {(q.used ?? 0).toLocaleString()} ข้อความ · แพ็กเกจไม่จำกัด</div>;
  const used = q.used ?? 0;
  const pct = q.limit > 0 ? Math.min(100, Math.round((used / q.limit) * 100)) : 100;
  const tone = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
        <span>โควตาเดือนนี้ {used.toLocaleString()}/{q.limit.toLocaleString()}</span>
        <span className={pct >= 90 ? "text-rose-600 font-semibold" : ""}>{pct >= 100 ? "หมดแล้ว — รอวันที่ 1" : `เหลือ ${(q.limit - used).toLocaleString()}`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function LineConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ConsoleData | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState<Record<string, string>>({});
  const [editToken, setEditToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [secretInput, setSecretInput] = useState("");
  // ฟอร์มเพิ่มบอทเสริม
  const [addOpen, setAddOpen] = useState(false);
  const [addBot, setAddBot] = useState({ label: "", token: "", channel_secret: "" });

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/line-console"); const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j as ConsoleData); setPaste({}); setEditToken(false); setTokenInput(""); setSecretInput("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [toast]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const post = async (body: Record<string, unknown>, okMsg: string): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/line-console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(okMsg);
      if (j.warning) toast.warning(j.warning);
      await load();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };

  const submitAddBot = async () => {
    const ok = await post({ add_bot: addBot }, `เพิ่มบอท "${addBot.label.trim()}" แล้ว`);
    if (ok) { setAddOpen(false); setAddBot({ label: "", token: "", channel_secret: "" }); }
  };

  const copyWebhook = async (url: string) => {
    if (await copyText(url)) toast.success("คัดลอก Webhook URL แล้ว — ไปวางใน LINE Developers → Messaging API → Webhook URL");
    else toast.error("คัดลอกไม่ได้ — เลือกข้อความแล้วก๊อปเอง");
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
            {/* Channel secret — ตรวจลายเซ็นว่าข้อความมาจาก LINE จริง (ไม่ใส่ก็ใช้ได้ แต่ใส่แล้วปลอดภัยกว่า) */}
            <div className="text-[11px] text-slate-500 mt-1.5">
              🔐 รหัสลับบอท (Channel secret): {data.has_secret ? <span className="text-emerald-700">ตั้งแล้ว ({data.secret_hint}) — ตรวจลายเซ็นทุกข้อความ</span> : <span className="text-amber-700">ยังไม่ตั้ง (แนะนำให้ใส่)</span>}
            </div>
            {editToken && (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <input type="password" value={secretInput} onChange={(e) => setSecretInput(e.target.value)} placeholder="วาง Channel secret (LINE Developers → Basic settings)"
                    className="h-8 px-2 text-xs border border-slate-200 rounded-lg flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <button disabled={busy || !secretInput.trim()} onClick={() => post({ channel_secret: secretInput }, "บันทึกรหัสลับแล้ว")}
                    className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">บันทึก</button>
                  {data.has_secret && data.secret_hint !== "ตั้งใน env" && (
                    <button disabled={busy} onClick={() => post({ channel_secret: "" }, "ล้างรหัสลับแล้ว")}
                      className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">ล้าง</button>
                  )}
                </div>
                <div className="text-[10px] text-amber-700">⚠ ใส่ผิด = บอทจะไม่รับข้อความเลย · ใส่แล้วลองส่งรูปทดสอบในกลุ่ม 1 รูป</div>
              </div>
            )}
          </div>

          {/* ---- บอท (หลายบอท = โควตาฟรีแยกต่อบอท) ---- */}
          {data.bots && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs font-semibold text-slate-500 flex-1">บอท ({data.bots.length} ตัว) · โควตาแยกกันต่อบอท</div>
                <button onClick={() => setAddOpen((v) => !v)}
                  className="h-7 px-2.5 text-xs rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 inline-flex items-center gap-1">
                  <Icon value="➕" /> เพิ่มบอท
                </button>
              </div>
              <div className="text-[11px] text-slate-400 mb-2">LINE นับโควตาตามจำนวนคนที่ได้รับ — ส่งเข้ากลุ่ม 10 คน 1 ครั้ง = 10 ข้อความ</div>

              {addOpen && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 mb-2 space-y-1.5">
                  <div className="text-xs font-semibold text-indigo-800">เพิ่มบอทใหม่</div>
                  <ol className="text-[11px] text-slate-600 list-decimal pl-4 space-y-0.5">
                    <li>สร้างบอทใน LINE Developers <b>ภายใต้ Provider เดิม</b> (ต่าง Provider = ส่งหาช่างรายคนไม่ได้)</li>
                    <li>ก๊อป Channel access token (แท็บ Messaging API) + Channel secret (แท็บ Basic settings) มาวางด้านล่าง</li>
                    <li>กดเพิ่มแล้ว คัดลอก Webhook URL ของบอทนี้ไปวางใน LINE Developers + เปิด Use webhook</li>
                  </ol>
                  <input value={addBot.label} onChange={(e) => setAddBot((b) => ({ ...b, label: e.target.value }))} placeholder="ชื่อบอทในระบบ เช่น บอทผลิต"
                    className="h-8 px-2 text-xs border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <input type="password" value={addBot.token} onChange={(e) => setAddBot((b) => ({ ...b, token: e.target.value }))} placeholder="Channel access token"
                    className="h-8 px-2 text-xs border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <input type="password" value={addBot.channel_secret} onChange={(e) => setAddBot((b) => ({ ...b, channel_secret: e.target.value }))} placeholder="Channel secret (32 ตัว)"
                    className="h-8 px-2 text-xs border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setAddOpen(false)} className="h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-600">ยกเลิก</button>
                    <button disabled={busy || !addBot.label.trim() || !addBot.token.trim() || !addBot.channel_secret.trim()} onClick={() => void submitAddBot()}
                      className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{busy ? "กำลังตรวจกับ LINE…" : "เพิ่มบอท"}</button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {data.bots.map((b) => (
                  <div key={b.key} className="border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <Icon value="🤖" className="shrink-0 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">
                          {b.label}{b.is_main && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 align-middle">หลัก</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {[b.bot_name, b.basic_id].filter(Boolean).join(" · ") || (b.has_token ? `โทเคน ${b.token_hint}` : "ยังไม่มีโทเคน")}
                          {` · ดูแล ${b.slots.length} กลุ่ม`}
                        </div>
                      </div>
                      <button disabled={busy} title="เปลี่ยนชื่อ" onClick={async () => {
                        const v = await askText({ title: "ชื่อบอทในระบบ", initial: b.label, required: true });
                        if (v && v.trim() && v.trim() !== b.label) void post({ bot: b.key, label: v }, "เปลี่ยนชื่อแล้ว");
                      }} className="h-7 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shrink-0">ชื่อ</button>
                      {!b.is_main && (
                        <button disabled={busy} title="ลบบอท" onClick={async () => {
                          if (await askConfirm({ title: `ลบ "${b.label}" ออกจากระบบ?`, message: "บอทใน LINE ยังอยู่ แค่ ERP เลิกใช้ · ต้องย้ายกลุ่มที่บอทนี้ดูแลไปบอทอื่นก่อน", confirmText: "ลบบอท", variant: "danger" }))
                            void post({ bot: b.key, remove: true }, "ลบบอทแล้ว");
                        }} className="h-7 px-2 text-xs rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 shrink-0">ลบ</button>
                      )}
                    </div>
                    <div className="mt-1.5 pl-6 space-y-1">
                      {b.has_token ? <QuotaBar q={b.quota} /> : <div className="text-[11px] text-amber-700">ยังไม่มีโทเคน — ส่งไม่ได้</div>}
                      {!b.is_main && !b.has_secret && <div className="text-[11px] text-rose-600">ยังไม่มีรหัสลับ (Channel secret) — บอทนี้จะไม่รับข้อความจากกลุ่ม</div>}
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] text-slate-500 truncate flex-1 min-w-0" title={b.webhook}>{b.webhook}</code>
                        <button onClick={() => void copyWebhook(b.webhook)} className="h-6 px-2 text-[11px] rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shrink-0">คัดลอก Webhook</button>
                      </div>
                      {b.captured && <div className="text-[11px] text-slate-400 truncate">กลุ่มล่าสุดที่บอทนี้เห็น: <code className="text-[10px]">{b.captured}</code>{b.captured_at ? ` · ${new Date(b.captured_at).toLocaleString("th-TH")}` : ""}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- กลุ่มปลายทาง (ทุก slot) ---- */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">กลุ่มปลายทาง ({slotList.length} ระบบ)</div>
            <div className="space-y-1.5">
              {slotList.map((slot) => {
                const def = data.slots[slot];
                const cur = data.groups[slot] ?? "";
                // บอทที่ดูแลกลุ่มนี้ → "กลุ่มล่าสุด" ต้องเป็นของบอทตัวนั้น (API เก่าไม่มี = บอทหลัก)
                const botKey = data.slot_bot?.[slot] ?? "main";
                const slotBot = data.bots?.find((x) => x.key === botKey);
                const latest = slotBot ? slotBot.captured : data.captured;
                const members = data.slot_members?.[slot];
                const usableBots = (data.bots ?? []).filter((x) => x.has_token);
                return (
                  <div key={slot} className="border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">{def.icon}</span>
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">{def.label}</span>
                      {usableBots.length > 1 && (
                        <select value={botKey} disabled={busy} onChange={(e) => void post({ slot, bot: e.target.value }, "เปลี่ยนบอทของกลุ่มนี้แล้ว")}
                          title="บอทที่ใช้ส่ง/รับของกลุ่มนี้" className="h-7 px-1.5 text-xs border border-slate-200 rounded-lg bg-white max-w-[140px] shrink-0">
                          {usableBots.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                      )}
                      {cur ? <span className="text-[11px] text-emerald-600 shrink-0">✓ ตั้งแล้ว</span> : <span className="text-[11px] text-slate-400 shrink-0">ยังไม่ตั้ง</span>}
                    </div>
                    {cur && (
                      <div className="text-[11px] text-slate-400 mt-1 truncate pl-7">
                        กลุ่ม: <code className="text-[10px]">{cur}</code>
                        {typeof members === "number" && <span className="text-slate-500"> · {members} คน = ส่ง 1 ครั้งกินโควตา {members}</span>}
                        {members === null && <span className="text-amber-600"> · ถามจำนวนคนไม่ได้ — {slotBot?.label ?? "บอท"} อาจไม่ได้อยู่ในกลุ่มนี้ (กดทดสอบเพื่อเช็ก)</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 pl-7">
                      {latest && latest !== cur && (
                        <button disabled={busy} onClick={() => post({ slot, group_id: latest }, "ตั้งกลุ่มแล้ว")}
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
                      const groupSet = ev.slot === "main" ? !!data.captured : !!data.groups[ev.slot] || (!!ev.fallbackMain && !!data.captured);
                      const groupLabel = ev.slot === "main" ? "กลุ่มหลัก" : data.slots[ev.slot].label;
                      return (
                        <div key={ev.key} className="flex items-center gap-2.5 px-3 py-2">
                          <span className="text-sm shrink-0">{ev.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm truncate ${on ? "text-slate-700" : "text-slate-400"}`}>{ev.label}</div>
                            {!groupSet && on && <div className="text-[10px] text-amber-600">⚠️ ยังไม่ได้ตั้งกลุ่ม {groupLabel} — จะยังไม่ส่งจนกว่าจะตั้ง</div>}
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
