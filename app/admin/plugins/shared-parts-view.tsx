"use client";

// เนื้อหาหน้า /admin/plugins — ของกลางในระบบ (ดู page.tsx)
// ของกลางที่ใช้: Icon · ScrollTabs · Drawer · MiniTable · LoadingState / ErrorState / EmptyState · CopyButton

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { ScrollTabs } from "@/components/scroll-tabs";
import { Drawer } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { CopyButton } from "@/components/copy-button";
import { apiFetch } from "@/lib/api";
import {
  PART_CATEGORIES, PART_FLAG_LABEL, SAME_JOB_LABEL, SAME_JOB_VERDICT, JOB_VERDICT_LABEL,
  type JobVerdict, type PartCategory, type PartFlag, type PartRow, type SharedPartsUsage, type UnitUsage, type UsagePlace,
} from "@/lib/shared-parts-registry";
import { LegacyPluginsTab } from "./legacy-tab";

type Data = Pick<SharedPartsUsage, "units" | "totals" | "handMade" | "generatedAt" | "commit"> & { rows: PartRow[] };
type Tab = "parts" | "groups" | "unregistered" | "legacy";
type StatusFilter = "all" | "todo" | "unused" | "dup" | "check" | "deprecated" | "single" | "nodoc" | "legacy";

const STATUS_FILTERS: { key: StatusFilter; label: string; test: (r: PartRow) => boolean }[] = [
  { key: "all", label: "ทั้งหมด", test: () => true },
  { key: "todo", label: "ต้องจัดการ", test: (r) => r.flags.some((f) => f === "unused" || f === "deprecated" || f === "dup" || f === "check") },
  { key: "unused", label: "ไม่มีใครใช้", test: (r) => r.flags.includes("unused") },
  { key: "dup", label: "ควรย้ายไปตัวหลัก", test: (r) => r.flags.includes("dup") },
  { key: "check", label: "ต้องเช็กข้อมูลก่อน", test: (r) => r.flags.includes("check") },
  { key: "deprecated", label: "ตัวเก่า ควรเลิก", test: (r) => r.flags.includes("deprecated") },
  { key: "single", label: "ใช้ที่เดียว", test: (r) => r.flags.includes("single") },
  { key: "nodoc", label: "ไม่มีคู่มือ", test: (r) => r.flags.includes("nodoc") },
  { key: "legacy", label: "อยู่ในทะเบียนเดิม", test: (r) => !!r.legacyKey },
];

const FLAG_CLASS: Record<PartFlag, string> = {
  unused: "bg-red-50 text-red-700 border-red-200",
  deprecated: "bg-slate-100 text-slate-600 border-slate-300",
  dup: "bg-amber-50 text-amber-800 border-amber-200",
  check: "bg-amber-50 text-amber-700 border-amber-200 border-dashed",
  single: "bg-sky-50 text-sky-700 border-sky-200",
  nodoc: "bg-white text-slate-500 border-slate-300 border-dashed",
};

const CAT = Object.fromEntries(PART_CATEGORIES.map((c) => [c.key, c])) as Record<PartCategory, (typeof PART_CATEGORIES)[number]>;
const PLACE_ICON: Record<UsagePlace["kind"], string> = { page: "i:file", component: "i:puzzle", lib: "i:database", api: "i:plug", other: "i:file" };

function Flag({ f }: { f: PartFlag }) {
  return <span className={`text-[11px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${FLAG_CLASS[f]}`}>{PART_FLAG_LABEL[f]}</span>;
}

function PrimaryBadge() {
  return <span className="text-[11px] px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-200">ตัวหลัก</span>;
}

/** สี/ไอคอนของคำตัดสินกลุ่ม */
const VERDICT_STYLE: Record<JobVerdict, { cls: string; icon: string }> = {
  merge: { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: "i:arrows-exchange" },
  "check-data": { cls: "bg-sky-50 text-sky-800 border-sky-200", icon: "i:database" },
  keep: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", icon: "i:check" },
};
const VERDICT_ORDER: JobVerdict[] = ["merge", "check-data", "keep"];

