"use client";

// ============================================================
// 🤖 ศูนย์ AI และ API ที่เสียเงิน — ดูว่าระบบใช้ AI / บริการเสียเงินตรงไหน · เปิด-ปิด · เปลี่ยนโมเดล · ยอดใช้เดือนนี้
// ทะเบียนจุดที่ใช้ = lib/paid-services (ของกลาง · เพิ่มจุดใหม่ต้องลงทะเบียน — เทสต์ paid-services-guard บังคับ)
// ด่านกลาง = lib/paid-services-server · ข้อมูลผ่าน /api/admin/paid-services (admin.paid_services)
// ของกลาง: MiniTable (ค้นหา/เรียง/จัดกลุ่ม) · ConfirmDialog (ยืนยันก่อนปิด) · Toast
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { PROVIDER_LABEL, type PaidProvider, type PaidService } from "@/lib/paid-services";

type Row = PaidService & {
  enabled: boolean; model: string | null; configured: boolean | null;
  month: { calls: number; failed: number; cost_thb: number; tokens: number };
  last_used_at: string | null; updated_at: string | null; updated_by_name: string | null;
};
type ModelChoice = { id: string; label: string; note: string; inPerM: number; outPerM: number };

const baht = (n: number) => (n === 0 ? "฿0" : n < 1 ? `฿${n.toFixed(2)}` : `฿${n.toLocaleString("th-TH", { maximumFractionDigits: n < 100 ? 1 : 0 })}`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });

export default function PaidServicesPage() {
  return <PlaygroundShell><PaidServicesView /></PlaygroundShell>;
}

