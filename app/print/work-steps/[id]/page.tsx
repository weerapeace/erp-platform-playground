"use client";

/**
 * 🖨 พิมพ์ "ขั้นตอนงาน" ของใบสั่งผลิต — /print/work-steps/<mo_id>?blank=1
 *   • มีขั้นตอนในสูตร → "📋 รายการขั้นตอน" เรียงลำดับ + ช่องผู้ทำ/วันที่/✓
 *   • ไม่มี (หรือ ?blank=1) → "▦ ตารางติ๊ก" (เจ้าของขอ 2026-09-04): แถว = ชิ้นส่วน · คอลัมน์ = ประเภทงาน (ทับ/เย็บตรง/…)
 *       ให้เอาไปถามช่างแล้วติ๊กได้เลย · แถวเติมจากบล็อกตัดของใบให้ (แก้ได้) · คอลัมน์แก้ได้และจำไว้ทั้งระบบ
 *   ใช้ PrintFrame + printReportFrameOrWindow ของกลาง (เหมือนใบสั่งงาน)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
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
  .grid th.sub { height: 20mm; vertical-align: bottom; }
  .grid thead tr:first-child th[colspan] { text-align: left; height: auto; padding: 4px 6px; }
  .grid th.v span { writing-mode: vertical-rl; transform: rotate(180deg); display: inline-block; white-space: nowrap; font-size: 11px; }
  /* เต็ม A4 หน้าเดียวแน่นอน: ล็อกความสูง "ทั้งตาราง" เป็น มม. แล้วให้ 20 แถวแบ่งพื้นที่กันเอง
     (A4 297 − ขอบ 20 − padding 18 − หัวใบ ≤40 − ท้าย 8 → ตาราง 196 มม.) */
  .grid { height: auto; }   /* ความสูงแถวคิดเป็น มม. ในโค้ด (sizeCss) เสมอ → แบ่งหน้าเองได้แม่นทุกโหมด */
  .grid tbody tr { page-break-inside: avoid; }
  .grid th.v { height: 20mm; }
  .grid td.piece { width: 30%; min-width: 34mm; }
  .grid td.piece small { color: #64748b; font-size: 10px; display: block; }
  .grid td.qty { width: 44px; text-align: center; }
  .grid td.tick { text-align: center; }
  .grid td.tick::before { content: ""; display: inline-block; width: 4.2mm; height: 4.2mm; border: 1.5px solid #334155; border-radius: 2px; margin-top: 1mm; }
  /* คอลัมน์ที่มี "+" (เช่น ทากาว + ติดกาว) → กล่องเดียวแบ่งเป็นหลายช่อง ติ๊กแยกได้ (เจ้าของขอ) */
  .grid td.tickm { text-align: center; }
  /* กล่องเดียวขนาดเท่าปกติ แบ่งครึ่งด้วยเส้นกลาง (เส้นยื่นเลยขอบบน-ล่างนิดหน่อยตามที่เจ้าของวาด) */
  .grid td.tickm .multi { display: inline-block; position: relative; width: 4.2mm; height: 4.2mm; border: 1.5px solid #334155; border-radius: 2px; margin-top: 1mm; overflow: visible; vertical-align: top; }
  .grid td.tickm .multi i { position: absolute; top: -0.9mm; bottom: -0.9mm; width: 0; border-left: 1.5px solid #334155; }
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
  // แถว = ลำดับขั้นตอน (ช่างเขียนเอง) · ชิ้นส่วน = คอลัมน์ย่อยติ๊กใต้หัว "ชิ้นส่วน" (เจ้าของวาดให้ 2026-09-04)
  //   → แต่ละแถวติ๊กว่าเป็นชิ้นไหน + งานประเภทไหน · ไม่มีชิ้นส่วน = ช่องชื่อกว้าง ๆ แบบเดิม
  const rows = Array.from({ length: Math.max(1, rowCount) }, () => ({ label: "", sub: "", qty: "" }));
  const pieceCols = pieces.map((p) => p.label).filter(Boolean);
  // ความสูงแถว: 0 = แบ่งเต็มหน้า A4 · ใส่ค่า = สูงตายตัวต่อแถว → แบ่งหน้าเอง (หัวใบซ้ำทุกหน้า + เลขหน้า x/y)
  const ROW_AREA = 172, ROW_MIN = 7.9, ROW_GAP = 0.4;
  const autoH = Math.max(ROW_MIN, Math.round((ROW_AREA / Math.max(1, Math.min(rows.length, 20)) - ROW_GAP) * 10) / 10);
  const rowH = rowHeightMm > 0 ? rowHeightMm : autoH;
  const sizeCss = `.grid td { height: ${rowH}mm; }`;
  const perPage = Math.max(1, Math.floor(ROW_AREA / (rowH + ROW_GAP)));
  const chunks: { rows: typeof rows; offset: number }[] = [];
  for (let i = 0; i < rows.length; i += perPage) chunks.push({ rows: rows.slice(i, i + perPage), offset: i });
  if (chunks.length === 0) chunks.push({ rows: [], offset: 0 });
  const tickTd = (c: string) => { const n = c.split("+").map((x) => x.trim()).filter(Boolean).length; return n > 1 ? `<td class="tickm"><span class="multi">${Array.from({ length: n - 1 }, (_, k) => `<i style="left:${((k + 1) / n) * 100}%"></i>`).join("")}</span></td>` : `<td class="tick"></td>`; };
  const rowHtml = (_p: Piece, i: number) => `<tr><td class="n">${i + 1}</td>
      <td class="piece"></td>
      ${pieceCols.map(() => `<td class="tick"></td>`).join("")}
      <td class="qty"></td>
      ${cols.map(tickTd).join("")}
      <td></td></tr>`;
  // หัวตาราง 2 ชั้น: "ชิ้นส่วน" ครอบช่องชื่อ + คอลัมน์ย่อยชิ้นส่วน (หัวตั้ง) · คอลัมน์อื่น rowspan 2
  const thead = pieceCols.length > 0
    ? `<thead><tr><th rowspan="2" style="width:22px">ลำดับ</th><th colspan="${1 + pieceCols.length}">ชิ้นส่วน</th><th rowspan="2" style="width:44px;text-align:center">จำนวน</th>${cols.map((c) => `<th rowspan="2" class="v"><span>${esc(c)}</span></th>`).join("")}<th rowspan="2" style="width:16%">หมายเหตุ</th></tr>
        <tr><th class="sub"></th>${pieceCols.map((c) => `<th class="v sub"><span>${esc(c)}</span></th>`).join("")}</tr></thead>`
    : `<thead><tr><th style="width:22px">ลำดับ</th><th>ชิ้นส่วน</th><th style="width:44px;text-align:center">จำนวน</th>${cols.map((c) => `<th class="v"><span>${esc(c)}</span></th>`).join("")}<th style="width:16%">หมายเหตุ</th></tr></thead>`;
  const pagesHtml = chunks.map((ch, pi) => `<div class="page">
    ${head(mo, "▦ ขั้นตอนการผลิต (ติ๊กตามชิ้น)", chunks.length > 1 ? `หน้า ${pi + 1}/${chunks.length}` : "")}
    <table class="grid">${thead}<tbody>${ch.rows.map((p, i) => rowHtml(p, ch.offset + i)).join("")}</tbody></table>
    <div class="foot"><div>สอบถามจาก: <span></span></div><div>บันทึกโดย: <span></span></div></div>
    ${pi === chunks.length - 1 ? `<div class="hint">แต่ละแถว = 1 ขั้นตอน: เขียนชื่อขั้นตอน/ชิ้น แล้วติ๊กว่าเป็นชิ้นไหน + งานประเภทไหน · ชิ้นส่วนตั้งได้ที่ ✎ แก้รายการ · เสร็จแล้วเอาไปกรอกที่แท็บ 🪜 ขั้นตอนงาน</div>` : ""}
  </div>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ขั้นตอนการผลิต ${esc(mo.mo_no)}</title><style>${CSS}${sizeCss}</style></head><body>
    ${pagesHtml}</body></html>`;
}

/** กล่องข้อความที่พิมพ์ @ ต้นบรรทัดแล้วเลือกจากทะเบียนได้ (ใช้ทั้งคอลัมน์ประเภทงานและชิ้นส่วน) */
function AtTextarea({ value, onChange, options, placeholder, rows = 8 }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState<string | null>(null);   // null = ไม่ได้พิมพ์ @
  const [line, setLine] = useState(0);
  const matches = q === null ? [] : options.filter((o) => !q || o.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const change = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value; onChange(v);
    const before = v.slice(0, e.target.selectionStart ?? v.length);
    const li = before.split("\n").length - 1; const cur = before.split("\n")[li] ?? "";
    if (cur.startsWith("@")) { setQ(cur.slice(1).trim()); setLine(li); } else setQ(null);
  };
  const pick = (name: string) => {
    const lines = value.split("\n"); lines[line] = name; onChange(lines.join("\n")); setQ(null);
    setTimeout(() => ref.current?.focus(), 0);
  };
  return (
    <div className="relative">
      <textarea ref={ref} value={value} onChange={change} rows={rows} placeholder={placeholder}
        onKeyDown={(e) => { if (q === null) return; if (e.key === "Enter" && matches.length) { e.preventDefault(); pick(matches[0]); } if (e.key === "Escape") setQ(null); }}
        onBlur={() => setTimeout(() => setQ(null), 150)}
        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg font-mono" />
      {q !== null && (
        <div className="absolute left-2 right-2 top-full -mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-slate-400 border-b border-slate-100">เลือกจากรายการ (Enter = เลือกอันแรก · Esc = ปิด)</div>
          {matches.length === 0
            ? <div className="px-3 py-2 text-sm text-slate-400">ไม่มีในรายการ — พิมพ์ต่อได้เลย แล้วกด ⚙ จัดการรายการ เพื่อเพิ่ม</div>
            : matches.map((o) => <button key={o} type="button" onMouseDown={(e) => { e.preventDefault(); pick(o); }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50">{o}</button>)}
        </div>
      )}
    </div>
  );
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
  // ทะเบียนสำหรับตัวช่วย @ (ทั้งระบบ): ประเภทงาน / ชิ้นส่วน
  const [ops, setOps] = useState<string[]>([]);
  const [pieceOps, setPieceOps] = useState<string[]>([]);
  // ป๊อปจัดการรายการ — จัดการได้ทั้ง 2 ทะเบียน
  const [manage, setManage] = useState<null | "ops" | "piece_ops">(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [draftNew, setDraftNew] = useState("");
  const [saving, setSaving] = useState<null | "cols" | "pieces" | "manage">(null);
  const [editOpen, setEditOpen] = useState(false);
  // จำนวนแถว + ความสูงแถว (จำไว้ในเครื่องนี้)
  const [rowCount, setRowCount] = useState<number>(() => { try { return Number(localStorage.getItem("ws-print-rows")) || MIN_ROWS; } catch { return MIN_ROWS; } });
  const [rowMm, setRowMm] = useState<number>(() => { try { return Number(localStorage.getItem("ws-print-rowmm")) || 0; } catch { return 0; } });
  useEffect(() => { try { localStorage.setItem("ws-print-rows", String(rowCount)); localStorage.setItem("ws-print-rowmm", String(rowMm)); } catch { /* ignore */ } }, [rowCount, rowMm]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const mj = await apiFetch(`/api/mo/${params.id}`).then((r) => r.json());
        const d = (mj?.data ?? null) as Record<string, unknown> | null;
        const h = ((d?.header as Record<string, unknown> | undefined) ?? d) as Record<string, unknown> | null;
        if (!h || !h.mo_no) { if (on) setError("ไม่พบใบสั่งผลิต"); return; }
        const sku = (h.product_sku as string) ?? null;
        const [sj, cj] = await Promise.all([
          apiFetch(`/api/bom/work-steps?mo_id=${encodeURIComponent(params.id)}`).then((r) => r.json()),
          apiFetch(`/api/bom/work-steps/columns${sku ? `?product_sku=${encodeURIComponent(sku)}` : ""}`).then((r) => r.json()),
        ]);
        if (!on) return;
        setMo({ id: String(h.id), mo_no: String(h.mo_no), product_sku: sku, product_name: (h.product_name as string) ?? null,
          qty: Number(h.qty) || 0, due_date: (h.due_date as string) ?? null, note: (h.note as string) ?? null,
          image: (d?.product_image as string) ?? null });
        const st = (sj?.data ?? []) as WorkStep[]; setSteps(st);
        const c = (cj?.data ?? []) as string[]; setCols(c); setColsText(c.join("\n"));
        setOps((cj?.ops ?? []) as string[]); setPieceOps((cj?.piece_ops ?? []) as string[]);
        // ชิ้นส่วนที่เคยบันทึกไว้ของสินค้านี้ → เติมให้ · ไม่มี = ว่าง (พิมพ์ช่องว่างให้เขียนเอง)
        setPiecesText(((cj?.pieces ?? []) as string[]).join("\n"));
        if (st.length === 0 && sp.get("blank") !== "0") setGrid(true);
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

  const put = async (body: Record<string, unknown>) => {
    const res = await apiFetch("/api/bom/work-steps/columns", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
    if (Array.isArray(j.data)) setCols(j.data as string[]);
    if (Array.isArray(j.ops)) setOps(j.ops as string[]);
    if (Array.isArray(j.piece_ops)) setPieceOps(j.piece_ops as string[]);
    return j as Record<string, unknown>;
  };
  const saveCols = async () => {
    setSaving("cols");
    try { await put({ columns: liveCols }); toast.success("บันทึกคอลัมน์แล้ว — ใช้กับทุกใบทั้งระบบ"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(null); }
  };
  const savePieces = async () => {
    if (!mo?.product_sku) { toast.error("ใบนี้ไม่มีรหัสสินค้า — บันทึกชิ้นส่วนต่อสินค้าไม่ได้"); return; }
    setSaving("pieces");
    try { await put({ product_sku: mo.product_sku, pieces: piecesText.split("\n").map((x) => x.trim()).filter(Boolean) }); toast.success(`บันทึกชิ้นส่วนของ ${mo.product_sku} แล้ว — พิมพ์ครั้งหน้าเติมให้เอง`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(null); }
  };
  const openManage = (which: "ops" | "piece_ops") => { setDraft(which === "ops" ? ops : pieceOps); setDraftNew(""); setManage(which); };
  const addDraft = () => { const v = draftNew.trim(); if (!v) return; setDraft((d) => [...new Set([...d, v])]); setDraftNew(""); };
  const saveManage = async () => {
    if (!manage) return;
    setSaving("manage");
    try { await put({ [manage]: draft }); setManage(null); toast.success("บันทึกรายการแล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(null); }
  };

  const btnGhost = "h-8 px-3 text-[12px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50";
  const btnSave = "h-8 px-3 text-[12px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50";

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
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-700">คอลัมน์ประเภทงาน <span className="text-[11px] text-slate-400">(บรรทัดละ 1 · ใช้ร่วมกันทั้งระบบ · พิมพ์ @ เลือกจากรายการ)</span></span>
              <span className="flex gap-1">
                <button onClick={() => openManage("ops")} className={btnGhost} title="รายการประเภทงานที่บันทึกไว้">⚙ จัดการรายการ ({ops.length})</button>
                <button onClick={() => void saveCols()} disabled={saving !== null || liveCols.length === 0} className={btnSave}>{saving === "cols" ? "กำลังบันทึก…" : "💾 บันทึกคอลัมน์"}</button>
              </span>
            </div>
            <AtTextarea value={colsText} onChange={setColsText} options={ops}
              placeholder={"พิมพ์ชื่อประเภทงาน บรรทัดละ 1\nพิมพ์ @ เพื่อเลือกจากรายการที่บันทึกไว้\nใส่ + คั่น = กล่องแบ่งช่อง เช่น ทากาว + ติดกาว"} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-700">ชิ้นส่วน (แถว) <span className="text-[11px] text-slate-400">(บรรทัดละ 1 · ใส่ <code>| จำนวน</code> ต่อท้ายได้ · พิมพ์ @ เลือกจากรายการ · ว่าง = พิมพ์ช่องว่างให้เขียนเอง)</span></span>
              <span className="flex gap-1">
                <button onClick={() => openManage("piece_ops")} className={btnGhost} title="รายการชื่อชิ้นส่วนที่บันทึกไว้">⚙ จัดการรายการ ({pieceOps.length})</button>
                <button onClick={() => void savePieces()} disabled={saving !== null || !mo?.product_sku} className={btnSave} title={mo?.product_sku ? `จำไว้กับสินค้า ${mo.product_sku} — พิมพ์ใบไหนของสินค้านี้ก็เติมให้` : "ใบนี้ไม่มีรหัสสินค้า"}>{saving === "pieces" ? "กำลังบันทึก…" : `💾 บันทึกชิ้นส่วน (${mo?.product_sku ?? "สินค้านี้"})`}</button>
              </span>
            </div>
            <AtTextarea value={piecesText} onChange={setPiecesText} options={pieceOps}
              placeholder={"ตัวหน้า | 1\nตัวหลัง | 1\nหูหิ้ว (หนัง) | 2\nพิมพ์ @ เพื่อเลือกจากรายการที่บันทึกไว้"} />
          </div>
        </div>
      )}

      {/* ป๊อปจัดการทะเบียน (ตัวช่วย @) — ใช้ร่วมกันทั้งประเภทงานและชิ้นส่วน */}
      <ERPModal open={manage !== null} onClose={() => setManage(null)} size="sm" title={manage === "piece_ops" ? "⚙ รายการชิ้นส่วน (ตัวช่วย @)" : "⚙ รายการประเภทงาน (ตัวช่วย @)"}
        footer={<>
          <button onClick={() => setManage(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
          <button onClick={() => void saveManage()} disabled={saving !== null} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving === "manage" ? "กำลังบันทึก…" : "บันทึก"}</button>
        </>}>
        <p className="text-[11px] text-slate-500 mb-2">ชื่อที่บันทึกไว้จะโผล่ให้เลือกตอนพิมพ์ @ · ชื่อใหม่ที่กด 💾 บันทึก ระบบเติมเข้ารายการให้เองด้วย</p>
        <div className="flex gap-1 mb-2">
          <input value={draftNew} onChange={(e) => setDraftNew(e.target.value)} placeholder={manage === "piece_ops" ? "เพิ่มชื่อชิ้นส่วน เช่น ตัวหน้า" : "เพิ่มประเภทงาน เช่น พับ"}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }}
            className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg" />
          <button onClick={addDraft} className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">＋</button>
        </div>
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {draft.length === 0 && <li className="px-3 py-3 text-sm text-slate-400 text-center">ยังไม่มีรายการ</li>}
          {draft.map((o, i) => (
            <li key={o} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1">{o}</span>
              <button onClick={() => setDraft((d) => { const n = [...d]; if (i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} disabled={i === 0} className="h-6 w-6 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
              <button onClick={() => setDraft((d) => { const n = [...d]; if (i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} disabled={i === draft.length - 1} className="h-6 w-6 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
              <button onClick={() => setDraft((d) => d.filter((x) => x !== o))} className="h-6 w-6 text-slate-300 hover:text-rose-600" title="ลบ">✕</button>
            </li>
          ))}
        </ul>
      </ERPModal>

      <div className="px-4 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : error || !mo ? <div className="py-20 text-center text-red-500">⚠ {error ?? "ไม่พบเอกสาร"}</div>
          : <PrintFrame html={html} fileName={fileName} />}
      </div>
    </div>
  );
}

