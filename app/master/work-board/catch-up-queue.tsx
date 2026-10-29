"use client";

/**
 * คิว "คำขออัปเดตงาน" (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — เปิดจากปุ่มบนแถบเหลือง / ลิงก์แจ้งเตือน (?cu=requests)
 *   หัวหน้า (work_board.catch_up_approve): แท็บ "รอยืนยัน" = คำขอของทุกคนที่ยังไม่จบ → กด "ตรวจ / ยืนยัน" เปิดป๊อปอัปเดตงานตัวเดิม (ข้อมูลที่พนักงานกรอกขึ้นให้)
 *   ทุกคน: แท็บ "ของฉัน" 14 วันล่าสุด — รอยืนยัน / ยืนยันแล้ว / ถูกตีกลับ (พร้อมเหตุผล) → เปิดแก้ / แก้แล้วส่งใหม่
 * ข้อมูลจาก GET /api/mo/catch-up/requests (หน้าแม่โหลดให้)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/state-views";
import type { CuRequest, CuRequestStatus } from "@/app/api/mo/catch-up/requests/route";
import { CU_TARGETS, cuWhen } from "./catch-up";

const STATUS: Record<CuRequestStatus, { label: string; cls: string }> = {
  pending: { label: "รอยืนยัน", cls: "bg-amber-50 text-amber-800" },
  processing: { label: "กำลังบันทึก", cls: "bg-sky-50 text-sky-700" },
  approved: { label: "ยืนยันแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "ถูกตีกลับ", cls: "bg-rose-50 text-rose-700" },
  cancelled: { label: "ยกเลิกแล้ว", cls: "bg-slate-100 text-slate-500" },
};
const targetLabel = (k: string) => CU_TARGETS.find((t) => t.key === k)?.label ?? k;

export function CatchUpQueue({ open, onClose, queue, mine, canApprove, onOpenMo }: {
  open: boolean; onClose: () => void;
  /** คำขอที่ยังไม่จบของทุกคน (เฉพาะหัวหน้า) · ของฉัน 14 วันล่าสุด */
  queue: CuRequest[]; mine: CuRequest[];
  canApprove: boolean;
  /** เปิดป๊อปอัปเดตงานของใบนั้น (ตรวจ / แก้ / ส่งใหม่) */
  onOpenMo: (moNo: string) => void;
}) {
  const others = queue.filter((q) => !q.mine);
  const [tab, setTab] = useState<"queue" | "mine">(canApprove ? "queue" : "mine");
  useEffect(() => { if (open) setTab(canApprove && (others.length > 0 || mine.length === 0) ? "queue" : "mine"); }, [open, canApprove]);   // eslint-disable-line react-hooks/exhaustive-deps
  const list = tab === "queue" ? others : mine;

  return (
    <ERPModal open={open} onClose={onClose} title="คำขออัปเดตงาน" size="md" storageKey="wb-catchup-queue"
      description={canApprove ? "พนักงานที่ไม่มีสิทธิ์บันทึกเอง ส่งอัปเดตมาให้ยืนยัน — เปิดตรวจ แก้ได้ทุกช่อง แล้วยืนยันหรือตีกลับ" : "อัปเดตที่คุณส่งให้หัวหน้ายืนยัน (14 วันล่าสุด)"}>
      <div className="space-y-3">
        {canApprove && (
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
            {([["queue", `รอยืนยัน (${others.length})`], ["mine", `ของฉัน (${mine.length})`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`h-8 flex-1 rounded-md font-medium ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <EmptyState icon={<Icon name={tab === "queue" ? "done" : "request"} />}
            title={tab === "queue" ? "ไม่มีคำขอรอยืนยัน" : "ยังไม่มีคำขอของคุณ"}
            hint={tab === "queue" ? "มีคำขอใหม่ ระบบจะแจ้งเตือนที่กระดิ่ง" : "กด \"อัปเดต\" ท้ายชื่อสินค้าบนตาราง แล้วส่งให้หัวหน้ายืนยัน"} className="!p-8" />
        ) : list.map((q) => {
          const st = q.status === "approved" && q.result && !q.result.ok ? { label: "บันทึกได้บางขั้น", cls: "bg-amber-50 text-amber-800" } : STATUS[q.status];
          const openable = tab === "queue" || q.status === "pending" || q.status === "rejected";
          return (
            <div key={q.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">{q.product_sku ?? q.mo_no}</span>
                <span className="text-[12px] text-slate-400">{q.mo_no}</span>
                <span className="rounded-full bg-indigo-50 px-2 text-[12px] text-indigo-700">{targetLabel(q.target)}</span>
                <span className={`rounded-full px-2 text-[12px] ${st.cls}`}>{st.label}</span>
                <span className="ml-auto text-[12px] text-slate-400">{tab === "queue" ? `${q.requested_name ?? "พนักงาน"} · ` : ""}{cuWhen(q.requested_at)}</span>
              </div>
              {q.summary.length > 0 && (
                <div className="mt-1 text-[12px] leading-relaxed text-slate-600">
                  {q.summary.slice(0, 4).map((x, i) => <div key={i}>• {x}</div>)}
                  {q.summary.length > 4 && <div className="text-slate-400">…อีก {q.summary.length - 4} ขั้น</div>}
                </div>
              )}
              {q.status === "processing" && <div className="mt-1 text-[12px] text-sky-700">{q.reviewed_name ?? "หัวหน้า"} กำลังบันทึก ({cuWhen(q.reviewed_at ?? q.requested_at)})</div>}
              {q.status === "rejected" && <div className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-[12px] text-rose-800">ตีกลับโดย {q.reviewed_name ?? "หัวหน้า"}: <b className="font-medium">{q.review_note}</b></div>}
              {q.status === "approved" && <div className="mt-1 text-[12px] text-emerald-700">ยืนยันโดย {q.reviewed_name ?? "หัวหน้า"} · {cuWhen(q.reviewed_at ?? q.requested_at)}{q.result && !q.result.ok ? ` — สำเร็จ ${q.result.steps.filter((s) => s.ok).length}/${q.result.steps.length} ขั้น` : ""}</div>}
              {openable && (
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => onOpenMo(q.mo_no)}
                    className={`h-8 rounded-lg px-3 text-[13px] font-medium ${tab === "queue" ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                    {tab === "queue" ? "ตรวจ / ยืนยัน" : q.status === "rejected" ? "แก้แล้วส่งใหม่" : "เปิดแก้"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ERPModal>
  );
}
