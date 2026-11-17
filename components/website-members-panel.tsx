"use client";

/**
 * 👥 แท็บสมาชิกของเว็บร้าน (/website/<shop>?tab=members)
 *
 * รายการ = MiniTable กลาง (ค้นหา ชื่อ/อีเมล/เบอร์ · เรียง · จัดกลุ่มตามสถานะ) · ระงับ/เปิดบัญชี = ConfirmDialog + audit (ฝั่ง API)
 * ข้อมูล /api/website/members · สมาชิกสมัครเองที่เว็บร้าน (Google/LINE/Facebook/อีเมล) — ERP ดูและระงับได้ แก้ข้อมูลแทนลูกค้าไม่ได้
 * ยังไม่ได้ตั้งค่าการเข้าสู่ระบบที่เว็บร้าน = ยังไม่มีใครสมัครได้ (บอกวิธีเปิดในกล่องว่าง)
 * ⭐ แต้ม/ระดับ: คอลัมน์แต้ม (กด = ประวัติ + ปรับแต้ม) · ปุ่ม "ระดับสมาชิก" มุมขวาบน — components/website-member-points
 * 👤 กดแถว = ประวัติลูกค้าหน้าเดียว (components/website-customer-profile)
 * 🎯 ปุ่มกลุ่มลูกค้า (รับข่าวสาร/ซื้อซ้ำ/ยังไม่ซื้อ/ห่างหาย/ระดับ) + ส่งออก CSV เฉพาะคนที่ยินยอม — lib/website-member-segments
 * 🧪 สมาชิกทดลอง (components/website-member-trial): ไม่นับในกลุ่ม/จำนวน/CSV — ดูได้จากปุ่มกรอง "🧪 ทดลอง" · แถวมีปุ่ม "เปิดเว็บ"
 * 🔑 ตั้งค่าการเข้าสู่ระบบ Google/LINE/Facebook ต่อร้าน (components/website-member-login-settings) + แถบสถานะด้านบน
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { PROVIDER_LABEL, type MemberProvider } from "@/lib/website-members";
import { MemberPointsModal, MemberTiersModal } from "@/components/website-member-points";
import { WebsiteCustomerProfile, type CustomerRef } from "@/components/website-customer-profile";
import type { MemberTier } from "@/lib/member-points";
import { MEMBER_SEGMENTS, inSegment } from "@/lib/website-member-segments";
import { MemberTrialModal, openAsTrialMember } from "@/components/website-member-trial";
import { MemberLoginSettingsModal } from "@/components/website-member-login-settings";
import { MemberBirthdayModal, birthdayText } from "@/components/website-member-birthday";
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";

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
  points: number;
  spend12m: number;
  lastOrderAt: string | null;
  tier: { key: string; name: string; color: string } | null;
  isTest: boolean;
  /** 🎂 วัน+เดือนเกิด (สมาชิกตั้งเองครั้งเดียว · ร้านแก้ได้) */
  birthMonth: number | null;
  birthDay: number | null;
};

const TRIAL_SEG = "trial";
const LOGIN_LABEL: Record<string, string> = { google: "Google", line: "LINE", facebook: "Facebook" };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(getLang() === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }) : "—");
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const PROV_TONE: Record<MemberProvider, string> = { google: "bg-red-50 text-red-700", line: "bg-green-50 text-green-700", facebook: "bg-blue-50 text-blue-700", password: "bg-slate-100 text-slate-600" };

