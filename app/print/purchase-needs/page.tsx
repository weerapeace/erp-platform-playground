"use client";

/**
 * พิมพ์ "รายการขอซื้อ/เตรียมวัตถุดิบ" — /print/purchase-needs
 *   ?types=ผ้า,หนัง                         → จัดกลุ่มตามประเภทอย่างเดียว (1 ชั้น)
 *   ?mode=group[&groups=กลุ่มA,กลุ่มB]       → จัดกลุ่มตามกลุ่ม MO แล้วแยกประเภทในกลุ่ม (2 ชั้น)
 * worksheet ไปโกดัง/ผู้ขาย: รหัส/วัตถุดิบ/ต้องซื้อ/หน่วย/ใบสั่งผลิต + ช่องเช็ค ☐ ซื้อแล้ว ☐ เตรียมแล้ว
 *
 * ⚙️ ตั้งค่าก่อนพิมพ์ได้ (แถบบนสุด — จำค่าไว้ให้ที่เครื่องนี้):
 *   • ขนาดตัวอักษร (เล็ก/ปกติ/ใหญ่/ใหญ่มาก)
 *   • โชว์รูปสินค้าที่สั่งผลิต (รูปของ SKU ในคอลัมน์ "ใบสั่งผลิต")
 *   • โชว์รูปวัตถุดิบ (เพิ่มคอลัมน์รูปหน้ารหัส)
 *   • โชว์จำนวนที่สั่งผลิตของแต่ละใบ (CTL044-02 ×1,000 (13.333) — ×1,000 = สั่งผลิต, (13.333) = วัตถุดิบที่ใบนั้นใช้)
 * รูปเป็นที่อยู่แบบย่อ (/api/r2-image?key=…) → ตอนเปิดแท็บพิมพ์มี <base href> ของกลางจัดการให้แล้ว
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// ---- ตั้งค่าก่อนพิมพ์ ----
type PrintOpts = {
  fontPx: number;
  moImg: boolean;    // รูปสินค้าที่สั่งผลิต (ในคอลัมน์ใบสั่งผลิต)
  matImg: boolean;   // รูปวัตถุดิบ (คอลัมน์ใหม่หน้ารหัส)
  moQty: boolean;    // จำนวนที่สั่งผลิตของใบนั้น (×1,000) — คู่กับจำนวนวัตถุดิบที่ใบนั้นต้องใช้
};
const FONTS: { px: number; label: string }[] = [
  { px: 9, label: "เล็ก" }, { px: 10.5, label: "ปกติ" }, { px: 12, label: "ใหญ่" }, { px: 14, label: "ใหญ่มาก" },
];
const OPTS_KEY = "print:purchase-needs:opts";

/** ความกว้างคอลัมน์ — ปรับตามว่าโชว์รูปอะไรบ้าง (รวมต้องได้ 100%) */
function colWidths(o: PrintOpts) {
  const moW = o.moImg ? 26 : 17;                       // คอลัมน์ใบสั่งผลิต กว้างขึ้นเมื่อมีรูป
  const matW = o.matImg ? 9 : 0;                       // คอลัมน์รูปวัตถุดิบ
  const nameW = 100 - (5 + matW + 13 + 10 + 7 + moW + 8 + 8);
  return { idx: 5, img: matW, code: 13, name: nameW, qty: 10, uom: 7, mos: moW, chk: 8 };
}

