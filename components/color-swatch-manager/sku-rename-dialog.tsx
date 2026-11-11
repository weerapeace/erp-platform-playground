"use client";

/**
 * 🔁 เปลี่ยนชื่อสีใน SKU (ทะเบียนสี · เจ้าของขอ 2026-11-11) — แตะข้อมูลจริง จึงต้อง "พรีวิว → ยืนยัน" เสมอ
 *   items = รายการ เปลี่ยนจาก → เป็น (ชื่อเดียว: แก้ชื่อใหม่ในหน้าต่างได้ · หลายชื่อ: ตัดเลขทั้งหมด / รวมชื่อคล้าย)
 *   โหลด SKU ที่ใช้ชื่อเหล่านี้ (/api/color-swatches/skus) → ตาราง SKU · รุ่น · เดิม → ใหม่
 *   ⚠️ ชื่อชนกันในรุ่นเดียว (เช่น "Soft Rose (05)" กับ "Soft Rose (11)" อยู่รุ่นเดียวกัน → ตัดเลขแล้วกลายเป็นชื่อเดียว = ตัวเลือกบนเว็บหายไป 1 สี)
 *      → ไม่ติ๊กให้ (ข้ามไว้) · ติ๊กเองได้ถ้าตั้งใจรวม
 *   ยืนยัน "ในหน้าต่างเดียวกัน" (ขั้น ดูรายการ → ยืนยัน → ผลลัพธ์) — 🐛 2026-11-11 เดิมใช้ ConfirmDialog ซ้อน แต่หน้าต่างนี้ลอยชั้นสูงกว่า
 *      หน้าต่างยืนยันเลยไปโผล่ข้างหลัง กดแล้ว "ไม่ขึ้นอะไรเลย" · ตั้งแต่ 100 SKU ต้องพิมพ์ CONFIRM (กฎ Bulk Edit Safety)
 *   ผลลัพธ์โชว์ในหน้าต่างเสมอ (สำเร็จกี่ตัว · ไม่สำเร็จตัวไหน เพราะอะไร) + toast · บันทึก POST { changes } (audit ทุก SKU)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { normColorName } from "@/lib/color-swatch";

export interface RenameItem { from: string; to: string }
type Sku = { id: string; code: string; name: string; label: string; parentId: string | null; parentCode: string; onWeb: boolean };
type Line = Sku & { to: string; clash: string | null };
type Result = { ok: number; failed: { code: string; error: string }[]; error?: string };
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
  // ขั้นตอน: ดูรายการ → ยืนยัน → (กำลังเปลี่ยน) → ผลลัพธ์
  const [step, setStep] = useState<"review" | "confirm" | "done">("review");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const sig = items.map((i) => `${i.from}→${i.to}`).join("|");

  useEffect(() => {
    if (!open) return;
    setTo1(items[0]?.to ?? "");
    setSkus(null); setErr(null); setStep("review"); setTyped(""); setResult(null);
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
  const needTyped = chosen.length >= TYPED_AT;
  const run = async () => {
    setBusy(true);
    const sent = chosen;
    try {
      const changes = sent.map((l) => ({ id: l.id, from: l.label, to: l.to }));
      const r = await apiFetch("/api/color-swatches/skus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
      const j = await r.json().catch(() => ({ error: `ระบบตอบกลับผิดปกติ (${r.status})` }));
      if (j.error || !r.ok) {
        const msg = j.error || `ไม่สำเร็จ (${r.status})`;
        setResult({ ok: 0, failed: [], error: msg });
        toast.error(`เปลี่ยนชื่อสีไม่สำเร็จ: ${msg}`);
        return;
      }
      const res = (j.data?.results ?? []) as { id: string; ok: boolean; error?: string }[];
      const codeOf = new Map(sent.map((l) => [l.id, l.code]));
      const ok = res.filter((x) => x.ok).length;
      const failed = res.filter((x) => !x.ok).map((x) => ({ code: codeOf.get(x.id) ?? x.id, error: x.error ?? "ไม่สำเร็จ" }));
      setResult({ ok, failed });
      if (ok) toast.success(`เปลี่ยนชื่อสีแล้ว ${ok} SKU — เว็บร้านอัปเดตแล้ว`);
      if (failed.length) toast.error(`ไม่สำเร็จ ${failed.length} SKU`);
      if (ok) onDone([...new Set(sent.filter((l) => res.find((x) => x.id === l.id)?.ok).map((l) => l.label))]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "เชื่อมต่อไม่ได้";
      setResult({ ok: 0, failed: [], error: msg });
      toast.error(`เปลี่ยนชื่อสีไม่สำเร็จ: ${msg}`);
    } finally {
      setBusy(false);
      setStep("done");
    }
  };

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const btn = "px-3 py-1.5 rounded-lg text-sm";
  const footer =
    step === "done" ? (
      <div className="flex w-full items-center gap-2">
        <span className="text-xs text-slate-500">{result?.error ? "ยังไม่ได้เปลี่ยน" : `สำเร็จ ${result?.ok ?? 0} · ไม่สำเร็จ ${result?.failed.length ?? 0}`}</span>
        <button type="button" onClick={onClose} className={`ml-auto ${btn} bg-slate-900 text-white hover:bg-slate-800`}>ปิด</button>
      </div>
    ) : step === "confirm" ? (
      <div className="flex w-full flex-wrap items-center gap-2">
        <span className="text-sm text-amber-800">ยืนยันเปลี่ยนชื่อสีใน <b>{chosen.length} SKU</b>? ช่องสีของ SKU จริงจะเปลี่ยน (มีประวัติ เปลี่ยนกลับได้)</span>
        {needTyped && (
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ CONFIRM" aria-label="พิมพ์ CONFIRM เพื่อยืนยัน"
            className="w-36 rounded-md border border-amber-300 px-2 py-1 text-sm" />
        )}
        <button type="button" disabled={busy} onClick={() => setStep("review")} className={`ml-auto ${btn} border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40`}>กลับไปดู</button>
        <button type="button" disabled={busy || (needTyped && typed.trim() !== "CONFIRM")} onClick={() => void run()}
          className={`${btn} bg-amber-600 font-medium text-white hover:bg-amber-700 disabled:opacity-40`}>
          {busy ? "กำลังเปลี่ยน…" : `ยืนยันเปลี่ยน ${chosen.length} SKU`}
        </button>
      </div>
    ) : (
      <div className="flex w-full items-center gap-2">
        <span className="text-xs text-slate-500">{skus ? `เลือก ${chosen.length} จาก ${lines.length} SKU${clashes ? ` · ชื่อชนกันในรุ่นเดียว ${clashes} (ข้ามไว้)` : ""}` : ""}</span>
        <button type="button" onClick={onClose} className={`ml-auto ${btn} border border-slate-300 bg-white hover:bg-slate-50`}>ยกเลิก</button>
        <button type="button" disabled={!chosen.length} onClick={() => { setTyped(""); setStep("confirm"); }}
          className={`${btn} bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-40`}>
          เปลี่ยน {chosen.length} SKU
        </button>
      </div>
    );

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={title ?? (single ? `เปลี่ยนชื่อสี “${items[0]?.from ?? ""}” ใน SKU` : `เปลี่ยนชื่อสีใน SKU (${items.length} ชื่อ)`)}
      description="แก้ช่องสีของ SKU จริง (ช่องที่ตรงกับชื่อเดิม: สี (ไทย) / Color) · ดูรายการก่อน แล้วกดยืนยัน · บันทึกประวัติทุก SKU"
      size="lg"
      // จำขนาด/ตำแหน่งที่ลากไว้ต่อคน — ต้องตั้งชื่อตายตัว เพราะหัวป๊อปมีชื่อสี (ระบบตั้งชื่อเองจากหัว = ทุกสีเป็นป๊อปใหม่ ไม่จำ · เจ้าของแจ้ง 2026-11-11)
      storageKey="color-sku-rename"
      zIndex={80}
      closeOnBackdrop={!busy && step !== "confirm"}
      footer={footer}
    >
      {/* ✅ ผลลัพธ์ — โชว์ในหน้าต่างเสมอ ไม่ปล่อยเงียบ */}
      {step === "done" && result && (
        <div className={`mb-3 rounded-lg border p-3 text-sm ${result.error ? "border-red-200 bg-red-50 text-red-700" : result.failed.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {result.error ? (
            <>ยังไม่ได้เปลี่ยนเลย — {result.error}</>
          ) : (
            <>
              <div className="font-medium">เปลี่ยนชื่อสีสำเร็จ {result.ok} SKU{result.failed.length ? ` · ไม่สำเร็จ ${result.failed.length} SKU` : ""}{result.ok ? " — ทะเบียนสีและเว็บร้านอัปเดตแล้ว" : ""}</div>
              {result.failed.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {result.failed.map((f) => <li key={f.code}>{f.code}: {f.error}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      {single && step === "review" && (
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
      ) : step !== "done" && (
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
                    <td className="p-2 text-center"><input type="checkbox" checked={picked.has(l.id)} disabled={same || step !== "review"} onChange={() => toggle(l.id)} aria-label={`เลือก ${l.code}`} /></td>
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
  );
}
