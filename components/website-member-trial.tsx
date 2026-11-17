"use client";

/**
 * 🧪 สมาชิกทดลอง — ป๊อปในแท็บ 👥 สมาชิก (components/website-members-panel)
 *
 * สร้างบัญชีทดลอง → "เปิดเว็บในฐานะคนนี้" (ตั๋วใช้ครั้งเดียว 10 นาที) → เห็นหน้าบัญชี/แต้ม/ระดับแบบที่ลูกค้าจริงเห็น
 * โดยไม่ต้องตั้ง Google/LINE/Facebook ก่อน · สั่งซื้อจริงไม่ได้ · ไม่นับในสถิติ/CSV · ลบทีละคนหรือทั้งหมดได้
 * API /api/website/members/test (audit ทุกคำสั่ง) · ของกลาง: ERPModal · askConfirm · webForm
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";

export type TrialMember = { id: string; name: string; points: number; status: string; lastLoginAt: string | null; createdAt: string };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : tr("ยังไม่เคยเปิด", "Never opened"));

async function call(shopSlug: string, body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; url?: string; deleted?: number }> {
  try {
    const r = await apiFetch("/api/website/members/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, ...body }) });
    return await r.json().catch(() => ({ error: tr("ระบบตอบกลับผิดรูปแบบ", "Unexpected server response") }));
  } catch {
    return { error: tr("เชื่อมต่อไม่ได้", "Can't connect") };
  }
}

/** เปิดเว็บร้านในฐานะสมาชิกทดลอง — เปิดแท็บเปล่าทันทีตอนกด (กันเบราว์เซอร์บล็อกป๊อปอัป) แล้วค่อยใส่ลิงก์ */
export async function openAsTrialMember(shopSlug: string, id: string): Promise<string | null> {
  const tab = window.open("about:blank", "_blank");
  const j = await call(shopSlug, { action: "open", id });
  if (!j.ok || !j.url) {
    tab?.close();
    return j.error ?? tr("เปิดไม่สำเร็จ", "Couldn't open");
  }
  if (tab) tab.location.href = j.url;
  else window.location.href = j.url;
  return null;
}

