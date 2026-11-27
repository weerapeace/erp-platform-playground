"use client";

/**
 * พิมพ์ / PDF สรุปการตลาดรายสัปดาห์ (สำหรับประชุม) — แผนการตลาด รอบ 8 ข้อ 4 (เจ้าของเลือก 2026-11-27)
 * ข้อมูล = /api/marketing/weekly?id= (ใบที่บันทึกไว้ — ตัวเลขไม่เปลี่ยนย้อนหลัง) · หน้าตา A4 แนวตั้ง สร้างจากโค้ด (ไม่ใช่แม่แบบในฐานข้อมูล)
 * ของกลาง: PrintToolbar (ปุ่มพิมพ์/ดาวน์โหลด PDF + 📤 ส่ง PDF ไป LINE/อีเมล ของกลาง SendPdfButton) · PrintFrame
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LoadingState } from "@/components/state-views";
import { PrintFrame, PrintToolbar } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { pctChange, weekLabel, type WeeklyAction, type WeeklyData, type WeeklyReview } from "@/lib/marketing-weekly-calc";

type Report = { id: string; week_start: string; data: WeeklyData; ai_summary: string | null; ai_actions: WeeklyAction[]; review_summary: Partial<WeeklyReview>; updated_at: string };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const baht = (n: number | null | undefined) => (n == null ? "—" : `฿${Math.round(n).toLocaleString("th-TH")}`);
const chg = (cur: number, prev: number) => { const p = pctChange(cur, prev); return p == null ? `<span class="mu">—</span>` : `<span class="${p >= 0 ? "up" : "dn"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(p * 100))}%</span>`; };

function buildHtml(r: Report): string {
  const d = r.data;
  const kpi = (label: string, value: string, sub: string) => `<div class="kpi"><div class="kl">${esc(label)}</div><div class="kv">${value}</div><div class="ks">${sub}</div></div>`;
  const list = (items: string[], empty: string) => (items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="mu">${esc(empty)}</p>`);
  const max = Math.max(1, ...d.daily.map((x) => x.sales));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: "Sarabun", "Noto Sans Thai", Tahoma, sans-serif; color: #0f172a; font-size: 11.5px; margin: 0; }
    .doc { width: 186mm; margin: 0 auto; background: #fff; }
    h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #1e293b; }
    .meta { color: #475569; margin: 2px 0 10px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; }
    .kl { color: #64748b; font-size: 10px; } .kv { font-size: 15px; font-weight: 700; margin-top: 2px; } .ks { font-size: 10px; color: #475569; }
    .up { color: #059669; } .dn { color: #e11d48; } .mu { color: #94a3b8; }
    p { margin: 0 0 4px; line-height: 1.55; white-space: pre-wrap; }
    ol, ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; line-height: 1.45; }
    .why { color: #64748b; font-size: 10.5px; } .done { text-decoration: line-through; color: #94a3b8; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 3px 4px; border-bottom: 1px solid #e2e8f0; text-align: left; } th { color: #64748b; font-weight: 600; font-size: 10px; }
    td.r, th.r { text-align: right; }
    .bars { display: flex; align-items: flex-end; gap: 6px; height: 70px; } .bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 9px; color: #64748b; }
    .bar i { display: block; width: 100%; background: #3b82f6; border-radius: 2px 2px 0 0; }
    .ok { color: #047857; font-weight: 600; } .bad { color: #be123c; font-weight: 600; }
    .foot { margin-top: 14px; color: #94a3b8; font-size: 9.5px; border-top: 1px solid #e2e8f0; padding-top: 4px; }
    .sec { break-inside: avoid; }
  </style></head><body><div class="doc">
    <h1>สรุปการตลาดรายสัปดาห์ · ${esc(weekLabel(r.week_start))}</h1>
    <div class="meta">${esc(d.brand.name)} · เทียบสัปดาห์ ${esc(weekLabel(d.prev.from))}</div>
    <div class="kpis">
      ${kpi("ยอดขาย", baht(d.sales.cur), `${chg(d.sales.cur, d.sales.prev)} ก่อน ${baht(d.sales.prev)}`)}
      ${kpi("ออเดอร์", d.sales.orders.toLocaleString("th-TH"), `${chg(d.sales.orders, d.sales.prevOrders)} · ต่อบิล ${baht(d.sales.aov)}`)}
      ${kpi("โฆษณา", d.ads ? baht(d.ads.spend) : "—", d.ads ? `ROAS ${d.ads.roas?.toFixed(1) ?? "—"} (ก่อน ${d.ads.prevRoas?.toFixed(1) ?? "—"})` : "ไม่มีข้อมูล")}
      ${kpi("รีวิว", d.reviews.avg != null ? `${d.reviews.avg.toFixed(2)} ★` : "—", `${d.reviews.count} รีวิว · 1-3 ดาว ${d.reviews.low}`)}
      ${kpi(`เป้าเดือน ${esc(d.sales.target?.month ?? "")}`, d.sales.target?.pct != null ? `${Math.round(d.sales.target.pct * 100)}%` : "—", d.sales.target?.target ? `${baht(d.sales.target.mtd)} / ${baht(d.sales.target.target)}` : "ยังไม่ตั้งเป้า")}
    </div>
    <div class="sec"><h2>บทสรุป</h2>${r.ai_summary ? `<p>${esc(r.ai_summary)}</p>` : `<p class="mu">ยังไม่มีบทสรุป</p>`}</div>
    <div class="sec"><h2>สิ่งที่ควรทำสัปดาห์หน้า</h2>${(r.ai_actions ?? []).length ? `<ol>${r.ai_actions.map((a) => `<li class="${a.done ? "done" : ""}">${a.done ? "☑ " : "☐ "}${esc(a.text)}${a.why ? `<div class="why">${esc(a.why)}</div>` : ""}</li>`).join("")}</ol>` : `<p class="mu">—</p>`}</div>
    <div class="sec"><h2>ลูกค้าพูดถึงเรา (รีวิว ${d.reviews.windowDays} วันล่าสุด)</h2><div class="two">
      <div><div class="ok">ชมบ่อย</div>${list(r.review_summary?.praise ?? [], "—")}</div>
      <div><div class="bad">บ่นบ่อย / ควรแก้</div>${list(r.review_summary?.complaints ?? [], "—")}</div>
    </div></div>
    <div class="two">
      <div class="sec"><h2>ช่องทาง</h2><table><tr><th>ช่องทาง</th><th class="r">ยอด</th><th class="r">เทียบ</th><th class="r">ออเดอร์</th></tr>
        ${d.channels.map((c) => `<tr><td>${esc(c.name)}</td><td class="r">${baht(c.cur)}</td><td class="r">${chg(c.cur, c.prev)}</td><td class="r">${c.orders}</td></tr>`).join("")}</table></div>
      <div class="sec"><h2>ยอดรายวัน</h2><div class="bars">${d.daily.map((x, i) => `<div class="bar"><i style="height:${Math.max(2, (x.sales / max) * 85)}%"></i>${["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"][i]}</div>`).join("")}</div></div>
    </div>
    <div class="two">
      <div class="sec"><h2>ขายดี 10 อันดับ</h2><table>${d.topProducts.map((p, i) => `<tr><td>${i + 1}. ${esc(p.name)}</td><td class="r">${baht(p.sales)}</td><td class="r">${chg(p.sales, p.prev)}</td></tr>`).join("")}</table></div>
      <div class="sec"><h2>ขึ้นแรง / ตกแรง</h2>${d.rising.length + d.falling.length ? `<table>${[...d.rising.map((p) => ["up", "▲", p] as const), ...d.falling.map((p) => ["dn", "▼", p] as const)].map(([c, s, p]) => `<tr><td><span class="${c}">${s}</span> ${esc(p.name)}</td><td class="r">${baht(p.prev)} → ${baht(p.cur)}</td></tr>`).join("")}</table>` : `<p class="mu">ไม่มี</p>`}
        <h2>โฆษณา & ยกเลิก</h2>
        <p>${d.ads ? `ใช้ ${baht(d.ads.spend)} ได้ยอด ${baht(d.ads.sales)} · ROAS ${d.ads.roas?.toFixed(1) ?? "—"}` : "ไม่มีข้อมูลโฆษณา"}${(d.ads?.losing ?? []).map((c) => `\nขาดทุน: ${esc(c.name)} ใช้ ${baht(c.spend)}`).join("")}\nยกเลิก ${d.cancels.count} ใบ (ก่อน ${d.cancels.prev}) · เพราะฝั่งร้าน ${d.cancels.storeFault}</p>
        ${d.posts.length ? `<h2>โพสต์</h2><p>${d.posts.map((p) => `${esc(p.platform)} ${p.posts} โพสต์ · เฉลี่ย ${Math.round(p.avg)} interaction`).join("\n")}</p>` : ""}
      </div>
    </div>
    ${d.alerts.length ? `<div class="sec"><h2>เรื่องที่ระบบเตือน</h2>${list(d.alerts.map((a) => `${a.title} — ${a.body}`), "")}</div>` : ""}
    <div class="foot">สร้างจากระบบ ERP · หน้าภาพรวมการตลาด → สรุปสัปดาห์ · ตัวเลขเก็บตอนสร้างใบ · บทสรุป/สิ่งที่ควรทำ เขียนโดย AI และคนแก้ได้</div>
  </div></body></html>`;
}

export default function PrintMarketingWeeklyPage() {
  const id = useParams().id as string;
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch(`/api/marketing/weekly?id=${encodeURIComponent(id)}`).then((res) => res.json())
      .then((j: { report?: Report | null; error?: string | null }) => { if (j.error) throw new Error(j.error); if (!j.report || j.report.id !== id) throw new Error("ไม่พบใบสรุปนี้"); setR(j.report); })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);
  const html = useMemo(() => (r ? buildHtml(r) : ""), [r]);
  const fileName = r ? docFileName("สรุปการตลาด", `${r.week_start} ${r.data.brand.name}`) : undefined;
  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar fileName={fileName} />
      <div className="px-2 py-6 sm:px-4">
        {loading ? <LoadingState /> : error || !r ? <div className="py-20 text-center text-red-500">{error ?? "ไม่พบเอกสาร"}</div> : <PrintFrame html={html} fileName={fileName} />}
      </div>
    </div>
  );
}
