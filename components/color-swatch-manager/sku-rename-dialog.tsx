"use client";

/**
 * 🔁 เปลี่ยนชื่อสีใน SKU (ทะเบียนสี · เจ้าของขอ 2026-11-11) — แตะข้อมูลจริง จึงต้อง "พรีวิว → ยืนยัน" เสมอ
 *   items = รายการ เปลี่ยนจาก → เป็น (ชื่อเดียว: แก้ชื่อใหม่ในหน้าต่างได้ · หลายชื่อ: ตัดเลขทั้งหมด / รวมชื่อคล้าย)
 *   โหลด SKU ที่ใช้ชื่อเหล่านี้ (/api/color-swatches/skus) → ตาราง SKU · รุ่น · เดิม → ใหม่
 *   ⚠️ ชื่อชนกันในรุ่นเดียว (เช่น "Soft Rose (05)" กับ "Soft Rose (11)" อยู่รุ่นเดียวกัน → ตัดเลขแล้วกลายเป็นชื่อเดียว = ตัวเลือกบนเว็บหายไป 1 สี)
 *      → ไม่ติ๊กให้ (ข้ามไว้) · ติ๊กเองได้ถ้าตั้งใจรวม
 *   ยืนยัน: ConfirmDialog · ตั้งแต่ 100 SKU ต้องพิมพ์ CONFIRM (กฎ Bulk Edit Safety) · บันทึก POST { changes } (audit ทุก SKU)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { normColorName } from "@/lib/color-swatch";

export interface RenameItem { from: string; to: string }
type Sku = { id: string; code: string; name: string; label: string; parentId: string | null; parentCode: string; onWeb: boolean };
type Line = Sku & { to: string; clash: string | null };
const TYPED_AT = 100;

export function SkuRenameDialog({ open, onClose, items, title, onDone }: {
  open: boolean;
  onClose: () => void;
  items: RenameItem[];
  title?: string;
  /** เปลี่ยนเสร็จ (ส่งชื่อเดิมที่เปลี่ยนไปแล้ว) → ทะเบียนโหลดใหม่ */
  onDone: (renamedFrom: string[]) => void;
}) {
  const toast = useToast();
  const single = items.length === 1;
  const [to1, setTo1] = useState("");
  const [skus, setSkus] = useState<Sku[] | null>(null);
  const [parentLabels, setParentLabels] = useState<Record<string, string[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const sig = items.map((i) => `${i.from}→${i.to}`).join("|");

  useEffect(() => {
    if (!open) return;
    setTo1(items[0]?.to ?? "");
    setSkus(null); setErr(null);
    const names = [...new Set(items.map((i) => i.from))];
    apiFetch(`/api/color-swatches/skus?names=${encodeURIComponent(names.join("|"))}`).then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setSkus(j.data.skus ?? []);
        setParentLabels(j.data.parentLabels ?? {});
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดรายการ SKU ไม่สำเร็จ"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sig]);

  // เดิม → ใหม่ ของแต่ละ SKU + ชนกันในรุ่นเดียวไหม
  const lines = useMemo<Line[]>(() => {
    if (!skus) return [];
    const toOf = new Map(items.map((i) => [normColorName(i.from), single ? to1.trim() : i.to]));
    const base = skus.map((s) => ({ ...s, to: toOf.get(normColorName(s.label)) ?? s.label }));
    return base.map((s) => {
      if (!s.parentId || !s.to) return { ...s, clash: null };
      const others = (parentLabels[s.parentId] ?? []).filter((l) => normColorName(l) !== normColorName(s.label));
      // สีอื่นในรุ่นเดียวกันจะกลายเป็นชื่อนี้ด้วย (หรือมีชื่อนี้อยู่แล้ว) = ตัวเลือกบนเว็บจะรวมเป็นอันเดียว
      const clashWith = others.find((l) => normColorName(toOf.get(normColorName(l)) ?? l) === normColorName(s.to));
      return { ...s, clash: clashWith ?? null };
    });
  }, [skus, parentLabels, items, single, to1]);

  // ติ๊กตั้งต้น: ทุกตัวที่ชื่อเปลี่ยนจริงและไม่ชนกัน
  useEffect(() => {
    setPicked(new Set(lines.filter((l) => l.to && normColorName(l.to) !== normColorName(l.label) && !l.clash).map((l) => l.id)));
  }, [lines]);

  const chosen = lines.filter((l) => picked.has(l.id));
  const clashes = lines.filter((l) => l.clash).length;
  const run = async () => {
    setAsk(false);
    setBusy(true);
    try {
      const changes = chosen.map((l) => ({ id: l.id, from: l.label, to: l.to }));
      const j = await apiFetch("/api/color-swatches/skus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      const res = (j.data?.results ?? []) as { ok: boolean; error?: string }[];
      const ok = res.filter((r) => r.ok).length;
      const fail = res.length - ok;
      if (ok) toast.success(`เปลี่ยนชื่อสีแล้ว ${ok} SKU — เว็บร้านอัปเดตแล้ว`);
      if (fail) toast.error(`ไม่สำเร็จ ${fail} SKU: ${[...new Set(res.filter((r) => !r.ok).map((r) => r.error))].join(" · ")}`);
      onDone([...new Set(chosen.map((l) => l.label))]);
      onClose();
    } catch {
      toast.error("เปลี่ยนชื่อสีไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <>
      <ERPModal
        open={open}
        onClose={onClose}
        title={title ?? (single ? `เปลี่ยนชื่อสี “${items[0]?.from ?? ""}” ใน SKU` : `เปลี่ยนชื่อสีใน SKU (${items.length} ชื่อ)`)}
        description="แก้ช่องสีของ SKU จริง (ช่องที่ตรงกับชื่อเดิม: สี (ไทย) / Color) · ดูรายการก่อน แล้วกดยืนยัน · บันทึกประวัติทุก SKU"
        size="lg"
        zIndex={80}
        footer={
          <div className="flex w-full items-center gap-2">
            <span className="text-xs text-slate-500">{skus ? `เลือก ${chosen.length} จาก ${lines.length} SKU${clashes ? ` · ชื่อชนกันในรุ่นเดียว ${clashes} (ข้ามไว้)` : ""}` : ""}</span>
            <button type="button" onClick={onClose} className="ml-auto px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50">ยกเลิก</button>
            <button type="button" disabled={!chosen.length || busy} onClick={() => setAsk(true)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              เปลี่ยน {chosen.length} SKU
            </button>
          </div>
        }
      >
        {single && (
          <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">ชื่อใหม่</span>
            <input value={to1} onChange={(e) => setTo1(e.target.value)} className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5" placeholder="เช่น Soft Rose" />
          </label>
        )}
        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        ) : !skus ? (
          <p className="py-6 text-center text-sm text-slate-400">กำลังโหลดรายการ SKU…</p>
        ) : !lines.length ? (
          <p className="py-6 text-center text-sm text-slate-500">ไม่พบ SKU ที่ใช้ชื่อนี้ (อาจเปลี่ยนไปแล้ว)</p>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr><th className="w-8 p-2" /><th className="p-2 text-left">SKU</th><th className="p-2 text-left">ชื่อเดิม</th><th className="p-2 text-left">ชื่อใหม่</th><th className="p-2 text-left">หมายเหตุ</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const same = !l.to || normColorName(l.to) === normColorName(l.label);
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="p-2 text-center"><input type="checkbox" checked={picked.has(l.id)} disabled={same} onChange={() => toggle(l.id)} aria-label={`เลือก ${l.code}`} /></td>
                      <td className="p-2">
                        {/* เปิดหน้า SKU ตัวเต็มในแท็บใหม่ (แก้ช่องอื่น/แก้เองทีละตัว) — หน้า SKU เปิดรายการจาก ?open= */}
                        <a href={`/master/skus?open=${encodeURIComponent(l.id)}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-700 hover:underline" title="เปิดหน้า SKU (แท็บใหม่)">{l.code}</a>
                        <div className="text-[11px] text-slate-400">{l.parentCode}{l.onWeb ? " · บนเว็บ" : ""}</div>
                      </td>
                      <td className="p-2 text-slate-500">{l.label}</td>
                      <td className="p-2 font-medium">{same ? <span className="text-slate-400">เหมือนเดิม</span> : l.to}</td>
                      <td className="p-2 text-[11px]">{l.clash ? <span className="text-amber-700">ชนกับ “{l.clash}” ในรุ่นเดียวกัน — ติ๊กเองถ้าตั้งใจรวม</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ERPModal>
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        onConfirm={() => void run()}
        title={`เปลี่ยนชื่อสีใน ${chosen.length} SKU?`}
        message={`ช่องสีของ SKU จริงจะเปลี่ยน · ปุ่มเลือกสี/ตัวกรองบนเว็บเปลี่ยนตาม · ย้อนได้ด้วยการเปลี่ยนกลับ (มีประวัติทุก SKU)${chosen.length >= TYPED_AT ? " — พิมพ์ CONFIRM เพื่อยืนยัน" : ""}`}
        confirmText={`เปลี่ยน ${chosen.length} SKU`}
        cancelText="กลับไปดู"
        requireTyped={chosen.length >= TYPED_AT ? "CONFIRM" : undefined}
        loading={busy}
      />
    </>
  );
}
