"use client";

/**
 * 🖨 พิมพ์ "ขั้นตอนงาน" ของใบสั่งผลิต — /print/work-steps/<mo_id>?blank=1
 *   • มีขั้นตอนในสูตร → "📋 รายการขั้นตอน" เรียงลำดับ + ช่องผู้ทำ/วันที่/✓
 *   • ไม่มี (หรือ ?blank=1) → "▦ ตารางติ๊ก" (เจ้าของขอ 2026-09-04): แถว = ชิ้นส่วน · คอลัมน์ = ประเภทงาน (ทับ/เย็บตรง/…)
 *       ให้เอาไปถามช่างแล้วติ๊กได้เลย · แถวเติมจากบล็อกตัดของใบให้ (แก้ได้) · คอลัมน์แก้ได้และจำไว้ทั้งระบบ
 *   ใช้ PrintFrame + printReportFrameOrWindow ของกลาง (เหมือนใบสั่งงาน)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { useToast } from "@/components/toast";
import type { WorkStep } from "@/app/api/bom/work-steps/route";

type MoHead = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; due_date: string | null; note: string | null; image: string | null };
type Piece = { label: string; sub: string; qty: string };

const MIN_ROWS = 20;   // ตารางติ๊ก: 20 แถว × 9.2 มม. ≈ เต็มหน้า A4 พอดี (เจ้าของขอ "ทำให้เต็ม A4")
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const thDate = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");

const CSS = `
  @page { size: A4; margin: 10mm 8mm; }
  body { font-family: "Sarabun", "Noto Sans Thai", "Tahoma", sans-serif; color: #0f172a; font-size: 12px; margin: 0; padding: 8mm 8mm 10mm; box-sizing: border-box; }
  .right { display: flex; align-items: flex-start; gap: 8px; }
  .photo { width: 92px; height: 92px; border: 1px solid #cbd5e1; border-radius: 4px; object-fit: cover; background: #f8fafc; }
  .photo-empty { width: 92px; height: 92px; border: 1px dashed #cbd5e1; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; }
  .meta { font-size: 12px; line-height: 1.6; }
  .meta b { display: inline-block; min-width: 72px; color: #475569; font-weight: 500; }
  .meta .nm { display: inline-block; max-width: 100mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
  .box { border: 1px solid #94a3b8; border-radius: 4px; padding: 4px 8px; font-size: 11px; min-width: 150px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #64748b; padding: 5px 6px; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; font-size: 11px; text-align: left; }
  td.n { width: 22px; text-align: center; font-weight: 600; }
  td.chk { width: 34px; text-align: center; font-size: 16px; }
  .tag { font-size: 10px; color: #4338ca; background: #eef2ff; border-radius: 3px; padding: 0 4px; }
  .ins { font-size: 11px; color: #475569; margin-top: 2px; white-space: pre-line; }
  .foot { margin-top: 10px; display: flex; gap: 24px; font-size: 11px; color: #475569; }
  .foot span { display: inline-block; border-bottom: 1px dotted #94a3b8; min-width: 140px; }
  .hint { font-size: 10px; color: #94a3b8; margin-top: 6px; }
  @media print { .hint { display: none; } .foot { margin-top: 4mm; } }
  .pg { margin-top: 3px; text-align: right; font-weight: 600; color: #0f172a; }
  .page { page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  @media screen { .page + .page { margin-top: 8mm; padding-top: 6mm; border-top: 2px dashed #cbd5e1; } }
  /* ตารางติ๊ก */
  .grid th.v { height: 78px; vertical-align: bottom; text-align: center; padding: 4px 2px; width: 30px; }
  .grid th.v span { writing-mode: vertical-rl; transform: rotate(180deg); display: inline-block; white-space: nowrap; font-size: 11px; }
  /* เต็ม A4 หน้าเดียวแน่นอน: ล็อกความสูง "ทั้งตาราง" เป็น มม. แล้วให้ 20 แถวแบ่งพื้นที่กันเอง
     (A4 297 − ขอบ 20 − padding 18 − หัวใบ ≤40 − ท้าย 8 → ตาราง 196 มม.) */
  .grid { height: 196mm; }
  .grid td { height: auto; }
  .grid tbody tr { page-break-inside: avoid; }
  .grid th.v { height: 20mm; }
  .grid td.piece { width: 34%; }
  .grid td.piece small { color: #64748b; font-size: 10px; display: block; }
  .grid td.qty { width: 44px; text-align: center; }
  .grid td.tick { text-align: center; }
  .grid td.tick::before { content: ""; display: inline-block; width: 4.2mm; height: 4.2mm; border: 1.5px solid #334155; border-radius: 2px; margin-top: 1mm; }
`;

function head(mo: MoHead, title: string, pageLabel = "") {
  return `<div class="head"><div><h1>${title}</h1><div class="meta">
      <div><b>ใบสั่งผลิต</b> ${esc(mo.mo_no)}</div>
      <div><b>สินค้า</b> <span class="nm" title="${esc(mo.product_name ?? "")}">${esc(mo.product_sku ?? "")} ${esc(mo.product_name ?? "")}</span></div>
      <div><b>จำนวน</b> ${Number(mo.qty || 0).toLocaleString("th-TH")} ชิ้น &nbsp;&nbsp; <b>กำหนดส่ง</b> ${thDate(mo.due_date)}</div>
      ${mo.note ? `<div><b>หมายเหตุ</b> ${esc(mo.note)}</div>` : ""}
    </div></div>
    <div class="right">${mo.image ? `<img class="photo" src="${esc(mo.image)}" alt="รูปสินค้า" />` : `<div class="photo-empty">ไม่มีรูป</div>`}<div class="box">ผู้ให้ข้อมูล/ผู้ทำ: ______________<br>วันที่: ______ / ______ / ______${pageLabel ? `<div class="pg">${pageLabel}</div>` : ""}</div></div></div>`;
}

/** แบบ 1: รายการขั้นตอนจากสูตร */
function buildStepsHtml(mo: MoHead, steps: WorkStep[]): string {
  const rows = steps.map((s, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td><b>${esc(s.step_name)}</b>${s.station ? ` <span class="tag">📍 ${esc(s.station)}</span>` : ""}${s.job_name ? ` <span class="tag">🧵 ${esc(s.job_name)}${s.job_rate ? ` ฿${s.job_rate}/ชิ้น` : ""}</span>` : ""}${s.instruction ? `<div class="ins">${esc(s.instruction).replace(/\n/g, "<br>")}</div>` : ""}</td>
      <td></td><td></td><td class="chk"></td><td></td></tr>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ขั้นตอนงาน ${esc(mo.mo_no)}</title><style>${CSS}</style></head><body>
    ${head(mo, "📋 รายการขั้นตอนงาน")}
    <table><thead><tr><th>#</th><th>ขั้นตอน / วิธีทำ</th><th style="width:16%">ผู้ทำ</th><th style="width:13%">วันที่</th><th>✓</th><th style="width:18%">หมายเหตุ</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot"><div>ตรวจโดย: <span></span></div><div>วันที่: <span></span></div></div>
    <div class="hint">ขั้นตอนจากสูตร BOM ของสินค้า · แก้ได้ที่แท็บ 🪜 ขั้นตอนงาน ในบอร์ดจ่ายงาน</div></body></html>`;
}

/** แบบ 2: ตารางติ๊ก — แถว = ชิ้นส่วน · คอลัมน์ = ประเภทงาน */
function buildGridHtml(mo: MoHead, pieces: Piece[], cols: string[], rowCount: number, rowHeightMm: number): string {
  const rows = [...pieces, ...Array.from({ length: Math.max(0, rowCount - pieces.length) }, () => ({ label: "", sub: "", qty: "" }))];
  // ความสูงแถว: 0 = ให้แบ่งเต็มหน้า A4 (ตาราง 196 มม.) · ใส่ค่า = สูงตายตัวต่อแถว → แบ่งหน้าเอง (หัวใบซ้ำทุกหน้า + เลขหน้า x/y)
  const sizeCss = rowHeightMm > 0 ? `.grid { height: auto; } .grid td { height: ${rowHeightMm}mm; }` : "";
  const perPage = rowHeightMm > 0 ? Math.max(1, Math.floor(172 / (rowHeightMm + 0.6))) : rows.length;   // พื้นที่แถว ≈ 172 มม./หน้า (หลังหักหัวใบ+หัวตาราง+ท้าย)
  const chunks: { rows: typeof rows; offset: number }[] = [];
  for (let i = 0; i < rows.length; i += perPage) chunks.push({ rows: rows.slice(i, i + perPage), offset: i });
  if (chunks.length === 0) chunks.push({ rows: [], offset: 0 });
  const rowHtml = (p: Piece, i: number) => `<tr><td class="n">${i + 1}</td>
      <td class="piece">${esc(p.label)}${p.sub ? `<small>${esc(p.sub)}</small>` : ""}</td>
      ${cols.map(() => `<td class="tick"></td>`).join("")}
      <td class="qty">${esc(p.qty)}</td><td></td></tr>`;
  const thead = `<thead><tr><th style="width:22px">ลำดับ</th><th>ชิ้นส่วน</th>${cols.map((c) => `<th class="v"><span>${esc(c)}</span></th>`).join("")}<th style="width:44px;text-align:center">จำนวน</th><th style="width:16%">หมายเหตุ</th></tr></thead>`;
  const pagesHtml = chunks.map((ch, pi) => `<div class="page">
    ${head(mo, "▦ ขั้นตอนการผลิต (ติ๊กตามชิ้น)", chunks.length > 1 ? `หน้า ${pi + 1}/${chunks.length}` : "")}
    <table class="grid">${thead}<tbody>${ch.rows.map((p, i) => rowHtml(p, ch.offset + i)).join("")}</tbody></table>
    <div class="foot"><div>สอบถามจาก: <span></span></div><div>บันทึกโดย: <span></span></div></div>
    ${pi === chunks.length - 1 ? `<div class="hint">ติ๊ก ✓ ว่าชิ้นนี้ต้องทำงานประเภทไหนบ้าง · เขียนชื่อชิ้นส่วนลงช่อง (หรือพิมพ์ล่วงหน้าที่ ✎ แก้รายการ) · เสร็จแล้วเอาไปกรอกที่แท็บ 🪜 ขั้นตอนงาน</div>` : ""}
  </div>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ขั้นตอนการผลิต ${esc(mo.mo_no)}</title><style>${CSS}${sizeCss}</style></head><body>
    ${pagesHtml}</body></html>`;
}

export default function PrintWorkStepsPage() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [mo, setMo] = useState<MoHead | null>(null);
  const [steps, setSteps] = useState<WorkStep[]>([]);
  const [grid, setGrid] = useState(sp.get("blank") === "1");
  const [cols, setCols] = useState<string[]>([]);
  const [colsText, setColsText] = useState("");
  const [piecesText, setPiecesText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  // จำนวนแถว + ความสูงแถว (จำไว้ในเครื่องนี้) — เจ้าของขอปรับได้
  const [rowCount, setRowCount] = useState<number>(() => { try { return Number(localStorage.getItem("ws-print-rows")) || MIN_ROWS; } catch { return MIN_ROWS; } });
  const [rowMm, setRowMm] = useState<number>(() => { try { return Number(localStorage.getItem("ws-print-rowmm")) || 0; } catch { return 0; } });
  useEffect(() => { try { localStorage.setItem("ws-print-rows", String(rowCount)); localStorage.setItem("ws-print-rowmm", String(rowMm)); } catch { /* ignore */ } }, [rowCount, rowMm]);
  const [savingCols, setSavingCols] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const [mj, sj, cj] = await Promise.all([
          apiFetch(`/api/mo/${params.id}`).then((r) => r.json()),
          apiFetch(`/api/bom/work-steps?mo_id=${encodeURIComponent(params.id)}`).then((r) => r.json()),
          apiFetch("/api/bom/work-steps/columns").then((r) => r.json()),
        ]);
        if (!on) return;
        const d = (mj?.data ?? null) as Record<string, unknown> | null;
        const h = ((d?.header as Record<string, unknown> | undefined) ?? d) as Record<string, unknown> | null;
        if (!h || !h.mo_no) { setError("ไม่พบใบสั่งผลิต"); return; }
        setMo({ id: String(h.id), mo_no: String(h.mo_no), product_sku: (h.product_sku as string) ?? null, product_name: (h.product_name as string) ?? null,
          qty: Number(h.qty) || 0, due_date: (h.due_date as string) ?? null, note: (h.note as string) ?? null,
          image: (d?.product_image as string) ?? null });
        // แถวชิ้นส่วน: ปล่อยว่างให้เขียนเอง (เจ้าของบอกบล็อกตัดของผ้า "ไม่เกี่ยวกับหน้านี้") — พิมพ์รายการล่วงหน้าได้ที่ ✎ แก้รายการ
        const st = (sj?.data ?? []) as WorkStep[]; setSteps(st);
        const c = (cj?.data ?? []) as string[]; setCols(c); setColsText(c.join("\n"));
        if (st.length === 0 && sp.get("blank") !== "0") setGrid(true);   // ไม่มีขั้นตอน → ตารางติ๊กอัตโนมัติ
      } catch { if (on) setError("โหลดข้อมูลไม่สำเร็จ"); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [params.id, sp]);

  // "ชื่อชิ้น (คำอธิบาย) | จำนวน" → Piece
  const pieces = useMemo<Piece[]>(() => piecesText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, qty = ""] = l.split("|").map((x) => x.trim());
    const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
    return { label: m ? m[1] : name, sub: m ? m[2] : "", qty };
  }), [piecesText]);
  const liveCols = useMemo(() => colsText.split("\n").map((x) => x.trim()).filter(Boolean), [colsText]);

  const html = useMemo(() => (mo ? (grid ? buildGridHtml(mo, pieces, liveCols.length ? liveCols : cols, rowCount, rowMm) : buildStepsHtml(mo, steps)) : ""), [mo, grid, pieces, liveCols, cols, steps, rowCount, rowMm]);
  const fileName = docFileName(grid ? "ตารางขั้นตอนการผลิต" : "ขั้นตอนงาน", mo?.mo_no);

  const saveCols = async () => {
    setSavingCols(true);
    try {
      const res = await apiFetch("/api/bom/work-steps/columns", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: liveCols }) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      setCols(j.data as string[]); toast.success("บันทึกคอลัมน์แล้ว — ใช้กับทุกใบทั้งระบบ");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSavingCols(false); }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
          <button onClick={() => setGrid(false)} disabled={steps.length === 0} title={steps.length === 0 ? "สินค้านี้ยังไม่มีขั้นตอนในสูตร" : ""}
            className={`px-3 h-8 rounded-md text-sm ${!grid ? "bg-slate-800 text-white" : "text-slate-600"} disabled:opacity-40`}>📋 รายการขั้นตอน ({steps.length})</button>
          <button onClick={() => setGrid(true)} className={`px-3 h-8 rounded-md text-sm ${grid ? "bg-slate-800 text-white" : "text-slate-600"}`}>▦ ตารางติ๊ก (ชิ้น × ประเภทงาน)</button>
        </div>
        {grid && <button onClick={() => setEditOpen((v) => !v)} className={`h-9 rounded-lg border px-4 text-sm ${editOpen ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>✎ แก้รายการ</button>}
        <div className="flex-1" />
        <button onClick={() => printReportFrameOrWindow(fileName)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">🖨️ พิมพ์</button>
        <button onClick={() => printReportFrameOrWindow(fileName)} title={`เลือกปลายทาง "บันทึกเป็น PDF" — ชื่อไฟล์ "${fileName}.pdf"`}
          className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">⬇ ดาวน์โหลด PDF</button>
      </div>

      {grid && editOpen && (
        <div className="no-print border-b border-slate-200 bg-white px-6 py-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex items-center gap-4 flex-wrap text-sm text-slate-700">
            <label className="flex items-center gap-2">จำนวนแถว (ลำดับ)
              <input type="number" min={1} max={60} value={rowCount} onChange={(e) => setRowCount(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
                className="w-20 h-8 px-2 text-sm text-center border border-slate-200 rounded-lg" />
            </label>
            <label className="flex items-center gap-2">ความสูงแถว
              <select value={rowMm} onChange={(e) => setRowMm(Number(e.target.value))} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value={0}>อัตโนมัติ (แบ่งเต็มหน้า A4)</option>
                {[6, 7, 8, 9, 10, 12, 14, 16, 20].map((v) => <option key={v} value={v}>{v} มม.</option>)}
              </select>
            </label>
            <span className="text-[11px] text-slate-400">อัตโนมัติ = ทุกแถวแบ่งพื้นที่ให้พอดี 1 หน้า · ตั้งความสูงเอง = แถวเยอะจะต่อหน้า 2 ให้ · จำค่านี้ไว้ในเครื่องนี้</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">คอลัมน์ประเภทงาน <span className="text-[11px] text-slate-400">(บรรทัดละ 1 · ใช้ร่วมกันทั้งระบบ)</span></span>
              <button onClick={() => void saveCols()} disabled={savingCols || liveCols.length === 0} className="h-8 px-3 text-[12px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{savingCols ? "กำลังบันทึก…" : "💾 บันทึกคอลัมน์"}</button>
            </div>
            <textarea value={colsText} onChange={(e) => setColsText(e.target.value)} rows={8} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg font-mono" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">ชิ้นส่วน (แถว) <span className="text-[11px] text-slate-400">(บรรทัดละ 1 · ใส่ <code>| จำนวน</code> ต่อท้ายได้ · เว้นว่าง = พิมพ์ช่องว่างให้เขียนเอง)</span></span>
              <span className="text-[11px] text-slate-400">แก้เฉพาะครั้งนี้ ไม่บันทึก</span>
            </div>
            <textarea value={piecesText} onChange={(e) => setPiecesText(e.target.value)} rows={8} placeholder={"ตัวหน้า | 1\nตัวหลัง | 1\nหูหิ้ว (หนัง) | 2"} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg font-mono" />
          </div>
        </div>
      )}

      <div className="px-4 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : error || !mo ? <div className="py-20 text-center text-red-500">⚠ {error ?? "ไม่พบเอกสาร"}</div>
          : <PrintFrame html={html} fileName={fileName} />}
      </div>
    </div>
  );
}
