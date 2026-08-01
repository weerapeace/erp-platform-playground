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

type Phase = "loading" | "ready" | "saving" | "error";

type SummaryRow = { component_sku: string | null; component_name: string | null; is_ready: boolean | null };
type MatRow = CutFields & { id: string; component_sku: string | null; cut_done: boolean | null };
type Mo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number | null; status: string | null; due_date: string | null;
  prep_done: boolean | null; cut_done: boolean | null;
  summary?: SummaryRow[]; materials?: MatRow[];
};

const thDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ScanPrepPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [mo, setMo] = useState<Mo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  const apply = useCallback(async (which: "prep" | "cut" | "both") => {
    if (!mo) return;
    setPhase("saving"); setError(null); setFlash(null);
    try {
      const body: Record<string, unknown> = { apply_all: true };
      if (which === "prep" || which === "both") body.prep_done = true;
      if (which === "cut" || which === "both") body.cut_done = true;

      const res = await apiFetch(`/api/mo/${encodeURIComponent(mo.id)}/prep`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "บันทึกไม่สำเร็จ"); setPhase("ready"); return; }
      setFlash(which === "cut" ? "บันทึก ตัดครบ แล้ว" : which === "prep" ? "บันทึก เตรียมครบ แล้ว" : "บันทึก เตรียม+ตัด ครบแล้ว");
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
      {/* หัวใบ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">ใบสั่งผลิต</div>
            <div className="text-xl font-bold text-slate-900 font-mono">{mo.mo_no}</div>
            <div className="text-sm text-slate-700 mt-0.5 truncate">{mo.product_name ?? "—"}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono">{mo.product_sku ?? ""}</div>
            <div className="text-xs text-slate-500 mt-1">
              จำนวน {Number(mo.qty ?? 0).toLocaleString("th-TH")} · กำหนดส่ง {thDate(mo.due_date)}
            </div>
          </div>
          <button onClick={() => router.push("/scan")}
            className="shrink-0 h-9 px-3 rounded-lg border border-slate-200 text-slate-500 text-sm">
            สแกนใหม่
          </button>
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-800">✅ {flash}</div>
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

      <button onClick={() => router.push(`/master/manufacturing-orders?open=${encodeURIComponent(mo.id)}`)}
        className="w-full h-12 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium">
        ติ๊กทีละชิ้น / ดูรายละเอียด →
      </button>

      <button onClick={() => router.push("/scan")}
        className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold">
        📷 สแกนใบถัดไป
      </button>
    </Shell>
  );
}
