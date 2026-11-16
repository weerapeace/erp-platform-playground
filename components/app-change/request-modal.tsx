"use client";

/**
 * ป๊อป "ขอแก้หน้านี้" — ศูนย์งานแก้แอป (ของกลาง · เปิดจากเมนูโปรไฟล์ทุกหน้า)
 * - หน้า = ใส่ให้เอง (หน้าที่เปิดอยู่) · ของกลางในหน้านี้ + กล่องในแผนผัง = ถามจาก /api/app-changes/context แล้วให้ติ๊ก
 * - ภาพหน้าจอ = FileMultiInput กลาง (ลากวาง / Ctrl+V ได้ทั้งหน้า)
 * - บันทึก = แถวใน issue_reports (page_path/parts/flow_refs) ผ่าน POST /api/issue-reports
 * กติกา/ตัวช่วย = lib/app-change.ts · คู่มือ docs/app-changes.md
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { FileMultiInput } from "@/components/file-multi-input";
import type { FlowRef, PagePart } from "@/lib/app-change";

export const APP_CHANGE_APP_NAME = "งานแก้แอป";

type Ctx = { page: string; parts: PagePart[]; flow: (FlowRef & { label: string })[] };

export function useAppChangeContext(path: string | null) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setCtx(null); setErr(null);
    apiFetch(`/api/app-changes/context?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((j) => { if (alive) { if (j?.error) setErr(j.error); else setCtx(j as Ctx); } })
      .catch(() => { if (alive) setErr("โหลดข้อมูลหน้านี้ไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [path]);
  return { ctx, err };
}

const Chip = ({ on, onClick, children, tone = "violet" }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: "violet" | "amber" }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`h-7 px-2.5 rounded-full text-xs border transition ${on
      ? tone === "violet" ? "bg-violet-600 border-violet-600 text-white" : "bg-amber-500 border-amber-500 text-white"
      : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
    {children}
  </button>
);

export function AppChangeRequestModal({ open, onClose, pagePath, pageTitle, onSaved }: {
  open: boolean; onClose: () => void; pagePath: string | null; pageTitle?: string | null; onSaved?: (id: string) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const { ctx, err } = useAppChangeContext(open ? pagePath : null);
  const [parts, setParts] = useState<string[]>([]);
  const [flow, setFlow] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [priority, setPriority] = useState<"medium" | "high">("medium");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setParts([]); setText(""); setImages([]); setPriority("medium"); setFormErr(null); } }, [open, pagePath]);
  // กล่องแผนผังที่ผูกหน้านี้ = ติ๊กไว้ให้ก่อน
  useEffect(() => { setFlow(ctx ? ctx.flow.map((f) => `${f.kind}:${f.ref}`) : []); }, [ctx]);

  const toggle = (list: string[], set: (v: string[]) => void, k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const dirty = !!text.trim() || images.length > 0 || parts.length > 0;

  const save = async () => {
    if (!text.trim()) { setFormErr("พิมพ์ก่อนว่าอยากให้แก้อะไร"); return; }
    setBusy(true); setFormErr(null);
    try {
      const r = await apiFetch("/api/issue-reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_name: APP_CHANGE_APP_NAME, description: text.trim(), images, priority,
          reporterName: user?.name ?? user?.email ?? null,
          page_path: pagePath, parts,
          flow_refs: flow.map((k) => { const [kind, ref] = k.split(":"); return { kind, ref }; }),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success("จดงานแก้แล้ว — ดูทั้งหมดที่ศูนย์งานแก้แอป");
      onSaved?.(String(j.id));
      onClose();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="ขอแก้หน้านี้" size="md" storageKey="app-change-request" defaultExpanded={false}
      hasUnsavedChanges={dirty && !busy}
      footer={
        <div className="flex items-center gap-2 w-full">
          <a href="/admin/app-changes" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><Icon value="i:pencil" /> ศูนย์งานแก้แอป</a>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={save} disabled={busy} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">{busy ? "กำลังบันทึก…" : "บันทึกงานแก้"}</button>
        </div>
      }>
      <div className="space-y-4 text-sm">
        <div className="text-slate-500">หน้า: <b className="text-slate-900 font-medium">{pageTitle || pagePath || "—"}</b>{pageTitle && pagePath ? <span className="text-slate-400"> · {pagePath}</span> : null}</div>

        <div>
          <div className="text-xs text-slate-500 mb-1.5">จุดที่อยากแก้ — ของกลางในหน้านี้ (ติ๊กได้หลายอัน · ไม่ติ๊กก็ได้)</div>
          {err ? <div className="text-xs text-rose-600">{err}</div>
            : !ctx ? <div className="text-xs text-slate-400">กำลังดูว่าหน้านี้ใช้ของกลางอะไร…</div>
            : ctx.parts.length === 0 ? <div className="text-xs text-slate-400">หน้านี้ไม่มีของกลางที่ลงทะเบียน — พิมพ์บอกในช่องด้านล่างได้เลย</div>
            : <div className="flex flex-wrap gap-1.5">{ctx.parts.map((p) => <Chip key={p.key} on={parts.includes(p.key)} onClick={() => toggle(parts, setParts, p.key)}>{p.label}</Chip>)}</div>}
        </div>

        <label className="block">
          <div className="text-xs text-slate-500 mb-1.5">อยากให้เป็นยังไง</div>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setFormErr(null); }} rows={4} autoFocus
            placeholder="ช่องค้นหาลูกค้าให้ค้นเบอร์โทรได้ด้วย"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200" />
          {formErr && <div className="text-xs text-rose-600 mt-1">{formErr}</div>}
        </label>

        <div>
          <div className="text-xs text-slate-500 mb-1.5">ภาพหน้าจอ (ลากมาวาง หรือ Ctrl+V)</div>
          <FileMultiInput value={images} onChange={setImages} folder="issue-reports" max={6} pasteFromPage label="แนบภาพ" />
        </div>

        {ctx && ctx.flow.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 mb-1.5">อยู่ในแผนผังการทำงาน</div>
            <div className="flex flex-wrap gap-1.5">{ctx.flow.map((f) => { const k = `${f.kind}:${f.ref}`; return <Chip key={k} tone="amber" on={flow.includes(k)} onClick={() => toggle(flow, setFlow, k)}>{f.label}</Chip>; })}</div>
          </div>
        )}

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={priority === "high"} onChange={(e) => setPriority(e.target.checked ? "high" : "medium")} /> ด่วน
        </label>
      </div>
    </ERPModal>
  );
}
