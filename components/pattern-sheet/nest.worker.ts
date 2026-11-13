/**
 * 🧩 ตัวทำงานเบื้องหลังของ "วางตามรูปจริง" (Bag CAD รอบ I2) — คำนวณใน Web Worker หน้าจอไม่ค้าง · ยกเลิก = terminate()
 *   รับ { items, opts } → ส่ง { type: "progress", done, total } ระหว่างทาง แล้ว { type: "done", result }
 *   สูตร: lib/pattern-nest (nestShapes) · ใช้ที่: components/pattern-sheet/nest-panel.tsx
 */
import { nestShapes, type NestItem, type NestOpts } from "@/lib/pattern-nest";

type Out = { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<{ items: NestItem[]; opts: NestOpts }>) => void) | null };
const ctx = self as unknown as Out;
ctx.onmessage = (e) => {
  let last = 0;
  try {
    const result = nestShapes(e.data.items, e.data.opts, (done, total) => {
      const now = Date.now();
      if (now - last > 120 || done === total) { last = now; ctx.postMessage({ type: "progress", done, total }); }
    });
    ctx.postMessage({ type: "done", result });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
