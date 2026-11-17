"use client";

/**
 * 🧱 จัดหน้าของชุดมาใหม่ (/new/<ชุด>) — เปิดจากแท็บ 🆕 มาใหม่ (ปุ่ม "จัดหน้าชุดนี้")
 * ตัวจัดหน้า 3 แผงตัวเดียวกับแท็บ "หน้าเว็บ" (components/website-builder): โครงหน้า · พรีวิวเว็บจริง (/new/<ชุด>?preview=1) · ตั้งค่า Section
 * ยังไม่เคยจัด = เริ่มจากโครงตั้งต้น (Section 🆕 ชุดมาใหม่) · บันทึกร่างเองหลังหยุดแก้ 1.5 วิ · เผยแพร่ = เว็บจริงเปลี่ยน
 * "กลับไปใช้หน้าตาเดิม" = ล้างหน้าที่จัด (เว็บวาดแบบเดิม: แบนเนอร์ + สินค้า / นับถอยหลัง)
 * ข้อมูล: /api/website/new-drops/page (lib/website-drop-page)
 * ร่าง/เผยแพร่/บันทึกอัตโนมัติ/ย้อน = ของกลาง useDraftPublish (components/website-draft-publish)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ConfirmDialog } from "@/components/modal";
import { askLeaveUnsaved } from "@/components/modal/ask-dialog";
import { WebsiteBuilder, type Selection } from "@/components/website-builder";
import { useDraftPublish, summarizeChanges } from "@/components/website-draft-publish";
import type { Block, BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks } from "@/lib/website-blocks";
import { useShopPublishIssues, PublishCheckDialog } from "@/components/website-publish-check";

export function DropPageBuilder({ shopSlug, shopId, dropId, onClose }: { shopSlug: string; shopId: string; dropId: string; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null); // 🔑 รหัสพรีวิว (ผ่านหน้าปิดเว็บ)
  const [shopName, setShopName] = useState("");
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [themeCard, setThemeCard] = useState<Record<string, unknown> | undefined>(undefined);
  /** เคยเผยแพร่หน้าที่จัดแล้ว (false = เว็บยังใช้หน้าตาเดิม) */
  const [custom, setCustom] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [askReset, setAskReset] = useState(false);
  const [changed, setChanged] = useState(false);
  const dataIssues = useShopPublishIssues(shopSlug);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 🧰 ร่าง/เผยแพร่/บันทึกอัตโนมัติ/ย้อน = ของกลาง · ที่นี่บอกแค่ยิง API ยังไง
  const dp = useDraftPublish<Block>({
    active: !loading,
    what: t("หน้าชุดนี้", "this drop page"),
    save: async (blocks, mode) => {
      const r = await apiFetch("/api/website/new-drops/page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dropId, blocks, mode }),
      });
      return r.json();
    },
    onSaved: (mode) => {
      setChanged(true);
      if (mode === "publish") setCustom(true);
    },
  });
  const { reset: resetDraft } = dp;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/new-drops/page?shop=${encodeURIComponent(shopSlug)}&id=${encodeURIComponent(dropId)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        onClose(false);
        return;
      }
      const d = j.drop;
      const initial: Block[] = d.draft ?? d.published ?? [];
      setTitle(d.title ?? "");
      setSiteUrl(j.shop?.siteUrl ?? null);
      setPreviewKey(j.shop?.previewKey ?? null);
      setShopName(j.shop?.name ?? "");
      setTypes(j.blockTypes ?? []);
      setCategories(j.categories ?? []);
      setThemeCard(j.themeCard);
      // ยังไม่จัด = โครงตั้งต้น (ไม่นับว่าแก้ · ไม่บันทึกร่างเองจนกว่าจะแก้จริง — เว็บพรีวิววาดโครงเดียวกันเอง)
      resetDraft(initial, d.custom ? d.published : [], Boolean(d.hasDraft));
      setCustom(Boolean(d.custom));
    } catch {
      toast.error(tr("เปิดหน้าชุดไม่สำเร็จ", "Could not open the drop page"));
      onClose(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSlug, dropId]);
  useEffect(() => {
    void load();
  }, [load]);

  const reset = async () => {
    setAskReset(false);
    try {
      const r = await apiFetch(`/api/website/new-drops/page?id=${encodeURIComponent(dropId)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? t("ทำไม่สำเร็จ", "Failed"));
        return;
      }
      toast.success(t("กลับไปใช้หน้าตาเดิมแล้ว", "Reverted to the original layout"));
      setChanged(true);
      await load();
      dp.bumpPreview();
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Connection failed"));
    }
  };

  const ctx = useMemo(() => ({ shopSlug, shopId, shopName, categories, themeCard, dropId }), [shopSlug, shopId, shopName, categories, themeCard, dropId]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">{t("กำลังเปิดหน้าชุด…", "Opening drop page…")}</div>;

  const previewSrc = siteUrl ? withPreviewKey(`${siteUrl}/new/${encodeURIComponent(dropId)}?preview=1`, previewKey) : null;
  const issues = [...validateBlocks(dp.blocks as never), ...dataIssues];
  const unpublished = !custom || dp.unpublished;
  return (
    <div className="space-y-3">
      {!custom && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          🧱 {t("ชุดนี้ยังใช้หน้าตาเดิม — เริ่มจากโครงตั้งต้น (Section 🆕 ชุดมาใหม่) แล้วเพิ่ม Section อื่นได้เลย · กด \"เผยแพร่หน้าชุดนี้\" เมื่อพร้อม (ก่อนนั้นลูกค้ายังเห็นหน้าเดิม)", "This drop still uses the original layout — start from the default (🆕 New drop section) and add other sections · press \"Publish this drop page\" when ready (until then customers see the old page)")}
        </p>
      )}
      <WebsiteBuilder
        blocks={dp.blocks}
        onChange={dp.apply}
        types={types}
        ctx={ctx}
        previewSrc={previewSrc}
        iframeRef={iframeRef}
        selection={selection}
        onSelect={setSelection}
        previewVersion={dp.previewVersion}
        toolbar={{
          leading: (
            <>
              <button
                onClick={async () => {
                  if (dp.dirty && !(await askLeaveUnsaved())) return;
                  onClose(changed);
                }}
                className="text-xs text-slate-500 hover:text-blue-600 mr-1"
                title={t("กลับไปรายการชุดมาใหม่", "Back to new drops list")}
              >
                ← {t("ชุดทั้งหมด", "All drops")}
              </button>
              <span className="text-sm font-medium text-slate-800 truncate max-w-[180px]" title={`/new/${dropId}`}>
                🆕 {title}
              </span>
              {(custom || dp.hasDraft) && (
                <button onClick={() => setAskReset(true)} className="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:border-red-300 hover:text-red-600" title={t("ล้างหน้าที่จัดไว้ กลับไปใช้หน้าตาเดิม", "Clear the custom layout and revert to the original")}>
                  ↺ {t("หน้าตาเดิม", "Original layout")}
                </button>
              )}
            </>
          ),
          ...dp.toolbar,
          dirty: unpublished,
          statusNote: `${dp.blocks.length} Section`,
          saving: dp.busy === "draft",
          issues,
          changes: summarizeChanges(dp.blocks, dp.published, types),
          publishLabel: t("เผยแพร่หน้าชุดนี้", "Publish this drop page"),
        }}
      />
      <PublishCheckDialog
        open={dp.checkOpen}
        onClose={dp.closeCheck}
        onConfirm={() => void dp.publish()}
        issues={issues}
        what={t(` หน้าชุด "${title}"`, ` drop page "${title}"`)}
        busy={dp.busy === "publish"}
        onGoBlock={(id) => setSelection({ blockId: id })}
      />
      <ConfirmDialog
        open={askReset}
        onClose={() => setAskReset(false)}
        onConfirm={() => void reset()}
        title={t("กลับไปใช้หน้าตาเดิม?", "Revert to the original layout?")}
        message={t("ล้าง Section ที่จัดไว้ทั้งที่เผยแพร่และร่าง — หน้า /new/<ชุด> กลับเป็นแบบเดิม (แบนเนอร์ชุด + สินค้า / นับถอยหลัง) · ตัวชุดและสินค้าในชุดไม่หาย", "Clears all sections, both published and draft — the /new/<drop> page goes back to the original (drop banner + products / countdown) · the drop and its products are kept")}
        confirmText={t("กลับไปหน้าตาเดิม", "Revert")}
        variant="danger"
      />
    </div>
  );
}
