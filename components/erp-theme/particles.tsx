"use client";
/**
 * ThemeParticles (ของกลาง · ธีมกลาง รอบ 4) — อนุภาคตกแต่ง หิมะ / ดาว / ฟอง / ซากุระ
 *   CSS ล้วน ตำแหน่งคงที่ตามลำดับ (ไม่สุ่มทุกครั้ง) · กดทะลุได้ · เคารพ "ลดการเคลื่อนไหว" ของเครื่อง
 *   fixed = เต็มจอหลังเนื้อหา (หน้าจริง · ThemeApplier) · ไม่ fixed = เต็มกล่องแม่ (พรีวิว)
 */
const CSS = `
@keyframes tmptFall{from{transform:translateY(-12px) rotate(0)}to{transform:translateY(var(--tmpt-fall)) rotate(260deg)}}
@keyframes tmptRise{from{transform:translateY(0);opacity:0}15%{opacity:.8}to{transform:translateY(calc(var(--tmpt-fall) * -1));opacity:0}}
@keyframes tmptTwinkle{0%,100%{opacity:.15;transform:rotate(45deg) scale(.6)}50%{opacity:1;transform:rotate(45deg) scale(1)}}
@media (prefers-reduced-motion: reduce){.tmpt-root *{animation:none!important;opacity:.4}}
@media print{.tmpt-root{display:none!important}}
`;

export function ThemeParticles({ kind, color, speed = 1, fixed = false, count }: {
  kind: "snow" | "stars" | "bubbles" | "sakura"; color: string; speed?: number; fixed?: boolean; count?: number;
}) {
  const n = count ?? (kind === "stars" ? (fixed ? 22 : 14) : fixed ? 18 : 12);
  const fall = fixed ? "105vh" : "520px";
  return (
    <div aria-hidden className="tmpt-root" style={{ position: fixed ? "fixed" : "absolute", inset: 0, zIndex: fixed ? 0 : 2, pointerEvents: "none", overflow: "hidden", ["--tmpt-fall" as string]: fall }}>
      <style>{CSS}</style>
      {Array.from({ length: n }, (_, i) => {
        const left = (i * 37 + 11) % 100, size = (fixed ? 5 : 4) + ((i * 7) % 6), dur = (fixed ? 10 : 6) + ((i * 13) % 7), del = -((i * 1.7) % 9);
        const d = dur * speed;
        const base: React.CSSProperties = { position: "absolute", left: `${left}%`, top: 0, width: size, height: size };
        if (kind === "snow") return <span key={i} style={{ ...base, borderRadius: 99, background: "#fff", boxShadow: "0 0 3px rgba(148,163,184,.8)", animation: `tmptFall ${d}s linear ${del}s infinite` }} />;
        if (kind === "sakura") return <span key={i} style={{ ...base, width: size + 3, height: size + 1, borderRadius: "0 100% 0 100%", background: "#f9a8d4", opacity: 0.85, animation: `tmptFall ${d * 1.2}s linear ${del}s infinite` }} />;
        if (kind === "bubbles") return <span key={i} style={{ ...base, top: "auto", bottom: -12, width: size + 4, height: size + 4, borderRadius: 99, border: `1.5px solid ${color}`, background: "rgba(255,255,255,.25)", animation: `tmptRise ${d}s ease-in ${del}s infinite` }} />;
        return <span key={i} style={{ ...base, top: `${(i * 29) % 92}%`, width: size - 1, height: size - 1, background: "#fde68a", borderRadius: 1, animation: `tmptTwinkle ${2 + (i % 3)}s ease-in-out ${del / 3}s infinite` }} />;
      })}
    </div>
  );
}
