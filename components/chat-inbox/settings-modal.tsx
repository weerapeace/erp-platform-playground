"use client";
/**
 * ห้องแชทรวม — ตั้งค่า: OA ไหนรับแชทลูกค้า + แบรนด์ · ดู webhook ตอนนี้ (อ่านอย่างเดียว) · ข้อความสำเร็จรูป
 * เพิ่มบอท/ใส่ token + Channel secret = ศูนย์ LINE เดิม (LineConsole · แอดมิน) — หน้านี้ไม่รับรหัสลับ
 * ของกลาง: ERPModal · ToggleSwitch · BrandSelect · CopyButton · LineConsole · ERPInput/ERPTextarea · useToast
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPTextarea } from "@/components/form";
import { ToggleSwitch } from "@/components/toggle-switch";
import { BrandSelect, type BrandSelectOption } from "@/components/brand-select";
import { CopyButton } from "@/components/copy-button";
import { LineConsole } from "@/components/line-console";
import { LoadingState, ErrorState } from "@/components/state-views";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { CHAT_VARS } from "@/lib/chat/rules";
import type { ChatQuickReply, ChatSettings } from "@/lib/chat/types";

type BotRow = { key: string; label: string; is_main: boolean; bot_name: string; basic_id: string; has_token: boolean; has_secret: boolean; webhook: string; groups: number };
type SettingsRes = { settings: ChatSettings; bots: BotRow[]; can_manage: boolean; error: string | null };
type CheckRes = { endpoint: string | null; active: boolean | null; points_here: boolean; ours: string; error: string | null };

const newId = () => `qr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function ChatSettingsModal({ open, onClose, brands, onSaved }: { open: boolean; onClose: () => void; brands: BrandSelectOption[]; onSaved: (s: ChatSettings) => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [res, setRes] = useState<SettingsRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChatSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckRes | "loading" | string>>({});
  const [consoleOpen, setConsoleOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiFetch("/api/chat/settings");
      const j = (await r.json()) as SettingsRes;
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRes(j); setDraft(j.settings);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const dirty = !!res && !!draft && JSON.stringify(res.settings) !== JSON.stringify(draft);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/chat/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const j = (await r.json().catch(() => ({}))) as { settings?: ChatSettings; error?: string | null };
      if (!r.ok || !j.settings) { toast.error(j.error || "บันทึกไม่สำเร็จ"); return; }
      toast.success("บันทึกค่าตั้งแชทแล้ว");
      setRes((p) => (p ? { ...p, settings: j.settings! } : p)); setDraft(j.settings); onSaved(j.settings);
    } catch { toast.error("บันทึกไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่"); }
    finally { setSaving(false); }
  };

  const check = async (key: string) => {
    setChecks((c) => ({ ...c, [key]: "loading" }));
    try {
      const r = await apiFetch(`/api/chat/settings?check=${encodeURIComponent(key)}`);
      const j = (await r.json()) as CheckRes;
      setChecks((c) => ({ ...c, [key]: r.ok && !j.error ? j : (j.error || "ถาม LINE ไม่ได้") }));
    } catch { setChecks((c) => ({ ...c, [key]: "ถาม LINE ไม่ได้" })); }
  };

  const setBot = (key: string, v: Partial<{ enabled: boolean; brand_id: string | null }>) =>
    setDraft((d) => d ? { ...d, line_bots: { ...d.line_bots, [key]: { enabled: d.line_bots[key]?.enabled ?? false, brand_id: d.line_bots[key]?.brand_id ?? null, ...v } } } : d);
  const setQr = (i: number, v: Partial<ChatQuickReply>) =>
    setDraft((d) => d ? { ...d, quick_replies: d.quick_replies.map((q, j) => (j === i ? { ...q, ...v } : q)) } : d);

  return (
    <ERPModal open={open} onClose={onClose} title="ตั้งค่าห้องแชท" size="lg" hasUnsavedChanges={dirty}
      footer={<div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">ปิด</button>
        {res?.can_manage && (
          <button type="button" disabled={!dirty || saving} onClick={() => void save()}
            className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        )}
      </div>}>
      {error && !res ? <ErrorState title="โหลดค่าตั้งไม่สำเร็จ" hint={error} onRetry={() => void load()} />
        : !res || !draft ? <LoadingState label="กำลังโหลด…" />
          : !res.can_manage ? <p className="text-sm text-slate-600">ต้องมีสิทธิ์ "ตั้งค่าแชท" ถึงจะแก้ได้</p>
            : (
              <div className="space-y-6">
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800"><Icon value="i:brand-line" /> LINE OA ที่รับแชทลูกค้า</h3>
                    {can("admin.users") && (
                      <button type="button" onClick={() => setConsoleOpen(true)} className="text-xs text-blue-700 hover:underline">เพิ่มบอท / ใส่โทเคน (ศูนย์ LINE) →</button>
                    )}
                  </div>
                  <p className="mb-2 text-xs text-slate-500">
                    เปิดรับแล้วต้องชี้ webhook ของ OA นั้นมาที่ลิงก์ด้านล่าง (ทำใน LINE Developers) — <b>ถ้า webhook เดิมเป็นของระบบอื่น (BigSeller / chatbot) ระบบนั้นจะไม่ได้รับแชทอีก</b> กด &quot;ดู webhook ตอนนี้&quot; ก่อนเสมอ
                  </p>
                  <div className="space-y-2">
                    {res.bots.map((b) => {
                      const cur = draft.line_bots[b.key] ?? { enabled: false, brand_id: null };
                      const ck = checks[b.key];
                      return (
                        <div key={b.key} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800">{b.label}{b.bot_name ? ` · ${b.bot_name}` : ""}{b.basic_id ? ` (${b.basic_id})` : ""}</div>
                              {b.is_main && <div className="text-[11px] text-amber-700">บอทหลักของพนักงาน (ใช้กับกลุ่มภายใน {b.groups} กลุ่ม) — ไม่ใช่ OA ร้าน</div>}
                              {!b.has_token && <div className="text-[11px] text-rose-700">ยังไม่มีโทเคน</div>}
                              {!b.has_secret && <div className="text-[11px] text-rose-700">ยังไม่มี Channel secret — ต้องใส่ก่อน ไม่งั้นระบบไม่รับแชท (กันข้อความปลอม)</div>}
                            </div>
                            <ToggleSwitch on={cur.enabled} onChange={(v) => setBot(b.key, { enabled: v })} label="รับแชทลูกค้า" size="sm" disabled={!b.has_token} />
                          </div>
                          {cur.enabled && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                              <BrandSelect brands={brands} value={cur.brand_id ?? ""} onChange={(id) => setBot(b.key, { brand_id: id || null })} emptyLabel="— เลือกแบรนด์ของ OA นี้ —" />
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="truncate">Webhook URL: <code className="rounded bg-slate-100 px-1">{b.webhook}</code></span>
                            <CopyButton value={b.webhook} title="คัดลอกลิงก์ webhook" />
                            {b.has_token && (
                              <button type="button" onClick={() => void check(b.key)} className="rounded border border-slate-200 px-2 py-0.5 text-slate-700 hover:bg-slate-50">
                                ดู webhook ตอนนี้
                              </button>
                            )}
                          </div>
                          {ck === "loading" && <div className="mt-1 text-[11px] text-slate-500">กำลังถาม LINE…</div>}
                          {typeof ck === "string" && ck !== "loading" && <div className="mt-1 text-[11px] text-rose-700">{ck}</div>}
                          {ck && typeof ck === "object" && (
                            <div className={`mt-1 rounded-md px-2 py-1 text-[11px] ${ck.points_here ? "bg-emerald-50 text-emerald-800" : ck.endpoint ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"}`}>
                              {ck.points_here ? "ชี้มาที่ ERP แล้ว" : ck.endpoint ? <>ตอนนี้ชี้ไปที่ <code>{ck.endpoint}</code> — เป็นของระบบอื่น ถ้าเปลี่ยนมา ERP ระบบนั้นจะไม่ได้รับแชท (บอกผู้ดูแลก่อน)</> : "ยังไม่ได้ตั้ง webhook (ว่าง) — ชี้มา ERP ได้เลย"}
                              {ck.active === false && " · สวิตช์ Use webhook ปิดอยู่"}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800"><Icon value="i:messages" /> ข้อความสำเร็จรูป</h3>
                    <button type="button" onClick={() => setDraft((d) => d ? { ...d, quick_replies: [...d.quick_replies, { id: newId(), label: "", body: "", brand_id: null }] } : d)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50"><Icon value="i:plus" /> เพิ่ม</button>
                  </div>
                  <p className="mb-2 text-xs text-slate-500">
                    ใส่ตัวแปรได้: {CHAT_VARS.map((v) => <code key={v.key} className="mx-0.5 rounded bg-slate-100 px-1">{`{${v.key}}`}</code>)} = {CHAT_VARS[0].label} ·
                    <code className="mx-0.5 rounded bg-slate-100 px-1">{"{product}"}</code><code className="mx-0.5 rounded bg-slate-100 px-1">{"{sku}"}</code> = สินค้าที่แนบการ์ดไว้ · ข้อความที่ไม่กรอกชื่อ/เนื้อหาจะไม่ถูกบันทึก
                  </p>
                  {draft.quick_replies.length === 0 && <p className="text-xs text-slate-400">ยังไม่มี — กด &quot;เพิ่ม&quot;</p>}
                  <div className="space-y-2">
                    {draft.quick_replies.map((q, i) => (
                      <div key={q.id} className="rounded-lg border border-slate-200 p-2">
                        <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
                          <ERPInput value={q.label} maxLength={40} placeholder="ชื่อปุ่ม เช่น ทักทาย" onChange={(e) => setQr(i, { label: e.target.value })} />
                          <BrandSelect brands={brands} value={q.brand_id ?? ""} onChange={(id) => setQr(i, { brand_id: id || null })} emptyLabel="ทุกแบรนด์" />
                          <button type="button" title="ลบข้อความนี้" onClick={() => setDraft((d) => d ? { ...d, quick_replies: d.quick_replies.filter((_, j) => j !== i) } : d)}
                            className="h-9 rounded-md px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:trash" /></button>
                        </div>
                        <ERPTextarea value={q.body} maxLength={1000} rows={2} className="mt-2" placeholder="เช่น สวัสดีค่ะ {customer} ขอบคุณที่ทักมานะคะ" onChange={(e) => setQr(i, { body: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
      {consoleOpen && <LineConsole open={consoleOpen} onClose={() => { setConsoleOpen(false); void load(); }} />}
    </ERPModal>
  );
}
