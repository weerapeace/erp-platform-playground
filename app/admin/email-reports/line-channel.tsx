"use client";

// ============================================================
// 🟢 ช่องทาง LINE ในป๊อปแก้ไขรายงาน — การ์ดตั้งค่า (เลือกกลุ่ม · หน้าตา · จำนวน · ประมาณโควตา) + ตัวอย่างข้อความ LINE
// ส่งจริง: lib/email-report/line (1 ข้อความ/ครั้ง — แบบการ์ดปัดดูก็ยัง 1) · ตัวอย่าง: /api/admin/email-reports/preview?format=line
// กลุ่มที่เลือกได้ = กลุ่มที่บอท ERP อยู่ (/api/admin/email-reports/line ← lib/line-intake · มีจำนวนสมาชิก)
// ⚠️ LINE นับโควตา "ต่อคนที่ได้รับ": กลุ่ม 8 คน = 8 ต่อครั้ง (ฟรี 300/เดือน ใช้ร่วมทั้ง ERP) → โชว์ประมาณการให้เห็นก่อนบันทึก
// ============================================================

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LINE_CARD_CHOICES, LINE_MAX_ROW_CHOICES, type EmailReportLine } from "@/lib/email-report/shared";

type LineGroup = { id: string; name: string | null; members: number | null; reachable: boolean; uses: string[] };
export type LinePreviewData = {
  header: string; sub: string[]; rows: { left: string; right: string }[]; more: number; link: string | null; link_label: string;
  group_name: string | null; empty: string | null;
  style?: "cards" | "list"; cards?: { rank: number; title: string; sub: string; value: string; image: string | null }[];
  stats?: { label: string; value: string; hint: string | null; good: boolean }[]; total?: number; unit?: string;
};
/** โควตาฟรีของ LINE OA ต่อเดือน (ใช้ร่วมทั้ง ERP) */
const LINE_FREE_QUOTA = 300;

