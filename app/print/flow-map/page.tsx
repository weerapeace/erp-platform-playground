"use client";

/**
 * พิมพ์แผนผังการทำงานเป็นกระดาษ / PDF — /print/flow-map (?view=<key ใน FLOW_VIEWS> · ไม่ส่ง = ทุกผังที่เห็น + ออเดอร์ 1 ใบ)
 * 1 หน้า A4 แนวนอน ต่อ 1 ผัง: ผัง (SVG จาก lib/flow-map-layout) + ตารางเส้น · ปิดท้ายด้วยตาราง "ออเดอร์ 1 ใบ เดินทางยังไง"
 * ผังการเงินพิมพ์ได้เฉพาะผู้มีสิทธิ์ FLOW_FINANCE_PERM (flowViewsFor)
 * ของกลาง: ระบบพิมพ์ (buildReportHtmlMulti + PrintFrame) — สั่งพิมพ์แล้วเลือก "บันทึกเป็น PDF" ได้
 */
import { shortcutKey } from "@/lib/shortcut-key";
import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { useAuth } from "@/components/auth";
import { buildReportHtmlMulti, type ReportTemplate } from "@/lib/template";
import { FLOW_EDGES, FLOW_NODES, FLOW_EDGE_TYPES, FLOW_JOURNEY, FLOW_AREA_LABEL, FLOW_FINANCE_PERM, flowViewsFor } from "@/lib/flow-map";
import { flowViewSvg, layoutFlowView, isRecentEdge } from "@/lib/flow-map-layout";

const CSS = `
.doc { font-size: 10px; color: #111827; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111827; padding-bottom: 2mm; margin-bottom: 3mm; }
.t1 { font-size: 17px; font-weight: 800; }
.t2 { font-size: 10px; color: #6b7280; margin-top: 0.5mm; }
.legend { display: flex; gap: 5mm; font-size: 9.5px; color: #374151; margin: 0 0 2mm; flex-wrap: wrap; }
.legend span { display: inline-flex; align-items: center; gap: 1.5mm; }
.grid { display: flex; gap: 5mm; align-items: flex-start; }
.map { flex: 0 0 56%; border: 1px solid #e5e7eb; border-radius: 3mm; padding: 2mm; }
.list { flex: 1; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #e5e7eb; padding: 1mm 1.5mm; font-size: 8.8px; vertical-align: top; }
th { background: #f1f5f9; font-weight: 700; text-align: left; }
.n { width: 6mm; text-align: center; font-weight: 700; }
.ty { white-space: nowrap; font-weight: 700; }
.new { color: #7c3aed; font-weight: 700; }
.warn { color: #b91c1c; }
.step { font-weight: 700; background: #f8fafc; }
.note { font-size: 8.5px; color: #9ca3af; margin-top: 2mm; }`;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "landscape",
  header_html: `<div class="hd"><div><div class="t1">แผนผังการทำงาน — {{title}}</div><div class="t2">{{subtitle}}</div></div><div class="t2">พิมพ์ {{printed_at}}</div></div>`,
  body_html: `{{{body}}}<div class="note">อ่านจากทะเบียนกลาง lib/flow-map.ts · ดูแบบกดได้ที่ /master/flow-map</div>`,
  footer_html: "", custom_css: CSS,
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const legend = () => `<div class="legend">${Object.values(FLOW_EDGE_TYPES).map((t) =>
  `<span><svg width="22" height="6"><line x1="2" y1="3" x2="20" y2="3" stroke="${t.color}" stroke-width="2" stroke-dasharray="${t.dash}" stroke-linecap="round"/></svg>${t.label}</span>`).join("")}
  <span><svg width="8" height="8"><circle cx="4" cy="4" r="3.5" fill="#7c3aed"/></svg>เพิ่งแก้</span></div>`;

