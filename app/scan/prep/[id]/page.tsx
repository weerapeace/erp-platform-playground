"use client";

/**
 * การ์ดยืนยัน "เตรียมครบ / ตัดครบ" จากการสแกนใบสั่งผลิต — /scan/prep/<mo_id>
 *
 * ⚠️ ไฟเขียวบนบอร์ดจ่ายงานคิดคนละแบบตามชนิดใบ (ดู /api/mo/work-board):
 *   - ใบมีวัตถุดิบ (117/130 ใบ) → ต้องติ๊กครบ "ทุกวัตถุดิบ" + "ทุกบล็อกที่ต้องตัด"
 *   - ใบไม่มีวัตถุดิบ (13 ใบ)   → ใช้ 2 ช่องระดับใบ
 * หน้านี้ส่ง apply_all ให้ API กลางจัดการให้ถูกแบบเอง ไม่ต้องรู้เองว่าใบไหนเป็นแบบไหน
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { needsCut, type CutFields } from "@/lib/cut-rules";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { MoMaterialChecklist } from "@/components/mo-material-checklist";

type Phase = "loading" | "ready" | "saving" | "error";

type SummaryRow = { component_sku: string | null; component_name: string | null; is_ready: boolean | null };
type MatRow = CutFields & { id: string; component_sku: string | null; cut_done: boolean | null };
type Mo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number | null; status: string | null; due_date: string | null;
  prep_done: boolean | null; cut_done: boolean | null;
  product_image?: string | null;   // รูปสินค้า (API /api/mo/[id] ส่งมาให้อยู่แล้ว)
  summary?: SummaryRow[]; materials?: MatRow[];
};

const thDateShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—";
/** เหลืออีกกี่วัน (null = ไม่ได้ตั้งวัน) */
const daysLeft = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};
const dueTone = (iso: string | null) => {
  const d = daysLeft(iso);
  if (d == null) return "bg-slate-50 border-slate-100 text-slate-400";
  if (d < 0) return "bg-rose-50 border-rose-200 text-rose-700";
  if (d <= 2) return "bg-amber-50 border-amber-200 text-amber-800";
  return "bg-slate-50 border-slate-100 text-slate-800";
};
const dueNote = (iso: string | null) => {
  const d = daysLeft(iso);
  if (d == null) return "ยังไม่ได้ตั้งวัน";
  if (d < 0) return `เลยมา ${Math.abs(d)} วัน`;
  if (d === 0) return "วันนี้!";
  return `อีก ${d} วัน`;
};