export function LineChannelCard({ value, onChange, chip, sendsPerMonth, cardsAvailable }: {
  value: EmailReportLine; onChange: (p: Partial<EmailReportLine>) => void; chip: (on: boolean) => string;
  /** ส่งประมาณกี่ครั้ง/เดือน (จากวันที่ตั้งส่ง) — ใช้ประมาณโควตา */
  sendsPerMonth: number;
  /** แหล่งข้อมูลมีสินค้าพร้อมรูป → เลือกแบบการ์ดปัดดูได้ */
  cardsAvailable: boolean;
}) {
  const [meta, setMeta] = useState<{ has_token: boolean; groups: LineGroup[]; error: string | null } | null>(null);
  useEffect(() => {
    apiFetch("/api/admin/email-reports/line").then((r) => r.json())
      .then((j) => setMeta({ has_token: !!j.has_token, groups: Array.isArray(j.groups) ? j.groups : [], error: j.error ?? null }))
      .catch(() => setMeta({ has_token: false, groups: [], error: "โหลดกลุ่ม LINE ไม่สำเร็จ" }));
  }, []);
  const groups = (meta?.groups ?? []).filter((g) => g.reachable);
  const picked = groups.find((g) => g.id === value.group_id) ?? null;
  const cards = cardsAvailable && value.style === "cards";
  const perSend = picked?.members ?? null;
  const perMonth = perSend != null ? Math.round(perSend * sendsPerMonth) : null;
  const pct = perMonth != null ? Math.min(100, Math.round((perMonth / LINE_FREE_QUOTA) * 100)) : 0;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
      <div className="text-xs font-semibold text-slate-700">🟢 LINE <span className="font-normal text-slate-400">(1 ข้อความต่อครั้ง · ปุ่ม &quot;ดูทั้งหมดใน ERP&quot;)</span></div>
      {!meta ? <p className="mt-2 text-xs text-slate-400">กำลังโหลดกลุ่ม LINE…</p>
        : !meta.has_token ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">ยังไม่ได้ตั้งบอท LINE — ตั้งที่ศูนย์ LINE (ตั้งค่า) ก่อน</p>
        : (
          <div className="mt-2 space-y-2">
            {meta.error && <p className="text-xs text-rose-600">⚠ {meta.error}</p>}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ส่งเข้ากลุ่ม</label>
              <select value={value.group_id ?? ""} onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); onChange({ group_id: g?.id ?? null, group_name: g?.name ?? null }); }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">— เลือกกลุ่มที่บอทอยู่ —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name ?? "(ไม่มีชื่อ)"}{g.members ? ` · ${g.members} คน` : ""}{g.uses.length ? ` · ใช้กับ ${g.uses.join(", ")}` : ""}</option>)}
                {value.group_id && !groups.some((g) => g.id === value.group_id) && <option value={value.group_id}>{value.group_name ?? value.group_id} (บอทไม่อยู่ในกลุ่มนี้แล้ว)</option>}
              </select>
              {groups.length === 0 && <p className="mt-1 text-[11px] text-slate-500">ยังไม่มีกลุ่มที่บอทอยู่ — เชิญบอท LINE ของ ERP เข้ากลุ่ม แล้วพิมพ์อะไรสักข้อความในกลุ่ม จากนั้นเปิดหน้านี้ใหม่</p>}
            </div>

            {cardsAvailable && (
              <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">หน้าตา
                <button type="button" onClick={() => onChange({ style: "cards", max_rows: LINE_CARD_CHOICES.includes(value.max_rows) ? value.max_rows : 5 })} className={chip(value.style === "cards")}>🖼 ปัดดูทีละสินค้า รูปใหญ่</button>
                <button type="button" onClick={() => onChange({ style: "list" })} className={chip(value.style === "list")}>☰ รายการสั้น</button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">{cards ? "การ์ดสินค้า" : "โชว์ในกล่อง"}
              {(cards ? LINE_CARD_CHOICES : LINE_MAX_ROW_CHOICES).map((n) => <button key={n} type="button" onClick={() => onChange({ max_rows: n })} className={chip(value.max_rows === n)}>{n} {cards ? "ชิ้น" : "อันดับ"}</button>)}
            </div>

            {/* ประมาณโควตา: LINE นับต่อคนที่ได้รับ */}
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs">
              {perMonth == null ? (
                <span className="text-slate-500">{picked ? "ไม่ทราบจำนวนคนในกลุ่ม — " : "เลือกกลุ่มก่อน — "}LINE นับโควตาตามจำนวนคนที่ได้รับ (กลุ่ม 8 คน = 8 ต่อครั้ง)</span>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-slate-600">ใช้โควตา <b className="text-slate-800">{perSend} ต่อครั้ง</b> ({perSend} คนในกลุ่ม) · ประมาณ <b className={pct >= 60 ? "text-rose-700" : pct >= 30 ? "text-amber-700" : "text-emerald-700"}>{perMonth}/เดือน</b></span>
                    <span className="text-slate-400">จาก {LINE_FREE_QUOTA} ใช้ร่วมทั้ง ERP</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pct >= 60 ? "bg-rose-500" : pct >= 30 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
                  {pct >= 30 && <p className="mt-1.5 text-amber-700">⚠ กินโควตามาก — แนะนำสร้างกลุ่ม LINE ที่มีแค่คุณกับบอท (= 1 ต่อครั้ง) แล้วเลือกกลุ่มนั้น ไม่งั้นแจ้งเตือนอื่นของ ERP อาจเงียบเมื่อโควตาหมด</p>}
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-500">ใส่รูปไม่กินโควตาเพิ่ม · ส่งทดสอบ = ส่งเข้ากลุ่มเดียวกัน (มีคำว่า &quot;ทดสอบ&quot;) และนับโควตาเหมือนส่งจริง</p>
          </div>
        )}
    </div>
  );
}

/** ตัวอย่างข้อความ LINE (หน้าตาใกล้ของจริง) — แบบการ์ดปัดดู หรือกล่องรายการ */
export function LinePreview({ data }: { data: LinePreviewData }) {
  const cards = data.style === "cards" && (data.cards?.length ?? 0) > 0 && !data.empty;
  return (
    <div className="rounded-2xl bg-[#8cabd9]/30 p-4">
      <div className="mb-1 text-[11px] text-slate-500">{data.group_name ? `กลุ่ม ${data.group_name}` : "กลุ่ม LINE"}{cards ? " · ปัดซ้าย-ขวาได้" : ""}</div>
      {cards ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {/* การ์ดสรุป */}
          <div className="flex w-48 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex-1 space-y-1 px-3 pb-2 pt-3">
              <div className="text-[13px] font-semibold leading-snug text-slate-900">{data.header}</div>
              {(data.stats ?? []).map((s) => (
                <div key={s.label} className="flex gap-2 text-[11px]"><span className="w-14 shrink-0 text-slate-500">{s.label}</span><span className={s.good ? "font-semibold text-emerald-700" : "text-slate-800"}>{s.value}{s.hint ? ` · ${s.hint}` : ""}</span></div>
              ))}
              <div className="!mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">ปัดซ้ายดูขายดี {data.cards!.length} อันดับ →</div>
              {(data.total ?? 0) > data.cards!.length && <div className="text-[11px] text-slate-400">ทั้งหมด {(data.total ?? 0).toLocaleString("th-TH")} {data.unit ?? "รายการ"} ดูใน ERP</div>}
            </div>
            {data.link && <div className="border-t border-slate-100 py-2 text-center text-xs font-medium text-blue-600">{data.link_label}</div>}
          </div>
          {/* การ์ดสินค้า */}
          {data.cards!.map((c) => (
            <div key={c.rank} className="w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {c.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.image} alt="" className="aspect-square w-full bg-slate-50 object-cover" loading="lazy" />
                : <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-[11px] text-slate-400">ไม่มีรูป</div>}
              <div className="space-y-0.5 px-2.5 py-2">
                <div className="truncate text-[12px] font-semibold text-slate-900">#{c.rank} {c.title}</div>
                {c.sub && <div className="line-clamp-2 text-[11px] text-slate-500">{c.sub}</div>}
                <div className="text-[12px] font-semibold text-emerald-700">{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-1 px-4 pb-3 pt-3">
            <div className="text-[15px] font-semibold text-slate-900">{data.header}</div>
            {data.sub.map((s, i) => <div key={i} className="text-xs text-slate-500">{s}</div>)}
            <div className="!my-2 border-t border-slate-100" />
            {data.empty ? <div className="text-sm text-emerald-700">{data.empty}</div> : data.rows.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-[13px]">
                <span className="min-w-0 text-slate-800">{i + 1}. {r.left}</span>
                {r.right && <span className="shrink-0 text-right text-slate-600">{r.right}</span>}
              </div>
            ))}
            {data.more > 0 && <div className="pt-1 text-xs text-slate-400">…และอีก {data.more.toLocaleString("th-TH")} รายการ</div>}
          </div>
          {data.link && <div className="border-t border-slate-100 py-2.5 text-center text-sm font-medium text-blue-600">{data.link_label}</div>}
        </div>
      )}
    </div>
  );
}
