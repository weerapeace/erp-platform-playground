"use client";

// ============================================================
// แถบ "ความพร้อม" ใต้ความคืบหน้าในลิ้นชักงาน — ป้าย ✓/✕ ทีละเรื่อง (ยังขาดอะไร) · เจ้าของขอ 2026-11-21
//  • ตัวคำนวณ = lib/task-readiness (ใช้ตัวเช็กกลางของปุ่ม "ตรวจเร็ว" + สถานะลงร้านเดียวกับแถบ Platform)
//  • รายการที่เช็กตั้งต่อประเภทงานได้ที่ /tasks/settings (ui_config task_readiness_rules)
//  • กดป้ายที่ขาด → เปิด Parent SKU ที่ต้องแก้ (ป้าย Platform → เปิดตัวช่วยลงร้านที่แถบ Platform)
//  • อ่านอย่างเดียว ไม่แก้ข้อมูล
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { sizeFilled } from "@/lib/product-listing-checks";
import { cleanReadinessRules, readinessKeysFor, readinessSummary, taskReadiness, READINESS_RULES_KEY, type ReadinessItem, type ReadinessParent, type ReadinessRules } from "@/lib/task-readiness";
import { getTaskQuickCheck } from "./data";
import { platformLabel } from "./use-options";
import type { PlatformListedStatus } from "./task-platform-listing";

let rulesCache: Promise<ReadinessRules> | null = null;
export function loadReadinessRules(force = false): Promise<ReadinessRules> {
  if (!rulesCache || force) {
    rulesCache = apiFetch(`/api/ui-config?key=${READINESS_RULES_KEY}`).then((r) => r.json())
      .then((j) => cleanReadinessRules(j?.value)).catch(() => cleanReadinessRules(null));
  }
  return rulesCache;
}
export function clearReadinessRulesCache() { rulesCache = null; }