export default function ScanPrepPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [mo, setMo] = useState<Mo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<"prep" | "cut" | "both" | null>(null);   // ไว้กด ↩ ย้อนกลับทันทีถ้าเผลอกด
  const [undoAsk, setUndoAsk] = useState<"prep" | "cut" | "both" | null>(null);           // ยืนยันก่อนยกเลิกทั้งใบ
  const [checklistOpen, setChecklistOpen] = useState(false);                               // ป๊อปติ๊กทีละชิ้น

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch(`/api/mo/${encodeURIComponent(id)}`);
      if (res.status === 401) { router.replace(`/login?next=${encodeURIComponent(`/scan/prep/${id}`)}`); return; }
      const json = (await res.json()) as { data?: Mo; error?: string };
      if (!res.ok || !json.data) { setError(json.error ?? "ไม่พบใบสั่งผลิต"); setPhase("error"); return; }
      setMo(json.data); setPhase("ready");
    } catch {
      setError("เชื่อมต่อไม่ได้"); setPhase("error");
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  // ตัวนับให้ตรงกับที่บอร์ดนับเป๊ะ ๆ (อะไหล่ไม่นับเป็นงานตัด)
  const prog = useMemo(() => {
    const sums = mo?.summary ?? [];
    const cuts = (mo?.materials ?? []).filter((m) => needsCut(m));
    return {
      hasBom: sums.length > 0,
      prepTotal: sums.length,
      prepReady: sums.filter((s) => s.is_ready).length,
      cutTotal: cuts.length,
      cutReady: cuts.filter((m) => m.cut_done).length,
    };
  }, [mo]);

  const prepAllDone = prog.hasBom ? prog.prepTotal > 0 && prog.prepReady >= prog.prepTotal : !!mo?.prep_done;
  const cutAllDone = prog.hasBom ? prog.cutReady >= prog.cutTotal : !!mo?.cut_done;
  const greenLight = prepAllDone && cutAllDone;

  /** done=true = ติ๊กครบทั้งใบ · done=false = ยกเลิก (ปลดติ๊กทุกชิ้นในใบ) */
  const apply = useCallback(async (which: "prep" | "cut" | "both", done = true) => {
    if (!mo) return;
    setPhase("saving"); setError(null); setFlash(null);
    try {
      const body: Record<string, unknown> = { apply_all: true };
      if (which === "prep" || which === "both") body.prep_done = done;
      if (which === "cut" || which === "both") body.cut_done = done;

      const res = await apiFetch(`/api/mo/${encodeURIComponent(mo.id)}/prep`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "บันทึกไม่สำเร็จ"); setPhase("ready"); return; }
      const what = which === "cut" ? "ตัดครบ" : which === "prep" ? "เตรียมครบ" : "เตรียม+ตัด ครบ";
      setFlash(done ? `บันทึก ${what} แล้ว` : `ยกเลิก ${what} แล้ว`);
      setLastApplied(done ? which : null);
      await load();
      setPhase("ready");
    } catch {
      setError("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง"); setPhase("ready");
    }
  }, [mo, load]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="mx-auto max-w-lg p-4 pb-24 space-y-3">{children}</div>
    </div>
  );

  if (phase === "loading") return <Shell><div className="text-center text-slate-400 py-24">กำลังโหลดใบสั่งผลิต...</div></Shell>;

  if (phase === "error" || !mo) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-red-600 font-medium mb-4">{error ?? "ไม่พบใบสั่งผลิต"}</div>
          <button onClick={() => router.push("/scan")} className="h-11 px-5 rounded-xl bg-blue-600 text-white font-medium">
            กลับไปสแกน
          </button>
        </div>
      </Shell>
    );
  }

  const Bar = ({ label, done, total }: { label: string; done: number; total: number }) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const full = total > 0 && done >= total;
    return (
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-600">{label}</span>
          <span className={full ? "text-emerald-600 font-semibold" : "text-slate-500"}>
            {done}/{total}{full ? " ✓" : ""}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${full ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <Shell>
      {/* หัวใบ — รูปสินค้าด้านขวา · จำนวน/กำหนดส่งตัวใหญ่ (อ่านจากระยะแขนบนหน้างาน) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">ใบสั่งผลิต</span>
              <button onClick={() => router.push("/scan")}
                className="ml-auto sm:hidden shrink-0 h-8 px-2.5 rounded-lg border border-slate-200 text-slate-500 text-xs">สแกนใหม่</button>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono">{mo.mo_no}</div>
            <div className="text-sm text-slate-700 mt-0.5 line-clamp-2">{mo.product_name ?? "—"}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono">{mo.product_sku ?? ""}</div>
          </div>

          {/* รูปสินค้า — แตะเพื่อดูใหญ่ */}
          <div className="shrink-0 flex flex-col items-end gap-2">
            {mo.product_image
              ? <HoverImage url={mo.product_image} size={84} previewSize={320} rounded="rounded-xl" alt={mo.product_sku ?? ""} />
              : <div className="w-[84px] h-[84px] rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-3xl text-slate-300">📦</div>}
            <button onClick={() => router.push("/scan")}
              className="hidden sm:block h-8 px-2.5 rounded-lg border border-slate-200 text-slate-500 text-xs">สแกนใหม่</button>
          </div>
        </div>

        {/* จำนวน + กำหนดส่ง — ตัวใหญ่ อ่านง่าย */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[11px] text-slate-400">จำนวนผลิต</div>
            <div className="text-3xl font-extrabold text-slate-900 leading-tight">
              {Number(mo.qty ?? 0).toLocaleString("th-TH")}<span className="text-sm font-normal text-slate-400 ml-1">ชิ้น</span>
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${dueTone(mo.due_date)}`}>
            <div className="text-[11px] opacity-70">กำหนดส่ง</div>
            <div className="text-2xl font-extrabold leading-tight">{thDateShort(mo.due_date)}</div>
            {dueNote(mo.due_date) && <div className="text-[11px] font-medium">{dueNote(mo.due_date)}</div>}
          </div>
        </div>
      </div>

      {/* ไฟเขียว */}
      <div className={`rounded-2xl border p-4 ${greenLight ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-200"}`}>
        {greenLight ? (
          <div className="text-center">
            <div className="text-4xl mb-1">🟢</div>
            <div className="font-semibold text-emerald-800">พร้อมจ่ายงานแล้ว</div>
            <div className="text-xs text-emerald-600 mt-1">ใบนี้ขึ้นไฟเขียวบนบอร์ดจ่ายงานแล้ว</div>
          </div>
        ) : (
          <div className="space-y-3">
            {prog.hasBom ? (
              <>
                <Bar label="เตรียมวัตถุดิบ" done={prog.prepReady} total={prog.prepTotal} />
                {prog.cutTotal > 0
                  ? <Bar label="ตัดบล็อก" done={prog.cutReady} total={prog.cutTotal} />
                  : <div className="text-xs text-slate-400">ใบนี้ไม่มีบล็อกที่ต้องตัด</div>}
              </>
            ) : (
              <div className="text-sm text-slate-600">
                ใบนี้ไม่มีรายการวัตถุดิบ — ติ๊กรวมทั้งใบได้เลย
                <div className="text-xs text-slate-400 mt-1">
                  เตรียม: {mo.prep_done ? "ครบแล้ว ✓" : "ยังไม่ครบ"} · ตัด: {mo.cut_done ? "ครบแล้ว ✓" : "ยังไม่ครบ"}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {flash && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
          <span className="flex-1">✅ {flash}</span>
          {/* เผลอกด → กดย้อนกลับได้ทันที (ปลดติ๊กที่เพิ่งกดไป) */}
          {lastApplied && (
            <button onClick={() => void apply(lastApplied, false)} disabled={phase === "saving"}
              className="shrink-0 h-8 px-3 rounded-lg border border-emerald-300 bg-white text-emerald-700 text-xs font-semibold disabled:opacity-50">
              ↩ ย้อนกลับ
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠️ {error}</div>
      )}

      {/* ปุ่ม */}
      {!greenLight && (
        <div className="space-y-2">
          {!prepAllDone && (
            <button onClick={() => void apply("prep")} disabled={phase === "saving"}
              className="w-full h-14 rounded-2xl bg-emerald-600 text-white text-lg font-bold disabled:opacity-50">
              {phase === "saving" ? "กำลังบันทึก..." : "✅ เตรียมครบทั้งใบ"}
            </button>
          )}
          {!cutAllDone && prog.cutTotal > 0 && (
            <button onClick={() => void apply("cut")} disabled={phase === "saving"}
              className="w-full h-14 rounded-2xl bg-indigo-600 text-white text-lg font-bold disabled:opacity-50">
              {phase === "saving" ? "กำลังบันทึก..." : "✂️ ตัดครบทั้งใบ"}
            </button>
          )}
          {!prepAllDone && !cutAllDone && (prog.cutTotal > 0 || !prog.hasBom) && (
            <button onClick={() => void apply("both")} disabled={phase === "saving"}
              className="w-full h-12 rounded-xl border-2 border-emerald-500 bg-white text-emerald-700 font-semibold disabled:opacity-50">
              ครบทั้งเตรียมและตัด
            </button>
          )}
        </div>
      )}

      {/* ยกเลิกทีหลัง (ไม่ได้เพิ่งกด) — ต้องยืนยันก่อน เพราะปลดติ๊กทุกชิ้นในใบ */}
      {(prepAllDone || cutAllDone) && (
        <div className="flex flex-wrap gap-2">
          {prepAllDone && (
            <button onClick={() => setUndoAsk("prep")} disabled={phase === "saving"}
              className="flex-1 h-10 rounded-xl border border-slate-300 bg-white text-slate-600 text-sm disabled:opacity-50">
              ↩ ยกเลิกเตรียมครบ
            </button>
          )}
          {cutAllDone && prog.cutTotal > 0 && (
            <button onClick={() => setUndoAsk("cut")} disabled={phase === "saving"}
              className="flex-1 h-10 rounded-xl border border-slate-300 bg-white text-slate-600 text-sm disabled:opacity-50">
              ↩ ยกเลิกตัดครบ
            </button>
          )}
        </div>
      )}

      <button onClick={() => setChecklistOpen(true)}
        className="w-full h-12 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium">
        📋 ติ๊กทีละชิ้น / ดูรายละเอียด
      </button>

      <button onClick={() => router.push("/scan")}
        className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold">
        📷 สแกนใบถัดไป
      </button>

      {/* ป๊อปติ๊กทีละชิ้น — ใช้เช็กลิสต์ตัวกลางตัวเดียวกับบอร์ดจ่ายงาน/หน้าความพร้อม */}
      <ERPModal open={checklistOpen} onClose={() => { setChecklistOpen(false); void load(); }} size="xl" storageKey="scan-prep-checklist"
        title={`${mo.product_sku ?? ""} · ${mo.mo_no}`}
        footer={<button onClick={() => { setChecklistOpen(false); void load(); }} className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg">เสร็จแล้ว</button>}>
        <MoMaterialChecklist moId={mo.id} moNo={mo.mo_no} productLabel={mo.product_name ?? mo.product_sku} productSku={mo.product_sku} onSaved={load} />
      </ERPModal>

      {/* ยืนยันก่อนยกเลิกทั้งใบ */}
      <ERPModal open={!!undoAsk} onClose={() => setUndoAsk(null)} size="sm" title="ยกเลิกการติ๊กทั้งใบ?"
        footer={<>
          <button onClick={() => setUndoAsk(null)} className="h-10 px-4 text-sm border border-slate-200 rounded-lg">ไม่ยกเลิก</button>
          <button onClick={() => { const w = undoAsk; setUndoAsk(null); if (w) void apply(w, false); }}
            className="h-10 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg">ยกเลิกทั้งใบ</button>
        </>}>
        <div className="text-sm text-slate-700">
          จะปลดติ๊ก <b>{undoAsk === "cut" ? "ตัดครบ" : "เตรียมครบ"}</b> ของใบ <b className="font-mono">{mo.mo_no}</b>
          <div className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            ⚠️ ปลด<b>ทุกชิ้นในใบ</b> ({undoAsk === "cut" ? `${prog.cutTotal} บล็อก` : `${prog.prepTotal} รายการ`}) —
            ถ้าอยากปลดแค่บางชิ้น ให้กด “📋 ติ๊กทีละชิ้น” แทน
            {undoAsk === "cut" && (
              <div className="mt-1 pt-1 border-t border-amber-200">
                หมายเหตุ: ระบบผูก “ตัด” กับ “เตรียม” ไว้ — ยกเลิกตัดครบ จะทำให้<b>วัตถุดิบที่มีบล็อกตัดกลับเป็น “ยังไม่เตรียม”</b> ด้วย
              </div>
            )}
          </div>
        </div>
      </ERPModal>
    </Shell>
  );
}
