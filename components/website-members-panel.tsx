"use client";

/**
 * 👥 แท็บสมาชิกของเว็บร้าน (/website/<shop>?tab=members)
 *
 * รายการ = MiniTable กลาง (ค้นหา ชื่อ/อีเมล/เบอร์ · เรียง · จัดกลุ่มตามสถานะ) · ระงับ/เปิดบัญชี = ConfirmDialog + audit (ฝั่ง API)
 * ข้อมูล /api/website/members · สมาชิกสมัครเองที่เว็บร้าน (Google/LINE/Facebook/อีเมล) — ERP ดูและระงับได้ แก้ข้อมูลแทนลูกค้าไม่ได้
 * ยังไม่ได้ตั้งค่าการเข้าสู่ระบบที่เว็บร้าน = ยังไม่มีใครสมัครได้ (บอกวิธีเปิดในกล่องว่าง)
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { PROVIDER_LABEL, type MemberProvider } from "@/lib/website-members";

type Member = {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  phone: string;
  avatarUrl: string | null;
  marketingOptIn: boolean;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  providers: MemberProvider[];
  orderCount: number;
  orderTotal: number;
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }) : "—");
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const PROV_TONE: Record<MemberProvider, string> = { google: "bg-red-50 text-red-700", line: "bg-green-50 text-green-700", facebook: "bg-blue-50 text-blue-700", password: "bg-slate-100 text-slate-600" };

export function WebsiteMembersPanel({ shopSlug }: { shopSlug: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<Member[] | null>(null);
  const [ask, setAsk] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/website/members?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.members ?? []);
      })
      .catch(() => {
        toast.error("โหลดสมาชิกไม่สำเร็จ");
        setRows([]);
      });
  }, [shopSlug, toast]);
  useEffect(() => load(), [load]);

  const toggle = async () => {
    if (!ask) return;
    setBusy(true);
    const next = ask.status === "blocked" ? "active" : "blocked";
    try {
      const r = await apiFetch("/api/website/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ask.id, status: next }) });
      const j = await r.json();
      if (!j.ok) toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      else {
        toast.success(next === "blocked" ? `ระงับบัญชี ${ask.name} แล้ว — เข้าสู่ระบบไม่ได้จนกว่าจะเปิด` : `เปิดบัญชี ${ask.name} แล้ว`);
        load();
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  if (rows === null) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      <MiniTable<Member>
        title="👥 สมาชิกเว็บร้าน"
        rows={rows}
        rowKey={(r) => r.id}
        countUnit="คน"
        searchText={(r) => `${r.name} ${r.email ?? ""} ${r.phone}`}
        searchPlaceholder="ค้นหาชื่อ / อีเมล / เบอร์"
        groupBy={(r) => (r.status === "blocked" ? "ระงับอยู่" : "ใช้งาน")}
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">ยังไม่มีสมาชิก</p>
            <p className="text-xs text-slate-400 mt-1">ลูกค้าสมัครเองที่หน้าเว็บ (ปุ่ม 👤 มุมขวาบน) — ต้องตั้งค่าการเข้าสู่ระบบ (Google/LINE/Facebook) ที่เว็บร้านก่อน ดูวิธีใน docs/website-members.md</p>
          </div>
        }
        columns={[
          {
            key: "name",
            header: "สมาชิก",
            width: "1.6fr",
            sortValue: (r) => r.name,
            cell: (r) => (
              <span className="flex items-center gap-2 min-w-0">
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center shrink-0">{r.name.slice(0, 1) || "?"}</span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{r.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {r.email ?? "ไม่มีอีเมล"}
                    {r.phone && ` · ${r.phone}`}
                  </span>
                </span>
              </span>
            ),
          },
          {
            key: "prov",
            header: "เข้าด้วย",
            width: "8rem",
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.providers.map((p) => (
                  <span key={p} className={`px-1.5 py-0.5 rounded text-[10px] ${PROV_TONE[p]}`}>
                    {PROVIDER_LABEL[p]}
                  </span>
                ))}
              </span>
            ),
          },
          { key: "orders", header: "ออเดอร์", align: "right", width: "5rem", sortValue: (r) => r.orderCount, cell: (r) => <span className="text-sm tabular-nums">{r.orderCount}</span> },
          { key: "total", header: "ยอดซื้อ", align: "right", width: "7rem", sortValue: (r) => r.orderTotal, cell: (r) => <span className="text-sm tabular-nums">{baht(r.orderTotal)}</span> },
          { key: "joined", header: "สมัครเมื่อ", width: "6rem", sortValue: (r) => r.createdAt, cell: (r) => <span className="text-xs text-slate-500">{day(r.createdAt)}</span> },
          { key: "last", header: "เข้าล่าสุด", width: "6rem", sortValue: (r) => r.lastLoginAt ?? "", cell: (r) => <span className="text-xs text-slate-500">{day(r.lastLoginAt)}</span> },
          { key: "mkt", header: "รับข่าวสาร", width: "5.5rem", cell: (r) => <span className="text-xs">{r.marketingOptIn ? "✓" : "—"}</span> },
          {
            key: "act",
            header: "",
            width: "6rem",
            align: "right",
            cell: (r) => (
              <button type="button" onClick={() => setAsk(r)} className={`h-7 px-2 text-[11px] rounded-md border ${r.status === "blocked" ? "border-emerald-300 text-emerald-700" : "border-slate-200 text-red-600 hover:border-red-300"}`}>
                {r.status === "blocked" ? "เปิดบัญชี" : "ระงับ"}
              </button>
            ),
          },
        ]}
        footnote="ออเดอร์/ยอดซื้อ = ออเดอร์ที่ผูกกับบัญชี (ไม่นับที่ยกเลิก) · สมาชิกแก้ข้อมูลตัวเองที่หน้าเว็บ ‘บัญชีของฉัน’"
      />
      <ConfirmDialog
        open={!!ask}
        onClose={() => !busy && setAsk(null)}
        onConfirm={() => void toggle()}
        loading={busy}
        variant={ask?.status === "blocked" ? "default" : "danger"}
        title={ask?.status === "blocked" ? `เปิดบัญชี ${ask?.name ?? ""}?` : `ระงับบัญชี ${ask?.name ?? ""}?`}
        message={ask?.status === "blocked" ? "สมาชิกจะเข้าสู่ระบบได้อีกครั้ง" : "สมาชิกจะเข้าสู่ระบบไม่ได้ (ออเดอร์เดิมยังอยู่ · สั่งแบบไม่สมัครยังได้) — เปิดกลับได้ทุกเมื่อ"}
        confirmText={ask?.status === "blocked" ? "เปิดบัญชี" : "ระงับบัญชี"}
      />
    </div>
  );
}
