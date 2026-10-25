"use client";

/**
 * สรุปทั้งงาน — แต่ละลายได้กี่ชิ้น (ตามจำนวนที่สั่ง + ที่เติม = รวม) และแต่ละแผ่นมีกี่ชิ้น
 * หัวงานบนแผ่นบอกทีละแผ่น — ตรงนี้รวมให้ทั้งงาน (เจ้าของขอ) · ตารางเล็กของกลาง MiniTable (ค้นหา/เรียงได้)
 * ชิ้นที่รหัส ≥ จำนวนที่สั่งรวม = ชิ้นที่เติม (ตัวช่วยนับแบบเดียวกัน)
 */
import { useMemo } from "react";
import { useT, useLang } from "@/components/i18n";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import type { HelperPart, Placed } from "./sheet-view";
import { fmt, fmtLen, type Unit } from "./nest-utils";

type Row = { tid: number; title: string; w: number; h: number; exact: number; filled: number; perSheet: { exact: number; filled: number }[] };

const n0 = (n: number, lang: "th" | "en") => fmt(n, 0, lang);

export function JobSummary({ parts, titles, perPart, sheets, unit }: {
  parts: HelperPart[];
  titles: string[];                                  // ชื่อลายตามลำดับชิ้นในตัวช่วย
  perPart: { exact: number; filled: number }[];
  sheets: Placed[][];                                // ตำแหน่งบนจอตอนนี้ (รวมที่ลากแก้)
  unit: Unit;
}) {
  const t = useT();
  const { lang } = useLang();

  const rows = useMemo<Row[]>(() => {
    const exactTotal = perPart.reduce((a, p) => a + p.exact, 0);
    return parts.map((p, i) => ({
      tid: i, title: titles[i] || p.name.replace(/\.png$/i, ""), w: p.size_mm[0], h: p.size_mm[1],
      exact: perPart[i]?.exact ?? 0, filled: perPart[i]?.filled ?? 0,
      perSheet: sheets.map((sh) => {
        let exact = 0, filled = 0;
        for (const pl of sh) if (pl.tid === i) { if (pl.inst >= exactTotal) filled++; else exact++; }
        return { exact, filled };
      }),
    }));
  }, [parts, titles, perPart, sheets]);

  const tot = rows.reduce((a, r) => ({ exact: a.exact + r.exact, filled: a.filled + r.filled }), { exact: 0, filled: 0 });
  const showSheets = sheets.length > 1 && sheets.length <= 8;
  const cell = (c: { exact: number; filled: number }) =>
    c.exact + c.filled === 0 ? <span className="text-slate-300">—</span>
      : <span>{n0(c.exact + c.filled, lang)}{c.filled ? <span className="text-[11px] text-emerald-700"> ({n0(c.exact, lang)}+{n0(c.filled, lang)})</span> : null}</span>;

  const columns: MiniColumn<Row>[] = [
    { key: "title", header: t("ลาย", "Artwork"), width: "minmax(160px,1.6fr)", cell: (r) => <span className="font-medium text-slate-800">{r.title}</span>, sortValue: (r) => r.title },
    { key: "size", header: t("ขนาด", "Size"), width: "9rem", cell: (r) => <span className="text-slate-500">{fmtLen(r.w, unit, lang)} × {fmtLen(r.h, unit, lang)}</span>, sortValue: (r) => r.w * r.h },
    { key: "exact", header: t("สั่ง", "Ordered"), align: "right", width: "5rem", cell: (r) => n0(r.exact, lang), sortValue: (r) => r.exact },
    { key: "filled", header: t("เติม", "Filled"), align: "right", width: "5rem",
      cell: (r) => (r.filled ? <span className="text-emerald-700">+{n0(r.filled, lang)}</span> : <span className="text-slate-300">—</span>), sortValue: (r) => r.filled },
    { key: "total", header: t("รวม", "Total"), align: "right", width: "5rem", cell: (r) => <b>{n0(r.exact + r.filled, lang)}</b>, sortValue: (r) => r.exact + r.filled },
    ...(showSheets ? sheets.map((_, s): MiniColumn<Row> => ({
      key: `s${s}`, header: t(`แผ่น ${s + 1}`, `Sheet ${s + 1}`), align: "right", width: "6.5rem",
      cell: (r) => cell(r.perSheet[s]), sortValue: (r) => r.perSheet[s].exact + r.perSheet[s].filled,
    })) : []),
  ];

  const perSheetTotal = sheets.map((sh) => sh.length);
  return (
    <MiniTable
      rows={rows}
      rowKey={(r) => String(r.tid)}
      columns={columns}
      searchText={rows.length > 5 ? (r) => r.title : undefined}
      dense
      title={<span>📊 {t("สรุปทั้งงาน", "Whole-job summary")} <span className="font-normal text-slate-500">
        · {t(`${sheets.length} แผ่น`, `${sheets.length} sheet(s)`)} · {t(`รวม ${n0(tot.exact + tot.filled, lang)} ชิ้น`, `${n0(tot.exact + tot.filled, lang)} pcs total`)}
        {tot.filled ? ` (${t(`สั่ง ${n0(tot.exact, lang)} + เติม ${n0(tot.filled, lang)}`, `ordered ${n0(tot.exact, lang)} + filled ${n0(tot.filled, lang)}`)})` : ""}</span></span>}
      countUnit={t("ลาย", "designs")}
      footnote={sheets.length > 1 ? perSheetTotal.map((c, s) => t(`แผ่น ${s + 1}: ${n0(c, lang)} ชิ้น`, `Sheet ${s + 1}: ${n0(c, lang)} pcs`)).join(" · ") : undefined}
    />
  );
}
