"use client";

/**
 * ป๊อป "รวมหน่วยซ้ำ" (เฉพาะหน้าจัดการหน่วย) — หากลุ่มที่ซ้ำให้เอง (lib/uom-names findDupGroups)
 * เลือกตัวหลัก → ดูว่าจะย้ายอะไร → ยืนยัน → แจ้งผลพร้อมปุ่มย้อนกลับ · ประวัติการรวมย้อนทีหลังได้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { triggerRefresh } from "@/lib/refresh-bus";
import { findDupGroups, uomLabel, type UomRow } from "@/lib/uom-names";

type Row = UomRow & { skus: number; purchase_skus: number; families: number; merged_into?: string | null };
type MergeLog = { id: string; primary_id: string; secondary_id: string; actor_name: string | null; created_at: string; undone_at: string | null };

export function useUomList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [merges, setMerges] = useState<MergeLog[]>([]);
  const load = useCallback(() => {
    apiFetch("/api/master/uoms/merge").then((r) => r.json())
      .then((j) => { setRows((j.data ?? []) as Row[]); setMerges((j.merges ?? []) as MergeLog[]); })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, merges, load };
}

const usageText = (r: Row) => [
  r.skus ? `สินค้า ${r.skus.toLocaleString("th-TH")}` : "",
  r.purchase_skus ? `หน่วยซื้อ ${r.purchase_skus.toLocaleString("th-TH")}` : "",
  r.families ? `ประเภทแท็ก ${r.families}` : "",
].filter(Boolean).join(" · ") || "ยังไม่มีสินค้าใช้";

export function UomMergeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { rows, merges, load } = useUomList();
  const groups = useMemo(() => findDupGroups(rows ?? []) as Row[][], [rows]);
  const [primary, setPrimary] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<{ pri: Row; secs: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);

  const undo = async (id: string) => {
    const r = await apiFetch("/api/master/uoms/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || "ย้อนกลับไม่สำเร็จ"); return; }
    toast.success("ย้อนการรวมหน่วยแล้ว"); load(); triggerRefresh();
  };

  const doMerge = async () => {
    if (!confirm) return;
    setBusy(true);
    const ids: string[] = [];
    let skus = 0;
    for (const s of confirm.secs) {
      const r = await apiFetch("/api/master/uoms/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primary_id: confirm.pri.id, secondary_id: s.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(`รวม ${s.name} ไม่สำเร็จ: ${j.error || "ลองใหม่"}`); break; }
      ids.push(j.merge_id as string); skus += Number(j.moved?.skus) || 0;
    }
    setBusy(false); setConfirm(null); load(); triggerRefresh();
    if (ids.length) toast.undo(`รวมเข้า ${uomLabel(confirm.pri)} แล้ว · ย้ายสินค้า ${skus.toLocaleString("th-TH")} ตัว`,
      async () => { for (const id of [...ids].reverse()) await undo(id); }, { ms: 10000 });
  };

  return (
    <ERPModal open={open} onClose={onClose} title="รวมหน่วยซ้ำ" size="lg" storageKey="uom-merge"
      description="หน่วยที่ชื่อไทยหรืออังกฤษตรงกัน = หน่วยเดียวกัน · เลือกตัวหลัก แล้วรวมตัวอื่นเข้าไป">
      {!rows ? <LoadingState /> : (
        <div className="space-y-4">
          {groups.length === 0 && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">ไม่มีหน่วยซ้ำแล้ว</div>}
          {groups.map((g, gi) => {
            const pid = primary[gi] ?? g[0].id;
            const pri = g.find((x) => x.id === pid) ?? g[0];
            const secs = g.filter((x) => x.id !== pri.id);
            return (
              <div key={g.map((x) => x.id).join()} className="border border-amber-200 bg-amber-50/50 rounded-xl p-3">
                <div className="text-sm font-medium text-slate-800 mb-2">กลุ่ม {gi + 1}: {uomLabel(pri)}</div>
                <div className="space-y-1.5">
                  {g.map((u) => (
                    <label key={u.id} className="flex items-start gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer min-w-0">
                      <input type="radio" name={`pri-${gi}`} checked={u.id === pri.id} onChange={() => setPrimary((p) => ({ ...p, [gi]: u.id }))} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium break-words">{u.name}</span>
                        {u.id === pri.id ? <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">เก็บตัวนี้</span>
                          : <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">รวมเข้าตัวหลัก → ถังขยะ</span>}
                        <span className="block text-xs text-slate-500">{usageText(u)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  ย้ายไปตัวหลัก: สินค้า {secs.reduce((n, x) => n + x.skus + x.purchase_skus, 0).toLocaleString("th-TH")} ตัว
                  {secs.some((x) => x.families) ? ` · ประเภทแท็ก ${secs.reduce((n, x) => n + x.families, 0)}` : ""}
                  {" · "}เอกสารเก่าที่เขียน &ldquo;{secs.map((x) => x.name).join(", ")}&rdquo; ไม่ถูกแก้ ระบบจำเป็นชื่ออื่นของ {pri.name}
                </div>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => setConfirm({ pri, secs })} className="h-8 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">รวม {secs.length} ตัวเข้า {pri.name}</button>
                </div>
              </div>
            );
          })}

          {merges.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">ประวัติการรวม</div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {merges.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 break-words">{byId.get(m.secondary_id)?.name ?? "?"} → {byId.get(m.primary_id) ? uomLabel(byId.get(m.primary_id)!) : "?"}
                      <span className="text-slate-400"> · {new Date(m.created_at).toLocaleString("th-TH")} {m.actor_name ?? ""}</span></span>
                    {m.undone_at ? <span className="text-slate-400">ย้อนแล้ว</span>
                      : <button type="button" onClick={() => undo(m.id)} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">ย้อนกลับ</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => !busy && setConfirm(null)} onConfirm={doMerge} loading={busy} confirmText="รวมหน่วย"
        title={confirm ? `รวมเข้า ${uomLabel(confirm.pri)}?` : ""}
        message={confirm ? `${confirm.secs.map((s) => s.name).join(", ")} จะถูกย้ายไปใช้ ${confirm.pri.name} แล้วเข้าถังขยะ · กดย้อนกลับได้ภายหลัง` : ""} />
    </ERPModal>
  );
}
