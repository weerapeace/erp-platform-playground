"use client";

/** ประวัติการเผยแพร่ — กู้คืนเวอร์ชันเป็นร่าง (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { timeAgo } from "./shared";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";

export function HistoryTab() {
  const { versions, restore } = useDesign();
  return (
    <DesignCard title="ประวัติการเผยแพร่" summary={versions.length ? `${versions.length} เวอร์ชัน — กดกู้คืนเป็นร่างได้` : "ยังไม่มีประวัติ"}>
      {!versions.length ? (
        <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติ — จะบันทึกทุกครั้งที่กดเผยแพร่</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {versions.map((v) => (
            <li key={v.versionNo} className="flex items-center gap-3 py-2.5">
              <span className="text-xs text-slate-400 w-10">#{v.versionNo}</span>
              <span className="flex gap-1">
                {[v.theme.colors.brand, v.theme.colors.ink, v.theme.colors.page].map((c, i) => (
                  <span key={i} style={{ background: c, width: 14, height: 14, borderRadius: 4, border: "1px solid rgba(0,0,0,.1)" }} />
                ))}
              </span>
              <span className="flex-1 text-xs text-slate-600">
                {v.theme.fonts.display} / {v.theme.fonts.body} · {timeAgo(v.createdAt)}
              </span>
              <button onClick={() => void restore(v.versionNo)} className="text-xs text-blue-600 hover:underline">กู้คืนเป็นร่าง</button>
            </li>
          ))}
        </ul>
      )}
    </DesignCard>
  );
}
