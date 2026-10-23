"use client";

/**
 * WebsiteLayoutPanel — แท็บ "🧱 หน้าแรก" ในหน้า /website/<slug>
 *
 * ตัวจัดหน้า 3 แผง (components/website-builder.tsx): โครงหน้า · พรีวิวเว็บจริง · คุณสมบัติจาก Schema
 * ไฟล์นี้ดูแล "ข้อมูล": โหลด · ละทิ้ง · ประวัติเวอร์ชัน · ตรวจก่อนเผยแพร่
 * ร่าง/เผยแพร่/บันทึกอัตโนมัติ/ย้อน = ของกลาง useDraftPublish (components/website-draft-publish — ใช้ร่วมหน้าเว็บ + หน้าชุดมาใหม่)
 *
 * ข้อมูล: /api/website/layout · /api/website/layout/versions
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { WebsiteBuilder, type Selection, type ChangeSummary } from "@/components/website-builder";
import { useDraftPublish, summarizeChanges } from "@/components/website-draft-publish";
import type { Block, BlockTypeInfo } from "@/components/website-block-editor";
import { validateBlocks, type ValidationIssue } from "@/lib/website-blocks";
import { useShopPublishIssues, PublishCheckDialog } from "@/components/website-publish-check";
import { VersionHistoryDrawer } from "@/components/website-version-history";

export function WebsiteLayoutPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  /** 🃏 การ์ดสินค้าของร้าน — Section ตารางสินค้าปิด "ใช้การ์ดตามค่ากลาง" แล้วก๊อปเป็นค่าเริ่ม */
  const [themeCard, setThemeCard] = useState<Record<string, unknown> | undefined>(undefined);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null); // 🔑 รหัสพรีวิว (ผ่านหน้าปิดเว็บ)
  const [shopName, setShopName] = useState<string>("");
  const [neverSet, setNeverSet] = useState(false);

  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 🧰 ร่าง/เผยแพร่/บันทึกอัตโนมัติ/ย้อน = ของกลาง · ที่นี่บอกแค่ยิง API ยังไง
  const dp = useDraftPublish<Block>({
    autosave: autoSave,
    // เตือนก่อนปิดเบราว์เซอร์ตลอดที่ยังมีร่างไม่ได้เผยแพร่ (เหมือนเดิม)
    warnOnLeave: "unpublished",
    save: async (blocks, mode, { auto }) => {
      if (auto && !blocks.length) return { ok: false }; // ไม่บันทึกร่างเองตอนหน้าว่าง
      const r = await apiFetch("/api/website/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, blocks, mode }),
      });
      return r.json();
    },
    onSaved: (mode) => {
      if (mode === "publish") setNeverSet(false);
    },
  });
  const { reset } = dp;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/layout?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      reset(j.draft ?? j.published ?? [], j.published ?? [], Boolean(j.hasDraft));
      setTypes(j.blockTypes ?? []);
      setCategories(j.categories ?? []);
      setThemeCard(j.themeCard ?? undefined);
      setSiteUrl(j.shop?.siteUrl ?? null);
      setPreviewKey(j.shop?.previewKey ?? null);
      setShopName(j.shop?.name ?? "");
      setNeverSet(Boolean(j.neverSet));
    } catch {
      toast.error("โหลดโครงหน้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast, reset]);

  useEffect(() => {
    void load();
  }, [load]);

  // ✅ ตรวจก่อนเผยแพร่ = ปัญหาในหน้า (Section) + ข้อมูลสินค้าของร้าน (ไม่มีราคา/รูป/หมวด)
  const dataIssues = useShopPublishIssues(shopSlug);
  const issues: ValidationIssue[] = useMemo(() => [...validateBlocks(dp.blocks as never), ...dataIssues], [dp.blocks, dataIssues]);

  // สรุปว่าร่างต่างจากที่เผยแพร่ตรงไหน (ชื่อ Section อ่านออก) — โชว์ตอนกดป้าย "ยังไม่เผยแพร่"
  const changes: ChangeSummary = useMemo(() => summarizeChanges(dp.blocks, dp.published, types), [dp.blocks, dp.published, types]);

  const discard = async () => {
    if (!(await askConfirm({ title: "ละทิ้งการเปลี่ยนแปลงทั้งหมด?", message: "ร่างหน้าแรกจะหาย กลับไปใช้หน้าที่เผยแพร่อยู่", variant: "danger", confirmText: "ละทิ้ง" }))) return;
    try {
      await apiFetch(`/api/website/layout?shopId=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await load();
    toast.info("ละทิ้งการเปลี่ยนแปลงแล้ว");
  };

  const previewSrc = siteUrl ? withPreviewKey(`${siteUrl}/?preview=1`, previewKey) : null;
  const ctx = useMemo(() => ({ shopSlug, shopId, shopName, categories, themeCard }), [shopSlug, shopId, shopName, categories, themeCard]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
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
          ...dp.toolbar,
          statusNote: `${dp.blocks.length} Section · เปิดใช้ ${dp.blocks.filter((b) => b.enabled).length}${neverSet ? " · ยังไม่เคยจัดหน้า (โครงเริ่มต้น)" : ""}`,
          saving: dp.autosaving || dp.busy === "draft",
          issues,
          changes,
          autoSave,
          onAutoSave: setAutoSave,
          onHistory: () => setShowVersions(true),
          onDiscard: () => void discard(),
        }}
      />

      <PublishCheckDialog
        open={dp.checkOpen}
        onClose={dp.closeCheck}
        onConfirm={() => void dp.publish()}
        issues={issues}
        what="หน้าแรก"
        busy={dp.busy === "publish"}
        onGoBlock={(id) => setSelection({ blockId: id })}
      />

      {/* ประวัติเวอร์ชัน */}
      <VersionHistoryDrawer<Block>
        open={showVersions}
        onClose={() => setShowVersions(false)}
        what="หน้าแรก"
        listUrl={`/api/website/layout/versions?shop=${encodeURIComponent(shopSlug)}`}
        restoreUrl="/api/website/layout/versions"
        restoreBody={(versionNo) => ({ shopId, versionNo })}
        onRestored={dp.restored}
      />
    </div>
  );
}
