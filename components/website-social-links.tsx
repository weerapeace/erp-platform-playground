"use client";
/**
 * 🌐 ป๊อปตั้งค่าโซเชียลมีเดียของร้าน (ของกลาง) — แก้ลิงก์ Instagram / Facebook / TikTok / X / Pinterest / YouTube / LINE / Shopee / Lazada
 * ลำดับในรายการนี้ = ลำดับที่โชว์บนเว็บ (ท้ายเว็บ "ติดตามเรา")
 * เก็บที่ "ข้อมูลร้าน" (store_settings · lib/website-site-info.ts) = ชุดเดียวกับแท็บ 🏪 ข้อมูลร้าน
 * ใช้ร่วม: หัวเว็บ (ชิ้น "โซเชียล") · ท้ายเว็บ · หน้าติดต่อ · ลิ้นชักเมนูมือถือ
 * บันทึกทันทีแบบแก้เฉพาะช่องเหล่านี้ (PUT /api/website/settings { patch }) — ไม่ต้องรอเผยแพร่ดีไซน์ · มี audit ที่ API
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadWebSettings } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type SocialKey = "social_facebook" | "social_instagram" | "social_tiktok" | "social_x" | "social_pinterest" | "social_youtube" | "contact_line_url" | "social_shopee" | "social_lazada";
const SOCIALS: { key: SocialKey; label: string; icon: string; placeholder: string }[] = [
  { key: "social_instagram", label: "Instagram", icon: "📸", get placeholder() { return tr("https://instagram.com/ชื่อบัญชี", "https://instagram.com/account"); } },
  { key: "social_facebook", label: "Facebook", icon: "📘", get placeholder() { return tr("https://facebook.com/ชื่อเพจ", "https://facebook.com/page"); } },
  { key: "social_tiktok", label: "TikTok", icon: "🎵", get placeholder() { return tr("https://tiktok.com/@ชื่อบัญชี", "https://tiktok.com/@account"); } },
  { key: "social_x", label: "X (Twitter)", icon: "✖️", get placeholder() { return tr("https://x.com/ชื่อบัญชี", "https://x.com/account"); } },
  { key: "social_pinterest", label: "Pinterest", icon: "📌", get placeholder() { return tr("https://pinterest.com/ชื่อบัญชี", "https://pinterest.com/account"); } },
  { key: "social_youtube", label: "YouTube", icon: "▶️", get placeholder() { return tr("https://youtube.com/@ชื่อช่อง", "https://youtube.com/@channel"); } },
  { key: "contact_line_url", label: "LINE Official", icon: "💬", placeholder: "https://lin.ee/xxxx" },
  { key: "social_shopee", label: "Shopee", icon: "🛍️", get placeholder() { return tr("https://shopee.co.th/ชื่อร้าน", "https://shopee.co.th/shop"); } },
  { key: "social_lazada", label: "Lazada", icon: "🛒", get placeholder() { return tr("https://lazada.co.th/shop/ชื่อร้าน", "https://lazada.co.th/shop/shop-name"); } },
];
type Links = Record<SocialKey, string>;
const EMPTY = Object.fromEntries(SOCIALS.map((s) => [s.key, ""])) as Links;

/** ลิงก์ต้องขึ้นต้นด้วย http(s):// (ไม่เดาให้ — เตือนว่าต้องใส่อะไร) */
const badLink = (v: string) => v.trim() !== "" && !/^https?:\/\/\S+$/i.test(v.trim());

