"use client";

/**
 * 🖨 พรีวิวแผงตั้งค่าหน้าพิมพ์กลาง (ListPrintPanel + lib/list-print) ด้วยข้อมูลตัวอย่างบอร์ดจ่ายงาน — ไม่ต้องต่อ DB
 *   ของจริง: /print/work-board?type=pending · เอกสาร docs/list-print.md
 *   (โฟลเดอร์ _demos ไม่ build — ก๊อปไปไว้ใต้ app/ ชั่วคราวถ้าจะเปิดดู)
 */
import { useMemo, useState } from "react";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintPanel } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { defaultListPrintSettings, estimateListPages } from "@/lib/list-print";
import {
  WORK_BOARD_PRINT_PRESETS, WORK_BOARD_PRINT_TITLE, WORK_BOARD_SORTS, buildWorkBoardPrint, workBoardPrintColumns, workBoardPrintGroups,
  type BoardResp, type WorkBoardPrintType,
} from "@/lib/work-board-print";

const NAMES = ["กระเป๋าถือทรงหมอนผ้าขาวม้า (ใบเล็ก) สีดำ", "Good Goods กระเป๋าทรงถือ ผ้าขาวม้า สีน้ำเงิน", "กระเป๋าสตางค์หนัง PU ด้าน", "กระเป๋าสะพายหนัง PU ด้าน", "กระเป๋าคาดอกหนัง PU ด้าน"];
const BOARD: BoardResp = {
  departments: [{ id: "d1", name: "โต๊ะเย็บ A" }, { id: "d2", name: "โต๊ะเย็บ B" }],
  pending: Array.from({ length: 40 }, (_, i) => ({
    id: `m${i}`, mo_no: `MO-2026-${String(20 + i).padStart(5, "0")}`, product_sku: `${i % 2 ? "CTL" : "PIX"}${40 + i}-0${(i % 3) + 1}`,
    product_name: NAMES[i % NAMES.length], qty: 30, remaining: [20, 30, 60][i % 3], due_date: i % 5 === 0 ? "2026-11-05" : null,
    internal_due_date: i % 3 === 0 ? `2026-11-${String(10 + (i % 15)).padStart(2, "0")}` : null, order_date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`,
    brand: i % 2 ? "Good Goods" : "PIX", image_url: null, central_rate: i % 4 === 0 ? 0 : 25 + (i % 5) * 5,
  })),
  pending_piece: [{ id: "p1", mo_no: "MO-2026-00021", job_name: "เย็บสาย", rate: 5, qty: 40, product_sku: "CTL41-02", product_name: NAMES[1], image_url: null }],
  workOrders: [
    { id: "w1", wo_no: "WO-1", mo_no: "MO-2026-00099", product_sku: "PIX99-01", product_name: NAMES[3], stage: "sew", assignee_name: "สมชาย (ชาย)", department_name: "โต๊ะเย็บ A", qty: 12, status: "dispatched", labor_cost: 360 },
    { id: "w2", wo_no: "WO-2", mo_no: "MO-2026-00098", product_sku: "CTL98-01", product_name: NAMES[0], stage: "sew", assignee_name: "สุดา (ดา)", department_name: "โต๊ะเย็บ B", qty: 20, status: "dispatched", labor_cost: null },
  ],
};

export default function ListPrintPreviewPage() {
  const [type, setType] = useState<WorkBoardPrintType>("pending");
  const available = useMemo(() => workBoardPrintColumns(type), [type]);
  const defaults = useMemo(() => defaultListPrintSettings(available, { sortBy: "opened" }), [available]);
  const print = useListPrintSettings({ reportKey: `demo:${type}`, family: "demo", available, defaults });
  const result = useMemo(() => buildWorkBoardPrint({
    type, group: "__all__", board: BOARD, moGroups: [{ name: "ล็อตตุลาคม", mo_nos: BOARD.pending.slice(0, 10).map((m) => m.mo_no) }], plan: null,
    assignees: { craftsmen: [{ id: "e1", name: "สมชาย", nickname: "ชาย", department_id: "d1" }], dept_wages: { d1: 12000 } },
    settings: print.settings, origin: "", company: print.settings.companyId ? { id: "c1", name: "บริษัท ตัวอย่าง จำกัด", logo_key: null } : null, printedAt: "31/10/2569",
  }), [type, print.settings]);

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {(["pending", "piece", "production", "all"] as WorkBoardPrintType[]).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`h-8 rounded-lg border px-3 text-sm ${type === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white"}`}>{WORK_BOARD_PRINT_TITLE[t]}</button>
        ))}
        <button type="button" onClick={() => printReportHtmlInNewWindow(result.html)} className="h-8 rounded-lg bg-blue-600 px-4 text-sm text-white">พิมพ์</button>
      </div>
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="w-full min-w-0 flex-1"><PrintFrame html={result.html} maxWidth={print.settings.orientation === "landscape" ? 1180 : 840} fit /></div>
        <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:w-[330px]">
          <ListPrintPanel state={print} available={available} sorts={WORK_BOARD_SORTS} groups={workBoardPrintGroups(type)} builtinPresets={WORK_BOARD_PRINT_PRESETS}
            companies={[{ id: "c1", name: "บริษัท ตัวอย่าง จำกัด" }]} estimatedPages={estimateListPages(result.groupCounts, print.settings)}
            defaultTitle={WORK_BOARD_PRINT_TITLE[type]} canSaveTeam={false} signatureHint="ผู้จ่ายงาน / ผู้รับงาน" />
        </aside>
      </div>
    </div>
  );
}
