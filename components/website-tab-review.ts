"use client";

/**
 * 👷 แท็บหน้าแรก / หน้าเว็บ สำหรับพนักงานที่ติ๊กหัวข้อแท็บ (lib/website-access DESIGN_TAB_TOPICS) — ของกลางของ layout panel + pages panel
 *   เผยแพร่เองไม่ได้ → ปุ่มเผยแพร่กลายเป็น "ส่งให้หัวหน้าตรวจ" (บันทึกร่างก่อน แล้วยิงกระดิ่ง /api/website/theme/review แบบ area)
 *   ไม่ใช่แก้ได้ทั้งหมด → ซ่อน ละทิ้งร่าง / ประวัติเวอร์ชัน (ร่างมีงานคนอื่นด้วย · กู้เวอร์ชัน = แก้ได้ทั้งหมดเท่านั้น) · ฝั่งเซิร์ฟเวอร์บังคับซ้ำ (guardDesignTab)
 */
import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth, type Permission } from "@/components/auth";
import { designAccess, type DesignTabTopic } from "@/lib/website-access";

export function useDesignTabAccess(tab: DesignTabTopic, shopId: string) {
  const toast = useToast();
  const { can, permsReady, user: me } = useAuth();
  // ยังโหลดสิทธิ์ไม่เสร็จ = ถือว่าได้ทั้งหมด (เหมือนหน้าดีไซน์) — เซิร์ฟเวอร์ตรวจจริงตอนบันทึก
  const knowPerms = permsReady || me?.role === "admin";
  const access = useMemo(() => designAccess((k) => !knowPerms || can(k as Permission)), [knowPerms, can]);
  const [reviewing, setReviewing] = useState(false);

  /** บันทึกร่างก่อน (saveDraft) แล้วส่งกระดิ่งถึงหัวหน้า · label = ชื่อหน้าเว็บที่แก้ */
  const requestReview = useCallback(
    async (saveDraft: () => Promise<boolean>, label?: string) => {
      if (!(await saveDraft())) return;
      const note = window.prompt(`ส่ง${label ? ` “${label}”` : "หน้าแรก"} ให้หัวหน้าตรวจ\nฝากข้อความถึงหัวหน้า (ไม่ใส่ก็ได้)`, "");
      if (note === null) return;
      setReviewing(true);
      try {
        const j = await apiFetch("/api/website/theme/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, area: tab, label, note }),
        }).then((r) => r.json());
        if (!j.ok) toast.error(j.error ?? "ส่งไม่สำเร็จ");
        else toast.success(j.sent ? `ส่งให้หัวหน้าแล้ว (${j.sent} คน) — รอหัวหน้าเผยแพร่` : "บันทึกคำขอแล้ว แต่ยังไม่มีหัวหน้าที่เข้าร้านนี้ได้ — แจ้งผู้ดูแลระบบ");
      } catch {
        toast.error("เชื่อมต่อไม่ได้");
      } finally {
        setReviewing(false);
      }
    },
    [shopId, tab, toast]
  );

  return { full: access.full, canPublish: access.publish, reviewing, requestReview };
}