function PaidServicesView() {
  const canManage = usePermission("admin.paid_services");
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [totals, setTotals] = useState({ calls: 0, failed: 0, cost_thb: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaidProvider | "">("");
  const [confirmOff, setConfirmOff] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch("/api/admin/paid-services");
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.services ?? []); setTotals(j.totals ?? { calls: 0, failed: 0, cost_thb: 0 }); setModels(j.model_choices ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const save = async (r: Row, patch: { enabled?: boolean; model?: string }) => {
    setBusy(r.key);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: r.key, ...patch }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows((cur) => cur.map((x) => (x.key === r.key ? { ...x, enabled: j.data.enabled, model: j.data.model, updated_at: j.data.updated_at, updated_by_name: j.data.updated_by_name } : x)));
      toast.success("enabled" in patch ? (patch.enabled ? `เปิด "${r.th}" แล้ว` : `ปิด "${r.th}" แล้ว`) : `เปลี่ยนโมเดลของ "${r.th}" แล้ว`);
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const providers = useMemo(() => {
    const m = new Map<PaidProvider, number>();
    for (const r of rows) m.set(r.provider, (m.get(r.provider) ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);
  const shown = useMemo(() => rows.filter((r) => !provider || r.provider === provider), [rows, provider]);
  const onCount = rows.filter((r) => r.enabled).length;
  const notSet = [...new Set(rows.filter((r) => r.configured === false).map((r) => PROVIDER_LABEL[r.provider]))];
  const groupOrder = useMemo(() => { const order = [...new Set(rows.map((r) => r.group))]; return (g: string) => order.indexOf(g); }, [rows]);

  const columns: MiniColumn<Row>[] = [
    {
      key: "what", header: "ใช้ทำอะไร · อยู่หน้าไหน", width: "minmax(0,2fr)", sortValue: (r) => r.th, sortLabel: "ชื่อ",
      cell: (r) => (
        <div className={`min-w-0 ${r.enabled ? "" : "opacity-60"}`}>
          <div className="font-medium text-slate-800">{r.th}</div>
          <div className="text-xs text-slate-500">ใช้ที่: {r.usedAt}</div>
          <div className="text-[11px] text-slate-400">ถ้าปิด: {r.offBehavior}</div>
        </div>
      ),
    },
    {
      key: "provider", header: "ผู้ให้บริการ", width: "9rem", sortValue: (r) => PROVIDER_LABEL[r.provider], sortLabel: "ผู้ให้บริการ",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{PROVIDER_LABEL[r.provider]}</span>
          {r.configured === false && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700" title="ยังไม่ได้ใส่รหัสของผู้ให้บริการนี้ใน Vercel — ตอนนี้ฟีเจอร์นี้ยังไม่ทำงานจริง">ยังไม่ตั้งรหัส</span>}
        </div>
      ),
    },
    {
      key: "model", header: "โมเดล / ราคา", width: "13rem",
      cell: (r) => r.kind === "ai_chat" ? (
        <div className="flex flex-col gap-1">
          <select value={r.model ?? ""} disabled={!r.enabled || busy === r.key} onChange={(e) => void save(r, { model: e.target.value })}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 text-xs outline-none focus:border-blue-400 disabled:opacity-50">
            <option value="">ค่าเดิมของระบบ</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {(() => { const m = models.find((x) => x.id === r.model); return m ? <span className="text-[11px] text-slate-400">{m.note} · เข้า ฿{m.inPerM}/ออก ฿{m.outPerM} ต่อ 1 ล้านคำ</span> : null; })()}
        </div>
      ) : <span className="text-xs text-slate-500">{r.costHint}</span>,
    },
    {
      key: "month", header: "เดือนนี้", width: "8rem", align: "right", sortValue: (r) => r.month.cost_thb * 1e6 + r.month.calls, sortLabel: "ยอดใช้เดือนนี้",
      cell: (r) => (
        <div className="text-right text-xs tabular-nums">
          <div className="font-medium text-slate-800">{r.month.calls.toLocaleString("th-TH")} ครั้ง</div>
          {r.kind === "ai_chat" && <div className="text-slate-500">{baht(r.month.cost_thb)}</div>}
          {r.month.failed > 0 && <div className="text-red-600">ล้มเหลว {r.month.failed}</div>}
          <div className="text-[11px] text-slate-400">{r.last_used_at ? `ล่าสุด ${fmtWhen(r.last_used_at)}` : "ยังไม่มีการใช้"}</div>
        </div>
      ),
    },
    {
      key: "on", header: "เปิด", width: "5.5rem", align: "center", sortValue: (r) => (r.enabled ? 1 : 0), sortLabel: "เปิด/ปิด",
      cell: (r) => r.kind === "locked" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500" title={r.offBehavior}><Icon name="lock" /> ล็อก</span>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" role="switch" aria-checked={r.enabled} aria-label={r.enabled ? `ปิด ${r.th}` : `เปิด ${r.th}`} disabled={busy === r.key}
            onClick={() => (r.enabled ? setConfirmOff(r) : void save(r, { enabled: true }))}
            className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${r.enabled ? "bg-blue-600" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${r.enabled ? "left-0.5 translate-x-4" : "left-0.5"}`} />
          </button>
          {r.updated_by_name && <span className="text-[10px] text-slate-400" title={r.updated_at ? fmtWhen(r.updated_at) : undefined}>โดย {r.updated_by_name}</span>}
        </div>
      ),
    },
  ];

  if (!canManage) return <AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบ (สิทธิ์ &quot;จัดการ AI / API ที่เสียเงิน&quot;)" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">ศูนย์ AI และ API ที่เสียเงิน</h1>
        <p className="text-sm text-slate-500">ดูว่าระบบใช้ AI / บริการเสียเงินตรงไหนบ้าง · เปิด-ปิด · เปลี่ยนโมเดล · ดูยอดใช้เดือนนี้ — ทุกการเปลี่ยนบันทึกประวัติ</p>
      </div>

      {loading && !rows.length ? <LoadingState label="กำลังโหลด…" />
        : err ? <ErrorState title="โหลดข้อมูลไม่สำเร็จ" hint={err} onRetry={() => void load()} retrying={loading} />
        : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="เดือนนี้ใช้ไป (ประมาณ)" value={baht(totals.cost_thb)} hint="คิดจากจำนวนคำที่ส่ง GPT" />
              <Stat label="เรียกใช้เดือนนี้" value={`${totals.calls.toLocaleString("th-TH")} ครั้ง`} hint={totals.failed ? `ล้มเหลว ${totals.failed} ครั้ง` : undefined} warn={totals.failed > 0} />
              <Stat label="ฟีเจอร์ที่เปิดอยู่" value={`${onCount}/${rows.length}`} />
              <Stat label="ยังไม่ตั้งรหัส" value={notSet.length ? notSet.join(" · ") : "ครบแล้ว"} small warn={notSet.length > 0} />
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              <ProviderChip on={!provider} onClick={() => setProvider("")}>ทั้งหมด <span className="opacity-70">{rows.length}</span></ProviderChip>
              {providers.map(([p, n]) => (
                <ProviderChip key={p} on={provider === p} onClick={() => setProvider(provider === p ? "" : p)}>{PROVIDER_LABEL[p]} <span className="opacity-70">{n}</span></ProviderChip>
              ))}
            </div>

            <MiniTable rows={shown} rowKey={(r) => r.key} columns={columns}
              searchText={(r) => `${r.th} ${r.en} ${r.usedAt} ${PROVIDER_LABEL[r.provider]} ${r.group}`} searchPlaceholder="ค้นหา ฟีเจอร์ / หน้า / ผู้ให้บริการ"
              groupBy={(r) => r.group} groupLabel="หมวดงาน" defaultGrouped groupOrder={groupOrder} countUnit="รายการ" />

            <p className="mt-3 text-xs text-slate-400">
              ตัวเลขเงินเป็นค่าประมาณจากจำนวนคำ (ราคาตามรายการโมเดล) · เริ่มนับตั้งแต่วันที่เปิดใช้ศูนย์นี้ · บริการคิดต่อครั้ง (สลิป/LINE/อีเมล) นับเป็นจำนวนครั้ง
              · ปิดแล้วมีผลทุกเครื่องภายใน ~30 วินาที · เพิ่มฟีเจอร์ใหม่ที่ใช้ AI/บริการเสียเงิน ต้องลงทะเบียนที่นี่ (ระบบบังคับ)
            </p>
          </>
        )}

      <ConfirmDialog open={confirmOff !== null} onClose={() => setConfirmOff(null)} variant="danger"
        onConfirm={() => { const r = confirmOff; setConfirmOff(null); if (r) void save(r, { enabled: false }); }}
        title={`ปิด "${confirmOff?.th ?? ""}"?`} confirmText="ปิดฟีเจอร์นี้"
        message={confirmOff ? `ผลที่เกิด: ${confirmOff.offBehavior}\nใช้ที่: ${confirmOff.usedAt}\nเปิดกลับได้ทุกเมื่อที่หน้านี้` : ""} />
    </div>
  );
}

function Stat({ label, value, hint, warn, small }: { label: string; value: string; hint?: string; warn?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`${small ? "text-sm" : "text-2xl"} font-semibold tabular-nums ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</div>
      {hint && <div className={`text-[11px] ${warn ? "text-red-600" : "text-slate-400"}`}>{hint}</div>}
    </div>
  );
}

function ProviderChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${on ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {children}
    </button>
  );
}
