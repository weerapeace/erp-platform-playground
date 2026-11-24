"use client";

/**
 * 🐾 ทะเบียนแมว — ถังขยะ: ของที่ลบไว้ (แมว · คลินิก · วัคซีน · ยา · น้ำหนัก) กู้คืน หรือ ลบถาวร
 *   + ของใช้ · ซื้อเข้า · หาหมอ · ค่าใช้จ่ายอื่น (รอบ 2-3)
 *   ลบถาวร = ยืนยันก่อนเสมอ · ลบแมวถาวร = พิมพ์ชื่อแมวยืนยัน (ประวัติทั้งหมดของตัวนั้นหายด้วย ย้อนไม่ได้)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { formatDate, formatDateTime } from "@/lib/date";
import { CAT_KINDS, recordLabel, type CatKind } from "@/lib/cats";
import { useCatsData, useCatsWrite } from "./use-cats";

type Item = { kind: CatKind; row: Record<string, unknown>; label: string; catName: string };

export function CatsTrash({ canEdit, onChanged }: { canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const { data, loading, error, reload } = useCatsData(true);
  const w = useCatsWrite(async () => { await reload(); await onChanged(); });
  const [confirm, setConfirm] = useState<Item | null>(null);

  const items = useMemo(() => {
    const catName = new Map(data.cats.map((c) => [c.id, c.name]));
    const supplyName = new Map(data.supplies.map((s) => [s.id, [s.brand, s.flavor].filter(Boolean).join(" ")]));
    const out: Item[] = [];
    (Object.keys(CAT_KINDS) as CatKind[]).forEach((kind) => {
      for (const row of data[kind] as unknown as Record<string, unknown>[]) {
        if (row.is_active) continue;
        const owner = kind === "purchases" ? supplyName.get(String(row.supply_id)) ?? "" : row.cat_id ? catName.get(String(row.cat_id)) ?? "" : "";
        out.push({ kind, row, label: recordLabel(kind, row), catName: kind === "cats" ? "" : owner });
      }
    });
    return out.sort((a, b) => String(b.row.deleted_at ?? "").localeCompare(String(a.row.deleted_at ?? "")));
  }, [data]);

  if (loading) return <LoadingState rows={4} />;
  if (error) return <ErrorState title="โหลดถังขยะไม่ได้" hint={error} onRetry={() => void reload()} />;
  if (!items.length) return <EmptyState icon={<Icon name="trash" />} title="ถังขยะว่าง" hint="ของที่ลบจะมาอยู่ที่นี่ก่อน กู้คืนได้ทุกเมื่อ" />;

  return (
    <section className="space-y-2">
      <p className="text-sm text-slate-500">ของที่ลบไว้ {items.length} รายการ · กด “กู้คืน” เพื่อเอากลับ</p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items.map((it) => (
          <div key={`${it.kind}:${it.row.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{CAT_KINDS[it.kind].label}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{it.catName ? `${it.catName} · ` : ""}{it.label}</div>
              <div className="text-xs text-slate-400">
                {it.row.date_given || it.row.date ? `วันที่ ${formatDate(it.row.date_given ?? it.row.date)} · ` : ""}ลบเมื่อ {formatDateTime(it.row.deleted_at)}
              </div>
            </div>
            {canEdit && <>
              <button type="button" onClick={() => void w.restore(it.kind, String(it.row.id), it.label)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><Icon name="arrow-back-up" /> กู้คืน</button>
              <button type="button" onClick={() => setConfirm(it)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash-x" /> ลบถาวร</button>
            </>}
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} variant="danger" confirmText="ลบถาวร"
        title={`ลบ "${confirm?.label ?? ""}" ถาวร?`}
        requireTyped={confirm?.kind === "cats" ? String(confirm.row.name) : undefined}
        message={confirm?.kind === "cats"
          ? "ประวัติวัคซีน ยา และน้ำหนักทั้งหมดของแมวตัวนี้จะหายไปด้วย ลบแล้วกู้คืนไม่ได้ — พิมพ์ชื่อแมวเพื่อยืนยัน"
          : confirm?.kind === "clinics" ? "ประวัติที่เคยระบุคลินิกนี้ยังอยู่ แต่จะไม่มีชื่อคลินิก ลบแล้วกู้คืนไม่ได้"
          : confirm?.kind === "supplies" ? "ประวัติซื้อเข้าของรายการนี้จะหายไปด้วย (ค่าใช้จ่ายเดือนเก่าจะลดลง) ลบแล้วกู้คืนไม่ได้" : "ลบแล้วกู้คืนไม่ได้"}
        onConfirm={async () => { const c = confirm; setConfirm(null); if (c) await w.destroy(c.kind, String(c.row.id), c.label); }} />
    </section>
  );
}