function VerdictBadge({ v }: { v: JobVerdict }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${VERDICT_STYLE[v].cls}`}>
      <Icon value={VERDICT_STYLE[v].icon} size={12} /> {JOB_VERDICT_LABEL[v].label}
    </span>
  );
}

/** แถบความนิยม (สเกล log — ตัวที่ใช้ 400 ที่ ไม่บังตัวที่ใช้ 5 ที่จนมองไม่เห็น) */
function UsageBar({ files }: { files: number }) {
  const w = files === 0 ? 0 : Math.max(4, Math.min(100, Math.round((Math.log10(files + 1) / Math.log10(500)) * 100)));
  const color = files === 0 ? "bg-red-300" : files === 1 ? "bg-sky-400" : "bg-emerald-400";
  return (
    <div className="h-1 rounded-full bg-slate-100 my-2">
      <div className={`h-1 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function fmtTime(iso: string | null) {
  if (!iso) return "ยังไม่เคยนับ";
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function SharedPartsView() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("parts");
  const [status, setStatus] = useState<StatusFilter>("todo");
  const [cat, setCat] = useState<PartCategory | "">("");
  const [q, setQ] = useState("");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [withWebsite, setWithWebsite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/shared-parts");
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json.data as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // กลุ่มที่คล้ายกัน (มีสมาชิก ≥2 ตัวจริง) + คำตัดสิน
  const groups = useMemo(() => {
    const m = new Map<string, PartRow[]>();
    for (const r of rows) if (r.sameJob && r.siblings.length) m.set(r.sameJob, [...(m.get(r.sameJob) ?? []), r]);
    return [...m.entries()].map(([key, members]) => ({
      key, label: SAME_JOB_LABEL[key] ?? key,
      verdict: (SAME_JOB_VERDICT[key]?.verdict ?? "check-data") as JobVerdict,
      why: SAME_JOB_VERDICT[key]?.why ?? "ยังไม่ได้ตัดสิน",
      members: [...members].sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || (b.usage?.files ?? 0) - (a.usage?.files ?? 0)),
    }));
  }, [rows]);

  const stats = useMemo(() => ({
    unused: rows.filter((r) => r.flags.includes("unused")).length,
    deprecated: rows.filter((r) => r.flags.includes("deprecated")).length,
    merge: groups.filter((g) => g.verdict === "merge").length,
    checkData: groups.filter((g) => g.verdict === "check-data").length,
    keep: groups.filter((g) => g.verdict === "keep").length,
  }), [rows, groups]);

  const filtered = useMemo(() => {
    const test = STATUS_FILTERS.find((s) => s.key === status)!.test;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => test(r) && (!cat || r.category === cat)
      && (!needle || `${r.label} ${r.code} ${r.what} ${r.source.path}`.toLowerCase().includes(needle)));
  }, [rows, status, cat, q]);

  const units = useMemo(() => (data?.units ?? []).filter((u) => withWebsite || !u.website), [data, withWebsite]);
  const sel = selKey ? byKey.get(selKey) ?? null : null;

  if (loading && !data) return <div className="max-w-6xl mx-auto px-6 py-6"><LoadingState /></div>;
  if (error && !data) return <div className="max-w-6xl mx-auto px-6 py-6"><ErrorState hint={error} onRetry={load} retrying={loading} /></div>;
  if (!data) return null;

  const { totals, handMade } = data;
  const metrics: { label: string; value: string; hint?: string; tone: string }[] = [
    { label: "ชิ้นส่วนกลางในโค้ด", value: String(totals.components), hint: `ไม่รวมชิ้นส่วนเว็บร้าน ${totals.website}`, tone: "text-slate-800" },
    { label: "ลงทะเบียนแล้ว", value: String(rows.length), hint: `ยังไม่ลงทะเบียน ${(data.units ?? []).filter((u) => !u.website).length}`, tone: "text-violet-700" },
    { label: "ไม่มีใครใช้", value: String(stats.unused), tone: "text-red-600" },
    { label: "กลุ่มที่ควรรวม", value: `${stats.merge} กลุ่ม`, hint: `เช็กข้อมูลก่อน ${stats.checkData} · ใช้คนละงาน ${stats.keep}`, tone: "text-amber-700" },
    { label: "ตัวเก่า ควรเลิก", value: String(stats.deprecated), tone: "text-slate-600" },
    { label: "หน้าที่เขียน \"กำลังโหลด\" เอง", value: `${handMade.loadingPages}/${handMade.loadingPagesTotal}`, hint: "ยังไม่ใช้ของกลาง LoadingState", tone: "text-sky-700" },
  ];

  const TABS: { key: Tab; label: string }[] = [
    { key: "parts", label: `ของกลางในระบบ (${rows.length})` },
    { key: "groups", label: `กลุ่มที่คล้ายกัน (${groups.length})` },
    { key: "unregistered", label: `ยังไม่ลงทะเบียน (${(data.units ?? []).filter((u) => !u.website).length})` },
    { key: "legacy", label: "ทะเบียนเดิม" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">ของกลางในระบบ</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Plugin Registry — ชิ้นส่วนกลางที่ทุกหน้าหยิบไปใช้ · ใช้ทำอะไร ใช้ที่ไหน ตัวไหนซ้ำ ตัวไหนเลิกแล้ว
        </p>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <Icon value="i:refresh" size={13} /> นับจากโค้ดจริงอัตโนมัติทุกครั้งที่ขึ้นเว็บ · นับล่าสุด {fmtTime(data.generatedAt)}
          {data.commit && <span className="font-mono">({data.commit})</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-slate-50 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500">{m.label}</div>
            <div className={`text-xl font-semibold ${m.tone}`}>{m.value}</div>
            {m.hint && <div className="text-[11px] text-slate-400 leading-tight">{m.hint}</div>}
          </div>
        ))}
      </div>

      <ScrollTabs activeKey={tab} className="border-b border-slate-200 mb-4">
        {TABS.map((t) => (
          <button key={t.key} data-tab-key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 h-9 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? "border-violet-600 text-violet-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>

      {tab === "parts" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {STATUS_FILTERS.map((s) => {
              const n = rows.filter(s.test).length;
              return (
                <button key={s.key} onClick={() => setStatus(s.key)}
                  className={`h-7 px-2.5 text-xs rounded-full border ${status === s.key ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  {s.label} <span className={status === s.key ? "opacity-80" : "text-slate-400"}>{n}</span>
                </button>
              );
            })}
            <div className="flex-1" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ เช่น เลือกร้าน"
              className="h-8 px-3 text-sm border border-slate-200 rounded-lg w-56" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <button onClick={() => setCat("")}
              className={`h-7 px-2.5 text-xs rounded-lg border ${cat === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              ทุกหมวด
            </button>
            {PART_CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`h-7 px-2.5 text-xs rounded-lg border inline-flex items-center gap-1 ${cat === c.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                <Icon value={c.icon} size={13} /> {c.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="ไม่พบรายการ" hint="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((r) => (
                <button key={r.key} onClick={() => setSelKey(r.key)}
                  className="text-left bg-white border border-slate-200 rounded-xl p-3 hover:border-violet-300 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                      <Icon value={CAT[r.category].icon} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 leading-tight">{r.label}</div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">{r.code}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{r.what}</p>
                  <UsageBar files={r.usage?.files ?? 0} />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-slate-600">
                      {r.usage && r.usage.files > 0 ? `ใช้ ${r.usage.placeCount} จุด · ${r.usage.files} ไฟล์` : "ยังไม่มีใครใช้"}
                    </span>
                    <span className="flex gap-1 flex-wrap">
                      {r.primary && r.siblings.length > 0 && <PrimaryBadge />}
                      {r.flags.filter((f) => f !== "nodoc").map((f) => <Flag key={f} f={f} />)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "groups" && <GroupsTab groups={groups} onOpen={setSelKey} />}

      {tab === "unregistered" && (
        <UnregisteredTab units={units} withWebsite={withWebsite} setWithWebsite={setWithWebsite} websiteCount={totals.website} />
      )}

      {tab === "legacy" && <LegacyPluginsTab onOpenPart={(k) => { if (byKey.has(k)) setSelKey(k); }} />}

      {sel && <PartDrawer row={sel} byKey={byKey} onClose={() => setSelKey(null)} onOpen={setSelKey} />}
    </div>
  );
}

function PartDrawer({ row, byKey, onClose, onOpen }: { row: PartRow; byKey: Map<string, PartRow>; onClose: () => void; onOpen: (k: string) => void }) {
  const u = row.usage;
  const missing = <span className="text-slate-400">ยังไม่ได้เขียน</span>;
  const siblings = row.siblings.map((k) => byKey.get(k)).filter((x): x is PartRow => !!x);
  const primary = siblings.find((s) => s.primary);
  const replaced = row.replacedBy ? byKey.get(row.replacedBy) : null;
  const jobLabel = row.sameJob ? SAME_JOB_LABEL[row.sameJob] ?? row.sameJob : "";
  const siblingsTitle = replaced
    ? `ตัวเก่า — ควรย้ายไปใช้ "${replaced.label}"`
    : row.verdict === "keep" ? `คล้ายกับตัวเหล่านี้ แต่ใช้คนละงาน — เก็บไว้ทั้งหมด`
    : row.verdict === "check-data" ? `ตัวอื่นในกลุ่ม "${jobLabel}" — ต้องเช็กว่าข้อมูลจริงอยู่ที่ไหนก่อนรวม`
    : row.primary ? `ตัวหลักของกลุ่ม "${jobLabel}" — ตัวอื่นในกลุ่มควรย้ายมาใช้ตัวนี้`
    : primary ? `ควรย้ายไปใช้ตัวหลัก "${primary.label}" — งานใหม่ให้ใช้ตัวหลัก`
    : `ตัวอื่นในกลุ่ม "${jobLabel}"`;
  const sourceText = row.source.names?.length ? `${row.source.path} → ${row.source.names.join(", ")}` : row.source.path;

  const Section = ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
      <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
    </div>
  );

  return (
    <Drawer open onClose={onClose} title={row.label} description={`${CAT[row.category].label} · ${row.code}`} size="lg" storageKey="shared-part-drawer">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {row.primary && row.siblings.length > 0 && <PrimaryBadge />}
          {row.flags.map((f) => <Flag key={f} f={f} />)}
          {row.flags.length === 0 && !(row.primary && row.siblings.length) && <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">ใช้งานปกติ</span>}
        </div>

        {row.verdict && (
          <div className={`px-3 py-2 rounded-lg border text-sm ${VERDICT_STYLE[row.verdict].cls}`}>
            <div className="flex items-center gap-1.5 font-medium">
              <Icon value={VERDICT_STYLE[row.verdict].icon} size={15} /> กลุ่ม &quot;{jobLabel}&quot; — {JOB_VERDICT_LABEL[row.verdict].label}
            </div>
            <p className="mt-0.5 leading-relaxed">{row.verdictWhy}</p>
          </div>
        )}

        {row.note && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex gap-2">
            <Icon value="i:alert-triangle" size={16} className="mt-0.5" />
            <span>{row.note}</span>
          </div>
        )}

        <Section label="ใช้ทำอะไร">{row.what}</Section>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Section label="ใช้เมื่อไหร่">{row.when ?? missing}</Section>
          <Section label="ห้ามใช้เมื่อไหร่ / ใช้ตัวไหนแทน">{row.notWhen ?? missing}</Section>
        </div>

        <Section label={u ? `ใช้อยู่ที่ (${u.placeCount} จุด · ${u.files} ไฟล์${u.demo ? ` · หน้าทดลอง ${u.demo}` : ""})` : "ใช้อยู่ที่"}>
          {!u || u.files === 0 ? (
            <span className="text-red-600">ยังไม่มีหน้าไหนใช้{u?.demo ? ` (มีแค่หน้าทดลอง ${u.demo} หน้า ซึ่งไม่ได้ขึ้นเว็บจริง)` : ""} — ถ้าจะลบ ต้องขออนุญาตเจ้าของก่อน</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {u.places.map((p) => {
                const inner = <><Icon value={PLACE_ICON[p.kind]} size={12} /> {p.label}</>;
                return p.href ? (
                  <a key={p.label} href={p.href} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100">{inner}</a>
                ) : (
                  <span key={p.label} className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md bg-slate-100 text-slate-600">{inner}</span>
                );
              })}
              {u.placeCount > u.places.length && <span className="text-xs text-slate-400 self-center">+ อีก {u.placeCount - u.places.length} จุด</span>}
            </div>
          )}
        </Section>

        {siblings.length > 0 && (
          <Section label={siblingsTitle}>
            <div className="flex flex-wrap gap-1.5">
              {siblings.map((s) => (
                <button key={s.key} onClick={() => onOpen(s.key)}
                  className="text-xs px-2.5 py-1 rounded-full border border-slate-200 hover:border-violet-300 hover:bg-violet-50">
                  {s.label} · {s.usage && s.usage.files > 0 ? `${s.usage.files} ไฟล์` : "ไม่มีใครใช้"}{s.primary ? " · ตัวหลัก" : ""}
                </button>
              ))}
            </div>
          </Section>
        )}

        <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Icon value="i:folder" size={13} /> ที่อยู่ในโค้ด: <code className="font-mono text-slate-700">{sourceText}</code>
            <CopyButton value={row.source.path} title="คัดลอกที่อยู่" />
          </div>
          <div className="flex items-center gap-1.5">
            <Icon value="i:book" size={13} /> คู่มือ: {row.doc ? <code className="font-mono text-slate-700">docs/{row.doc}</code> : <span className="text-slate-400">ยังไม่มี</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <Icon value="i:list" size={13} /> ทะเบียนเดิม: {row.legacyKey ? <code className="font-mono text-slate-700">{row.legacyKey}</code> : <span className="text-slate-400">ไม่มี</span>}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

type JobGroup = { key: string; label: string; verdict: JobVerdict; why: string; members: PartRow[] };

/** แท็บ "กลุ่มที่คล้ายกัน" — แต่ละกลุ่มบอกคำตัดสิน (ควรรวม / เช็กข้อมูลก่อน / ใช้คนละงาน) + เหตุผล + สมาชิก */
function GroupsTab({ groups, onOpen }: { groups: JobGroup[]; onOpen: (key: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        <p className="mb-1.5">ชิ้นส่วนที่หน้าตาหรือหน้าที่คล้ายกัน <b>ไม่ได้แปลว่าต้องรวมทุกตัว</b> — แต่ละกลุ่มมีคำตัดสินแบบใดแบบหนึ่ง:</p>
        <div className="space-y-1">
          {VERDICT_ORDER.map((v) => (
            <div key={v} className="flex flex-wrap items-start gap-2">
              <VerdictBadge v={v} /> <span className="text-[13px] leading-snug flex-1 min-w-[12rem]">{JOB_VERDICT_LABEL[v].hint}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">การลบตัวที่เลิกใช้แล้ว ต้องขออนุญาตเจ้าของทุกครั้ง</p>
      </div>

      {VERDICT_ORDER.map((v) => {
        const list = groups.filter((g) => g.verdict === v);
        if (!list.length) return null;
        return (
          <section key={v}>
            <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <VerdictBadge v={v} /> <span className="text-xs font-normal text-slate-400">{list.length} กลุ่ม</span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {list.map((g) => (
                <div key={g.key} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="text-sm font-semibold text-slate-800">{g.label}</div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{g.why}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {g.members.map((m) => (
                      <button key={m.key} type="button" onClick={() => onOpen(m.key)}
                        className={`text-xs px-2.5 py-1 rounded-full border hover:border-violet-300 hover:bg-violet-50 ${m.primary ? "border-emerald-300 bg-emerald-50/60" : m.replacedBy ? "border-slate-300 bg-slate-50 text-slate-500" : "border-slate-200"}`}>
                        {m.label} · {m.usage && m.usage.files > 0 ? `${m.usage.placeCount} จุด` : "ไม่มีใครใช้"}
                        {m.primary ? " · ตัวหลัก" : m.replacedBy ? " · ตัวเก่า" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function UnregisteredTab({ units, withWebsite, setWithWebsite, websiteCount }: {
  units: UnitUsage[]; withWebsite: boolean; setWithWebsite: (v: boolean) => void; websiteCount: number;
}) {
  // ตัวที่ใช้หลายจุดขึ้นก่อน = ตัวที่ควรลงทะเบียนก่อน
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "places", dir: "desc" });
  const columns: MiniColumn<UnitUsage>[] = [
    {
      key: "name", header: "ชิ้นส่วน", width: "2.6fr",
      cell: (u) => (
        <div className="min-w-0 py-0.5">
          <div className="text-sm font-mono text-slate-800">{u.path.replace(/^components\//, "")}</div>
          {u.desc && <div className="text-xs text-slate-500 line-clamp-2">{u.desc}</div>}
        </div>
      ),
      sortValue: (u) => u.path, sortLabel: "ชื่อ",
    },
    {
      key: "where", header: "ใช้อยู่ที่", width: "2fr",
      cell: (u) => u.files === 0
        ? <span className="text-xs text-red-600">ไม่มีใครใช้</span>
        : <span className="text-xs text-slate-500 line-clamp-2">{u.places.map((p) => p.label).join(" · ")}{u.placeCount > u.places.length ? ` + อีก ${u.placeCount - u.places.length}` : ""}</span>,
    },
    { key: "places", header: "จุด", align: "right", width: "4rem", cell: (u) => u.placeCount, sortValue: (u) => u.placeCount, sortLabel: "จำนวนจุดที่ใช้" },
    { key: "files", header: "ไฟล์", align: "right", width: "4rem", cell: (u) => u.files, sortValue: (u) => u.files, sortLabel: "จำนวนไฟล์ที่ใช้" },
    { key: "loc", header: "บรรทัด", align: "right", width: "5rem", cell: (u) => u.loc.toLocaleString(), sortValue: (u) => u.loc, sortLabel: "ขนาดโค้ด" },
  ];
  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        ชิ้นส่วนใน components/ ที่ยังไม่ได้ลงทะเบียน — ส่วนใหญ่เป็นชิ้นส่วนเฉพาะโมดูล
        ตัวที่ใช้หลายจุดควรลงทะเบียนพร้อมเขียน &quot;ใช้ทำอะไร / ใช้เมื่อไหร่&quot; (แก้ที่ lib/shared-parts-registry.ts)
      </p>
      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 mb-3">
        <input type="checkbox" checked={withWebsite} onChange={(e) => setWithWebsite(e.target.checked)} className="rounded border-slate-300" />
        รวมชิ้นส่วนของเว็บร้าน ({websiteCount})
      </label>
      <MiniTable rows={units} columns={columns} rowKey={(u) => u.path}
        searchText={(u) => `${u.path} ${u.desc}`} searchPlaceholder="ค้นชื่อชิ้นส่วน หรือคำอธิบาย"
        countUnit="ชิ้นส่วน" emptyText="ลงทะเบียนครบแล้ว"
        sortKey={sort.key} sortDir={sort.dir} onSortChange={(key, dir) => setSort({ key, dir })} />
    </div>
  );
}