export function MemberTrialModal({ open, shopSlug, members, onClose, onChanged }: { open: boolean; shopSlug: string; members: TrialMember[]; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const create = async () => {
    setBusy("create");
    const j = await call(shopSlug, { action: "create", name: name.trim(), points: Number(points.replace(/,/g, "")) || 0 });
    setBusy(null);
    if (!j.ok) return toast.error(j.error ?? t("สร้างไม่สำเร็จ", "Create failed"));
    toast.success(t("สร้างสมาชิกทดลองแล้ว — กด “เปิดเว็บในฐานะคนนี้” เพื่อลองดู", "Test member created — click “Open site as this member” to try it"));
    setName("");
    setPoints("");
    onChanged();
  };

  const openAs = async (m: TrialMember) => {
    setBusy(m.id);
    const err = await openAsTrialMember(shopSlug, m.id);
    setBusy(null);
    if (err) toast.error(err);
    else onChanged();
  };

  const remove = async (m: TrialMember | null) => {
    const all = !m;
    const ok = await askConfirm({
      title: all ? t(`ลบสมาชิกทดลองทั้งหมด (${members.length} คน)?`, `Delete all test members (${members.length})?`) : t(`ลบ “${m.name}”?`, `Delete “${m.name}”?`),
      message: t("ลบทิ้งถาวร (ที่อยู่ แต้ม รายการโปรด ของบัญชีทดลองหายด้วย) · บัญชีลูกค้าจริงไม่ถูกแตะ", "Deleted permanently (the test account's addresses, points and wishlist go too) · real customer accounts aren't touched"),
      variant: "danger",
      confirmText: all ? t("ลบทั้งหมด", "Delete all") : t("ลบ", "Delete"),
    });
    if (!ok) return;
    setBusy(all ? "all" : m.id);
    const j = await call(shopSlug, all ? { action: "delete_all" } : { action: "delete", id: m.id });
    setBusy(null);
    if (!j.ok) return toast.error(j.error ?? t("ลบไม่สำเร็จ", "Delete failed"));
    toast.success(t(`ลบแล้ว ${j.deleted ?? 0} คน`, `Deleted ${j.deleted ?? 0}`));
    onChanged();
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={t("🧪 สมาชิกทดลอง", "🧪 Test members")}
      description={t("ลองเข้าเว็บร้านในฐานะสมาชิก เพื่อดูหน้าบัญชี แต้ม และระดับ — ไม่ต้องตั้ง Google/LINE/Facebook ก่อน", "Try the shop site as a member to see the account page, points and tiers — no need to set up Google/LINE/Facebook first")}
      size="md"
      hasUnsavedChanges={!!name.trim() || !!points.trim()}
      footer={
        <div className="flex items-center gap-2">
          {members.length > 0 && (
            <button type="button" disabled={!!busy} onClick={() => void remove(null)} className="h-9 px-3 rounded-lg border border-red-200 text-red-700 text-sm disabled:opacity-40" data-trial-delete-all>
              {t("🗑 ลบสมาชิกทดลองทั้งหมด (", "🗑 Delete all test members (")}{members.length})
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto h-9 px-3 rounded-lg border border-slate-200 text-sm">
            {t("ปิด", "Close")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className={webForm.card}>
          <p className="text-sm font-medium text-slate-700 mb-2">{t("สร้างสมาชิกทดลอง", "Create test member")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
            <label className="block">
              <span className={webForm.label}>{t("ชื่อที่โชว์บนเว็บ", "Name shown on site")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ทดลอง · ลูกค้าใหม่", "Test · New customer")} className={webForm.input} maxLength={80} data-trial-name />
            </label>
            <label className="block">
              <span className={webForm.label}>{t("แต้มเริ่มต้น", "Starting points")}</span>
              <input value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d,]/g, ""))} placeholder="0" inputMode="numeric" className={`${webForm.input} tabular-nums text-right`} data-trial-points />
            </label>
            <button type="button" disabled={!!busy} onClick={() => void create()} className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50" data-trial-create>
              {busy === "create" ? t("กำลังสร้าง…", "Creating…") : t("สร้าง", "Create")}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">{t("อยากดูระดับสมาชิก: ใส่แต้มเยอะ ๆ ได้ แต่ระดับคิดจากยอดซื้อจริง 12 เดือน — บัญชีทดลองจะเห็นแถบ “อีก ฿… ถึงระดับถัดไป”", "To see member tiers: you can add lots of points, but tiers are based on real 12-month spend — the test account will see a “฿… to next tier” bar")}</p>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">{t("ยังไม่มีสมาชิกทดลอง", "No test members yet")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5" data-trial-row={m.id}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800 truncate">
                    {m.name} <span className="ml-1 px-1.5 py-px rounded text-[10px] font-bold bg-violet-100 text-violet-700">{t("🧪 ทดลอง", "🧪 Test")}</span>
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {t(`⭐ ${m.points.toLocaleString("th-TH")} แต้ม · เข้าเว็บล่าสุด ${day(m.lastLoginAt)}`, `⭐ ${m.points.toLocaleString("th-TH")} points · last visit ${day(m.lastLoginAt)}`)}
                    {m.status === "blocked" && t(" · ระงับอยู่", " · suspended")}
                  </span>
                </span>
                <button type="button" disabled={!!busy || m.status !== "active"} onClick={() => void openAs(m)} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs disabled:opacity-40" data-trial-open>
                  {busy === m.id ? t("กำลังเปิด…", "Opening…") : t("เปิดเว็บในฐานะคนนี้ ↗", "Open site as this member ↗")}
                </button>
                <button type="button" disabled={!!busy} onClick={() => void remove(m)} className="h-8 px-2.5 rounded-lg border border-red-200 text-red-700 text-xs disabled:opacity-40" data-trial-delete>
                  {t("ลบ", "Delete")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <ul className="text-[11px] text-slate-500 space-y-1 list-disc pl-4">
          <li>{t("ลิงก์เปิดเว็บใช้ได้ครั้งเดียว ภายใน 10 นาที — กดใหม่ได้ทุกครั้ง (บันทึกประวัติว่าใครเปิด)", "The open-site link works once, within 10 minutes — click again anytime (who opened it is logged)")}</li>
          <li>{t("บัญชีทดลองสั่งซื้อจริงไม่ได้ ไม่นับในยอดขาย สถิติ กลุ่มลูกค้า และไฟล์ CSV", "Test accounts can't place real orders and aren't counted in sales, stats, customer segments or CSV files")}</li>
          <li>{t("ลูกค้าจริงใช้ทางนี้ไม่ได้ — ตั๋วออกจาก ERP เท่านั้น และใช้ได้เฉพาะบัญชีทดลอง", "Real customers can't use this — tickets are issued from the ERP only and work for test accounts only")}</li>
        </ul>
      </div>
    </ERPModal>
  );
}
