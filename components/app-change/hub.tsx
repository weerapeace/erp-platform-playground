"use client";

/**
 * ศูนย์งานแก้แอป (/admin/app-changes) — ภาพรวมงานแก้แบบ A "รายการจัดกลุ่ม" (เจ้าของเลือก 2026-11-16)
 * - จัดกลุ่ม: ตามหน้า / ตามของกลาง / ตามสถานะ · ติ๊กหลายข้อ → "สร้างคำสั่งให้ AI"
 * - ต่อรายการ: ส่งเข้าแผนทีม (AddToPlanButton กลาง) · ดูในแผนผัง · คัดลอกคำสั่ง AI · เปลี่ยนสถานะ
 * - กดชื่อของกลาง → ป๊อป "ผลกระทบ" = หน้าที่ใช้ตัวนี้ทั้งหมด (/api/app-changes/context?part=)
 * - ป้าย รอขึ้นเว็บ / ขึ้นเว็บแล้ว = รหัส [CH-xxxxxx] ใน commit (/api/app-changes/deploy-marks)
 * ข้อมูล = issue_reports ที่มี page_path (ใบจากศูนย์นี้) ผ่าน /api/issue-reports · ตัวช่วย lib/app-change.ts
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { AddToPlanButton } from "@/components/team-plan/add-to-plan";
import { SHARED_PARTS } from "@/lib/shared-parts-registry";
import { FLOW_NODES, FLOW_EDGES } from "@/lib/flow-map";
import {
  buildChangePrompt, changeBadge, changeCode, groupChanges,
  type ChangeGroupBy, type DeployMark, type FlowRef, type PartPlace, type PromptItem,
} from "@/lib/app-change";

type Row = {
  id: string; description: string; images: string[]; status: string; priority: string;
  reporter_name: string | null; created_at: string; page_path: string | null; parts: string[]; flow_refs: FlowRef[];
};

const PART_LABEL = new Map(SHARED_PARTS.map((p) => [p.key, p.label]));
const partLabel = (k: string) => PART_LABEL.get(k) ?? k;
const flowLabel = (f: FlowRef) => f.kind === "n" ? FLOW_NODES[f.ref]?.label ?? f.ref
  : (() => { const e = FLOW_EDGES[f.ref]; return e ? `${FLOW_NODES[e.from]?.label ?? e.from} → ${FLOW_NODES[e.to]?.label ?? e.to}` : f.ref; })();
const imgUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

const TONE: Record<string, string> = {
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  wait: "bg-violet-50 text-violet-700 border-violet-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  muted: "bg-slate-50 text-slate-500 border-slate-200",
};
const GROUPS: { key: ChangeGroupBy; label: string }[] = [
  { key: "page", label: "ตามหน้า" }, { key: "part", label: "ตามของกลาง" }, { key: "status", label: "ตามสถานะ" },
];
const STATUS_OPTS = [["open", "รอทำ"], ["in_progress", "กำลังทำ"], ["resolved", "เสร็จ/ขึ้นเว็บแล้ว"], ["closed", "ปิด (ไม่ทำ)"]] as const;

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const toPrompt = (r: Row): PromptItem => ({
  id: r.id, description: r.description, page_path: r.page_path,
  parts: r.parts.map((k) => ({ key: k, label: partLabel(k) })),
  flow: r.flow_refs.map(flowLabel), images: r.images.length,
});

export function AppChangeHub() {
  const canManage = usePermission("report.manage");
  const toast = useToast();
  const sp = useSearchParams();
  const flowFilter = sp.get("flow");        // มาจากป้ายบนแผนผัง: ?flow=n:qt
  const focusId = sp.get("id");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, DeployMark>>({});
  const [by, setBy] = useState<ChangeGroupBy>("page");
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [promptText, setPromptText] = useState<string | null>(null);
  const [impact, setImpact] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch("/api/issue-reports").then((r) => r.json());
      if (j?.error) throw new Error(j.error);
      setRows(((j.data ?? []) as Row[]).filter((r) => r.page_path).map((r) => ({ ...r, parts: r.parts ?? [], flow_refs: r.flow_refs ?? [], images: r.images ?? [] })));
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  const loadMarks = useCallback(async () => {
    try { const j = await apiFetch("/api/app-changes/deploy-marks").then((r) => r.json()); if (j?.marks) setMarks(j.marks); } catch { /* ป้ายแค่ไม่ขึ้น */ }
  }, []);
  useEffect(() => { if (canManage) { void load(); void loadMarks(); } }, [canManage, load, loadMarks]);
  // ป้ายขึ้นเว็บ: ระบบปรับสถานะให้เอง → โหลดรายการซ้ำเมื่อป้ายเปลี่ยน
  useEffect(() => {
    if (!canManage) return;
    const t = setInterval(() => { void loadMarks().then(load); }, 120_000);
    return () => clearInterval(t);
  }, [canManage, load, loadMarks]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (showDone || (r.status !== "resolved" && r.status !== "closed") || r.id === focusId) &&
      (!flowFilter || r.flow_refs.some((f) => `${f.kind}:${f.ref}` === flowFilter)) &&
      (!s || r.description.toLowerCase().includes(s) || (r.page_path ?? "").includes(s) || r.parts.some((k) => partLabel(k).toLowerCase().includes(s))));
  }, [rows, showDone, flowFilter, q, focusId]);
  const groups = useMemo(() => groupChanges(visible, by, partLabel), [visible, by]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows ?? []) { const b = changeBadge(r.status, marks[changeCode(r.id)]).label; c[b] = (c[b] ?? 0) + 1; }
    return c;
  }, [rows, marks]);

  const setStatus = async (r: Row, status: string) => {
    const res = await apiFetch(`/api/issue-reports/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) { toast.error(j?.error || "เปลี่ยนสถานะไม่สำเร็จ"); return; }
    setRows((prev) => prev?.map((x) => x.id === r.id ? { ...x, status } : x) ?? prev);
  };
  const openPrompt = (list: Row[]) => setPromptText(buildChangePrompt(list.map(toPrompt)));
  const togglePick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!canManage) return <AccessDenied message="หน้านี้สำหรับผู้จัดการงานแก้ (report.manage)" />;
  const pickedRows = (rows ?? []).filter((r) => picked.has(r.id));

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-5 py-4 sm:py-5 space-y-3 pb-24">
      <div>
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold text-slate-800"><Icon value="i:pencil" /> ศูนย์งานแก้แอป</h1>
        <p className="text-sm text-slate-500 mt-0.5">จดงานแก้จากเมนูโปรไฟล์ → “ขอแก้หน้านี้” ทุกหน้า · ระบบผูกหน้า + ของกลาง + แผนผังให้เอง · ติ๊กหลายข้อแล้วสร้างคำสั่งให้ AI</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["รอทำ", "กำลังทำ", "รอขึ้นเว็บ", "ขึ้นเว็บแล้ว"].map((l) => {
          const tone = l === "รอทำ" ? "warn" : l === "กำลังทำ" ? "info" : l === "รอขึ้นเว็บ" ? "wait" : "ok";
          return <span key={l} className={`text-xs px-2 py-0.5 rounded-full border ${TONE[tone]}`}>{l} {counts[l] ?? 0}</span>;
        })}
        <span className="flex-1" />
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" onClick={() => setBy(g.key)}
              className={`h-7 px-2.5 text-xs rounded-md ${by === g.key ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500"}`}>{g.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon value="i:search" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหางานแก้ / หน้า / ของกลาง"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> โชว์งานที่เสร็จ/ปิดแล้ว
        </label>
        {flowFilter && (
          <Link href="/admin/app-changes" className="text-xs px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 inline-flex items-center gap-1">
            แผนผัง: {flowLabel({ kind: flowFilter.startsWith("e:") ? "e" : "n", ref: flowFilter.slice(2) })} <Icon value="i:x" />
          </Link>
        )}
        <button type="button" disabled={!pickedRows.length} onClick={() => openPrompt(pickedRows)}
          className="hidden sm:inline-flex h-9 px-3 items-center gap-1.5 text-sm rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40">
          <Icon value="i:copy" /> สร้างคำสั่งให้ AI ({pickedRows.length})
        </button>
      </div>

      {err && !rows ? <ErrorState title="โหลดงานแก้ไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดงานแก้…" />
        : visible.length === 0 ? (
          <EmptyState icon={<Icon value="i:pencil" />} title={rows.length ? "ไม่มีงานแก้ที่ค้าง" : "เริ่มจดงานแก้แรก"}
            hint="เปิดหน้าที่อยากแก้ → กดรูปโปรไฟล์ → “ขอแก้หน้านี้” แล้วพิมพ์สั้น ๆ + แนบภาพหน้าจอ" />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {groups.map((g) => (
              <div key={g.key || "_none"}>
                <div className="px-3 py-2 bg-slate-50 border-t first:border-t-0 border-slate-200 text-sm font-medium text-slate-800 flex items-center gap-2">
                  {by === "page" && g.key ? <Link href={g.key} className="hover:underline">{g.label}</Link>
                    : by === "part" && g.key ? <button type="button" onClick={() => setImpact(g.key)} className="hover:underline text-left">{g.label}</button>
                    : g.label}
                  <span className="text-xs font-normal text-slate-400">· {g.rows.length} งาน</span>
                  {by === "part" && g.key && <button type="button" onClick={() => setImpact(g.key)} className="ml-auto text-xs font-normal text-violet-600 hover:underline">ดูหน้าที่กระทบ</button>}
                </div>
                {g.rows.map((r) => {
                  const badge = changeBadge(r.status, marks[changeCode(r.id)]);
                  return (
                    <div key={r.id} className={`px-3 py-2.5 border-t border-slate-100 flex flex-wrap sm:flex-nowrap items-start gap-2.5 ${r.id === focusId ? "bg-violet-50/60" : ""}`}>
                      <input type="checkbox" className="mt-1" checked={picked.has(r.id)} onChange={() => togglePick(r.id)} aria-label="เลือกงานแก้นี้" />
                      <div className="flex-1 min-w-[calc(100%-2rem)] sm:min-w-0">
                        <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                          {r.priority === "high" || r.priority === "urgent" ? <span className="mr-1 text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">ด่วน</span> : null}
                          {r.description}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[11px] text-slate-400 font-mono">{changeCode(r.id)}</span>
                          {by !== "page" && r.page_path && <Link href={r.page_path} className="text-[11px] text-slate-500 hover:underline">{r.page_path}</Link>}
                          {r.parts.map((k) => (
                            <button key={k} type="button" onClick={() => setImpact(k)} title="ดูว่าแก้ตัวนี้กระทบหน้าไหน"
                              className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100">{partLabel(k)}</button>
                          ))}
                          {r.flow_refs.map((f) => (
                            <Link key={`${f.kind}:${f.ref}`} href={`/master/flow-map?${f.kind === "n" ? "node" : "edge"}=${f.ref}`}
                              className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-0.5">
                              <Icon value="i:sitemap" /> {flowLabel(f)}
                            </Link>
                          ))}
                          {r.images.slice(0, 4).map((k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={k} src={imgUrl(k)} alt="" onClick={() => setPreview(k)} className="h-7 w-10 object-cover rounded border border-slate-200 cursor-zoom-in" />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-6 sm:ml-0">
                        <select value={r.status} onChange={(e) => void setStatus(r, e.target.value)} aria-label="สถานะ"
                          className={`h-7 text-xs rounded-full border px-2 ${TONE[badge.tone]}`}>
                          {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{v === r.status ? badge.label : l}</option>)}
                        </select>
                        <AddToPlanButton title={r.description.split("\n")[0].slice(0, 80)} label="แผนทีม"
                          source={{ label: `งานแก้ ${changeCode(r.id)}`, href: `/admin/app-changes?id=${r.id}` }}
                          className="h-7 px-2 inline-flex items-center gap-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" />
                        <button type="button" onClick={() => openPrompt([r])} title="คำสั่งให้ AI (ข้อนี้)"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon value="i:copy" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

      {/* มือถือ: ปุ่มคำสั่ง AI ติดล่างจอ */}
      {pickedRows.length > 0 && (
        <div className="sm:hidden fixed left-3 right-3 bottom-20 z-30">
          <button type="button" onClick={() => openPrompt(pickedRows)} className="w-full h-11 rounded-xl bg-violet-600 text-white text-sm font-medium shadow-lg inline-flex items-center justify-center gap-1.5">
            <Icon value="i:copy" /> สร้างคำสั่งให้ AI ({pickedRows.length})
          </button>
        </div>
      )}

      <ERPModal open={promptText !== null} onClose={() => setPromptText(null)} title="คำสั่งให้ AI" size="md" storageKey="app-change-prompt" defaultExpanded={false}
        footer={<div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={() => setPromptText(null)} className="h-9 px-3 text-sm rounded-lg border border-slate-200">ปิด</button>
          <button type="button" onClick={async () => { if (promptText && await copyText(promptText)) toast.success("คัดลอกแล้ว — วางใน Claude ได้เลย"); else toast.error("คัดลอกไม่ได้ — ลากเลือกข้อความแล้ว Ctrl+C แทน"); }}
            className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 inline-flex items-center gap-1.5"><Icon value="i:copy" /> คัดลอก</button>
        </div>}>
        <p className="text-xs text-slate-500 mb-2">แก้ข้อความได้ก่อนคัดลอก · AI จะใส่รหัส [CH-…] ใน commit แล้วงานแก้ขึ้นป้าย “รอขึ้นเว็บ / ขึ้นเว็บแล้ว” ให้เอง</p>
        <textarea value={promptText ?? ""} onChange={(e) => setPromptText(e.target.value)} rows={14}
          className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono leading-relaxed" />
      </ERPModal>

      <ImpactModal partKey={impact} onClose={() => setImpact(null)} rows={rows ?? []} />

      <ERPModal open={preview !== null} onClose={() => setPreview(null)} title="ภาพหน้าจอ" size="lg" storageKey="app-change-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={imgUrl(preview)} alt="" className="max-w-full mx-auto rounded" />}
      </ERPModal>
    </div>
  );
}

/** ผลกระทบของกลาง: หน้าที่ใช้ตัวนี้ทั้งหมด + งานแก้ค้างต่อหน้า */
function ImpactModal({ partKey, onClose, rows }: { partKey: string | null; onClose: () => void; rows: Row[] }) {
  const [data, setData] = useState<{ part: { label: string; what: string }; pages: PartPlace[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!partKey) return;
    setData(null); setErr(null);
    apiFetch(`/api/app-changes/context?part=${encodeURIComponent(partKey)}`).then((r) => r.json())
      .then((j) => { if (j?.error) setErr(j.error); else setData(j); })
      .catch(() => setErr("โหลดไม่สำเร็จ"));
  }, [partKey]);
  const open = rows.filter((r) => r.status === "open" || r.status === "in_progress");
  const pending = (href: string | null) => href ? open.filter((r) => r.page_path === href).length : 0;
  const mine = partKey ? open.filter((r) => r.parts.includes(partKey)) : [];

  return (
    <ERPModal open={partKey !== null} onClose={onClose} title={`ผลกระทบ: ${partKey ? partLabel(partKey) : ""}`} size="md" storageKey="app-change-impact" defaultExpanded={false}>
      {err ? <ErrorState title="ดูผลกระทบไม่ได้" hint={err} />
        : !data ? <LoadingState label="กำลังนับหน้าที่ใช้…" />
        : (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{data.part.what}</p>
            <div className="text-slate-500">ถ้าแก้ตัวนี้ <b className="text-slate-900 font-medium">{data.pages.length} หน้า</b> เปลี่ยนตามทั้งหมด:</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {data.pages.map((p) => {
                const n = pending(p.href);
                const body = <>{p.label}{n ? <span className="ml-1 text-[11px] px-1.5 rounded-full bg-amber-50 text-amber-700">แก้ค้าง {n}</span> : null}</>;
                return p.href
                  ? <Link key={p.label} href={p.href} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs hover:bg-slate-50 break-all">{body}</Link>
                  : <span key={p.label} className="px-2 py-1.5 rounded-lg border border-slate-100 text-xs text-slate-500 break-all">{body}</span>;
              })}
            </div>
            {mine.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-1">งานแก้ค้างที่ผูกกับตัวนี้</div>
                <ul className="space-y-1">{mine.map((r) => <li key={r.id} className="text-xs"><span className="font-mono text-slate-400">{changeCode(r.id)}</span> {r.description.split("\n")[0]} <span className="text-slate-400">({r.page_path})</span></li>)}</ul>
              </div>
            )}
            <p className="text-[11px] text-slate-400">นับจากโค้ดตอนขึ้นเว็บรอบล่าสุด (ทะเบียนของกลาง /admin/plugins)</p>
          </div>
        )}
    </ERPModal>
  );
}