export function SocialLinksModal({ open, onClose, shopSlug, shopId, onSaved }: { open: boolean; onClose: () => void; shopSlug: string; shopId: string; onSaved?: () => void }) {
  const t = useT();
  const toast = useToast();
  const [saved, setSaved] = useState<Links>(EMPTY);
  const [links, setLinks] = useState<Links>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    loadWebSettings(shopSlug, true)
      .then((j) => {
        if (!alive) return;
        if (j.error) return setErr(j.error);
        const info = (j.info ?? {}) as Record<string, unknown>;
        const v = { ...EMPTY };
        for (const s of SOCIALS) v[s.key] = typeof info[s.key] === "string" ? (info[s.key] as string) : "";
        setSaved(v);
        setLinks(v);
      })
      .catch(() => alive && setErr(tr("โหลดข้อมูลร้านไม่สำเร็จ", "Couldn't load shop info")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, shopSlug]);

  const dirty = useMemo(() => SOCIALS.some((s) => links[s.key].trim() !== saved[s.key].trim()), [links, saved]);
  const invalid = SOCIALS.filter((s) => badLink(links[s.key]));
  const filled = SOCIALS.filter((s) => links[s.key].trim()).length;

  const save = async () => {
    if (invalid.length || saving) return;
    setSaving(true);
    try {
      const patch = Object.fromEntries(SOCIALS.map((s) => [s.key, links[s.key].trim()]));
      const r = await apiFetch("/api/website/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, patch }) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
        return;
      }
      setSaved(links);
      window.dispatchEvent(new Event("website-info-saved"));
      toast.success(t("บันทึกโซเชียลแล้ว — เว็บจะอัปเดตภายใน 1 นาที", "Social links saved — the site updates within 1 minute"));
      onSaved?.();
      onClose();
    } catch {
      toast.error(t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={t("🌐 โซเชียลมีเดียของร้าน", "🌐 Shop social media")}
      description={t("ใส่ลิงก์ช่องทางของร้าน — ช่องที่ว่างจะไม่โชว์ · ใช้ร่วมกันที่หัวเว็บ (ชิ้น “โซเชียล”) · ท้ายเว็บ · หน้าติดต่อ · เมนูมือถือ · บันทึกแล้วขึ้นเว็บเลย (ไม่ต้องกดเผยแพร่)", "Add your shop's channel links — empty ones are hidden · shared by the header (“Social” item) · footer · contact page · mobile menu · goes live on save (no need to publish)")}
      size="lg"
      defaultExpanded={false}
      loading={loading}
      hasUnsavedChanges={dirty}
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-slate-500 mr-auto">{t("ใส่แล้ว", "Filled")} {filled}/{SOCIALS.length} {t("ช่องทาง", "channels")}</span>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            {t("ยกเลิก", "Cancel")}
          </button>
          <button type="button" onClick={save} disabled={!dirty || invalid.length > 0 || saving} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40">
            {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
          </button>
        </div>
      }
    >
      {err ? (
        <p className="text-sm text-rose-600 py-6 text-center">{err}</p>
      ) : (
        <div className="space-y-2.5">
          {SOCIALS.map((s) => {
            const v = links[s.key];
            const bad = badLink(v);
            return (
              <div key={s.key}>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-slate-700">
                    <span className="mr-1.5" aria-hidden>
                      {s.icon}
                    </span>
                    {s.label}
                  </span>
                  <input
                    value={v}
                    onChange={(e) => setLinks((p) => ({ ...p, [s.key]: e.target.value }))}
                    placeholder={s.placeholder}
                    className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-sm outline-none bg-white ${bad ? "border-rose-400 focus:border-rose-500" : "border-slate-200 focus:border-blue-400"}`}
                    aria-label={t(`ลิงก์ ${s.label}`, `${s.label} link`)}
                  />
                  {v.trim() && !bad ? (
                    <a href={v.trim()} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title={t("ลองเปิดลิงก์", "Try opening the link")}>
                      {t("↗ ลองเปิด", "↗ Try it")}
                    </a>
                  ) : (
                    <span className="shrink-0 w-[68px]" />
                  )}
                </div>
                {bad && <p className="text-[11px] text-rose-600 mt-0.5 ml-[120px]">{t("ลิงก์ต้องขึ้นต้นด้วย https:// เช่น", "Link must start with https://, e.g.")} {s.placeholder}</p>}
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400 pt-1">{t("ไอคอนบนหัวเว็บซ่อนบนมือถือ (บนมือถือโชว์ในเมนู ☰ แทน) · LINE ID / เบอร์โทร / อีเมล แก้ที่แท็บ 🏪 ข้อมูลร้าน", "Header icons are hidden on mobile (shown in the ☰ menu instead) · LINE ID / phone / email are edited in 🏪 Shop info")}</p>
        </div>
      )}
    </ERPModal>
  );
}
