"use client";

// ============================================================
// 🟢 ช่องทาง LINE ในป๊อปแก้ไขรายงาน — การ์ดตั้งค่า (เลือกกลุ่ม · โชว์กี่อันดับ) + ตัวอย่างกล่อง LINE
// ส่งจริง: lib/email-report/line (Flex กล่องเดียว = 1 ข้อความ) · ตัวอย่าง: /api/admin/email-reports/preview?format=line
// กลุ่มที่เลือกได้ = กลุ่มที่บอท ERP อยู่ (/api/admin/email-reports/line ← lib/line-intake)
// ============================================================

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LINE_MAX_ROW_CHOICES, type EmailReportLine } from "@/lib/email-report/shared";

type LineGroup = { id: string; name: string | null; members: number | null; reachable: boolean; uses: string[] };
export type LinePreviewData = { header: string; sub: string[]; rows: { left: string; right: string }[]; more: number; link: string | null; link_label: string; group_name: string | null; empty: string | null };

export function LineChannelCard({ value, onChange, chip }: { value: EmailReportLine; onChange: (p: Partial<EmailReportLine>) => void; chip: (on: boolean) => string }) {
  const [meta, setMeta] = useState<{ has_token: boolean; groups: LineGroup[]; error: string | null } | null>(null);
  useEffect(() => {
    apiFetch("/api/admin/email-reports/line").then((r) => r.json())
      .then((j) => setMeta({ has_token: !!j.has_token, groups: Array.isArray(j.groups) ? j.groups : [], error: j.error ?? null }))
      .catch(() => setMeta({ has_token: false, groups: [], error: "โหลดกลุ่ม LINE ไม่สำเร็จ" }));
  }, []);
  const groups = (meta?.groups ?? []).filter((g) => g.reachable);
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
      <div className="text-xs font-semibold text-slate-700">🟢 LINE <span className="font-normal text-slate-400">(กล่องเดียว 1 ข้อความต่อครั้ง · ปุ่ม "ดูทั้งหมดใน ERP")</span></div>
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
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">โชว์ในกล่อง
              {LINE_MAX_ROW_CHOICES.map((n) => <button key={n} type="button" onClick={() => onChange({ max_rows: n })} className={chip(value.max_rows === n)}>{n} อันดับ</button>)}
            </div>
            <p className="text-[11px] text-slate-500">LINE ฟรีส่งได้ 300 ข้อความ/เดือน ใช้ร่วมกันทั้ง ERP — รายงานนี้ใช้ 1 ข้อความต่อครั้ง (ส่งทุกวัน ≈ 30/เดือน) · ส่งทดสอบ = ส่งเข้ากลุ่มเดียวกัน (มีคำว่า "ทดสอบ")</p>
          </div>
        )}
    </div>
  );
}

/** ตัวอย่างกล่อง LINE (หน้าตาใกล้ของจริง) */
export function LinePreview({ data }: { data: LinePreviewData }) {
  return (
    <div className="rounded-2xl bg-[#8cabd9]/30 p-4">
      <div className="mb-1 text-[11px] text-slate-500">{data.group_name ? `กลุ่ม ${data.group_name}` : "กลุ่ม LINE"}</div>
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
    </div>
  );
}