export function WebsiteMembersPanel({ shopSlug }: { shopSlug: string }) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<Member[] | null>(null);
  const [ask, setAsk] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [tiers, setTiers] = useState<MemberTier[]>([]);
  const [pointsOn, setPointsOn] = useState(false);
  const [pointsOf, setPointsOf] = useState<Member | null>(null);
  const [tierEdit, setTierEdit] = useState(false);
  const [profile, setProfile] = useState<CustomerRef | null>(null);
  const [seg, setSeg] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [loginReady, setLoginReady] = useState<Record<string, boolean>>({});
  const [trialOpen, setTrialOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [bdOf, setBdOf] = useState<Member | null>(null);

  const load = useCallback(() => {
    apiFetch(`/api/website/members?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.members ?? []);
        setTiers(j.tiers ?? []);
        setPointsOn(!!j.pointsEnabled);
        setLoginReady(j.loginReady ?? {});
      })
      .catch(() => {
        toast.error(tr("โหลดสมาชิกไม่สำเร็จ", "Couldn't load members"));
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
      if (!j.ok) toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
      else {
        toast.success(next === "blocked" ? t(`ระงับบัญชี ${ask.name} แล้ว — เข้าสู่ระบบไม่ได้จนกว่าจะเปิด`, `Suspended ${ask.name} — can't log in until reactivated`) : t(`เปิดบัญชี ${ask.name} แล้ว`, `Reactivated ${ask.name}`));
        load();
      }
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  // 🎯 ส่งออกกลุ่มที่เลือก — เซิร์ฟเวอร์ตัดคนที่ไม่ยินยอมรับข่าวสารออกเสมอ + บันทึก audit
  const exportCsv = async (list: Member[]) => {
    setExporting(true);
    try {
      const r = await apiFetch("/api/website/members/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, ids: list.map((m) => m.id), segment: seg }) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.error ?? t("ส่งออกไม่สำเร็จ", "Export failed"));
        return;
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `members-${shopSlug}-${seg.replace(/[^a-z0-9-]/gi, "-")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success(t("ส่งออกแล้ว (เฉพาะคนที่ยินยอมรับข่าวสาร)", "Exported (only people who opted in to marketing)"));
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setExporting(false);
    }
  };

  // 🧪 เปิดเว็บร้านในฐานะสมาชิกทดลอง (แท็บใหม่)
  const openTrial = async (m: Member) => {
    setOpening(m.id);
    const err = await openAsTrialMember(shopSlug, m.id);
    setOpening(null);
    if (err) toast.error(err);
  };

  if (rows === null) return <div className="py-16 text-center text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</div>;
  // 🧪 สมาชิกทดลองไม่นับในกลุ่ม/จำนวน/CSV — โชว์เฉพาะตอนเลือกปุ่มกรอง "🧪 ทดลอง"
  const real = rows.filter((m) => !m.isTest);
  const trial = rows.filter((m) => m.isTest);
  const segOpts = [
    ...MEMBER_SEGMENTS.map((x) => ({ key: x.key as string, label: x.label, hint: x.hint, count: real.filter((m) => inSegment(m, x.key)).length })),
    ...tiers.map((tier) => ({ key: `tier:${tier.key}`, label: `⭐ ${tier.name}`, hint: t(`ระดับ ${tier.name}`, `Tier ${tier.name}`), count: real.filter((m) => inSegment(m, `tier:${tier.key}`)).length })),
    ...(trial.length ? [{ key: TRIAL_SEG, label: t("🧪 ทดลอง", "🧪 Test"), hint: t("สมาชิกทดลอง (ไม่นับในยอด/สถิติ/CSV)", "Test members (not counted in totals/stats/CSV)"), count: trial.length }] : []),
  ];
  const shown = seg === TRIAL_SEG ? trial : real.filter((m) => inSegment(m, seg));
  const optInShown = seg === TRIAL_SEG ? 0 : shown.filter((m) => m.marketingOptIn && m.status === "active").length;
  const readyList = Object.keys(LOGIN_LABEL).filter((p) => loginReady[p]);
  // แสดงคอลัมน์แต้ม/ระดับเมื่อร้านเปิดแต้ม หรือเคยมีแต้ม/ตั้งระดับไว้ (ปิดทีหลังแต้มเดิมยังอยู่)
  const showPoints = pointsOn || tiers.length > 0 || rows.some((r) => r.points !== 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500" data-login-strip>
        <b className="text-slate-700">{t("การเข้าสู่ระบบของร้านนี้:", "This shop's login:")}</b>
        {Object.entries(LOGIN_LABEL).map(([p, label]) => (
          <span key={p} className={loginReady[p] ? "text-emerald-700 font-medium" : "text-slate-400"}>
            {label} {loginReady[p] ? "✓" : t("ยังไม่ตั้ง", "not set")}
          </span>
        ))}
        <span className="text-violet-700 font-medium">{t("🧪 สมาชิกทดลอง ✓ พร้อมใช้", "🧪 Test members ✓ ready")}</span>
        <span className="ml-auto text-[11px] text-slate-400">{readyList.length ? t("ลูกค้ากดสมัครที่ปุ่มบนหัวเว็บได้แล้ว", "Customers can sign up via the button in the site header") : t("ยังไม่มีปุ่มสมัครบนเว็บ — ตั้งค่าอย่างน้อย 1 ช่องทาง", "No sign-up button on the site yet — set up at least 1 method")}</span>
      </div>
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-member-segments>
          {segOpts.map((o) => (
            <button
              key={o.key}
              type="button"
              title={o.hint}
              onClick={() => setSeg(o.key)}
              className={`h-8 px-3 rounded-full text-xs border ${seg === o.key ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {o.label} <span className="opacity-70">{o.count}</span>
            </button>
          ))}
        </div>
      )}
      <MiniTable<Member>
        title={t("👥 สมาชิกเว็บร้าน", "👥 Shop members")}
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={(r) => setProfile({ customerId: r.id, name: r.name })}
        countUnit={t("คน", "people")}
        actions={
          <span className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTrialOpen(true)} className="h-8 px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 text-xs" data-open-trial>
            {t("🧪 สมาชิกทดลอง", "🧪 Test members")}{trial.length ? ` (${trial.length})` : ""}
          </button>
          <button type="button" onClick={() => setLoginOpen(true)} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs" data-open-login-settings>
            {t("🔑 ตั้งค่าการเข้าสู่ระบบ", "🔑 Login settings")}
          </button>
          <button type="button" disabled={exporting || !optInShown} onClick={() => void exportCsv(shown)} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs disabled:opacity-40" title={t("ส่งออกเฉพาะคนที่ยินยอมรับข่าวสาร (PDPA)", "Exports only people who opted in to marketing (PDPA)")} data-export-members>
            {exporting ? t("กำลังส่งออก…", "Exporting…") : t(`⬇️ ส่งออก CSV (${optInShown} คนที่รับข่าวสาร)`, `⬇️ Export CSV (${optInShown} opted in)`)}
          </button>
          <button type="button" onClick={() => setTierEdit(true)} className="h-8 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs" data-open-tiers>
            {t("⭐ ระดับสมาชิก", "⭐ Member tiers")}{tiers.length ? ` (${tiers.length})` : ""}
          </button>
          </span>
        }
        searchText={(r) => `${r.name} ${r.email ?? ""} ${r.phone}`}
        searchPlaceholder={t("ค้นหาชื่อ / อีเมล / เบอร์", "Search name / email / phone")}
        groupBy={(r) => (r.isTest ? t("🧪 สมาชิกทดลอง (ไม่นับในยอด/สถิติ/CSV)", "🧪 Test members (not counted in totals/stats/CSV)") : r.status === "blocked" ? t("ระงับอยู่", "Suspended") : t("ใช้งาน", "Active"))}
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">{t("ยังไม่มีสมาชิก", "No members yet")}</p>
            <p className="text-xs text-slate-400 mt-1">
              {readyList.length
                ? t("ลูกค้ากดปุ่ม “สมัครสมาชิก” บนหัวเว็บร้านได้แล้ว — สมัครเมื่อไหร่จะขึ้นที่นี่", "Customers can click “Sign up” in the site header — new members will show up here")
                : t("ลูกค้าจะสมัครได้เมื่อตั้งค่าการเข้าสู่ระบบ (Google / LINE / Facebook) อย่างน้อย 1 ช่องทาง — กดปุ่ม 🔑 ด้านบน · อยากลองดูหน้าบัญชีก่อน กด 🧪 สมาชิกทดลอง", "Customers can sign up once at least 1 login method (Google / LINE / Facebook) is set up — click 🔑 above · to try the account page first, click 🧪 Test members")}
            </p>
          </div>
        }
        columns={[
          {
            key: "name",
            header: t("สมาชิก", "Member"),
            width: "minmax(11rem, 1.6fr)",
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
                  <span className="block text-sm text-slate-800 truncate">
                    {r.name}
                    {r.isTest && <span className="ml-1.5 px-1.5 py-px rounded text-[10px] font-bold bg-violet-100 text-violet-700" data-test-badge>{t("🧪 ทดลอง", "🧪 Test")}</span>}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {r.email ?? t("ไม่มีอีเมล", "No email")}
                    {r.phone && ` · ${r.phone}`}
                    {" · "}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setBdOf(r); }} className="text-slate-500 hover:text-blue-600 hover:underline" title={t("วันเกิด (แก้/ล้าง)", "Birthday (edit/clear)")} data-member-birthday>
                      🎂 {r.birthMonth ? birthdayText(r.birthMonth, r.birthDay) : t("ยังไม่ตั้ง", "not set")}
                    </button>
                  </span>
                </span>
              </span>
            ),
          },
          {
            key: "prov",
            header: t("เข้าด้วย", "Login via"),
            width: "6.5rem",
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
          { key: "orders", header: t("ออเดอร์", "Orders"), align: "right", width: "4.5rem", sortValue: (r) => r.orderCount, cell: (r) => <span className="text-sm tabular-nums">{r.orderCount}</span> },
          { key: "total", header: t("ยอดซื้อ", "Spend"), align: "right", width: "6.5rem", sortValue: (r) => r.orderTotal, cell: (r) => <span className="text-sm tabular-nums">{baht(r.orderTotal)}</span> },
          ...(showPoints
            ? [
                {
                  key: "points",
                  header: t("⭐ แต้ม · ระดับ", "⭐ Points · tier"),
                  align: "right" as const,
                  width: "6.5rem",
                  sortValue: (r: Member) => r.points,
                  sortLabel: t("แต้ม", "Points"),
                  cell: (r: Member) => (
                    <span className="flex flex-col items-end gap-0.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setPointsOf(r); }} className="text-sm tabular-nums text-amber-700 hover:underline" data-points-of={r.id} title={t("ดูประวัติ / ปรับแต้ม", "View history / adjust points")}>
                        {r.points.toLocaleString("th-TH")}
                      </button>
                      {r.tier && (
                        <span className="px-1.5 py-px rounded text-[10px] font-medium text-white" style={{ background: r.tier.color }} title={t(`ยอดซื้อ 12 เดือน ${baht(r.spend12m)}`, `12-month spend ${baht(r.spend12m)}`)} data-tier-badge>
                          {r.tier.name}
                        </span>
                      )}
                    </span>
                  ),
                },
              ]
            : []),
          { key: "joined", header: t("สมัครเมื่อ", "Joined"), width: "5.5rem", sortValue: (r) => r.createdAt, cell: (r) => <span className="text-xs text-slate-500">{day(r.createdAt)}</span> },
          { key: "last", header: t("เข้าล่าสุด", "Last login"), width: "5.5rem", sortValue: (r) => r.lastLoginAt ?? "", cell: (r) => <span className="text-xs text-slate-500">{day(r.lastLoginAt)}</span> },
          { key: "mkt", header: t("รับข่าวสาร", "Marketing"), width: "4.5rem", cell: (r) => <span className="text-xs">{r.marketingOptIn ? "✓" : "—"}</span> },
          {
            key: "act",
            header: "",
            width: "5rem",
            align: "right",
            cell: (r) => r.isTest ? (
              <button type="button" disabled={opening === r.id || r.status !== "active"} onClick={(e) => { e.stopPropagation(); void openTrial(r); }} className="h-7 px-2 text-[11px] rounded-md bg-blue-600 text-white disabled:opacity-40" data-trial-open-row>
                {opening === r.id ? "…" : t("เปิดเว็บ ↗", "Open site ↗")}
              </button>
            ) : (
              <button type="button" onClick={(e) => { e.stopPropagation(); setAsk(r); }} className={`h-7 px-2 text-[11px] rounded-md border ${r.status === "blocked" ? "border-emerald-300 text-emerald-700" : "border-slate-200 text-red-600 hover:border-red-300"}`}>
                {r.status === "blocked" ? t("เปิดบัญชี", "Reactivate") : t("ระงับ", "Suspend")}
              </button>
            ),
          },
        ]}
        footnote={`${t("ออเดอร์/ยอดซื้อ = ออเดอร์ที่ผูกกับบัญชี (ไม่นับที่ยกเลิก) · สมาชิกแก้ข้อมูลตัวเองที่หน้าเว็บ ‘บัญชีของฉัน’", "Orders/spend = orders linked to the account (cancelled excluded) · members edit their own info on the site's ‘My account’ page")}${showPoints ? t(" · ⭐ กดตัวเลขแต้มเพื่อดูประวัติ/ปรับแต้ม · ระดับคิดจากยอดซื้อ 12 เดือน", " · ⭐ click the points number to see history/adjust · tier is based on 12-month spend") : t(" · ⭐ เปิดแต้มสะสมที่แท็บ 🏪 ข้อมูลร้าน", " · ⭐ turn on loyalty points in the 🏪 Shop info tab")}`}
      />
      <MemberPointsModal member={pointsOf} onClose={() => setPointsOf(null)} onChanged={load} />
      <WebsiteCustomerProfile shopSlug={shopSlug} who={profile} onClose={() => setProfile(null)} />
      <MemberTiersModal open={tierEdit} shopSlug={shopSlug} onClose={() => setTierEdit(false)} onSaved={load} />
      <MemberTrialModal open={trialOpen} shopSlug={shopSlug} members={trial} onClose={() => setTrialOpen(false)} onChanged={load} />
      <MemberLoginSettingsModal open={loginOpen} shopSlug={shopSlug} onClose={() => setLoginOpen(false)} onSaved={load} />
      <MemberBirthdayModal member={bdOf} onClose={() => setBdOf(null)} onSaved={load} />
      <ConfirmDialog
        open={!!ask}
        onClose={() => !busy && setAsk(null)}
        onConfirm={() => void toggle()}
        loading={busy}
        variant={ask?.status === "blocked" ? "default" : "danger"}
        title={ask?.status === "blocked" ? t(`เปิดบัญชี ${ask?.name ?? ""}?`, `Reactivate ${ask?.name ?? ""}?`) : t(`ระงับบัญชี ${ask?.name ?? ""}?`, `Suspend ${ask?.name ?? ""}?`)}
        message={ask?.status === "blocked" ? t("สมาชิกจะเข้าสู่ระบบได้อีกครั้ง", "The member will be able to log in again") : t("สมาชิกจะเข้าสู่ระบบไม่ได้ (ออเดอร์เดิมยังอยู่ · สั่งแบบไม่สมัครยังได้) — เปิดกลับได้ทุกเมื่อ", "The member won't be able to log in (past orders stay · guest checkout still works) — can be reactivated anytime")}
        confirmText={ask?.status === "blocked" ? t("เปิดบัญชี", "Reactivate") : t("ระงับบัญชี", "Suspend account")}
      />
    </div>
  );
}
