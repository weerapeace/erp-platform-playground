"use client";

/**
 * ⚙️ ตั้งค่าผู้ช่วยเสียง — /admin/voice-assistant (เจ้าของเลือก 2026-11-28 · ข้อเสนอ 1-4)
 *
 * - แต่ละคำสั่ง: เปิด/ปิด · ทำได้แค่ไหน (เปิดฟอร์มให้คนกดบันทึก / บันทึกหลังกดยืนยัน) · ตัวอย่างคำพูด (สอน AI · แก้/ลบได้)
 * - ลองพูดทดสอบ (ไม่ทำจริง · ใช้ค่าที่บันทึกแล้ว) · แท็บประวัติคำสั่ง (ใครพูดอะไร ระบบทำอะไร) · ประวัติการตั้งค่า
 * - บันทึกแล้วมีปุ่ม "ย้อนกลับ" (คืนค่าก่อนหน้า) · ทุกการเปลี่ยนลงประวัติ (audit)
 * - เปิด-ปิดทั้งระบบ / ใครใช้ได้ / งบ / รุ่น AI = ศูนย์ AI (/admin/paid-services) — หน้านี้ลิงก์ไป ไม่ทำซ้ำ
 * API: /api/voice-assistant/settings · คู่มือ docs/voice-assistant.md
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { AccessDenied, useAuth, usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import {
  normalizeVoiceSettings, VOICE_COMMAND_INFO, VOICE_COMMANDS, VOICE_EXAMPLE_LIMITS,
  type VoiceCmdMode, type VoiceCommandKey, type VoiceSettings,
} from "@/lib/voice-assistant";
import { VoiceTestBox } from "./test-box";
import { VoiceCommandLog, VoiceSettingsHistory, type SettingsHistoryRow } from "./history";

export default function Page() {
  return <PlaygroundShell><VoiceSettingsView /></PlaygroundShell>;
}

function VoiceSettingsView() {
  const { permsReady } = useAuth();
  const canManage = usePermission("admin.paid_services");
  const toast = useToast();
  const [saved, setSaved] = useState<VoiceSettings | null>(null);
  const [draft, setDraft] = useState<VoiceSettings | null>(null);
  const [hist, setHist] = useState<SettingsHistoryRow[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"cmds" | "log">("cmds");
  const [openCmd, setOpenCmd] = useState<VoiceCommandKey | null>("product_detail");

  const load = async () => {
    setErr("");
    try {
      const j = await apiFetch("/api/voice-assistant/settings").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const s = normalizeVoiceSettings(j.data);
      setSaved(s); setDraft(s); setHist((j.history ?? []) as SettingsHistoryRow[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดการตั้งค่าไม่สำเร็จ"); }
  };
  useEffect(() => { if (canManage) void load(); }, [canManage]);

  const dirty = useMemo(() => !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(normalizeVoiceSettings(draft)), [saved, draft]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const put = async (settings: VoiceSettings) => {
    const r = await apiFetch("/api/voice-assistant/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return { data: normalizeVoiceSettings(j.data), before: normalizeVoiceSettings(j.before) };
  };
  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const { data, before } = await put(normalizeVoiceSettings(draft));
      setSaved(data); setDraft(data);
      toast.undo("บันทึกการตั้งค่าผู้ช่วยเสียงแล้ว", async () => {
        try { const back = await put(before); setSaved(back.data); setDraft(back.data); toast.success("คืนค่าเดิมแล้ว"); void load(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
      void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (permsReady && !canManage) return <AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบ (สิทธิ์ &quot;จัดการ AI / API ที่เสียเงิน&quot;)" />;
  if (err) return <div className="p-4"><ErrorState title={err} onRetry={() => void load()} /></div>;
  if (!draft || !saved) return <LoadingState />;

  const setCmd = (k: VoiceCommandKey, patch: Partial<VoiceSettings["commands"][VoiceCommandKey]>) =>
    setDraft((d) => (d ? { commands: { ...d.commands, [k]: { ...d.commands[k], ...patch } } } : d));

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Icon name="microphone" size={20} className="text-blue-600" /> ตั้งค่าผู้ช่วยเสียง</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">เลือกว่าผู้ช่วยทำอะไรได้บ้าง และทำได้แค่ไหน · ไม่ต้องแก้โค้ด</p>
        </div>
        <Link href="/admin/paid-services" className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
          <Icon name="settings" size={15} /> เปิด-ปิดทั้งระบบ · ใครใช้ได้ · งบ
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="flex gap-1 mb-3">
            {([["cmds", `คำสั่ง (${VOICE_COMMANDS.length})`], ["log", "ประวัติคำสั่ง"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`h-8 px-3 rounded-lg text-[13px] ${tab === k ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>

          {tab === "cmds" ? (
            <div className="space-y-2.5">
              {VOICE_COMMANDS.map((k) => {
                const info = VOICE_COMMAND_INFO[k];
                const c = draft.commands[k];
                const isOpen = openCmd === k;
                return (
                  <div key={k} className={`rounded-xl border bg-white ${c.enabled ? "border-slate-200" : "border-slate-200 opacity-70"}`}>
                    <div role="button" tabIndex={0} onClick={() => setOpenCmd(isOpen ? null : k)} onKeyDown={(e) => { if (e.key === "Enter") setOpenCmd(isOpen ? null : k); }}
                      className="flex items-center gap-3 p-3 cursor-pointer">
                      <span className="h-9 w-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Icon value={info.icon} size={17} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium text-slate-800">{info.label}</span>
                        <span className="block text-[12px] text-slate-500 truncate">{c.examples[0] ? `"${c.examples[0]}" · ` : ""}{info.modeLabels[c.mode]}</span>
                      </span>
                      <ToggleSwitch on={c.enabled} onChange={(v) => setCmd(k, { enabled: v })} title={c.enabled ? "ปิดคำสั่งนี้" : "เปิดคำสั่งนี้"} />
                      <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={16} className="text-slate-400" />
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 sm:pl-[60px] space-y-3">
                        <p className="text-[12px] text-slate-500">{info.desc}</p>
                        {info.modes.length > 1 && (
                          <div>
                            <p className="text-[12px] text-slate-500 mb-1">ผู้ช่วยทำได้แค่ไหน</p>
                            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 p-0.5 bg-white">
                              {info.modes.map((m: VoiceCmdMode) => (
                                <button key={m} type="button" onClick={() => setCmd(k, { mode: m })}
                                  className={`h-7 px-3 rounded-md text-[12px] ${c.mode === m ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:text-slate-800"}`}>{info.modeLabels[m]}</button>
                              ))}
                            </div>
                            {c.mode === "confirm" && (
                              <p className="mt-1.5 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                ผู้ช่วยเตรียมให้ครบ แล้วโชว์สรุปให้กดยืนยันก่อนบันทึกทุกครั้ง · ย้อนกลับได้จากปุ่ม &quot;ย้อนกลับ&quot; ในแจ้งผล{k === "product_detail" ? " หรือประวัติเวอร์ชัน" : " (ปิดใช้ SKU)"} · ใช้โควตา AI มากขึ้น
                              </p>
                            )}
                          </div>
                        )}
                        <ExamplesEditor list={c.examples} onChange={(examples) => setCmd(k, { examples })} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="rounded-xl border border-dashed border-slate-200 p-3 text-[12px] text-slate-500">
                คำสั่งที่จะเพิ่มต่อ: เช็กสต็อก · เปิดใบขอซื้อ — บอกได้ว่าอยากได้คำสั่งไหนก่อน
              </div>
            </div>
          ) : (
            <VoiceCommandLog />
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <VoiceTestBox />
          <VoiceSettingsHistory rows={hist} />
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-30 mt-4 mx-auto w-fit flex items-center gap-3 rounded-xl bg-slate-900 text-white px-4 py-2.5 shadow-lg">
          <span className="text-[13px]">มีการแก้ที่ยังไม่บันทึก</span>
          <button type="button" onClick={() => setDraft(saved)} className="h-8 px-3 rounded-lg text-[13px] hover:bg-white/10">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="h-8 px-4 rounded-lg bg-indigo-500 text-[13px] hover:bg-indigo-400 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}
    </div>
  );
}

/** ตัวอย่างคำพูดของคำสั่ง — เพิ่ม/แก้/ลบได้ (AI ใช้เทียบว่าคำพูดแบบไหนคือคำสั่งนี้) */
function ExamplesEditor({ list, onChange }: { list: string[]; onChange: (l: string[]) => void }) {
  const [add, setAdd] = useState("");
  const full = list.length >= VOICE_EXAMPLE_LIMITS.perCommand;
  const commit = () => { const v = add.trim(); if (!v || full || list.includes(v)) return; onChange([...list, v]); setAdd(""); };
  return (
    <div>
      <p className="text-[12px] text-slate-500 mb-1">ตัวอย่างคำพูด (ช่วยให้ AI เข้าใจว่าพูดแบบไหนคือคำสั่งนี้)</p>
      <div className="space-y-1.5">
        {list.map((x, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={x} maxLength={VOICE_EXAMPLE_LIMITS.chars} onChange={(e) => onChange(list.map((y, j) => (j === i ? e.target.value : y)))}
              className="flex-1 min-w-0 h-8 rounded-lg border border-slate-200 px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} title="ลบประโยคนี้" aria-label="ลบประโยคนี้"
              className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center"><Icon name="trash" size={15} /></button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <input value={add} onChange={(e) => setAdd(e.target.value)} maxLength={VOICE_EXAMPLE_LIMITS.chars} disabled={full}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }}
            placeholder={full ? `ครบ ${VOICE_EXAMPLE_LIMITS.perCommand} ประโยคแล้ว` : "พิมพ์ประโยคตัวอย่างใหม่ แล้วกด Enter"}
            className="flex-1 min-w-0 h-8 rounded-lg border border-dashed border-slate-300 px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <button type="button" onClick={commit} disabled={!add.trim() || full} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] hover:bg-slate-50 disabled:opacity-40">+ เพิ่ม</button>
        </div>
      </div>
    </div>
  );
}
