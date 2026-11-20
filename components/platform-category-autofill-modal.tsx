"use client";

/**
 * ป๊อป "ใส่ให้เอง (ไม่เสียเงิน)" — เดาหมวดของแต่ละร้านให้หมวดกลาง แล้วให้ดูก่อนบันทึก (เปิดจาก PlatformCategoryMapper)
 * - ไม่ใช้ AI: เดาด้วยชื่อหมวด/คำพ้อง/หมวดที่ร้านอื่นจับไว้ (lib/platform-category-autofill) — API /api/platform-category-map/autofill
 * - เดาเฉพาะช่องที่ยังว่าง · ช่องที่ตั้งไว้แล้วไม่แตะ · ติ๊กให้ก่อนเฉพาะ "มั่นใจสูง" · แต่ละช่องสลับตัวเลือกสำรองได้ 2-3 อัน
 * - บันทึกแล้วกด "ย้อนกลับ" ในแจ้งผลมุมจอได้ (ล้างเฉพาะช่องที่ปุ่มนี้ใส่ และยังไม่มีใครแก้ต่อ) · ทุกครั้งลงประวัติ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { LoadingState, ErrorState, EmptyState } from "@/components/state-views";
import type { AutofillSuggestion } from "@/lib/platform-category-autofill";

type Target = { kind: "platform" | "web"; id: string; name: string };
type Item = { central_id: string; central_name: string; target: Target; suggestion: AutofillSuggestion | null };
type Resp = { items: Item[]; stats: { empty: number; high: number; check: number; none: number }; noOptions: string[]; error: string | null };
type Pick = { checked: boolean; value: string };
type Done = { central_category_id: string; platform_id?: string; shop_id?: string; value: string };

const keyOf = (i: Item) => `${i.central_id}:${i.target.kind}:${i.target.id}`;

export function PlatformCategoryAutofillModal({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");   // "" = ทุกหมวดกลาง

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch("/api/platform-category-map/autofill");
      const j = (await res.json()) as Resp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j);
      const p: Record<string, Pick> = {};
      for (const it of j.items) if (it.suggestion) p[keyOf(it)] = { checked: it.suggestion.confidence === "high", value: it.suggestion.candidates[0].value };
      setPicks(p); setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) { setFilter(""); void load(); } }, [open, load]);

  const centrals = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of data?.items ?? []) m.set(it.central_id, it.central_name);
    return [...m.entries()];
  }, [data]);
  const shown = useMemo(() => (data?.items ?? []).filter((i) => !filter || i.central_id === filter), [data, filter]);
  const groups = useMemo(() => {
    const g = new Map<string, { name: string; items: Item[] }>();
    for (const it of shown) { const x = g.get(it.central_id) ?? { name: it.central_name, items: [] }; x.items.push(it); g.set(it.central_id, x); }
    return [...g.values()];
  }, [shown]);
  // บันทึกทุกช่องที่ติ๊ก (รวมหมวดที่ซ่อนด้วยตัวกรอง) — ปุ่มบอกจำนวนชัดเจน
  const checkedItems = useMemo(() => (data?.items ?? []).filter((i) => i.suggestion && picks[keyOf(i)]?.checked), [data, picks]);

  const setPick = (k: string, patch: Partial<Pick>) => { setPicks((p) => ({ ...p, [k]: { ...p[k], ...patch } })); setDirty(true); };
  const toggleAll = (on: boolean) => {
    setPicks((p) => { const n = { ...p }; for (const i of shown) if (i.suggestion) n[keyOf(i)] = { ...n[keyOf(i)], checked: on }; return n; });
    setDirty(true);
  };

  const post = async (mode: "apply" | "undo", items: Done[]) => {
    const res = await apiFetch("/api/platform-category-map/autofill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, items }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return j as { done: Done[]; skipped: number };
  };

  const save = async () => {
    if (checkedItems.length === 0) { toast.warning("ยังไม่ได้ติ๊กช่องไหน"); return; }
    setSaving(true);
    try {
      const items: Done[] = checkedItems.map((i) => ({
        central_category_id: i.central_id,
        ...(i.target.kind === "platform" ? { platform_id: i.target.id } : { shop_id: i.target.id }),
        value: picks[keyOf(i)].value,
      }));
      const r = await post("apply", items);
      onApplied();
      onClose();
      const msg = `บันทึกหมวดแล้ว ${r.done.length} ช่อง${r.skipped ? ` (ข้าม ${r.skipped} ช่องที่มีคนตั้งไว้แล้ว)` : ""}`;
      if (r.done.length === 0) { toast.info(msg); return; }
      toast.undo(msg, async () => {
        try { const u = await post("undo", r.done); onApplied(); toast.success(`ย้อนกลับแล้ว ${u.done.length} ช่อง`); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      }, { ms: 10000 });
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };

  const stats = data?.stats;
  return (

      <ERPModal open={open} onClose={onClose} title="ใส่หมวดให้เอง (ไม่เสียเงิน)" size="xl" zIndex={300} storageKey="platform-category-autofill"
        hasUnsavedChanges={dirty} closeOnBackdrop={!dirty}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2 w-full">
            <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving || loading}
              className="h-9 px-4 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : `บันทึก ${checkedItems.length} ช่องที่ติ๊ก`}
            </button>
          </div>
        }>
        {loading ? <LoadingState rows={6} /> : err ? <ErrorState title="เดาหมวดไม่สำเร็จ" hint={err} onRetry={() => void load()} /> : !data || data.items.length === 0 ? (
          <EmptyState title="ทุกช่องจับคู่ครบแล้ว" hint={data?.noOptions.length ? `ร้านที่ยังไม่มีรายการหมวดให้เลือก: ${data.noOptions.join(", ")} — กด “นำเข้าหมวดของร้าน” ก่อน` : "ไม่มีช่องว่างให้เดา"} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-indigo-50 text-indigo-800 text-sm px-3 py-2">
              ระบบเดาได้ {stats!.high + stats!.check} ช่อง จาก {stats!.empty} ช่องที่ยังว่าง · ช่องที่ตั้งไว้แล้วไม่ถูกแตะ · ติ๊กเฉพาะช่องที่ใช่แล้วกดบันทึก
            </div>
            {data.noOptions.length > 0 && (
              <div className="rounded-lg bg-amber-50 text-amber-800 text-xs px-3 py-2">
                {data.noOptions.join(", ")} ยังไม่มีรายการหมวดให้เลือก จึงยังเดาให้ไม่ได้ — กด “นำเข้าหมวดของร้าน” ก่อน
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">มั่นใจสูง {stats!.high}</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">ควรเช็ก {stats!.check}</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">เดาไม่ได้ {stats!.none}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => toggleAll(true)} className="text-indigo-600 hover:underline">ติ๊กทั้งหมด</button>
              <button type="button" onClick={() => toggleAll(false)} className="text-slate-500 hover:underline">ไม่ติ๊กเลย</button>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="กรองหมวดกลาง"
                className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white max-w-[14rem]">
                <option value="">ทุกหมวดกลาง ({centrals.length})</option>
                {centrals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            {groups.map((g) => (
              <div key={g.name} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 text-sm font-medium text-slate-800">{g.name}</div>
                {g.items.map((it) => {
                  const k = keyOf(it);
                  const s = it.suggestion;
                  const p = picks[k];
                  return (
                    <div key={k} className="grid grid-cols-[1.25rem_minmax(0,1fr)] md:grid-cols-[1.25rem_9rem_minmax(0,1fr)_5.5rem] gap-x-2 gap-y-1 items-center px-3 py-2 border-t border-slate-100 text-sm">
                      <input type="checkbox" aria-label={`ใช้หมวดที่เดาให้ ${it.target.name}`} disabled={!s} checked={!!p?.checked} onChange={(e) => setPick(k, { checked: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                      <span className={`truncate ${s ? "text-slate-700" : "text-slate-400"}`} title={it.target.name}>{it.target.name}</span>
                      {s ? (
                        <select value={p?.value ?? ""} onChange={(e) => setPick(k, { value: e.target.value, checked: true })} title={s.reason}
                          className="col-start-2 md:col-start-auto min-w-0 w-full h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                          {s.candidates.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      ) : (
                        <span className="col-start-2 md:col-start-auto text-xs text-slate-400">ร้านนี้ไม่มีหมวดที่ใกล้เคียง — เว้นว่างไว้ (เลือกเองในหน้าจับคู่ได้)</span>
                      )}
                      <span className={`col-start-2 md:col-start-auto justify-self-start md:justify-self-center text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${!s ? "bg-slate-100 text-slate-500" : s.confidence === "high" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                        title={s?.reason}>
                        {!s ? "เดาไม่ได้" : s.confidence === "high" ? "มั่นใจสูง" : "ควรเช็ก"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </ERPModal>

  );
}

