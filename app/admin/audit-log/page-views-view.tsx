"use client";

/**
 * แท็บ "การเข้าใช้หน้า" ในหน้าประวัติการใช้งาน (ขั้น 3) — ใครเปิดหน้าไหน กี่ครั้ง ล่าสุดเมื่อไหร่
 *
 * ข้อมูล: GET /api/page-views (ยอดรวมรายวัน เก็บ 90 วัน · สิทธิ์ admin.audit_log) — ผู้บันทึก components/page-view-recorder
 * ตาราง: MiniTable กลาง (ค้นหา/เรียงในตัว) 2 ตาราง — "ตามหน้า" กับ "ตามคน"
 *   กดคน = ตาราง "ตามหน้า" เหลือเฉพาะหน้าที่คนนั้นเปิด · กดหน้า = ตาราง "ตามคน" เหลือเฉพาะคนที่เปิดหน้านั้น
 * เอกสาร: docs/audit-log.md
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { Icon } from "@/components/icon";
import { ErrorState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { addDaysYmd, todayBangkok } from "@/lib/date";
import type { PageViewPageRow, PageViewPersonRow, PageViewsResponse } from "@/app/api/page-views/route";

const RANGES = [
  { key: "today", label: "วันนี้", days: 0 },
  { key: "7d", label: "7 วันล่าสุด", days: 6 },
  { key: "30d", label: "30 วันล่าสุด", days: 29 },
  { key: "90d", label: "90 วันล่าสุด", days: 89 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const fmtTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const fmtNum = (n: number) => n.toLocaleString("th-TH");

export function PageViewsView() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [person, setPerson] = useState<PageViewPersonRow | null>(null);
  const [page, setPage] = useState<PageViewPageRow | null>(null);
  const [pages, setPages] = useState<PageViewPageRow[]>([]);
  const [people, setPeople] = useState<PageViewPersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const today = todayBangkok();
      const r = RANGES.find((x) => x.key === range)!;
      const p = new URLSearchParams({ from: addDaysYmd(today, -r.days), to: today });
      if (person) p.set("user", person.user_id);
      if (page) p.set("path", page.path);
      const res = await apiFetch(`/api/page-views?${p}`);
      const json: PageViewsResponse = await res.json();
      if (id !== reqId.current) return;
      if (!res.ok || json.error) throw new Error(json.error || "โหลดข้อมูลไม่สำเร็จ");
      setPages(json.pages);
      setPeople(json.people);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [range, person, page]);

  useEffect(() => { void load(); }, [load]);

  const pageName = (r: PageViewPageRow) => r.label ?? r.path;
  const totalViews = pages.reduce((s, r) => s + r.views, 0);

  return (
    <div className="px-4 md:px-8 py-5 space-y-4">
      {/* แถบตัวกรอง */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
        <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} aria-label="ช่วงวัน"
          className="h-9 px-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700">
          {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {person && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 pl-2.5 pr-1 py-0.5">
            <Icon name="user" size={13} /> เฉพาะ {person.name}
            <button type="button" onClick={() => setPerson(null)} className="p-0.5 rounded-full hover:bg-blue-100" aria-label="เลิกกรองคน"><Icon name="cancel" size={13} /></button>
          </span>
        )}
        {page && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 pl-2.5 pr-1 py-0.5">
            <Icon name="web" size={13} /> เฉพาะหน้า {pageName(page)}
            <button type="button" onClick={() => setPage(null)} className="p-0.5 rounded-full hover:bg-violet-100" aria-label="เลิกกรองหน้า"><Icon name="cancel" size={13} /></button>
          </span>
        )}
        <span className="text-slate-500">
          {loading ? "กำลังโหลด…" : `เปิดหน้ารวม ${fmtNum(totalViews)} ครั้ง · ${fmtNum(pages.length)} หน้า · ${fmtNum(people.length)} คน`}
        </span>
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
          <Icon name="refresh" size={14} /> โหลดใหม่
        </button>
      </div>

      {error ? <ErrorState title="โหลดข้อมูลการเข้าใช้หน้าไม่สำเร็จ" hint={error} onRetry={() => void load()} /> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <MiniTable<PageViewPageRow>
            title={person ? `หน้าที่ ${person.name} เปิด` : "ตามหน้า"}
            rows={pages} rowKey={(r) => r.path}
            searchText={(r) => `${r.label ?? ""} ${r.section ?? ""} ${r.path}`}
            onRowClick={(r) => setPage(page?.path === r.path ? null : r)}
            emptyText={loading ? "กำลังโหลด…" : "ยังไม่มีการเปิดหน้าในช่วงนี้"}
            maxHeightClass="max-h-[65vh]"
            columns={[
              { key: "page", header: "หน้า", width: "1fr", sortValue: (r) => pageName(r), sortLabel: "ชื่อหน้า",
                cell: (r) => (
                  <span className={`block min-w-0 ${page?.path === r.path ? "font-semibold text-violet-700" : ""}`}>
                    <span className="block truncate">{pageName(r)}</span>
                    <span className="block truncate text-[11px] text-slate-400">{r.label ? `${r.section ? `${r.section} · ` : ""}${r.path}` : "ไม่มีในเมนู"}</span>
                  </span>
                ) },
              { key: "views", header: "เปิด (ครั้ง)", width: "6rem", align: "right", sortValue: (r) => r.views, cell: (r) => fmtNum(r.views) },
              { key: "users", header: "คน", width: "4rem", align: "right", sortValue: (r) => r.users, cell: (r) => fmtNum(r.users) },
              { key: "last", header: "ล่าสุด", width: "7.5rem", align: "right", sortValue: (r) => r.last_at, cell: (r) => <span className="text-slate-500">{fmtTime(r.last_at)}</span> },
            ]}
          />
          <MiniTable<PageViewPersonRow>
            title={page ? `ใครเปิดหน้า ${pageName(page)}` : "ตามคน"}
            rows={people} rowKey={(r) => r.user_id}
            searchText={(r) => r.name}
            onRowClick={(r) => setPerson(person?.user_id === r.user_id ? null : r)}
            emptyText={loading ? "กำลังโหลด…" : "ยังไม่มีการเปิดหน้าในช่วงนี้"}
            maxHeightClass="max-h-[65vh]"
            columns={[
              { key: "name", header: "คน", width: "1fr", sortValue: (r) => r.name, sortLabel: "ชื่อ",
                cell: (r) => <span className={`block truncate ${person?.user_id === r.user_id ? "font-semibold text-blue-700" : ""}`}>{r.name}</span> },
              { key: "views", header: "เปิด (ครั้ง)", width: "6rem", align: "right", sortValue: (r) => r.views, cell: (r) => fmtNum(r.views) },
              { key: "pages", header: "หน้า", width: "4rem", align: "right", sortValue: (r) => r.pages, cell: (r) => fmtNum(r.pages) },
              { key: "days", header: "วัน", width: "4rem", align: "right", sortValue: (r) => r.days, cell: (r) => fmtNum(r.days) },
              { key: "last", header: "ล่าสุด", width: "7.5rem", align: "right", sortValue: (r) => r.last_at, cell: (r) => <span className="text-slate-500">{fmtTime(r.last_at)}</span> },
            ]}
          />
        </div>
      )}

      <p className="text-xs text-slate-400 leading-relaxed">
        กดชื่อคนเพื่อดูว่าคนนั้นเปิดหน้าไหนบ้าง · กดชื่อหน้าเพื่อดูว่าใครเปิดหน้านั้น ·
        ระบบเก็บเป็นยอดรวมรายวัน (เปิดกี่ครั้ง · ครั้งแรก/ล่าสุดกี่โมง) ย้อนหลัง 90 วัน ไม่เก็บว่าดูข้อมูลอะไรในหน้า ·
        เริ่มเก็บ 7 พ.ย. 2569 · ยอดอัปเดตทุก ~1 นาที
      </p>
    </div>
  );
}
