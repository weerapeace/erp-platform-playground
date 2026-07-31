"use client";

/**
 * การ์ดยืนยันรับของจากการสแกน — /scan/receive/<po_id>
 *
 * หลักการที่ยึด (กันของเข้าเบิ้ล / กันกดผิดใบ):
 *  1) ต้องเห็นข้อมูลใบก่อนเสมอ — ร้าน / รายการ / รูป / จำนวน ไม่ใช่สแกนแล้วบันทึกทันที
 *  2) รับครบแล้ว = ปุ่มถูกปิด + บอกว่าใครรับเมื่อไหร่
 *  3) กด 2 จังหวะ (กดปุ่ม → เห็นสรุป → ยืนยัน) กันนิ้วโดนโดยไม่ตั้งใจ
 *  4) มีช่อง "ผู้รับของ" — เครื่องประจำจุดล็อกอินบัญชีเดียว ประวัติจะได้รู้ว่าใครเป็นคนรับจริง
 *  5) รับไม่ครบ/มีของเสีย → ส่งต่อไปฟอร์มเต็มที่หน้ารับของเดิม (ไม่ทำ logic ซ้ำ)
 *
 * เขียนข้อมูลผ่าน API กลางเดิม POST /api/purchasing/receive
 * (ออกเลขใบรับ + สร้าง GR + อัปเดตบรรทัด PO + สถานะใบ + ลงบัญชีเดินสต๊อก + audit ครบอยู่แล้ว)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import type { PoDetail } from "@/app/api/purchasing/po-detail/route";

type Phase = "loading" | "ready" | "confirm" | "saving" | "done" | "error";

const nf = (n: number) => Number(n || 0).toLocaleString("th-TH");
const thDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ScanReceivePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = String(params?.id ?? "");

  const [po, setPo] = useState<PoDetail | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [receiver, setReceiver] = useState("");
  const [result, setResult] = useState<{ gr_no?: string; stocked?: number; warnings?: string[] } | null>(null);

  useEffect(() => { if (user?.name && !receiver) setReceiver(user.name); }, [user, receiver]);

  const load = useCallback(async () => {
    setPhase("loading"); setError(null);
    try {
      const res = await apiFetch(`/api/purchasing/po-detail?id=${encodeURIComponent(id)}`);
      if (res.status === 401) { router.replace(`/login?next=${encodeURIComponent(`/scan/receive/${id}`)}`); return; }
      const json = (await res.json()) as { data?: PoDetail; error?: string };
      if (!res.ok || !json.data) { setError(json.error ?? "ไม่พบใบสั่งซื้อ"); setPhase("error"); return; }
      setPo(json.data); setPhase("ready");
    } catch {
      setError("เชื่อมต่อไม่ได้"); setPhase("error");
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  /** บรรทัดที่ยังรับไม่ครบ = ของที่จะรับรอบนี้ */
  const openLines = useMemo(
    () => (po?.lines ?? []).filter((l) => !l.done && l.qty - l.received > 0),
    [po],
  );
  const allDone = !!po && openLines.length === 0;
  const totalRemain = openLines.reduce((s, l) => s + (l.qty - l.received), 0);

  const submit = useCallback(async () => {
    if (!po || openLines.length === 0) return;
    setPhase("saving"); setError(null);
    try {
      const res = await apiFetch("/api/purchasing/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: po.id,
          receiver: receiver.trim() || user?.name || null,
          note: "รับของจากการสแกน QR",
          lines: openLines.map((l) => ({
            po_line_id: l.id,
            qty_received: l.qty - l.received,
            qty_defective: 0,
            case_type: "full",
          })),
        }),
      });
      const json = (await res.json()) as { gr_no?: string; stocked_lines?: number; stock_warnings?: string[]; error?: string };
      if (!res.ok) { setError(json.error ?? "บันทึกไม่สำเร็จ"); setPhase("ready"); return; }
      setResult({ gr_no: json.gr_no, stocked: json.stocked_lines, warnings: json.stock_warnings ?? [] });
      setPhase("done");
    } catch {
      setError("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง"); setPhase("ready");
    }
  }, [po, openLines, receiver, user]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="mx-auto max-w-lg p-4 pb-24 space-y-3">{children}</div>
    </div>
  );

  if (phase === "loading") {
    return <Shell><div className="text-center text-slate-400 py-24">กำลังโหลดใบสั่งซื้อ...</div></Shell>;
  }

  if (phase === "error" || !po) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-red-600 font-medium mb-4">{error ?? "ไม่พบใบสั่งซื้อ"}</div>
          <button onClick={() => router.push("/scan")} className="h-11 px-5 rounded-xl bg-blue-600 text-white font-medium">
            กลับไปสแกน
          </button>
        </div>
      </Shell>
    );
  }

  // ---- บันทึกสำเร็จ ----
  if (phase === "done") {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-emerald-200 p-6 text-center">
          <div className="text-5xl mb-2">✅</div>
          <div className="text-lg font-semibold text-emerald-700">รับของเรียบร้อย</div>
          <div className="text-sm text-slate-600 mt-1">
            {po.po_no} · {po.seller ?? "—"}
          </div>
          {result?.gr_no && <div className="text-xs text-slate-400 mt-1 font-mono">เลขใบรับ {result.gr_no}</div>}
          <div className="text-sm text-slate-500 mt-3">ผู้รับ: {receiver || "—"}</div>
          {typeof result?.stocked === "number" && (
            <div className="text-xs text-slate-400 mt-1">เข้าสต๊อกแล้ว {result.stocked} รายการ</div>
          )}
        </div>

        {/* บันทึกใบรับสำเร็จแล้ว แต่บวกสต๊อกไม่ผ่าน — ต้องบอก ไม่ใช่เงียบ */}
        {result?.warnings && result.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
            <div className="font-medium text-amber-800 text-sm">⚠️ รับของสำเร็จ แต่บวกสต๊อกไม่ครบ</div>
            <ul className="text-xs text-amber-700 mt-1.5 list-disc pl-4 space-y-0.5">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <div className="text-[11px] text-amber-600 mt-2">แจ้งคนดูแลระบบให้ตรวจสต๊อกของรายการนี้</div>
          </div>
        )}
        <button onClick={() => router.push("/scan")}
          className="w-full h-14 rounded-2xl bg-blue-600 text-white text-lg font-semibold">
          📷 สแกนใบถัดไป
        </button>
        <button onClick={() => router.push(`/print/purchase-order/${po.id}`)}
          className="w-full h-11 rounded-xl border border-slate-300 bg-white text-slate-700">
          ดูใบสั่งซื้อ
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* หัวใบ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">ใบสั่งซื้อ</div>
            <div className="text-xl font-bold text-slate-900 font-mono">{po.po_no}</div>
            <div className="text-sm text-slate-600 mt-0.5 truncate">🏪 {po.seller ?? "—"}</div>
            <div className="text-xs text-slate-400 mt-0.5">สั่งเมื่อ {thDate(po.order_date)}</div>
          </div>
          <button onClick={() => router.push("/scan")}
            className="shrink-0 h-9 px-3 rounded-lg border border-slate-200 text-slate-500 text-sm">
            สแกนใหม่
          </button>
        </div>
      </div>

      {/* เตือนถ้ารับไปแล้ว */}
      {allDone && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
          <div className="font-semibold text-amber-800">⚠️ ใบนี้รับครบแล้ว</div>
          <div className="text-sm text-amber-700 mt-1">
            {po.last_receipt
              ? <>รับเมื่อ {thDate(po.last_receipt.receive_date)} โดย {po.last_receipt.receiver || "—"} (ใบรับ {po.last_receipt.gr_no})</>
              : <>ทุกรายการในใบนี้ถูกปิดแล้ว</>}
          </div>
          <div className="text-xs text-amber-600 mt-2">กดรับซ้ำไม่ได้ — ถ้าของมาเพิ่มจริง ให้แก้ที่หน้ารับของ</div>
        </div>
      )}

      {po.last_receipt && !allDone && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-800">
          ℹ️ ใบนี้เคยรับมาแล้วบางส่วน (ล่าสุด {thDate(po.last_receipt.receive_date)} โดย {po.last_receipt.receiver || "—"})
        </div>
      )}

      {/* รายการ */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 text-xs font-medium text-slate-400 border-b border-slate-100">
          รายการในใบ ({po.lines.length})
        </div>
        <ul className="divide-y divide-slate-100">
          {po.lines.map((l) => {
            const remain = Math.max(0, l.qty - l.received);
            return (
              <li key={l.id} className="p-3 flex gap-3">
                {l.img
                  ? <img src={l.img} alt="" className="w-14 h-14 rounded-lg object-cover bg-slate-100 shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-slate-100 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800 leading-snug">{l.name}</div>
                  {l.sku && <div className="text-xs text-slate-400 font-mono">{l.sku}</div>}
                  <div className="text-sm mt-1">
                    <span className="text-slate-500">สั่ง {nf(l.qty)} {l.uom ?? ""}</span>
                    {l.received > 0 && <span className="text-slate-400"> · รับแล้ว {nf(l.received)}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {l.done || remain === 0
                    ? <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">ครบแล้ว</span>
                    : <><div className="text-lg font-bold text-orange-600 leading-none">{nf(remain)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">รอรับ</div></>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {!allDone && (
        <>
          {/* ผู้รับของ */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <label className="text-xs font-medium text-slate-500">ผู้รับของ</label>
            <input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="ชื่อคนที่รับของจริง"
              className="mt-1.5 w-full h-11 px-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-[11px] text-slate-400 mt-1.5">
              เครื่องประจำจุดใช้บัญชีเดียวกันทั้งแผนก — ใส่ชื่อจริงเพื่อให้ประวัติรู้ว่าใครรับ
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠️ {error}</div>
          )}

          {/* ยืนยัน 2 จังหวะ */}
          {phase === "confirm" ? (
            <div className="bg-white rounded-2xl border-2 border-emerald-400 p-4 space-y-3">
              <div className="font-semibold text-slate-800">ยืนยันรับของ?</div>
              <div className="text-sm text-slate-600 space-y-1">
                <div>• ใบ <span className="font-mono">{po.po_no}</span> — {po.seller ?? "—"}</div>
                <div>• รับ <strong>{openLines.length}</strong> รายการ รวม <strong>{nf(totalRemain)}</strong> ชิ้น (เท่ากับที่สั่ง)</div>
                <div>• ผู้รับ: <strong>{receiver.trim() || user?.name || "—"}</strong></div>
                <div className="text-slate-400">ระบบจะบวกสต๊อกและบันทึกประวัติให้อัตโนมัติ</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPhase("ready")} className="flex-1 h-12 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium">
                  ย้อนกลับ
                </button>
                <button onClick={() => void submit()} className="flex-[2] h-12 rounded-xl bg-emerald-600 text-white font-semibold">
                  ยืนยัน
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPhase("confirm")}
              disabled={phase === "saving" || openLines.length === 0}
              className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-lg font-bold disabled:opacity-50 shadow-sm"
            >
              {phase === "saving" ? "กำลังบันทึก..." : `✅ รับครบตามสั่ง (${nf(totalRemain)} ชิ้น)`}
            </button>
          )}

          <button
            onClick={() => router.push("/purchasing/receive")}
            className="w-full h-12 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium"
          >
            รับไม่ครบ / มีของเสีย →
          </button>
        </>
      )}

      {allDone && (
        <button onClick={() => router.push("/scan")} className="w-full h-14 rounded-2xl bg-blue-600 text-white text-lg font-semibold">
          📷 สแกนใบถัดไป
        </button>
      )}
    </Shell>
  );
}
