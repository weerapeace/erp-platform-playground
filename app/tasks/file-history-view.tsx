"use client";
/**
 * 📂 ประวัติไฟล์ — ทุกครั้งที่ใช้โปรแกรม "ตัวแยกไฟล์ ERP": ลงรูปอะไร ย้ายอะไรไปไหน ใครทำ เมื่อไหร่ · ย้ายกลับแล้วก็บอก
 *   FileHistoryView = Task Manager › มุมมอง "ประวัติไฟล์" (ค้นรหัสรุ่น · กรองชนิดงาน / คน / ช่วงวัน · โหลดเพิ่ม) — ?view=files&q=PIX39 เปิดตรงได้
 *   FileHistoryBox  = กล่องเล็กในหน้างาน: ประวัติของสินค้าที่ผูกกับงาน (Parent SKU)
 *   FileSortErpBlock = กล่อง "ลงระบบ ERP" ใต้แต่ละครั้ง (โปรแกรม v1.13+): ช่องไหน ลง/เอาออก/ข้ามกี่รูป · รูปย่อ · ลิงก์หน้าสินค้า · พลาดเพราะอะไร
 * ข้อมูล: GET /api/file-sort/history (อ่านประวัติกลาง audit_logs — ไม่มีตารางของตัวเอง)
 * ของกลาง: ActivityFeed (ไทม์ไลน์ประวัติ · คำแปล lib/audit-format · renderDetail) · HoverImage · ErrorState · Icon · useT
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import { ErrorState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { useLang, useT } from "@/components/i18n";
import { auditEntityInfo } from "@/lib/audit-entities";
import { r2ImageUrl } from "@/lib/r2-image";
import { cleanErpSlots, erpSlotText, type FsErpSlot } from "@/lib/file-sort-history";

type Actor = { id: string; name: string };
type HistoryResp = { entries?: ActivityEntry[]; has_more?: boolean; actors?: Actor[]; error?: string | null };

async function fetchHistory(params: URLSearchParams): Promise<HistoryResp> {
  const res = await apiFetch(`/api/file-sort/history?${params.toString()}`);
  const j = (await res.json().catch(() => ({}))) as HistoryResp;
  if (!res.ok || j.error) throw new Error(j.error || "โหลดประวัติไฟล์ไม่สำเร็จ");
  return j;
}

const selCls = "h-9 px-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400";

const SLOT_TONE: Record<FsErpSlot["state"], string> = {
  done: "text-emerald-700", partial: "text-amber-700", failed: "text-red-700", already: "text-slate-500", off: "text-slate-400",
};

/** กล่อง "ลงระบบ ERP" ของ 1 ครั้งที่ใช้ — ประวัติเก่า (ไม่มี metadata.erp) = ไม่มีกล่อง */
export function FileSortErpBlock({ entry, compact = false }: { entry: ActivityEntry; compact?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  if (entry.action !== "file_sort.upload") return null;
  const slots = cleanErpSlots(entry.metadata?.erp);
  if (!slots.length) return null;
  return (
    <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-2">
      <p className="text-xs font-semibold text-emerald-800 mb-1 flex items-center gap-1">
        <Icon name="upload" size={13} /> {t("ลงระบบ ERP", "Uploaded to ERP")}
      </p>
      <ul className="space-y-1.5">
        {slots.map((s, i) => {
          const { title, result } = erpSlotText(s, lang === "en");
          const href = s.entity_type && s.entity_id ? auditEntityInfo(s.entity_type).href?.(s.entity_id) ?? null : null;
          return (
            <li key={`${s.kind}-${s.code}-${i}`} className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-medium text-slate-700">{title}</span>
                <span className={SLOT_TONE[s.state]}>{result}</span>
                {href && s.state !== "off" && (
                  <a href={href} target="_blank" rel="noreferrer" className="text-violet-700 hover:underline inline-flex items-center gap-0.5">
                    {t("เปิดหน้าสินค้า", "Open product")} <Icon name="open" size={11} />
                  </a>
                )}
              </div>
              {s.keys.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {s.keys.slice(0, compact ? 6 : 12).map((k) => <HoverImage key={k} url={r2ImageUrl(k)} size={compact ? 28 : 36} previewSize={240} />)}
                  {s.up > s.keys.length && <span className="text-[11px] text-slate-400 self-center">+{s.up - s.keys.length}</span>}
                </div>
              )}
              {s.fails.length > 0 && (
                <div className="mt-0.5 text-xs text-red-700">
                  {t(`พลาด ${s.fails.length}`, `${s.fails.length} failed`)}: {s.fails.slice(0, 5).map((f) => [f.file, f.why].filter(Boolean).join(" — ")).join(" · ")}
                  {s.fails.length > 5 && " …"}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FileHistoryView() {
  const t = useT();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [profile, setProfile] = useState("");
  const [actor, setActor] = useState("");
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  // ?q=PIX39 จากลิงก์ในหน้างาน → ค้นรหัสนั้น · ช่วงวัน "ทั้งหมด" จะได้เจอแน่
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) { setQ(v); setTerm(v); setDays(""); }
  }, []);
  useEffect(() => { const h = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(h); }, [q]);

  const params = useCallback((before?: string) => {
    const p = new URLSearchParams({ limit: "50" });
    if (term) p.set("q", term);
    if (profile) p.set("profile", profile);
    if (actor) p.set("actor", actor);
    if (days) p.set("days", days);
    if (before) p.set("before", before);
    return p;
  }, [term, profile, actor, days]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setErr(null);
    try {
      const p = params(); if (!actors.length) p.set("include", "actors");
      const j = await fetchHistory(p);
      if (my !== seq.current) return;
      setRows(j.entries ?? []); setMore(!!j.has_more);
      if (j.actors) setActors(j.actors);
    } catch (e) { if (my === seq.current) setErr(e instanceof Error ? e.message : String(e)); }
    finally { if (my === seq.current) setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const j = await fetchHistory(params(last.created_at));
      const seen = new Set(rows.map((r) => r.id));
      setRows((cur) => [...cur, ...(j.entries ?? []).filter((r) => !seen.has(r.id))]); setMore(!!j.has_more);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoadingMore(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><Icon name="folder" size={18} /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-800">{t("ประวัติไฟล์", "File history")}</h2>
          <p className="text-xs text-slate-500">{t("ทุกครั้งที่ใช้โปรแกรมตัวแยกไฟล์: ลงรูปเข้าระบบกี่รูป ย้ายอะไรไปไหน ใครทำ เมื่อไหร่ · ถ้ากดย้ายกลับแล้วจะบอกด้วย",
            "Every run of the ERP File Sorter: images uploaded, what moved where, who and when · undos are shown too")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นรหัสรุ่น เช่น PIX39", "Search model, e.g. PIX39")} aria-label={t("ค้นรหัสรุ่น", "Search model")}
            className="h-9 w-56 pl-8 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <select value={profile} onChange={(e) => setProfile(e.target.value)} className={selCls} aria-label={t("ชนิดงาน", "Job type")}>
          <option value="">{t("ทุกชนิดงาน", "All job types")}</option>
          <option value="product">{t("งานสินค้า", "Products")}</option>
          <option value="content">Content</option>
          <option value="artwork">{t("โลโก้ / Artwork", "Logo / Artwork")}</option>
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)} className={selCls} aria-label={t("คนทำ", "Person")}>
          <option value="">{t("ทุกคน", "Everyone")}</option>
          {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(e.target.value)} className={selCls} aria-label={t("ช่วงวัน", "Period")}>
          <option value="7">{t("7 วันล่าสุด", "Last 7 days")}</option>
          <option value="30">{t("30 วันล่าสุด", "Last 30 days")}</option>
          <option value="90">{t("90 วันล่าสุด", "Last 90 days")}</option>
          <option value="">{t("ทั้งหมด", "All time")}</option>
        </select>
      </div>
      {err && !rows.length ? (
        <ErrorState hint={err} onRetry={() => void load()} retrying={loading} />
      ) : (
        <ActivityFeed entries={rows} loading={loading} showWhere renderDetail={(e) => <FileSortErpBlock entry={e} />}
          emptyMessage={term || profile || actor
            ? t("ไม่พบประวัติที่ตรงกับตัวกรอง ลองเปลี่ยนคำค้นหรือช่วงวัน", "No history matches — try another search or period")
            : t("ยังไม่มีประวัติ — จะขึ้นหลังมีคนใช้โปรแกรมตัวแยกไฟล์ (เวอร์ชัน 1.5.2 ขึ้นไปจดครบ)", "No history yet — it appears once someone runs the File Sorter (v1.5.2+)")} />
      )}
      {more && !loading && (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
            className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loadingMore ? t("กำลังโหลด…", "Loading…") : t("โหลดเพิ่ม", "Load more")}
          </button>
        </div>
      )}
    </div>
  );
}

/** กล่องในหน้างาน: ประวัติไฟล์ของสินค้าที่ผูกกับงาน (Parent SKU) · ไม่มีประวัติ = บอกสั้น ๆ */
export function FileHistoryBox({ parents }: { parents: { id: string; code?: string | null }[] }) {
  const t = useT();
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const ids = parents.map((p) => p.id).filter(Boolean).join(",");
  const codes = parents.map((p) => (p.code ?? "").trim()).filter(Boolean).join(",");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const p = new URLSearchParams({ limit: "5" });
      if (ids) p.set("parent_ids", ids);
      if (codes) p.set("codes", codes);
      const j = await fetchHistory(p);
      setRows(j.entries ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [ids, codes]);
  useEffect(() => { if (ids || codes) void load(); else setLoading(false); }, [load, ids, codes]);

  const first = codes.split(",")[0] ?? "";
  return (
    <div>
      {err ? <ErrorState hint={err} onRetry={() => void load()} retrying={loading} className="py-4" />
        : <ActivityFeed entries={rows} loading={loading} compact showWhere renderDetail={(e) => <FileSortErpBlock entry={e} compact />}
            emptyMessage={t("ยังไม่เคยใช้ตัวแยกไฟล์กับรุ่นนี้", "The File Sorter hasn't been used for this model yet")} />}
      {!loading && !err && rows.length > 0 && (
        <a href={`/tasks?view=files${first ? `&q=${encodeURIComponent(first)}` : ""}`} className="inline-block mt-2 text-xs text-violet-700 hover:underline">
          {t("ดูทั้งหมดในหน้าประวัติไฟล์ →", "See all in File history →")}
        </a>
      )}
    </div>
  );
}
