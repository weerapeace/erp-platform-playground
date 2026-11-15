"use client";

/**
 * ยืนยันหมวด Shopee ทีละหลายสินค้า (เฟส 5C) — ป๊อปจากแท็บ Shopee ในตัวช่วยลงสินค้า (AddToPlatformWizard ขั้น "ดูและแก้")
 * --------------------------------------------------------------------------
 * ข้อมูล = GET /api/shopee/create-product/categories (ตัวคิดหมวดตัวเดียวกับหน้าดูก่อนส่ง — ../load shopeeCategoryCandidates)
 * ติ๊ก → "ใช้หมวดนี้กับตัวที่ติ๊ก" = บันทึกหมวดลงร่าง Shopee ทีละตัว (PATCH /api/product-platforms { category_path } · มีประวัติต่อสินค้า)
 * ไม่แก้ข้อมูลสินค้าในระบบ · ไม่ส่งอะไรขึ้นร้าน · ตัวที่ยืนยันแล้ว/มีบนร้านแล้ว ไม่ติ๊กให้
 * ของกลางที่ใช้: ERPModal · MiniTable · PlatformCategoryPicker · state-views · Icon
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import { ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import type { ShopeeBulkCategoryRow } from "@/lib/shopee-create-plan";

const CHUNK = 50;
type Resp = { rows: ShopeeBulkCategoryRow[]; platform_id: string | null; error: string | null };

export function ShopeeBulkCategoryDialog({ open, parentIds, canEdit, onClose, onSaved }: {
  open: boolean;
  parentIds: string[];
  canEdit: boolean;
  onClose: () => void;
  /** บันทึกแล้ว n ตัว — ตัวช่วยโหลดหน้าดูก่อนส่ง/ตรวจความครบใหม่ */
  onSaved: (n: number) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<ShopeeBulkCategoryRow[] | null>(null);
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});        // parent_id → "{id} · ชื่อ" ที่จะใช้
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<Set<string>>(new Set());          // แถวที่เปิดตัวค้นหมวดเอง
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [n, setN] = useState(0);
  const key = parentIds.join(",");

  useEffect(() => {
    if (!open || !parentIds.length) return;
    let alive = true;
    setRows(null); setErr(null); setCustom(new Set());
    (async () => {
      try {
        const all: ShopeeBulkCategoryRow[] = [];
        let pid: string | null = null;
        for (let i = 0; i < parentIds.length; i += CHUNK) {
          const ids = parentIds.slice(i, i + CHUNK).join(",");
          const j = await apiFetch(`/api/shopee/create-product/categories?parent_sku_ids=${encodeURIComponent(ids)}`).then((r) => r.json()) as Resp;
          if (j.error) throw new Error(j.error);
          all.push(...j.rows); pid = j.platform_id;
        }
        if (!alive) return;
        setRows(all); setPlatformId(pid);
        setPicks(Object.fromEntries(all.filter((r) => r.suggestion).map((r) => [r.parent_id, r.suggestion!.label])));
        setSelected(new Set(all.filter((r) => !r.confirmed && !r.on_shop && r.suggestion).map((r) => r.parent_id)));
      } catch (e) { if (alive) setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
  }, [open, key, n]);   // eslint-disable-line react-hooks/exhaustive-deps

  const todo = useMemo(() => (rows ?? []).filter((r) => selected.has(r.parent_id) && picks[r.parent_id]), [rows, selected, picks]);

  const save = async () => {
    if (!platformId || !todo.length) return;
    setSaving({ done: 0, total: todo.length });
    let ok = 0; const fails: string[] = [];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, async () => {
      while (i < todo.length) {
        const r = todo[i++];
        try {
          const res = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: r.parent_id, platform_id: platformId, category_path: picks[r.parent_id] }) });
          const j = await res.json();
          if (j.error) throw new Error(j.error);
          ok++;
        } catch (e) { fails.push(`${r.code}: ${(e as Error).message}`); }
        setSaving((s) => (s ? { ...s, done: s.done + 1 } : s));
      }
    }));
    setSaving(null);
    if (ok) toast.success(`ยืนยันหมวด Shopee แล้ว ${ok.toLocaleString()} สินค้า — บันทึกลงร่างแล้ว`);
    if (fails.length) toast.error(`บันทึกไม่สำเร็จ ${fails.length} ตัว: ${fails.slice(0, 2).join(" · ")}`);
    if (ok) { onSaved(ok); setN((x) => x + 1); }
  };

  const labelOf = (r: ShopeeBulkCategoryRow) => picks[r.parent_id] ?? "";
  const srcOf = (r: ShopeeBulkCategoryRow) => r.candidates.find((c) => c.label === labelOf(r))?.src ?? (labelOf(r) ? "เลือกเอง" : "");
  const cols: MiniColumn<ShopeeBulkCategoryRow>[] = [
    { key: "product", header: "สินค้า", width: "minmax(10rem,1.2fr)", cell: (r) => (
      <div className="min-w-0"><div className="font-mono text-xs">{r.code}</div><div className="truncate text-[11px] text-slate-500" title={r.name}>{r.name}</div></div>
    ) },
    { key: "cat", header: "หมวด Shopee ที่จะใช้", width: "minmax(14rem,2fr)", cell: (r) => (
      <div className="min-w-0 space-y-1">
        {r.candidates.length > 0 || labelOf(r) ? (
          <select value={labelOf(r)} disabled={!canEdit || !!r.on_shop} onChange={(e) => setPicks((p) => ({ ...p, [r.parent_id]: e.target.value }))}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs" aria-label={`หมวด Shopee ของ ${r.code}`}>
            {labelOf(r) && !r.candidates.some((c) => c.label === labelOf(r)) && <option value={labelOf(r)}>{labelOf(r)} (เลือกเอง)</option>}
            {r.candidates.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
          </select>
        ) : <span className="text-xs text-rose-600">ยังไม่มีหมวดแนะนำ — ค้นหมวดเอง</span>}
        <div className="text-[11px] text-slate-400">{srcOf(r)}</div>
        {r.note && <div className="text-[11px] text-amber-700">{r.note}</div>}
      </div>
    ) },
    { key: "state", header: "สถานะ", width: "8rem", cell: (r) => (
      r.on_shop ? <span className="text-[11px] text-slate-500">มีบน Shopee แล้ว</span>
        : r.confirmed ? <span className="text-[11px] text-emerald-700"><Icon name="done" /> ยืนยันแล้ว</span>
        : <span className="text-[11px] text-amber-700">ระบบเดา — ยังไม่ยืนยัน</span>
    ) },
    { key: "act", header: "", width: "5.5rem", cell: (r) => (canEdit && !r.on_shop ? (
      <button type="button" onClick={() => setCustom((s) => { const x = new Set(s); if (x.has(r.parent_id)) x.delete(r.parent_id); else x.add(r.parent_id); return x; })}
        className="text-[11px] text-violet-700 hover:underline">{custom.has(r.parent_id) ? "ปิดค้นหา" : "ค้นหมวดเอง"}</button>
    ) : null) },
  ];

  const pending = (rows ?? []).filter((r) => !r.confirmed && !r.on_shop).length;
  return (
    <ERPModal open={open} onClose={() => { if (!saving) onClose(); }} size="xl" storageKey="shopee-bulk-category"
      title="ยืนยันหมวด Shopee ทีละหลายสินค้า"
      description="ระบบแนะนำหมวดให้ทุกตัว (Shopee แนะนำจากชื่อ / สินค้าประเภทเดียวกันบนร้าน) — ตรวจ เปลี่ยนได้ แล้วติ๊กตัวที่ถูกต้อง · บันทึกลงร่าง Shopee เท่านั้น ยังไม่ส่งขึ้นร้าน"
      footer={rows ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-slate-500">
            {saving ? `กำลังบันทึก ${saving.done.toLocaleString()}/${saving.total.toLocaleString()}…` : `ติ๊กไว้ ${todo.length.toLocaleString()} ตัว · ยังไม่ยืนยันทั้งหมด ${pending.toLocaleString()} ตัว`}
          </span>
          <button type="button" onClick={onClose} disabled={!!saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-50">ปิด</button>
          {canEdit && <button type="button" onClick={() => void save()} disabled={!todo.length || !!saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm text-white hover:bg-violet-700 disabled:opacity-40"><Icon name="done" />ใช้หมวดนี้กับตัวที่ติ๊ก ({todo.length.toLocaleString()})</button>}
        </div>
      ) : undefined}>
      {err ? <ErrorState title="โหลดหมวดที่แนะนำไม่สำเร็จ" hint={err} onRetry={() => setN((x) => x + 1)} className="py-6" />
        : !rows ? <LoadingState label={`กำลังขอหมวดแนะนำจาก Shopee ${parentIds.length.toLocaleString()} สินค้า…`} className="py-6" />
        : (
          <div className="space-y-3">
            {canEdit && platformId && selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-600">ใช้หมวดเดียวกันกับ {selected.size.toLocaleString()} ตัวที่ติ๊ก:</span>
                <div className="min-w-[16rem] flex-1"><PlatformCategoryPicker platformId={platformId} placeholder="ค้นหมวด Shopee (เช่น เข็มขัด / belt)"
                  onPick={(label) => setPicks((p) => { const x = { ...p }; for (const id of selected) x[id] = label; return x; })} /></div>
              </div>
            )}
            <MiniTable rows={rows} columns={cols} rowKey={(r) => r.parent_id} dense hideToolbar emptyText="ไม่มีสินค้า"
              selectable={canEdit} selected={selected} onSelectedChange={(next) => setSelected(new Set([...next].filter((id) => { const r = rows.find((x) => x.parent_id === id); return !!r && !r.on_shop; })))}
              expandedKeys={custom} renderExpanded={(r) => platformId ? (
                <div className="max-w-md py-1"><PlatformCategoryPicker platformId={platformId} placeholder={`ค้นหมวด Shopee ให้ ${r.code}`}
                  onPick={(label) => { setPicks((p) => ({ ...p, [r.parent_id]: label })); setSelected((s) => new Set(s).add(r.parent_id)); setCustom((s) => { const x = new Set(s); x.delete(r.parent_id); return x; }); }} /></div>
              ) : null} />
            <p className="text-[11px] text-slate-400">หมวดที่ยืนยันแล้วจะไม่ถูกติ๊กให้ (เปลี่ยนได้ถ้าต้องการ) · ตัวที่มีบน Shopee แล้วข้ามให้ · หลังบันทึก หน้าดูก่อนส่งจะโหลดใหม่</p>
          </div>
        )}
    </ERPModal>
  );
}