export function TaskReadinessBar({ taskId, taskType, platforms, parentKey, status, onOpenParent, onResult, accent, persist = false, onSaved }: {
  taskId: string;
  taskType: string | null;
  platforms: string[];
  /** id Parent ที่ผูก (เปลี่ยน = โหลดใหม่) */
  parentKey: string;
  status: PlatformListedStatus;
  onOpenParent: (parentId: string) => void;
  /** ส่งผลขึ้นไป (ใช้เตือนก่อนส่งตรวจ/เสร็จ) */
  onResult?: (items: ReadinessItem[]) => void;
  accent?: string;
  /** บันทึกผลลงงาน (แถบบนการ์ดบอร์ดใช้) — เปิดเฉพาะในลิ้นชักงาน */
  persist?: boolean;
  /** บันทึกผลแล้ว (ค่าเปลี่ยน) → หน้าแม่โหลดรายการงานใหม่ให้การ์ดอัปเดต */
  onSaved?: () => void;
}) {
  const t = useT();
  const [parents, setParents] = useState<ReadinessParent[] | null>(null);
  const [rules, setRules] = useState<ReadinessRules | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => { let live = true; loadReadinessRules().then((r) => { if (live) setRules(r); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true; setErr(false);
    getTaskQuickCheck(taskId).then((ps) => { if (live) setParents(ps as ReadinessParent[]); }).catch(() => { if (live) { setErr(true); setParents([]); } });
    return () => { live = false; };
  }, [taskId, parentKey]);

  const listed = useMemo(() => {
    if (!status.listed || !status.total) return status.list.length === 0 ? {} : null;
    const out: Record<string, boolean> = {};
    for (const code of status.known) out[code] = (status.listed[code] ?? 0) >= status.total;
    return out;
  }, [status.listed, status.known, status.total, status.list.length]); // ไม่ผูกทั้งก้อน status (กันวนอัปเดต)

  // ผูกด้วยข้อความ (ไม่ผูก array ที่หน้าแม่สร้างใหม่ทุกครั้ง) — กันวนอัปเดต
  const platformsKey = platforms.join(",");
  const items = useMemo(() => {
    if (!parents || !rules) return null;
    return taskReadiness(parents, readinessKeysFor(rules, taskType), { platforms: platformsKey ? platformsKey.split(",") : [], listed, platformLabel: (c) => platformLabel(c) || c });
  }, [parents, rules, taskType, platformsKey, listed]);
  // ส่งผลขึ้นไปเฉพาะตอนผลเปลี่ยนจริง (เทียบลายเซ็น) — หน้าแม่ setState แล้วเรนเดอร์ใหม่จะไม่วนกลับมา
  const sentSig = useRef("");
  const savedSig = useRef("");
  useEffect(() => {
    if (!items) return;
    const sig = items.map((i) => `${i.key}:${i.ok ? 1 : 0}:${i.pending ? 1 : 0}:${i.issues.length}`).join("|");
    if (sig === sentSig.current) return;
    sentSig.current = sig; onResult?.(items);
    // บันทึกผล (ผ่าน/ทั้งหมด) ให้แถบบนการ์ดบอร์ดงาน — รอสถานะลงร้านมาก่อน (ไม่บันทึกตอนยังมีข้อรอ) · ค่าเดิมเท่ากัน server ไม่เขียนซ้ำ
    if (!persist || items.some((i) => i.pending)) return;
    const s = readinessSummary(items); const key = `${s.done}/${s.total}`;
    if (key === savedSig.current) return;
    savedSig.current = key;
    void apiFetch(`/api/creative-tasks/${taskId}/readiness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: s.done, total: s.total }) })
      .then((r) => { if (r.ok) onSaved?.(); }).catch(() => undefined);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAll, setShowAll] = useState(false);
  const toast = useToast();
  const [sizeBusy, setSizeBusy] = useState(false);
  // ปุ่ม "ไม่ต้องใส่ไซส์" (เจ้าของเลือก 2026-11-22) — ติ๊ก parent_skus_v2.size_not_needed ผ่าน API กลาง (ลงประวัติ) · ย้อนกลับได้จากแจ้งผล
  const noSizeIds = (parents ?? []).filter((p) => !sizeFilled(p)).map((p) => p.id);
  const setSizeNotNeeded = async (ids: string[], on: boolean): Promise<boolean> => {
    const res = await Promise.all(ids.map((id) => apiFetch(`/api/master-v2/parent-skus/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size_not_needed: on }) }).then((r) => r.ok).catch(() => false)));
    const okIds = new Set(ids.filter((_, i) => res[i]));
    if (okIds.size) setParents((ps) => (ps ?? []).map((p) => (okIds.has(p.id) ? { ...p, size_not_needed: on } : p)));
    return okIds.size === ids.length;
  };
  const markNoSize = async () => {
    const ids = noSizeIds; if (!ids.length || sizeBusy) return;
    setSizeBusy(true);
    const ok = await setSizeNotNeeded(ids, true);
    setSizeBusy(false);
    if (!ok) { toast.error(t("บันทึกไม่สำเร็จ — อาจไม่มีสิทธิ์แก้สินค้า", "Save failed — you may not have permission to edit products")); return; }
    toast.undo(t(`ตั้งว่าไม่ต้องใส่ไซส์แล้ว (${ids.length} รุ่น)`, `Marked size not needed (${ids.length})`), async () => { await setSizeNotNeeded(ids, false); });
  };

  if (err) return <p className="text-[11px] text-slate-400">{t("ตรวจความพร้อมไม่สำเร็จ — ลองเปิดใหม่", "Couldn't check readiness — reopen to retry")}</p>;
  if (!items) return <div className="h-5 w-40 rounded bg-slate-100 animate-pulse" />;
  if (!items.length) return null;
  const sum = readinessSummary(items);
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{t("ความพร้อมสินค้า", "Product readiness")}</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: sum.missing ? (accent || "#8b5cf6") : "#10b981" }} /></div>
        <span className={sum.missing ? "text-slate-600 font-medium" : "text-emerald-600 font-medium"}>{sum.done}/{sum.total}{!sum.missing && sum.total > 0 ? ` ${t("ครบ", "done")}` : ""}</span>
        {/* ครบ = เหลือแถบเดียว · ขาด = โชว์เฉพาะข้อที่ขาด · กดดูทั้งหมดได้ (เจ้าของเลือก 2026-11-22) */}
        {sum.done > 0 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10.5px] text-slate-500 hover:bg-slate-50">
            {showAll ? t("ซ่อน ▴", "Hide ▴") : sum.missing ? t(`ครบแล้ว ${sum.done} ▾`, `${sum.done} done ▾`) : t("ดูรายการ ▾", "Show ▾")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 empty:hidden">
        {items.map((it) => {
          const label = t(it.label, it.label_en);
          if (it.pending) return <span key={it.key} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-400">… {label}</span>;
          if (it.ok) return showAll ? <span key={it.key} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">✓ {label}</span> : null;
          const canJump = it.parentIds.length > 0;
          const chip = (
            <button key={it.key} type="button" title={it.issues.join("\n")} disabled={!canJump}
              onClick={() => { if (canJump) onOpenParent(it.parentIds[0]); }}
              className={`inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 ${canJump ? "hover:bg-rose-100 cursor-pointer" : "cursor-help"}`}>
              ✕ {label}{it.issues.length > 1 && <span className="text-rose-400">({it.issues.length})</span>}
            </button>
          );
          if (it.key === "size" && noSizeIds.length > 0) return (
            <span key={it.key} className="inline-flex items-center gap-1">
              {chip}
              <button type="button" disabled={sizeBusy} onClick={() => void markNoSize()}
                title={t("สินค้านี้ไม่มีขนาดให้วัด — ไม่ต้องเตือนเรื่องขนาดอีก (น้ำหนักยังต้องใส่) · ย้อนกลับได้", "This product has no size to measure — stop warning about size (weight still required) · undoable")}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                {sizeBusy ? "…" : t("ไม่ต้องใส่ไซส์", "No size needed")}
              </button>
            </span>
          );
          return chip;
        })}
      </div>
    </div>
  );
}
