"use client";

/**
 * 💾 ธีมที่บันทึกไว้ — ของกลางของหน้าดีไซน์เว็บ (แท็บ "สี")
 *
 * SavedThemesCard = การ์ด "💾 ธีมที่บันทึกไว้": ปุ่มบันทึกธีมปัจจุบัน (ทั้งชุด/เฉพาะสี) + รายการ "ร้านนี้ / ร้านอื่น"
 *                   กด "ใช้" = ใส่หน้าตาลงร่าง (ยังไม่ขึ้นเว็บจนกดเผยแพร่ · ↶ ย้อนได้) · ✏️ แก้ชื่อ · 🗑 ลบ (ยืนยันก่อน)
 * ข้อมูล: /api/website/saved-themes · เก็บ/ใส่ด้วยตัวกลาง lib/website-saved-themes (ไม่แตะโลโก้ เมนู ท้ายเว็บ เนื้อหาร้าน)
 */
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { SAVED_THEME_SCOPES, savedThemeSwatch, type SavedTheme, type SavedThemeScope } from "@/lib/website-saved-themes";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

const API = "/api/website/saved-themes";
/** คำอังกฤษของตัวเลือก "บันทึกอะไรบ้าง" (ป้ายไทยอยู่ใน lib/website-saved-themes) */
const SCOPE_EN: Record<SavedThemeScope, { label: string; hint: string }> = {
  full: { label: "Full look", hint: "Colors, fonts, typography, buttons/shape, product card, header, product page look" },
  colors: { label: "Colors only", hint: "Main + fine colors (buttons, borders, links, prices, stock) + sale badge color" },
};

