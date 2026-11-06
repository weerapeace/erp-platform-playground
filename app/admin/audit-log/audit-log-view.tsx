"use client";

/**
 * เนื้อหาหน้า "ประวัติการใช้งาน (Audit Log)" (page.tsx ครอบด่านสิทธิ์ + เปลือกหน้า) — ใคร ทำอะไร ที่หน้าไหน รายการไหน เปลี่ยนจากอะไรเป็นอะไร
 *
 * ของกลางที่ใช้: /api/audit-logs (กรอง + นับจริง + ซ่อนค่าตามสิทธิ์) · ActivityFeed · RecordHistoryDrawer
 *   lib/audit-format (กลุ่มการกระทำ) · lib/audit-entities (โมดูล) · state-views
 * ตัวเลขบนการ์ด = จำนวนจริงตามตัวกรอง (ไม่ใช่นับจากแถวที่โหลดมาโชว์เหมือนเดิม)
 * เอกสาร: docs/audit-log.md
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import { RecordHistoryDrawer, type RecordHistoryTarget } from "@/components/activity-feed/record-history-drawer";
import { Icon } from "@/components/icon";
import { ErrorState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { addDaysYmd, todayBangkok } from "@/lib/date";
import { ACTION_GROUPS, type AuditActionGroup, type AuditView } from "@/lib/audit-format";
import { AUDIT_MODULES } from "@/lib/audit-entities";
import type { AuditGroupCounts, AuditLogsResponse } from "@/app/api/audit-logs/route";

const PAGE_SIZE = 50;

const RANGES = [
  { key: "today", label: "วันนี้", days: 0 },
  { key: "7",     label: "7 วัน",  days: 6 },
  { key: "30",    label: "30 วัน", days: 29 },
  { key: "90",    label: "90 วัน", days: 89 },
  { key: "custom", label: "เลือกวันเอง", days: -1 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const GROUP_TONE: Record<string, string> = {
  success: "text-emerald-700", accent: "text-blue-700", warning: "text-amber-700", danger: "text-red-600", neutral: "text-slate-600",
};

export function AuditLogView() {

  const [range, setRange] = useState<RangeKey>("7");
  const [customFrom, setCustomFrom] = useState(() => addDaysYmd(todayBangkok(), -6));
  const [customTo, setCustomTo] = useState(() => todayBangkok());
  const [actor, setActor] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [group, setGroup] = useState<AuditActionGroup | "">("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [noise, setNoise] = useState(false);

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<AuditGroupCounts | null>(null);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<RecordHistoryTarget | null>(null);
  const reqId = useRef(0);
  const actorsLoaded = useRef(false);   // รายชื่อคนขอครั้งเดียวพอ (ไม่ใส่ใน deps กันยิงซ้ำ)

  // พิมพ์ค้นหา → รอหยุดพิมพ์ 400ms ค่อยยิง
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 400); return () => clearTimeout(t); }, [qInput]);

  const buildParams = useCallback((offset: number, withExtras: boolean) => {
    const today = todayBangkok();
    const r = RANGES.find((x) => x.key === range)!;
    const from = range === "custom" ? customFrom : addDaysYmd(today, -r.days);
    const to = range === "custom" ? customTo : today;
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), from, to, noise: noise ? "1" : "0" });
    if (actor) p.set("actor", actor);
    if (moduleKey) p.set("module", moduleKey);
    if (group) p.set("group", group);
    if (q) p.set("q", q);
    if (withExtras) { p.set("counts", "1"); if (!actorsLoaded.current) p.set("include", "actors"); }
    return p;
  }, [range, customFrom, customTo, actor, moduleKey, group, q, noise]);

  const fetchFirst = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/audit-logs?${buildParams(0, true)}`);
      const json: AuditLogsResponse = await res.json();
      if (id !== reqId.current) return;   // มีคำขอใหม่กว่าแล้ว
      if (!res.ok || json.error) throw new Error(json.error || "โหลดประวัติไม่สำเร็จ");
      setEntries(json.data);
      setTotal(json.total);
      setCounts(json.counts ?? null);
      if (json.actors) { setActors(json.actors); actorsLoaded.current = true; }
    } catch (err) {
      if (id === reqId.current) setError(err instanceof Error ? err.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [buildParams]);

  const fetchMore = async () => {
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/audit-logs?${buildParams(entries.length, false)}`);
      const json: AuditLogsResponse = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "โหลดเพิ่มไม่สำเร็จ");
      // มีประวัติใหม่เข้ามาระหว่างดู → หน้าถัดไปอาจเลื่อนซ้ำแถวเดิม — ตัดตัวซ้ำออก
      setEntries((prev) => { const seen = new Set(prev.map((e) => e.id)); return [...prev, ...json.data.filter((e) => !seen.has(e.id))]; });
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดเพิ่มไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { void fetchFirst(); }, [fetchFirst]);

  const openRecord = (e: ActivityEntry, v: AuditView) => {
    if (!e.entity_id) return;
    setTarget({
      entityType: e.entity_type, entityId: e.entity_id,
      title: [v.recordCode, v.recordName].filter(Boolean).join(" · ") || v.page,
      subtitle: `${v.moduleLabel} · ${v.page}`,
      href: v.href,
    });
  };

  const resetFilters = () => { setActor(""); setModuleKey(""); setGroup(""); setQInput(""); setQ(""); setRange("7"); setNoise(false); };
  const filtered = !!(actor || moduleKey || group || q || range !== "7" || noise);

  const selectCls = "h-9 px-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 min-w-0";

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-5">
        <div className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-medium mb-2">
          <Icon name="history" size={14} /> Audit Log — ประวัติการใช้งาน
        </div>
        <h1 className="text-2xl font-bold text-slate-900">ประวัติการใช้งาน</h1>
        <p className="text-slate-500 mt-1 text-sm">
          ใคร ทำอะไร ที่หน้าไหน รายการไหน และเปลี่ยนจากอะไรเป็นอะไร — กดชื่อรายการเพื่อดูประวัติทั้งหมดของรายการนั้น
        </p>
      </div>

      <div className="px-4 md:px-8 py-5 space-y-4">
        {/* การ์ดจำนวน = ปุ่มกรองกลุ่มการกระทำ (นับจริงตามตัวกรอง) */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <CountCard label="ทั้งหมด" value={counts?.all} active={group === ""} tone="text-slate-800" onClick={() => setGroup("")} />
          {ACTION_GROUPS.map((g) => (
            <CountCard key={g.key} label={g.label} icon={g.icon} value={counts?.[g.key]} active={group === g.key}
              tone={GROUP_TONE[g.tone]} onClick={() => setGroup(group === g.key ? "" : g.key)} />
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {/* ตัวกรอง */}
          <div className="px-4 py-3 border-b border-slate-200 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-2">
              <label className="relative min-w-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" size={15} /></span>
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="ค้นเลขเอกสาร / SKU / ชื่อรายการ"
                  className="h-9 w-full pl-8 pr-3 text-sm border border-slate-200 rounded-lg" aria-label="ค้นหาประวัติ" />
              </label>
              <select value={actor} onChange={(e) => setActor(e.target.value)} className={selectCls} aria-label="กรองตามคน">
                <option value="">ทุกคน</option>
                {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)} className={selectCls} aria-label="กรองตามโมดูล">
                <option value="">ทุกโมดูล</option>
                {AUDIT_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className={selectCls} aria-label="ช่วงวัน">
                {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
              {range === "custom" && (
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  ตั้งแต่ <input type="date" value={customFrom} max={customTo} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} className="h-8 px-2 border border-slate-200 rounded-md text-sm" />
                  ถึง <input type="date" value={customTo} min={customFrom} onChange={(e) => e.target.value && setCustomTo(e.target.value)} className="h-8 px-2 border border-slate-200 rounded-md text-sm" />
                </span>
              )}
              <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} className="rounded" />
                รวมบันทึกอัตโนมัติ (กระดานเซฟเอง / อัปโหลดไฟล์ / สคริปต์นำเข้าอีเมลยอดขาย)
              </label>
              <div className="flex-1" />
              {filtered && (
                <button type="button" onClick={resetFilters} className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2">ล้างตัวกรอง</button>
              )}
              <button type="button" onClick={() => void fetchFirst()}
                className="h-8 px-3 inline-flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
                <Icon name="refresh" size={14} /> รีเฟรช
              </button>
            </div>
          </div>

          {/* รายการ */}
          <div className="p-4 md:p-6">
            {error && entries.length === 0 ? (
              <ErrorState hint={error} onRetry={() => void fetchFirst()} retrying={loading} />
            ) : (
              <>
                {!loading && entries.length > 0 && (
                  <p className="text-xs text-slate-500 mb-4">
                    พบ {total.toLocaleString("th-TH")} รายการ · แสดง {entries.length.toLocaleString("th-TH")} รายการล่าสุด
                  </p>
                )}
                <ActivityFeed entries={entries} loading={loading} showWhere onOpenRecord={openRecord}
                  emptyMessage={filtered ? "ไม่พบประวัติตามตัวกรองนี้ ลองเปลี่ยนคน โมดูล หรือขยายช่วงวัน" : "ยังไม่มีประวัติในช่วงนี้"} />
                {!loading && entries.length < total && (
                  <div className="text-center mt-5">
                    <button type="button" onClick={() => void fetchMore()} disabled={loadingMore}
                      className="h-9 px-4 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                      {loadingMore ? "กำลังโหลด..." : `โหลดเพิ่ม (เหลืออีก ${(total - entries.length).toLocaleString("th-TH")})`}
                    </button>
                  </div>
                )}
                {error && entries.length > 0 && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          ประวัติก่อน 6 พ.ย. 2569 ส่วนใหญ่จดแค่ "แก้ช่องไหน" ไม่ได้จดค่าเดิม · การแก้สินค้า/คู่ค้า/ใบขอซื้อหลังจากนี้จะเห็น "จาก → เป็น" ครบ ·
          ค่าที่คุณไม่มีสิทธิ์ดู (เช่น ราคาทุน เงินเดือน) จะถูกซ่อน
        </p>
      </div>

      <RecordHistoryDrawer target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function CountCard({ label, value, icon, active, tone, onClick }: {
  label: string; value: number | undefined; icon?: string; active: boolean; tone: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${active ? "bg-white border-blue-400 ring-2 ring-blue-100" : "bg-slate-50 border-transparent hover:bg-white hover:border-slate-200"}`}>
      <span className="text-xs text-slate-500 inline-flex items-center gap-1">{icon && <Icon name={icon} size={13} />}{label}</span>
      <span className={`block text-xl font-bold tabular-nums ${tone}`}>{value === undefined ? "–" : value.toLocaleString("th-TH")}</span>
    </button>
  );
}
