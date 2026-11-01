"use client";

// 📌 แท็บ "กฎที่จำไว้" — คู่สินค้าที่คนยืนยันแล้ว (สินค้า+ตัวเลือกในเมล → SKU หรือ รุ่น) · ดู / แก้ / ลบ ได้ (เพิ่มได้ต้องแก้/ลบได้)
// แก้ = ย้ายรายการที่ผูกด้วยกฎนี้ตามไป · ลบ = เลือกส่งรายการกลับไปรอยืนยัน · ออเดอร์ที่ตัดสต๊อกแล้วไม่แตะ (กันสต๊อกเพี้ยน)
// โหลดทีละหน้า · ของกลาง: MiniTable · Pager · PlatformBadge · ERPModal · ConfirmDialog · SkuPicker · ParentSkuPicker · ERPInput · toast

import { useCallback, useEffect, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { PlatformBadge } from "@/components/platform-icon";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ParentSkuPicker, SkuPicker, type ParentSkuPickerValue, type SkuPickerValue } from "@/components/pickers";
import { ERPInput } from "@/components/form";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime, PLATFORM_LABEL, type RuleView } from "./types";

const num = (n: number) => n.toLocaleString("th-TH");
const PLATFORMS = ["shopee", "lazada"];

export function RulesTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [platform, setPlatformRaw] = useState("");
  const [level, setLevelRaw] = useState<"" | "sku" | "model">("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSizeRaw] = useState(20);
  const [rows, setRows] = useState<RuleView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RuleView | null>(null);
  const [deleting, setDeleting] = useState<RuleView | null>(null);
  const [release, setRelease] = useState(true);
  const [busy, setBusy] = useState(false);

  const setPlatform = (v: string) => { setPlatformRaw(v); setPage(0); };
  const setLevel = (v: "" | "sku" | "model") => { setLevelRaw(v); setPage(0); };
  const setSize = (v: number) => { setSizeRaw(v); setPage(0); };
  useEffect(() => {
    const t = setTimeout(() => { const v = q.trim(); if (v !== query) { setQuery(v); setPage(0); } }, 300);
    return () => clearTimeout(t);
  }, [q, query]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ page: String(page), size: String(size) });
      if (platform) p.set("platform", platform);
      if (level) p.set("level", level);
      if (query) p.set("q", query);
      const res = await apiFetch(`/api/platform-email/rules?${p}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.rows as RuleView[]); setTotal(Number(j.total ?? 0));
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [page, size, platform, level, query]);
  useEffect(() => { void load(); }, [load]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/platform-email/rules", { method: "DELETE", body: JSON.stringify({ id: deleting.id, release }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(`ลบกฎแล้ว${release ? ` · ส่ง ${num(j.released)} รายการกลับไปรอยืนยัน${j.rematched ? ` (ระบบจับคู่เองได้ ${num(j.rematched)})` : ""}` : ""}${j.locked ? ` · ไม่แตะ ${num(j.locked)} รายการ (ออเดอร์ตัดสต๊อกแล้ว)` : ""}`);
      setDeleting(null);
      await load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const columns: MiniColumn<RuleView>[] = [
    { key: "platform", header: "แพลตฟอร์ม", width: "7rem",
      cell: (r) => <PlatformBadge code={r.platform_code} name={PLATFORM_LABEL[r.platform_code]} size="xs" /> },
    { key: "item", header: "สินค้าในเมล", width: "2fr",
      cell: (r) => (
        <div className="min-w-0 text-xs leading-snug">
          <div className="line-clamp-2 text-slate-800" title={r.title ?? ""}>{r.title ?? (r.model ? `รุ่น ${r.model}` : "—")}</div>
          <div className="mt-0.5 text-slate-500">ตัวเลือก: <b className="text-slate-700">{r.variant ?? "— (เมลไม่บอก)"}</b></div>
        </div>
      ) },
    { key: "target", header: "ผูกกับ", width: "1.3fr", sortValue: (r) => r.target?.code ?? "",
      cell: (r) => !r.target ? <span className="text-xs text-rose-600">⚠ SKU/รุ่นที่ผูกถูกลบไปแล้ว — แก้หรือลบกฎนี้</span>
        : r.target.level === "model" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-800" title={r.target.name ?? ""}>
            🎨 รุ่น <code className="font-mono font-medium">{r.target.code}</code> (ไม่แยกสี)
          </span>
        ) : (
          <span className="text-xs" title={r.target.name ?? ""}><code className="font-mono font-medium text-emerald-700">{r.target.code}</code>{r.target.color ? <span className="text-slate-500"> · {r.target.color}</span> : null}</span>
        ) },
    { key: "items", header: "รายการ", width: "4.5rem", align: "right", sortValue: (r) => r.items,
      cell: (r) => <span className="text-xs tabular-nums text-slate-600">{num(r.items)}</span> },
    { key: "by", header: "ยืนยันโดย", width: "8.5rem", sortValue: (r) => r.created_at,
      cell: (r) => (
        <div className="text-[11px] leading-tight text-slate-500">
          <div className="text-slate-700">{r.created_by_name ?? "—"}</div>
          <div>{fmtDateTime(r.created_at)}</div>
        </div>
      ) },
    { key: "act", header: "", width: "7rem", align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => setEditing(r)} className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">✏️ แก้</button>
          <button type="button" onClick={() => { setRelease(true); setDeleting(r); }} className="h-7 rounded-md border border-rose-200 px-2 text-xs text-rose-600 hover:bg-rose-50">ลบ</button>
        </div>
      ) },
  ];

  const chip = (on: boolean) => `inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm ${on ? "border-slate-900 bg-slate-900 font-medium text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-slate-500">คู่สินค้าที่ยืนยันไว้แล้ว — เมลครั้งต่อไปที่มีสินค้า+ตัวเลือกเดียวกัน ระบบจับคู่ตามนี้เอง · ยืนยันผิด แก้หรือลบได้ที่นี่</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setPlatform("")} className={chip(!platform)}>ทุกแพลตฟอร์ม</button>
        {PLATFORMS.map((p) => (
          <button key={p} type="button" onClick={() => setPlatform(platform === p ? "" : p)} className="rounded-full">
            <PlatformBadge code={p} name={PLATFORM_LABEL[p]} active={platform === p} className={`h-8 px-3 text-sm ${platform === p ? "ring-2 ring-slate-300 ring-offset-1" : "hover:bg-slate-50"}`} />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onClick={() => setLevel("")} className={chip(!level)}>ทุกแบบ</button>
        <button type="button" onClick={() => setLevel(level === "sku" ? "" : "sku")} className={chip(level === "sku")}>ผูก SKU (รู้สี)</button>
        <button type="button" onClick={() => setLevel(level === "model" ? "" : "model")} className={chip(level === "model")}>🎨 นับเป็นรุ่น</button>
        <div className="w-64 max-w-full"><ERPInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัสรุ่น / ตัวเลือก" /></div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>}

      {loading && !rows.length ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading ? "pointer-events-none opacity-50" : ""}`}>
          <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} hideSearch countUnit="กฎ"
            emptyText={platform || level || query ? "ไม่พบกฎตามที่กรอง ลองเปลี่ยนตัวกรองหรือคำค้นหา" : "ยังไม่มีกฎที่จำไว้ — ยืนยันสินค้าในแท็บ “รอยืนยันสินค้า” แล้วกฎจะมาอยู่ที่นี่"}
            footnote="รายการ = จำนวนรายการสินค้าจากเมลที่ใช้สินค้า+ตัวเลือกนี้ (ทุกสถานะ)" />
          {total > 0 && <Pager page={page} pageSize={size} total={total} onPage={setPage} unitLabel="กฎ" onPageSize={setSize} pageSizes={[20, 50, 100]} />}
        </div>
      )}

      {editing && <EditRuleModal rule={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); onChanged(); }} />}

      <ConfirmDialog open={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} onConfirm={() => void remove()} loading={busy}
        variant="danger" title="ลบกฎนี้?" confirmText="ลบกฎ"
        message={deleting && (
          <div className="space-y-2 text-sm">
            <p>เมลครั้งต่อไปของ <b>{deleting.title ?? deleting.model ?? "สินค้านี้"}</b> (ตัวเลือก {deleting.variant ?? "—"}) จะ<b>ไม่ถูกจับคู่อัตโนมัติ</b>ตามกฎนี้อีก</p>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <input type="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>ส่งรายการที่ผูกด้วยกฎนี้<b>กลับไปรอยืนยัน</b> (ใช้เมื่อยืนยันผิด) <span className="text-xs text-slate-500">— ออเดอร์ที่ตัดสต๊อกแล้วจะไม่ถูกแตะ</span></span>
            </label>
          </div>
        )} />
    </div>
  );
}

/** ✏️ แก้กฎ: เปลี่ยนเป็น SKU อื่น (รู้สี) หรือ นับเป็นรุ่น (ไม่แยกสี) */
function EditRuleModal({ rule, onClose, onSaved }: { rule: RuleView; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<"sku" | "model">(rule.target?.level ?? "sku");
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = mode === "sku" ? sku : parent;
  const dirty = !!chosen;

  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/platform-email/rules", { method: "PATCH", body: JSON.stringify(mode === "sku" ? { id: rule.id, sku_id: chosen.id } : { id: rule.id, parent_sku_id: chosen.id }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(`แก้กฎแล้ว → ${j.level === "model" ? `รุ่น ${j.code} (ไม่แยกสี)` : j.code} · ย้าย ${num(j.moved)} รายการ${j.locked ? ` · ไม่แตะ ${num(j.locked)} รายการ (ออเดอร์ตัดสต๊อกแล้ว)` : ""}`);
      await onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="แก้กฎที่จำไว้" size="md" defaultExpanded={false} hasUnsavedChanges={dirty && !saving}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={!chosen || saving} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      }>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 text-xs">
          <div className="mb-1"><PlatformBadge code={rule.platform_code} name={PLATFORM_LABEL[rule.platform_code]} size="xs" /></div>
          <div className="text-slate-800">{rule.title ?? (rule.model ? `รุ่น ${rule.model}` : "—")}</div>
          <div className="mt-0.5 text-slate-500">ตัวเลือก: <b className="text-slate-700">{rule.variant ?? "— (เมลไม่บอก)"}</b> · ตอนนี้ผูกกับ <b className="text-slate-700">{rule.target ? (rule.target.level === "model" ? `รุ่น ${rule.target.code} (ไม่แยกสี)` : rule.target.code) : "— (ถูกลบไปแล้ว)"}</b></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {([["sku", "ผูกกับ SKU (รู้สี)"], ["model", "🎨 นับเป็นรุ่น (ไม่แยกสี)"]] as const).map(([k, label]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 ${mode === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <input type="radio" name="rule-mode" checked={mode === k} onChange={() => setMode(k)} className="sr-only" />{label}
            </label>
          ))}
        </div>
        {mode === "sku"
          ? <SkuPicker value={sku} onChange={setSku} placeholder="🔍 ค้นหา SKU ใหม่..." />
          : <ParentSkuPicker value={parent} onChange={setParent} placeholder="🔍 ค้นหารุ่น..." disableCreate />}
        <p className="text-xs text-slate-500">รายการจากเมลที่ผูกด้วยกฎนี้จะย้ายไปตามที่เลือก — <b>ยกเว้นออเดอร์ที่ตัดสต๊อกแล้ว</b> (ไม่แตะ กันสต๊อกเพี้ยน)</p>
      </div>
    </ERPModal>
  );
}