function SaveThemeDialog({
  open,
  onClose,
  shopId,
  theme,
  rename,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  theme?: unknown;
  rename?: SavedTheme | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<SavedThemeScope>("full");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(rename ? rename.name : `ธีม ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}`);
    setScope("full");
  }, [open, rename]);

  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(API, {
        method: rename ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rename ? { id: rename.id, name: n } : { shopId, name: n, scope, theme }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? tr("บันทึกไม่สำเร็จ", "Save failed"));
        return;
      }
      toast.success(rename ? tr("แก้ชื่อธีมแล้ว", "Theme renamed") : tr(`บันทึกธีม “${n}” แล้ว — ใช้ได้ทุกร้าน`, `Theme “${n}” saved — usable in every shop`));
      onSaved();
      onClose();
    } catch {
      toast.error(tr("เชื่อมต่อไม่ได้", "Connection failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={rename ? t("แก้ชื่อธีม", "Rename theme") : t("💾 บันทึกธีมนี้", "💾 Save this theme")}
      description={rename ? undefined : t("เก็บหน้าตาที่ปรับไว้ (รวมค่าที่ยังไม่เผยแพร่) ไว้ใช้ซ้ำ หรือใช้กับร้านอื่น — ไม่เก็บโลโก้ เมนู ท้ายเว็บ และเนื้อหาร้าน", "Keep this look (including unpublished changes) to reuse or use in another shop — logo, menu, footer and shop content aren't saved")}
      size="sm"
      defaultExpanded={false}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {t("ยกเลิก", "Cancel")}
          </button>
          <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className="h-9 px-4 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? t("กำลังบันทึก…", "Saving…") : rename ? t("บันทึกชื่อ", "Save name") : t("💾 บันทึกธีม", "💾 Save theme")}
          </button>
        </div>
      }
    >
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("ชื่อธีม", "Theme name")}</label>
      <input
        autoFocus
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        placeholder={t("เช่น ธีมปีใหม่ ทองแดง", "e.g. New Year copper theme")}
      />
      {!rename && (
        <div className="mt-3 grid gap-2">
          <span className="block text-[11px] font-medium text-slate-500">{t("บันทึกอะไรบ้าง", "What to save")}</span>
          {SAVED_THEME_SCOPES.map((o) => (
            <label key={o.value} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${scope === o.value ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:border-slate-400"}`}>
              <input type="radio" name="saved-theme-scope" className="mt-0.5" checked={scope === o.value} onChange={() => setScope(o.value)} />
              <span>
                <span className="block text-sm text-slate-800">{t(o.label, SCOPE_EN[o.value]?.label ?? o.label)}</span>
                <span className="block text-[11px] text-slate-500">{t(o.hint, SCOPE_EN[o.value]?.hint ?? o.hint)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </ERPModal>
  );
}

function ThemeSwatch({ theme, scope }: { theme: unknown; scope: SavedThemeScope }) {
  const s = savedThemeSwatch(theme);
  return (
    <div className="rounded-lg h-14 px-3 flex items-center justify-between gap-2 border border-black/5" style={{ background: s.page }}>
      <span className="truncate" style={{ fontFamily: scope === "full" ? `"${s.display}", sans-serif` : undefined, color: s.ink, fontSize: 15 }}>
        Aa กข
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {[s.brand, s.ink, s.surface].map((c, i) => (
          <span key={i} className="w-4 h-4 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }} />
        ))}
      </span>
    </div>
  );
}

export function SavedThemesCard({ shopId, theme, onApply }: { shopId: string; theme: unknown; onApply: (saved: SavedTheme) => void }) {
  const toast = useToast();
  const t = useT();
  const [list, setList] = useState<SavedTheme[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<SavedTheme | null>(null);
  const [deleting, setDeleting] = useState<SavedTheme | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOther, setShowOther] = useState(false);

  const load = useCallback(() => {
    apiFetch(API)
      .then((r) => r.json())
      .then((j) => setList(j.themes ?? []))
      .catch(() => setList([]));
  }, []);
  useEffect(() => load(), [load]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${API}?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) toast.error(j.error ?? tr("ลบไม่สำเร็จ", "Delete failed"));
      else {
        toast.success(tr("ลบธีมแล้ว — ร้านที่เคยใช้ไปแล้วไม่กระทบ", "Theme deleted — shops already using it aren't affected"));
        setDeleting(null);
        load();
      }
    } catch {
      toast.error(tr("เชื่อมต่อไม่ได้", "Connection failed"));
    } finally {
      setBusy(false);
    }
  };

  const mine = (list ?? []).filter((t) => t.shopId === shopId);
  const other = (list ?? []).filter((t) => t.shopId !== shopId);

  const item = (th: SavedTheme) => (
    <div key={th.id} className="group rounded-xl border border-slate-200 p-2 hover:border-slate-400">
      <ThemeSwatch theme={th.theme} scope={th.scope} />
      <div className="mt-1.5 flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 truncate" title={th.name}>{th.name}</p>
          <p className="text-[10px] text-slate-400 truncate">
            {th.scope === "full" ? t("ทั้งชุดหน้าตา", "Full look") : t("เฉพาะสี", "Colors only")}
            {th.shopId !== shopId && (th.shopName ? ` · ${t("จากร้าน", "from shop")} ${th.shopName}` : ` · ${t("จากร้านอื่น", "from another shop")}`)}
          </p>
        </div>
        <button type="button" onClick={() => setRenaming(th)} title={t("แก้ชื่อ", "Rename")} className="w-6 h-6 text-[11px] text-slate-400 hover:text-slate-800 opacity-60 group-hover:opacity-100">
          ✏️
        </button>
        <button type="button" onClick={() => setDeleting(th)} title={t("ลบธีม", "Delete theme")} className="w-6 h-6 text-[11px] text-slate-400 hover:text-red-600 opacity-60 group-hover:opacity-100">
          🗑️
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          onApply(th);
          toast.success(t(`ใช้ธีม "${th.name}" แล้ว — ยังไม่ขึ้นเว็บจนกดเผยแพร่ · กด ↶ เพื่อย้อนกลับ`, `Theme "${th.name}" applied — not live until you publish · press ↶ to undo`));
        }}
        className="mt-1.5 w-full h-8 rounded-lg border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-50"
      >
        {t("ใช้ธีมนี้", "Use this theme")}
      </button>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-800">{t("💾 ธีมที่บันทึกไว้", "💾 Saved themes")}</h3>
        <button type="button" onClick={() => setSaving(true)} className="shrink-0 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          {t("💾 บันทึกธีมนี้", "💾 Save this theme")}
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">{t("เก็บหน้าตาที่ปรับไว้ใช้ซ้ำ หรือเอาไปใช้กับร้านอื่น — ใช้แล้วไม่แตะโลโก้/เมนู/ท้ายเว็บ/เนื้อหาร้าน · ↶ ย้อนได้ก่อนบันทึก", "Keep this look to reuse or use in another shop — applying doesn't touch logo/menu/footer/shop content · ↶ undo before saving")}</p>
      {list === null ? (
        <p className="text-xs text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
      ) : !list.length ? (
        <p className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">{t("ยังไม่มีธีมที่บันทึกไว้ — ปรับหน้าตาจนพอใจแล้วกด “💾 บันทึกธีมนี้”", "No saved themes yet — adjust the look, then click “💾 Save this theme”")}</p>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <p className="text-[10px] font-medium text-slate-500 mb-1">{t("ร้านนี้", "This shop")}</p>
              <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                {mine.map(item)}
              </div>
            </>
          )}
          {other.length > 0 && (
            <div className={mine.length ? "mt-3" : ""}>
              <button type="button" onClick={() => setShowOther((v) => !v)} className="text-[11px] font-medium text-slate-500 hover:text-slate-800 mb-1">
                {showOther || !mine.length ? "▾" : "▸"} {t("จากร้านอื่น", "From other shops")} ({other.length})
              </button>
              {(showOther || !mine.length) && (
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  {other.map(item)}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <SaveThemeDialog open={saving} onClose={() => setSaving(false)} shopId={shopId} theme={theme} onSaved={load} />
      <SaveThemeDialog open={!!renaming} onClose={() => setRenaming(null)} shopId={shopId} rename={renaming} onSaved={load} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        onConfirm={() => void remove()}
        loading={busy}
        variant="danger"
        title={t(`ลบธีม “${deleting?.name ?? ""}”?`, `Delete theme “${deleting?.name ?? ""}”?`)}
        message={t("ร้านที่เคยใช้ธีมนี้ไปแล้วจะไม่เปลี่ยน (ค่าถูกคัดลอกไปแล้ว) — ลบแล้วธีมนี้จะหายจากรายการทุกร้าน", "Shops already using this theme won't change (values were copied) — it will disappear from the list for every shop")}
        confirmText={t("ลบธีม", "Delete theme")}
      />
    </div>
  );
}
