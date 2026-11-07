"use client";
/**
 * ชิ้นส่วนของหน้าแม่แบบเอกสาร (/admin/report-templates) — แยกไฟล์ให้ page.tsx อ่านง่าย
 *   UsageList      = "ใช้พิมพ์ที่" (จาก lib/report-usage)
 *   RealDocPicker  = เลือกเอกสารจริงมาพรีวิว (GET /api/admin/report-templates/sample-docs)
 *   HistoryList    = ประวัติแม่แบบ + เทียบ + ใช้เวอร์ชันนี้ (GET /api/admin/report-templates/history)
 */
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { usageMatch, usagesFor } from "@/lib/report-usage";
import type { ReportTemplateRow } from "@/app/api/admin/report-templates/route";
import type { SampleDoc } from "@/app/api/admin/report-templates/sample-docs/route";
import type { TemplateVersion } from "@/lib/report-template-history";

export type { SampleDoc, TemplateVersion };

const FIELD_LABEL: Record<string, string> = {
  label: "ชื่อ", paper_size: "กระดาษ", orientation: "แนวกระดาษ",
  header_html: "หัวเอกสาร", body_html: "เนื้อหา", footer_html: "ท้ายเอกสาร", custom_css: "CSS",
};

/* ── ใช้พิมพ์ที่ ── */
export function UsageList({ row }: { row: ReportTemplateRow }) {
  const usages = usagesFor(row.entity_type);
  if (usages.length === 0) {
    return <p className="text-xs text-slate-400">ยังไม่มีหน้าพิมพ์ไหนลงทะเบียนว่าใช้เอกสารประเภทนี้</p>;
  }
  return (
    <ul className="space-y-1">
      {usages.map(u => {
        const m = usageMatch(u, row);
        return (
          <li key={u.label} className={`flex items-start gap-2 text-sm ${m === "no" ? "text-slate-400" : "text-slate-700"}`}>
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${m === "yes" ? "bg-emerald-500" : m === "maybe" ? "bg-amber-400" : "bg-slate-300"}`} />
            <span className="min-w-0 flex-1">
              {u.label}
              <span className="block text-[11px] text-slate-400">
                {m === "yes" ? "ใช้ใบนี้อยู่" : m === "maybe" ? "ใช้ใบนี้ถ้าเลือกไว้ในหน้าพิมพ์" : typeof u.pick === "object" ? "ใช้ใบอื่น (ตามรหัสแม่แบบ)" : "ใช้ใบหลักใบอื่น"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── เลือกเอกสารจริง ── */
export function RealDocPicker({ entityType, value, onPick }: {
  entityType: string;
  value: SampleDoc | null;
  onPick: (doc: SampleDoc) => void;
}) {
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<SampleDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(!value);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiFetch(`/api/admin/report-templates/sample-docs?entity_type=${encodeURIComponent(entityType)}&q=${encodeURIComponent(q)}`);
        const j = await res.json() as { data: SampleDoc[]; error: string | null };
        if (j.error) throw new Error(j.error);
        setDocs(j.data);
        if (!value && j.data[0] && !q) { onPick(j.data[0]); setOpen(false); }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "โหลดรายการไม่ได้");
      } finally {
        setLoading(false);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดตามคำค้น/ประเภท
  }, [q, entityType, open]);

  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs text-slate-700 hover:bg-slate-50">
        <Icon name="search" />
        <span className="min-w-0 flex-1 truncate">{value ? <>{value.label}{value.sub && <span className="text-slate-400"> · {value.sub}</span>}</> : "เลือกเอกสาร…"}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-9 z-20 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นเลขที่ หรือชื่อลูกค้า/ร้าน"
            className="mb-1 h-8 w-full rounded-md border border-slate-200 px-2.5 text-xs focus:border-blue-400 focus:outline-none" />
          <div className="max-h-64 overflow-auto">
            {loading ? <p className="p-3 text-center text-xs text-slate-400">กำลังโหลด…</p>
              : err ? <p className="p-3 text-center text-xs text-red-600">{err}</p>
              : docs.length === 0 ? <p className="p-3 text-center text-xs text-slate-400">ไม่พบเอกสาร</p>
              : docs.map(d => (
                <button key={d.id} type="button" onClick={() => { onPick(d); setOpen(false); }}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 ${value?.id === d.id ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}>
                  {d.label}{d.sub && <span className="text-slate-400"> · {d.sub}</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ประวัติ ── */
export function HistoryList({ templateId, reloadKey, comparingId, onCompare, onRestore, canEdit, allowCompare = true }: {
  templateId: string;
  reloadKey: number;
  comparingId: string | null;
  onCompare: (v: TemplateVersion | null) => void;
  onRestore: (v: TemplateVersion) => void;
  canEdit: boolean;
  /** แบบลากวางเทียบภาพไม่ได้ (ไม่ใช่ HTML) */
  allowCompare?: boolean;
}) {
  const [items, setItems] = useState<TemplateVersion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setItems(null);
    setErr(null);
    apiFetch(`/api/admin/report-templates/history?id=${templateId}`)
      .then(r => r.json() as Promise<{ data: TemplateVersion[]; error: string | null }>)
      .then(j => { if (off) return; if (j.error) throw new Error(j.error); setItems(j.data); })
      .catch(e => { if (!off) setErr(e instanceof Error ? e.message : "โหลดประวัติไม่ได้"); });
    return () => { off = true; };
  }, [templateId, reloadKey]);

  if (err) return <Note tone="error">{err}</Note>;
  if (!items) return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />)}</div>;
  if (items.length === 0) {
    return <Note>ยังไม่มีประวัติ — ระบบเริ่มเก็บตั้งแต่ตอนนี้ ทุกครั้งที่กดบันทึกจะเก็บของเดิมไว้ให้ย้อนได้ (30 ครั้งล่าสุด)</Note>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-slate-400">แต่ละแถว = หน้าตาเอกสาร "ก่อน" ถูกแก้ครั้งนั้น</p>
      {items.map(v => {
        const active = comparingId === v.id;
        return (
          <div key={v.id} className={`rounded-lg border px-2.5 py-2 ${active ? "border-blue-300 bg-blue-50" : "border-slate-100"}`}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-700">{new Date(v.changed_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="min-w-0 flex-1 truncate text-slate-400">{v.actor_name ?? "ไม่ระบุ"}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">แก้: {v.changed.map(c => FIELD_LABEL[c] ?? c).join(", ") || "-"}</p>
            <div className="mt-1.5 flex gap-1.5">
              {allowCompare && <button type="button" onClick={() => onCompare(active ? null : v)}
                className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
                {active ? "เลิกเทียบ" : "เทียบกับตอนนี้"}
              </button>}
              {canEdit && (
                <button type="button" onClick={() => onRestore(v)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
                  ใช้เวอร์ชันนี้
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "error" }) {
  const cls = tone === "error" ? "bg-red-50 text-red-700" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500";
  return <p className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${cls}`}>{children}</p>;
}
