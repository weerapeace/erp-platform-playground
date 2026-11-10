"use client";

/**
 * สตูดิโอแพทเทิร์น — หน้ารวมแพทเทิร์น (แอปหลัก · เจ้าของสั่ง 2026-11-10)
 *   ค้นหา · กรองสถานะ · การ์ดแพทเทิร์น (ภาพย่อเส้นตัด · จำนวนชิ้น · ตะเข็บ · พื้นที่) → กด = เปิดสตูดิโอของใบนั้น
 *   ＋ แพทเทิร์นใหม่ (คนที่มีสิทธิ์แก้) → ตั้งชื่อ → เปิดสตูดิโอ
 * ข้อมูลผ่าน /api/pattern-projects เท่านั้น · สูตร lib/pattern-project
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { PATTERN_STATUS_LABEL, type PatternProjectRow, type PatternProjectStatus } from "@/lib/pattern-project";

const SQFT = 929.03;
type Filter = "open" | PatternProjectStatus | "all";

export function PatternStudioList() {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<PatternProjectRow[]>([]);
  const [me, setMe] = useState<{ can_edit: boolean; can_delete: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sp = new URLSearchParams();
      if (filter !== "open") sp.set("status", filter);
      if (q.trim()) sp.set("q", q.trim());
      const res = await apiFetch(`/api/pattern-projects?${sp.toString()}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.data ?? []); setMe(j.me ?? null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [filter, q]);
  useEffect(() => { const id = setTimeout(() => { void load(); }, q ? 300 : 0); return () => clearTimeout(id); }, [load, q]);

  const create = async () => {
    if (!name.trim()) { setFormErr(t("ใส่ชื่อแพทเทิร์นก่อน", "Enter a pattern name first")); return; }
    setBusy(true); setFormErr(null);
    try {
      const res = await apiFetch("/api/pattern-projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), sku_code: sku.trim() }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      router.push(`/pattern-studio/${j.data.id}`);
    } catch (e) { setFormErr((e as Error).message); setBusy(false); }
  };

  const filters: [Filter, string][] = [["open", t("ที่ใช้อยู่", "Active")], ["draft", t("กำลังทำ", "Draft")], ["ready", t("พร้อมใช้", "Ready")], ["archived", t("เก็บเข้ากรุ", "Archived")], ["all", t("ทั้งหมด", "All")]];
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800"><Icon value="i:shopping-bag" className="text-2xl" />{t("สตูดิโอแพทเทิร์น", "Pattern studio")}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{t("ทำแพทเทิร์นกระเป๋า: วาดชิ้นหรือเริ่มจากแม่แบบทรง กำหนดว่าขอบไหนเย็บติดกัน แล้วดูเป็นภาพ 3D", "Make bag patterns: draw pieces or start from a bag template, say which edges are sewn together, and view it in 3D")}</p>
        </div>
        {me?.can_edit && (
          <button type="button" onClick={() => { setName(""); setSku(""); setFormErr(null); setCreating(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">
            <Icon value="i:plus" className="text-base" />{t("แพทเทิร์นใหม่", "New pattern")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาชื่อ เลขแพทเทิร์น รหัสรุ่น", "Search name, pattern no., model code")} aria-label={t("ค้นหาแพทเทิร์น", "Search patterns")}
          className="h-9 w-72 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("กรองสถานะ", "Filter by status")}>
          {filters.map(([k, lb]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`h-7 rounded-md px-2.5 text-xs ${filter === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{lb}</button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState /> : err ? <ErrorState hint={err} onRetry={() => void load()} /> : rows.length === 0 ? (
        <EmptyState title={q || filter !== "open" ? t("ไม่พบแพทเทิร์นตามที่ค้นหา", "No patterns match") : t("ยังไม่มีแพทเทิร์น", "No patterns yet")}
          hint={q || filter !== "open" ? t("ลองเปลี่ยนคำค้นหาหรือตัวกรอง", "Try a different search or filter") : me?.can_edit ? t("กด แพทเทิร์นใหม่ แล้วเริ่มจากแม่แบบทรงกระเป๋าได้เลย", "Press New pattern and start from a bag template") : t("ยังไม่มีใครสร้างแพทเทิร์น", "Nobody has created a pattern yet")}
          action={me?.can_edit && !q && filter === "open" ? { label: t("＋ แพทเทิร์นใหม่", "＋ New pattern"), onClick: () => setCreating(true) } : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => {
            const st = PATTERN_STATUS_LABEL[r.status] ?? PATTERN_STATUS_LABEL.draft;
            const [vb, d] = (r.thumb ?? "").split("|");
            return (
              <button key={r.id} type="button" onClick={() => router.push(`/pattern-studio/${r.id}`)} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left hover:border-blue-300 hover:shadow-sm">
                <div className="grid h-36 place-items-center bg-slate-50 p-3">
                  {vb && d ? (
                    <svg viewBox={`0 0 ${vb}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d={d} fill="#e2e8f0" fillRule="evenodd" stroke="#475569" strokeWidth={1} vectorEffect="non-scaling-stroke" /></svg>
                  ) : <span className="text-xs text-slate-400">{t("ยังไม่มีชิ้น", "No pieces yet")}</span>}
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-medium text-slate-800 group-hover:text-blue-700">{r.name}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{t(st.th, st.en)}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{[r.pattern_no, r.sku_code].filter(Boolean).join(" · ") || "—"}</div>
                  <div className="text-xs tabular-nums text-slate-600">{t(`${r.piece_count} ชิ้น · ตะเข็บ ${r.seam_count} แนว · ${(Number(r.area_cm2) / SQFT).toFixed(2)} ตร.ฟุต`, `${r.piece_count} pcs · ${r.seam_count} seams · ${(Number(r.area_cm2) / SQFT).toFixed(2)} sq ft`)}</div>
                  <div className="truncate text-[11px] text-slate-400">{t("แก้ล่าสุด", "Updated")} {fmtDate(r.updated_at)}{r.updated_by_name ? ` · ${r.updated_by_name}` : ""}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ERPModal open={creating} onClose={() => { if (!busy) setCreating(false); }} size="sm" title={t("แพทเทิร์นใหม่", "New pattern")} hasUnsavedChanges={!!name.trim()}
        footer={<>
          <button type="button" disabled={busy} onClick={() => setCreating(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={busy} onClick={() => void create()} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{busy ? t("กำลังสร้าง…", "Creating…") : t("สร้างแล้วเปิดสตูดิโอ", "Create and open")}</button>
        </>}>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="text-slate-600">{t("ชื่อแพทเทิร์น", "Pattern name")} <span className="text-red-500">*</span></span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} maxLength={120} placeholder={t("เช่น Tote ใบกลาง ช่องหัวใจ", "e.g. Medium tote with heart window")} className="h-9 w-full rounded-lg border border-slate-200 px-3" /></label>
          <label className="block space-y-1"><span className="text-slate-600">{t("รหัสรุ่น / สินค้า (ไม่ใส่ก็ได้)", "Model / product code (optional)")}</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={80} className="h-9 w-full rounded-lg border border-slate-200 px-3" /></label>
          {formErr && <p className="text-sm text-red-600">{formErr}</p>}
        </div>
      </ERPModal>
    </div>
  );
}