function FlowMapPrint() {
  const sp = useSearchParams();
  const only = sp.get("view");
  const { can } = useAuth();
  const canFinance = can(FLOW_FINANCE_PERM);
  const allowed = useMemo(() => flowViewsFor(canFinance), [canFinance]);
  const html = useMemo(() => {
    const now = new Date();
    const printed = now.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    const views = allowed.filter((v) => !only || v.key === only);
    const pages = views.map((v) => {
      const rows = layoutFlowView(v).map((d) => {
        const e = FLOW_EDGES[d.id], ty = FLOW_EDGE_TYPES[e.type];
        return `<tr><td class="n" style="color:${ty.color}">${d.i + 1}</td>`
          + `<td>${esc(FLOW_NODES[d.a].label)} → ${esc(FLOW_NODES[d.b].label)}${isRecentEdge(d.id, now) ? ` <span class="new">• เพิ่งแก้</span>` : ""}</td>`
          + `<td class="ty" style="color:${ty.color}">${ty.label}</td>`
          + `<td>${esc(e.title)}${e.warn ? `<div class="warn">${esc(e.warn)}</div>` : ""}</td></tr>`;
      }).join("");
      return {
        title: v.label, subtitle: "กดอะไร แล้วไปอัปเดตอะไรต่อ — ตัวเลขในวงกลมตรงกับตารางขวา", printed_at: printed,
        body: `${legend()}<div class="grid"><div class="map">${flowViewSvg(v, now)}</div><div class="list"><table><thead><tr><th class="n">#</th><th>จาก → ไป</th><th>แบบ</th><th>กดอะไร / ระวัง</th></tr></thead><tbody>${rows}</tbody></table></div></div>`,
      };
    });
    if (!only) {
      const rows = FLOW_JOURNEY.map((s, i) => {
        const n = FLOW_NODES[s.node];
        return `<tr class="step"><td class="n">${i + 1}</td><td colspan="3">${esc(s.title)} <span style="font-weight:400;color:#6b7280">(${FLOW_AREA_LABEL[n.area]} · ${esc(n.sub)})</span></td></tr>`
          + s.edges.map((id) => {
            const e = FLOW_EDGES[id], ty = FLOW_EDGE_TYPES[e.type];
            return `<tr><td></td><td class="ty" style="color:${ty.color}">${ty.label}</td><td colspan="2">${esc(e.title)}${e.warn ? ` <span class="warn">— ${esc(e.warn)}</span>` : ""}${isRecentEdge(id, now) ? ` <span class="new">• เพิ่งแก้</span>` : ""}</td></tr>`;
          }).join("");
      }).join("");
      pages.push({ title: "ออเดอร์ 1 ใบ เดินทางยังไง", subtitle: "ไล่ทีละขั้นตั้งแต่ลงออเดอร์จนเก็บเงิน", printed_at: printed,
        body: `${legend()}<table><thead><tr><th class="n">#</th><th style="width:22mm">แบบ</th><th colspan="2">ขั้น / การส่งต่อ</th></tr></thead><tbody>${rows}</tbody></table>` });
    }
    return buildReportHtmlMulti(TEMPLATE, pages, "แผนผังการทำงาน");
  }, [only, allowed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") { e.preventDefault(); printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  return (
    <div className="min-h-screen bg-slate-100 py-4">
      <div className="max-w-[1180px] mx-auto px-4 mb-3 flex items-center gap-2 flex-wrap">
        <div className="flex-1 text-sm text-slate-600">พิมพ์แผนผังการทำงาน{only ? ` — ${allowed.find((v) => v.key === only)?.label ?? "ไม่มีสิทธิ์ดูผังนี้"}` : " — ทุกผัง + ออเดอร์ 1 ใบ"} · สั่งพิมพ์แล้วเลือก “บันทึกเป็น PDF” ได้</div>
        {only && <a href="/print/flow-map" className="h-9 px-3 inline-flex items-center text-sm rounded-lg border border-slate-300 bg-white text-slate-700">พิมพ์ทุกผัง</a>}
        <button type="button" onClick={() => printReportHtmlInNewWindow(html)} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white">พิมพ์ / บันทึก PDF</button>
      </div>
      <PrintFrame html={html} maxWidth={1180} />
    </div>
  );
}

export default function FlowMapPrintPage() {
  return <Suspense fallback={null}><FlowMapPrint /></Suspense>;
}
