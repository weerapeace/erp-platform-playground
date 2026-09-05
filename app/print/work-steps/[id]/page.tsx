"use client";

/**
 * 🖨 พิมพ์ "รายการขั้นตอนงาน" ของใบสั่งผลิต — /print/work-steps/<mo_id>?blank=1
 *   • มีขั้นตอนในสูตร → พิมพ์ขั้นตอนเรียงลำดับ + ช่องผู้ทำ/วันที่/✓/หมายเหตุ ให้ช่างติ๊ก
 *   • ไม่มี (หรือ ?blank=1) → พิมพ์แม่แบบเปล่า 15 บรรทัด ให้เขียนขั้นตอนเองด้วยมือ
 *   สลับสองแบบได้จากแถบบน · ใช้ PrintFrame + printReportFrameOrWindow ของกลาง (เหมือนใบสั่งงาน)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import type { WorkStep } from "@/app/api/bom/work-steps/route";

type MoHead = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; due_date: string | null; note: string | null };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const thDate = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");

function buildHtml(mo: MoHead, steps: WorkStep[], blank: boolean): string {
  const rows = blank
    ? Array.from({ length: 15 }, (_, i) => `<tr><td class="n">${i + 1}</td><td class="step"></td><td></td><td></td><td class="chk"></td><td></td></tr>`).join("")
    : steps.map((s, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td class="step"><b>${esc(s.step_name)}</b>${s.station ? ` <span class="tag">📍 ${esc(s.station)}</span>` : ""}${s.job_name ? ` <span class="tag">🧵 ${esc(s.job_name)}${s.job_rate ? ` ฿${s.job_rate}/ชิ้น` : ""}</span>` : ""}${s.instruction ? `<div class="ins">${esc(s.instruction).replace(/\n/g, "<br>")}</div>` : ""}</td>
        <td></td><td></td><td class="chk"></td><td></td></tr>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ขั้นตอนงาน ${esc(mo.mo_no)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: "Sarabun", "Noto Sans Thai", "Tahoma", sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; }
  .meta { font-size: 12px; line-height: 1.6; }
  .meta b { display: inline-block; min-width: 72px; color: #475569; font-weight: 500; }
  .box { border: 1px solid #94a3b8; border-radius: 4px; padding: 4px 8px; font-size: 11px; min-width: 150px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #94a3b8; padding: 5px 6px; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; font-size: 11px; text-align: left; }
  td.n { width: 22px; text-align: center; font-weight: 600; }
  td.step { width: ${blank ? "40%" : "44%"}; ${blank ? "height: 26px;" : ""} }
  td.chk { width: 34px; text-align: center; font-size: 16px; }
  .tag { font-size: 10px; color: #4338ca; background: #eef2ff; border-radius: 3px; padding: 0 4px; }
  .ins { font-size: 11px; color: #475569; margin-top: 2px; white-space: pre-line; }
  .foot { margin-top: 10px; display: flex; gap: 24px; font-size: 11px; color: #475569; }
  .foot span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 140px; }
  .hint { font-size: 10px; color: #94a3b8; margin-top: 6px; }
</style></head><body>
<div class="head">
  <div>
    <h1>📋 รายการขั้นตอนงาน${blank ? " (แม่แบบ)" : ""}</h1>
    <div class="meta">
      <div><b>ใบสั่งผลิต</b> ${esc(mo.mo_no)}</div>
      <div><b>สินค้า</b> ${esc(mo.product_sku ?? "")} ${esc(mo.product_name ?? "")}</div>
      <div><b>จำนวน</b> ${Number(mo.qty || 0).toLocaleString("th-TH")} ชิ้น &nbsp;&nbsp; <b>กำหนดส่ง</b> ${thDate(mo.due_date)}</div>
      ${mo.note ? `<div><b>หมายเหตุ</b> ${esc(mo.note)}</div>` : ""}
    </div>
  </div>
  <div class="box">ผู้รับผิดชอบ: ________________<br>วันที่เริ่ม: ______ / ______ / ______</div>
</div>
<table>
  <thead><tr><th>#</th><th>ขั้นตอน / วิธีทำ</th><th style="width:16%">ผู้ทำ</th><th style="width:13%">วันที่</th><th>✓</th><th style="width:18%">หมายเหตุ</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="foot"><div>ตรวจโดย: <span></span></div><div>วันที่: <span></span></div></div>
<div class="hint">${blank ? "แม่แบบเปล่า — เขียนขั้นตอนลงช่องแล้วนำไปกรอกเข้าระบบที่แท็บ 📋 ขั้นตอนงาน ในบอร์ดจ่ายงาน" : "ขั้นตอนจากสูตร BOM ของสินค้า · แก้ได้ที่แท็บ 📋 ขั้นตอนงาน ในบอร์ดจ่ายงาน"}</div>
</body></html>`;
}

export default function PrintWorkStepsPage() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const [mo, setMo] = useState<MoHead | null>(null);
  const [steps, setSteps] = useState<WorkStep[]>([]);
  const [blank, setBlank] = useState(sp.get("blank") === "1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const [mj, sj] = await Promise.all([
          apiFetch(`/api/mo/${params.id}`).then((r) => r.json()),
          apiFetch(`/api/bom/work-steps?mo_id=${encodeURIComponent(params.id)}`).then((r) => r.json()),
        ]);
        if (!on) return;
        const h = (mj?.data?.header ?? mj?.data ?? null) as Record<string, unknown> | null;
        if (!h || !h.mo_no) { setError("ไม่พบใบสั่งผลิต"); return; }
        setMo({ id: String(h.id), mo_no: String(h.mo_no), product_sku: (h.product_sku as string) ?? null, product_name: (h.product_name as string) ?? null,
          qty: Number(h.qty) || 0, due_date: (h.due_date as string) ?? null, note: (h.note as string) ?? null });
        const st = (sj?.data ?? []) as WorkStep[];
        setSteps(st);
        if (st.length === 0 && sp.get("blank") !== "0") setBlank(true);   // ไม่มีขั้นตอน → แม่แบบเปล่าอัตโนมัติ
      } catch { if (on) setError("โหลดข้อมูลไม่สำเร็จ"); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [params.id, sp]);

  const html = useMemo(() => (mo ? buildHtml(mo, steps, blank) : ""), [mo, steps, blank]);
  const fileName = docFileName(blank ? "แม่แบบขั้นตอนงาน" : "ขั้นตอนงาน", mo?.mo_no);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
          <button onClick={() => setBlank(false)} disabled={steps.length === 0} title={steps.length === 0 ? "สินค้านี้ยังไม่มีขั้นตอนในสูตร" : ""}
            className={`px-3 h-8 rounded-md text-sm ${!blank ? "bg-slate-800 text-white" : "text-slate-600"} disabled:opacity-40`}>📋 พิมพ์ขั้นตอน ({steps.length})</button>
          <button onClick={() => setBlank(true)} className={`px-3 h-8 rounded-md text-sm ${blank ? "bg-slate-800 text-white" : "text-slate-600"}`}>▭ แม่แบบเปล่า</button>
        </div>
        <div className="flex-1" />
        <button onClick={() => printReportFrameOrWindow(fileName)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">🖨️ พิมพ์</button>
        <button onClick={() => printReportFrameOrWindow(fileName)} title={`เลือกปลายทาง "บันทึกเป็น PDF" — ชื่อไฟล์ "${fileName}.pdf"`}
          className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">⬇ ดาวน์โหลด PDF</button>
      </div>
      <div className="px-4 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : error || !mo ? <div className="py-20 text-center text-red-500">⚠ {error ?? "ไม่พบเอกสาร"}</div>
          : <PrintFrame html={html} fileName={fileName} />}
      </div>
    </div>
  );
}
