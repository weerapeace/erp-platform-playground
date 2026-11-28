"use client";

/**
 * ประวัติในหน้าตั้งค่าผู้ช่วยเสียง
 *   VoiceCommandLog       — คำสั่งเสียงล่าสุด 100 รายการ (audit voice_command): ใคร · พูดว่าอะไร · ระบบจะทำอะไร · ทดสอบ/จริง
 *   VoiceSettingsHistory  — ใครเปลี่ยนการตั้งค่าอะไร เมื่อไหร่ (audit voice_assistant_settings · changes)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ErrorState, LoadingState, EmptyState } from "@/components/state-views";
import { VOICE_COMMAND_INFO, type VoiceAction, type VoiceCommandKey } from "@/lib/voice-assistant";
import { describeVoiceAction } from "./test-box";

type LogRow = { id: string; created_at: string; metadata: { actor?: string | null; said?: string; action?: VoiceAction; page?: string | null; sku?: Record<string, unknown> | null; query?: string | null; reply?: string; dry?: boolean } | null };
export type SettingsHistoryRow = { id: string; created_at: string; metadata: { actor?: string | null; changes?: { field: string; old: unknown; new: unknown }[] } | null };

const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function VoiceCommandLog() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [err, setErr] = useState("");
  const [onlyReal, setOnlyReal] = useState(false);
  const load = async () => {
    setErr(""); setRows(null);
    try {
      const j = await apiFetch("/api/voice-assistant/settings?view=log").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows(j.data as LogRow[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ"); }
  };
  useEffect(() => { void load(); }, []);
  if (err) return <ErrorState title={err} onRetry={() => void load()} />;
  if (!rows) return <LoadingState />;
  const shown = onlyReal ? rows.filter((r) => !r.metadata?.dry) : rows;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 text-[12px] text-slate-500">
        <span className="flex-1">คำสั่งล่าสุด {shown.length} รายการ</span>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={onlyReal} onChange={(e) => setOnlyReal(e.target.checked)} /> ซ่อนการทดสอบ</label>
        <button type="button" onClick={() => void load()} className="text-indigo-600 hover:underline">โหลดใหม่</button>
      </div>
      {!shown.length ? <div className="p-4"><EmptyState title="ยังไม่มีใครใช้ผู้ช่วยเสียง" /></div> : (
        <ul className="divide-y divide-slate-100">
          {shown.map((r) => {
            const m = r.metadata ?? {};
            return (
              <li key={r.id} className="px-3 py-2 text-[13px] flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3">
                <span className="shrink-0 w-28 text-[12px] text-slate-400">{when(r.created_at)}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-slate-500">{m.actor || "—"}</span>{m.dry && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 text-[11px] text-amber-700">ทดสอบ</span>}
                  <span className="block text-slate-800">“{m.said ?? ""}”</span>
                </span>
                <span className={`sm:w-64 text-[12px] ${m.action === "none" ? "text-slate-400" : "text-slate-700"}`}>
                  {describeVoiceAction({ action: m.action ?? "none", page: m.page ?? undefined, sku: (m.sku ?? undefined) as never, query: m.query ?? undefined })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const fieldLabel = (f: string) => {
  const [k, part] = f.split(".");
  const cmd = VOICE_COMMAND_INFO[k as VoiceCommandKey]?.label ?? k;
  return `${cmd} · ${part === "enabled" ? "เปิด/ปิด" : part === "mode" ? "ทำได้แค่ไหน" : "ตัวอย่างคำพูด"}`;
};
const valueLabel = (f: string, v: unknown) => {
  const [k, part] = f.split(".");
  if (part === "enabled") return v === true || v === "true" ? "เปิด" : "ปิด";
  if (part === "mode") return VOICE_COMMAND_INFO[k as VoiceCommandKey]?.modeLabels[v as "form" | "confirm"] ?? String(v ?? "");
  return String(v ?? "") || "(ว่าง)";
};

export function VoiceSettingsHistory({ rows }: { rows: SettingsHistoryRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[14px] font-medium text-slate-800 mb-1.5">ประวัติการตั้งค่า</p>
      {!rows.length ? <p className="text-[12px] text-slate-400">ยังไม่เคยเปลี่ยน (ใช้ค่าเริ่มต้นอยู่)</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="text-[12px]">
              <span className="text-slate-400">{when(r.created_at)}</span> <span className="text-slate-600">{r.metadata?.actor ?? "—"}</span>
              <ul className="mt-0.5 pl-3 text-slate-600">
                {(r.metadata?.changes ?? []).map((c, i) => (
                  <li key={i} className="break-words">{fieldLabel(c.field)}: <span className="text-slate-400 line-through">{valueLabel(c.field, c.old)}</span> → {valueLabel(c.field, c.new)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
