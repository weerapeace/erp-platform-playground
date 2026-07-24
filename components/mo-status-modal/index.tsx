"use client";

// ============================================================
// MoStatusModal (ของกลาง) — Popup "สถานะงานผลิต" ของใบสั่งผลิต 1 ใบ
// โชว์สถานะ 9 ขั้น + รายละเอียดเฉพาะขั้นนั้น + กล่องงานเหมา (ถ้ามี)
// ดึงจาก /api/mo/[id]/status (คำนวณจากหลังบ้านครั้งเดียว)
// ============================================================
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import type { MoStatus } from "@/app/api/mo/[id]/status/route";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const baht = (n: number) => "฿" + fmt(n);

// สีตามขั้น: ติดปัญหา=แดง · รอ=เหลือง · พร้อม/จบ=เขียว · กำลังทำ=คราม
const TONE: Record<number, string> = {
  1: "bg-slate-50 text-slate-600 border-slate-200",
  2: "bg-rose-50 text-rose-700 border-rose-200",
  3: "bg-amber-50 text-amber-700 border-amber-200",
  4: "bg-rose-50 text-rose-700 border-rose-200",
  5: "bg-emerald-50 text-emerald-700 border-emerald-200",
  6: "bg-indigo-50 text-indigo-700 border-indigo-200",
  7: "bg-indigo-50 text-indigo-700 border-indigo-200",
  8: "bg-amber-50 text-amber-700 border-amber-200",
  9: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// สีตามสถานะของซื้อ: รอ=เหลือง · สั่งแล้ว=น้ำเงิน · ของเข้า=เขียว
const PU_TONE: Record<string, string> = {
  wait: "text-amber-700 bg-amber-50/60 border-amber-100",
  ordered: "text-blue-700 bg-blue-50/60 border-blue-100",
  done: "text-emerald-700 bg-emerald-50/60 border-emerald-100",
};

function Bar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const ok = total > 0 && done >= total;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-12 shrink-0">{label}</span>
      <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums shrink-0 ${ok ? "text-emerald-600 font-medium" : "text-slate-500"}`}>{done}/{total}</span>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function MoStatusModal({ moId, onClose, onOpenChecklist }: {
  moId: string; onClose: () => void; onOpenChecklist?: (moId: string) => void;
}) {
  const [d, setD] = useState<MoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    apiFetch(`/api/mo/${encodeURIComponent(moId)}/status`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setD(j.data as MoStatus); })
      .catch(() => setErr("โหลดสถานะไม่ได้"))
      .finally(() => setLoading(false));
  }, [moId]);

  const title = d ? `📊 สถานะ · ${d.product_sku ?? d.mo_no}` : "📊 สถานะงาน";

  return (
    <ERPModal open onClose={onClose} size="md" title={title}>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}</div>
      ) : err ? (
        <div className="text-sm text-red-600 py-6 text-center">{err}</div>
      ) : !d ? null : (
        <div className="space-y-3">
          {/* หัว: ชื่อสินค้า + ใบสั่งผลิต */}
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.product_name || d.product_sku || "—"}</div>
            <div className="font-mono text-[11px] text-slate-400">{d.product_sku} · {d.mo_no} · {fmt(d.qty)} ชิ้น</div>
          </div>

          {/* แถบสถานะ */}
          <div className={`rounded-xl border px-3 py-2.5 ${TONE[d.code] ?? TONE[1]}`}>
            <div className="text-[11px] opacity-70">สถานะ (ขั้น {d.code}/9)</div>
            <div className="text-base font-bold">{d.label}</div>
            {d.note && <div className="text-xs mt-1 font-medium">{d.note}</div>}
          </div>

          {/* ความคืบหน้า เตรียม/ตัด */}
          <div className="space-y-1.5 bg-slate-50 rounded-lg p-2.5">
            <Bar label="เตรียม" done={d.prep.done} total={d.prep.total} />
            {d.cut.total > 0 && <Bar label="ตัด" done={d.cut.done} total={d.cut.total} />}
            <div className="flex gap-3 text-[11px] text-slate-500 pt-0.5">
              <span>จ่ายแล้ว {fmt(d.dispatched)}/{fmt(d.qty)}</span>
              <span>ส่งคืน {fmt(d.received)}/{fmt(d.qty)}</span>
            </div>
          </div>

          {/* ---- รายละเอียดตามขั้น ---- */}
          {d.code === 1 && <p className="text-sm text-slate-500 text-center py-3">ยังไม่เริ่มเตรียม/ตัด</p>}
          {d.code === 5 && <p className="text-sm text-emerald-700 font-medium text-center py-3">✅ พร้อมจ่ายงานแล้ว</p>}

          {(d.code === 2 || d.code === 4) && d.missing.length > 0 && (
            <Sec title={`ของที่ยังไม่ครบ (${d.missing.length} รายการ)`}>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {d.missing.map((m, i) => (
                  <div key={i} className="text-xs bg-rose-50/60 border border-rose-100 rounded-lg px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-slate-700">{m.name}</span>
                      <span className="tabular-nums text-slate-500 shrink-0">ต้องใช้ {fmt(m.required)}{m.uom ? ` ${m.uom}` : ""}</span>
                      {m.to_purchase > 0 && <span className="tabular-nums text-rose-700 font-medium shrink-0">ต้องซื้อ {fmt(m.to_purchase)}</span>}
                    </div>
                    {m.purchase_status && <div className="text-[11px] text-slate-500 mt-0.5">{m.purchase_status}</div>}
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {(d.code === 3 || d.code === 4) && d.pending_cut.length > 0 && (
            <Sec title={`รอตัด (${d.pending_cut.length} รายการ)`}>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {d.pending_cut.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-amber-50/60 border border-amber-100 rounded-lg px-2 py-1.5">
                    <span className="flex-1 min-w-0 truncate text-slate-700">{c.name}</span>
                    {c.block && <span className="text-slate-400 shrink-0">{c.block}</span>}
                    <span className="tabular-nums text-amber-700 font-medium shrink-0">{fmt(c.pieces)} ชิ้น</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {d.purchases.length > 0 && (
            <Sec title={`สถานะของซื้อ (${d.purchases.length})`}>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {d.purchases.map((p, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs border rounded-lg px-2 py-1.5 ${PU_TONE[p.tone] ?? "border-slate-100"}`}>
                    <span className="flex-1 min-w-0 truncate">{p.is_urgent && <span className="text-rose-600">⚡ </span>}{p.item_name}</span>
                    <span className="shrink-0 font-medium">{p.label}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {(d.code === 6 || d.code === 7 || d.code === 8 || d.code === 9) && d.desks.length > 0 && (
            <Sec title="โต๊ะที่จ่ายงาน">
              <div className="space-y-1">
                {d.desks.map((k, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 flex-1 truncate">🔨 {k.desk}</span>
                      <span className="text-xs tabular-nums text-slate-500">{fmt(k.qty)} ชิ้น</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>ราคาที่จ่าย <b className="text-slate-700">{baht(k.rate_per_piece)}</b>/ชิ้น</span>
                      <span>รวมค่าแรง <b className="text-slate-700">{baht(k.labor_total)}</b></span>
                      {k.dispatch_date && <span>จ่าย {new Date(k.dispatch_date).toLocaleDateString("th-TH")}</span>}
                      {k.days_since !== null && <span className="text-amber-600">จ่ายมาแล้ว {k.days_since} วัน</span>}
                      {k.received > 0 && <span className="text-emerald-600">ส่งคืน {fmt(k.received)}</span>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-slate-500">ค่าแรงรวมทั้งใบ</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{baht(d.labor_total)}</span>
                </div>
              </div>
            </Sec>
          )}

          {d.code === 7 && <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5">⏳ ยังต้องจ่ายอีก <b>{fmt(d.remaining_to_dispatch)}</b> ชิ้น</p>}
          {d.code === 8 && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">📦 ส่งคืนแล้ว <b>{fmt(d.received)}</b> ชิ้น · เหลืออีก <b>{fmt(d.remaining_to_receive)}</b> ชิ้น</p>}
          {d.code === 9 && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5">🎉 จบงาน — ส่งครบ {fmt(d.qty)} ชิ้น · ค่าแรงรวม {baht(d.labor_total)}</p>}

          {/* ---- กล่องงานเหมา ---- */}
          {d.piecework.length > 0 && (
            <Sec title={`งานเหมา (${d.piecework.length} รายการ)`}>
              <div className="space-y-1">
                {d.piecework.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs border border-violet-100 bg-violet-50/50 rounded-lg px-2 py-1.5">
                    <span className="flex-1 min-w-0 truncate text-slate-700">{p.job}</span>
                    <span className="text-slate-500 shrink-0">👤 {p.assignee || "—"}</span>
                    <span className="tabular-nums text-slate-500 shrink-0">{baht(p.rate)}×{fmt(p.qty)}</span>
                    <span className="tabular-nums font-semibold text-violet-700 shrink-0">{baht(p.total)}</span>
                    {p.done && <span className="text-emerald-600 shrink-0">✓</span>}
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {/* ปุ่มไปเช็กลิสต์เต็ม */}
          {onOpenChecklist && (
            <button onClick={() => onOpenChecklist(moId)}
              className="w-full h-9 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              📋 เปิดเช็กลิสต์เตรียม/ตัด เต็ม →
            </button>
          )}
        </div>
      )}
    </ERPModal>
  );
}