const tableHtml = (o: PrintOpts) => {
  const w = colWidths(o);
  return `<table class="doc-table">
    <thead><tr>
      <th style="width:${w.idx}%">ลำดับ</th>
      ${o.matImg ? `<th style="width:${w.img}%">รูป</th>` : ""}
      <th style="width:${w.code}%">รหัส</th>
      <th style="width:${w.name}%">วัตถุดิบ</th>
      <th style="width:${w.qty}%" class="text-right">ต้องซื้อ</th>
      <th style="width:${w.uom}%">หน่วย</th>
      <th style="width:${w.mos}%">ใบสั่งผลิต</th>
      <th style="width:${w.chk}%" class="text-center">ซื้อแล้ว</th>
      <th style="width:${w.chk}%" class="text-center">เตรียมแล้ว</th>
    </tr></thead>
    <tbody>
      {{#rows}}
      <tr>
        <td class="text-center">{{idx}}</td>
        ${o.matImg ? `<td class="text-center">{{#img}}<img src="{{img}}" class="mat-thumb" />{{/img}}{{^img}}<span class="no-img">—</span>{{/img}}</td>` : ""}
        <td class="code-cell">{{code}}</td>
        <td>{{name}}</td>
        <td class="text-right">{{qty}}</td>
        <td class="text-center">{{uom}}</td>
        <td class="mos">${o.moImg
          ? `{{#mos_list}}<span class="mo-chip">{{#img}}<img src="{{img}}" class="mo-thumb" />{{/img}}<span>{{label}}{{#moqty}} <b class="moqty">×{{moqty}}</b>{{/moqty}} ({{qty}})</span></span>{{/mos_list}}`
          : `{{mos_text}}`}</td>
        <td class="text-center"><span class="chk"></span></td>
        <td class="text-center"><span class="chk"></span></td>
      </tr>
      {{/rows}}
    </tbody>
  </table>`;
};

// ขนาดย่อยทั้งหมดอิงตัวอักษรหลัก (em) → เลื่อนขนาดตัวอักษรแล้วทั้งใบขยายตามกัน
const sharedCss = (o: PrintOpts) => `
.doc { font-size: ${o.fontPx}px; color: #111827; }
.doc-header { text-align: center; }
.company-name { font-size: 1.05em; font-weight: 700; color: #475569; }
.doc-title { text-align: center; font-size: 1.9em; font-weight: 800; margin: 2mm 0 1mm; }
.doc-sub { text-align: center; font-size: 0.95em; color: #64748b; margin-bottom: 4mm; }
.grp { margin-bottom: 4mm; page-break-inside: auto; }
.grp-title { font-size: 1.15em; font-weight: 800; background: #f1f5f9; padding: 1.2mm 2mm; border: 1px solid #cbd5e1; break-after: avoid; page-break-after: avoid; }
.grp-count { color: #64748b; font-weight: 500; }
.bucket-title { font-size: 1.25em; font-weight: 800; color: #5b21b6; background: #f5f3ff; padding: 1.5mm 2mm; border: 1px solid #c4b5fd; margin: 2mm 0 1.5mm; break-after: avoid; page-break-after: avoid; }
.bucket { margin-bottom: 5mm; }
.doc-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 2mm; }
.doc-table th, .doc-table td { border: 1px solid #94a3b8; padding: 1mm 1.2mm; vertical-align: middle; word-break: break-word; }
.doc-table th { background: #f8fafc; font-weight: 700; font-size: 0.95em; }
.doc-table tr { page-break-inside: avoid; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.code-cell { font-family: ui-monospace, Consolas, monospace; font-size: 0.82em; word-break: break-all; color: #334155; }
.mos { font-size: 0.82em; color: #475569; }
.chk { display: inline-block; width: 4mm; height: 4mm; border: 1.2px solid #334155; border-radius: 1px; }
.mat-thumb { width: 100%; max-width: 16mm; max-height: 16mm; object-fit: contain; display: inline-block; }
.no-img { color: #cbd5e1; }
.mo-chip { display: inline-flex; align-items: center; gap: 1mm; margin: 0 2mm 1mm 0; vertical-align: middle; }
.mo-thumb { width: 9mm; height: 9mm; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 1mm; background: #fff; }
.moqty { color: #b45309; font-weight: 700; }
@media print { .doc { padding: 10mm 9mm !important; } }`;

const headerHtml = (title: string) => `<div class="doc-header"><div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div></div>
<div class="doc-title">${title}</div>
<div class="doc-sub">พิมพ์เมื่อ {{printed_at}} · รวม {{total}} รายการ</div>`;

// โหมดตามประเภท (1 ชั้น)
const templateByType = (o: PrintOpts): ReportTemplate => ({
  paper_size: "A4", orientation: "portrait",
  header_html: headerHtml("รายการขอซื้อ / เตรียมวัตถุดิบ"),
  body_html: `{{#groups}}
<section class="grp">
  <div class="grp-title">{{type}} <span class="grp-count">({{count}})</span></div>
  ${tableHtml(o)}
</section>
{{/groups}}`,
  footer_html: "",
  custom_css: sharedCss(o),
});

// โหมดตามกลุ่ม (2 ชั้น): กลุ่ม MO → ประเภท → รายการ
const templateByGroup = (o: PrintOpts): ReportTemplate => ({
  paper_size: "A4", orientation: "portrait",
  header_html: headerHtml("รายการขอซื้อ / เตรียมวัตถุดิบ (ตามกลุ่ม)"),
  body_html: `{{#buckets}}
<section class="bucket">
  <div class="bucket-title">🗂 {{name}} <span class="grp-count">({{mo_count}} ใบสั่งผลิต)</span></div>
  {{#types}}
  <div class="grp">
    <div class="grp-title">{{type}} <span class="grp-count">({{count}})</span></div>
    ${tableHtml(o)}
  </div>
  {{/types}}
</section>
{{/buckets}}`,
  footer_html: "",
  custom_css: sharedCss(o),
});

type GroupDef = { name: string; mo_nos: string[] };

// แปลง row → record สำหรับเทมเพลต
//   ×N = จำนวนที่ใบสั่งผลิตนั้นสั่งผลิต (เปิด/ปิดได้) · (N) = จำนวนวัตถุดิบที่ใบนั้นต้องใช้
const rowRecord = (r: PurchaseNeedRow, i: number, o: PrintOpts) => ({
  idx: i + 1, code: r.component_sku || "-", name: r.component_name ?? "", qty: fmt(r.total_remaining), uom: r.uom ?? "",
  img: r.component_image ?? "",
  mos_text: r.mos.map((m) => `${m.product_label || m.mo_no}${o.moQty ? ` ×${fmt(m.mo_qty)}` : ""} (${fmt(m.needed)})`).join(", "),
  // โหมดรูป: การ์ดเล็ก ๆ ต่อใบสั่งผลิต (รูปสินค้า + รหัส + จำนวน)
  mos_list: r.mos.map((m) => ({
    label: m.product_label || m.mo_no, qty: fmt(m.needed),
    moqty: o.moQty ? fmt(m.mo_qty) : "",
    img: m.product_image ?? "",
  })),
});

// จัดกลุ่มชุด row ตามประเภท → [{ type, count, rows }]
const groupByType = (rs: PurchaseNeedRow[], o: PrintOpts) => {
  const byType = new Map<string, PurchaseNeedRow[]>();
  for (const r of rs) { const t = r.material_type || "ไม่ระบุประเภท"; (byType.get(t) ?? byType.set(t, []).get(t)!).push(r); }
  return [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")).map(([type, list]) => ({
    type, count: list.length,
    rows: list.sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th")).map((r, i) => rowRecord(r, i, o)),
  }));
};

function PurchaseNeedsPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const isGroupMode = sp.get("mode") === "group";
  const typesFilter = useMemo(() => (sp.get("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);
  const groupsFilter = useMemo(() => (sp.get("groups") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [moGroups, setMoGroups] = useState<GroupDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  // ตั้งค่าก่อนพิมพ์ — จำไว้ที่เครื่องนี้ (ครั้งหน้าเปิดมาได้ค่าเดิม)
  const [opts, setOpts] = useState<PrintOpts>({ fontPx: 10.5, moImg: false, matImg: false, moQty: false });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPTS_KEY);
      if (raw) { const o = JSON.parse(raw) as Partial<PrintOpts>; setOpts((s) => ({ ...s, ...o })); }
    } catch { /* ignore */ }
  }, []);
  const setOpt = (patch: Partial<PrintOpts>) => setOpts((s) => {
    const next = { ...s, ...patch };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  useEffect(() => {
    Promise.all([
      apiFetch("/api/mo/purchase-needs").then((r) => r.json()),
      isGroupMode ? apiFetch("/api/mo/groups").then((r) => r.json()).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ])
      .then(([jr, jg]) => {
        if (jr.error) throw new Error(jr.error);
        setRows((jr.data ?? []) as PurchaseNeedRow[]);
        setMoGroups(((jg.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [isGroupMode]);

  const html = useMemo(() => {
    if (!rows) return "";
    const printed_at = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    if (isGroupMode) {
      const nameOf = (moNo: string) => moGroups.find((g) => g.mo_nos.includes(moNo))?.name ?? "— ยังไม่จับกลุ่ม —";
      // ถัง: ชื่อกลุ่ม → set ของ mo_no ที่โผล่ในข้อมูลจริง
      const allMoNos = new Set<string>();
      for (const r of rows) for (const m of r.mos) allMoNos.add(m.mo_no);
      const bucketMos = new Map<string, Set<string>>();
      for (const mo of allMoNos) { const n = nameOf(mo); (bucketMos.get(n) ?? bucketMos.set(n, new Set()).get(n)!).add(mo); }
      let entries = [...bucketMos.entries()];
      if (groupsFilter.length) entries = entries.filter(([n]) => groupsFilter.includes(n));
      entries.sort((a, b) => a[0].localeCompare(b[0], "th"));

      let total = 0;
      const buckets = entries.map(([name, moSet]) => {
        const grows = rows.map((r) => {
          const mos = r.mos.filter((m) => moSet.has(m.mo_no));
          if (mos.length === 0) return null;
          return { ...r, mos, total_remaining: r4(mos.reduce((n, m) => n + m.needed, 0)) };
        }).filter((x): x is PurchaseNeedRow => x !== null);
        const types = groupByType(grows, opts);
        total += grows.length;
        return { name, mo_count: moSet.size, types };
      });
      return buildReportHtml(templateByGroup(opts), { printed_at, total, buckets });
    }

    const filtered = typesFilter.length ? rows.filter((r) => typesFilter.includes(r.material_type || "ไม่ระบุประเภท")) : rows;
    return buildReportHtml(templateByType(opts), { printed_at, total: filtered.length, groups: groupByType(filtered, opts) });
  }, [rows, moGroups, isGroupMode, typesFilter, groupsFilter, opts]);

  const subtitle = isGroupMode
    ? `ตามกลุ่ม${groupsFilter.length ? ` · ${groupsFilter.join(", ")}` : " · ทุกกลุ่ม"}`
    : typesFilter.length ? ` · ${typesFilter.join(", ")}` : "";

  const chk = "flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg border cursor-pointer whitespace-nowrap";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ พิมพ์รายการขอซื้อ/เตรียม{subtitle ? ` · ${subtitle}` : ""}</span>
        <div className="flex-1" />

        {/* ⚙️ ตั้งค่าก่อนพิมพ์ */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 h-9" title="ขนาดตัวอักษรทั้งใบ">
          <span className="text-xs text-slate-500">ตัวอักษร</span>
          {FONTS.map((f) => (
            <button key={f.px} onClick={() => setOpt({ fontPx: f.px })}
              className={`h-7 px-2 text-xs rounded ${opts.fontPx === f.px ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f.label}</button>
          ))}
        </div>
        <label className={`${chk} ${opts.moImg ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"}`}
          title="โชว์รูปสินค้าที่สั่งผลิต ในคอลัมน์ “ใบสั่งผลิต” (เช่น CTL044-02 มีรูปด้วย)">
          <input type="checkbox" checked={opts.moImg} onChange={(e) => setOpt({ moImg: e.target.checked })} className="w-4 h-4 accent-rose-600" />
          🖼 รูปสินค้าที่สั่งผลิต
        </label>
        <label className={`${chk} ${opts.matImg ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"}`}
          title="เพิ่มคอลัมน์รูปวัตถุดิบหน้ารหัส">
          <input type="checkbox" checked={opts.matImg} onChange={(e) => setOpt({ matImg: e.target.checked })} className="w-4 h-4 accent-rose-600" />
          🧵 รูปวัตถุดิบ
        </label>
        <label className={`${chk} ${opts.moQty ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"}`}
          title="โชว์จำนวนที่ใบสั่งผลิตนั้นสั่งผลิต เช่น CTL044-02 ×1,000 (13.333) — ×1,000 คือจำนวนที่สั่ง, ในวงเล็บคือวัตถุดิบที่ใบนั้นต้องใช้">
          <input type="checkbox" checked={opts.moQty} onChange={(e) => setOpt({ moQty: e.target.checked })} className="w-4 h-4 accent-rose-600" />
          🔢 จำนวนที่สั่งผลิต
        </label>

        <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html} className="h-9 rounded-lg bg-rose-600 px-5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : rows === null ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
          : <PrintFrame html={html} />}
      </div>
    </div>
  );
}

export default function PurchaseNeedsPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PurchaseNeedsPrintInner /></Suspense>;
}
