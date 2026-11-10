# กัน build บน Vercel "memory หมด" (Build Memory)

> สรุปสั้น: เครื่อง build ของ Vercel มี RAM 8 GB · ตั้งแต่ 2026-11-10 เราตั้งค่า 3 อย่างเพื่อให้ build ใช้ RAM ไม่เกิน ~4–5 GB

## อาการที่เคยเจอ

push แล้วเว็บไม่อัปเดต · Vercel แจ้ง `Next.js build worker exited with code: null and signal: SIGKILL`
และ `Out of Memory event detected` ตอน "Creating an optimized production build" (ล้ม 7 ครั้งช่วง 1–10 พ.ย. 2026)

## ต้นเหตุ (วัดจริงในเครื่อง)

| ต้นเหตุ | ผล |
|---|---|
| เพดาน memory ของ Node ตั้งไว้ 8192 MB = RAM ทั้งเครื่อง | Node ไม่ยอมเก็บขยะจนเครื่องเต็ม → peak 7.6 GB |
| แคช webpack บนดิสก์ใหญ่ 2–3.5 GB | โหลด/เขียนแคชกิน RAM เพิ่ม ~1.5 GB |
| ไลบรารีที่ใช้แค่ในเบราว์เซอร์ (ตัวออกแบบ PDF, กระดานวาด) ถูก build ฝั่งเซิร์ฟเวอร์ด้วย | ฝั่งเซิร์ฟเวอร์ต้องคอมไพล์ไฟล์เกินมา 52 % |

## สิ่งที่ตั้งไว้

1. `package.json` → `build`: `--max-old-space-size=5120` (งานจริงใช้ 3–4 GB · ตั้ง 3072 แล้วไม่พอ)
2. `next.config.ts` → `webpack()`: build จริงใช้แคชในหน่วยความจำเท่านั้น (`config.cache = { type: "memory" }`)
   + `scripts/clear-webpack-cache.mjs` (รันใน `prebuild`) ลบแคชเก่าที่ Vercel กู้คืนมา
3. `next.config.ts` → `BROWSER_ONLY_LIBS`: ฝั่งเซิร์ฟเวอร์ได้ "โมดูลว่าง" แทนไลบรารีพวกนี้
4. `experimental.webpackBuildWorker: true` — **ต้องมี** เพราะพอมี `webpack()` แล้ว Next จะปิด build worker เอง (กิน memory กว่าเดิม)

ผลวัด (เครื่อง dev, build แบบไม่มีแคช): ตัวคอมไพล์ฝั่งเซิร์ฟเวอร์ peak **7.6 GB → 4.2 GB** · เวลาคอมไพล์ฝั่งเซิร์ฟเวอร์ 77 → 48 วินาที

## กฎเมื่อเพิ่มไลบรารีหนัก ๆ ที่ใช้แค่ในเบราว์เซอร์

- โหลดด้วย `await import("…")` ใน `useEffect` / ตอนกดปุ่ม หรือ `next/dynamic(..., { ssr: false })` เท่านั้น
- เพิ่มชื่อเข้า `BROWSER_ONLY_LIBS` ใน `next.config.ts`
- ห้าม `import X from "…"` ตรง ๆ (ใช้ `import type` ได้) · ห้ามใช้ในโค้ดฝั่งเซิร์ฟเวอร์ / API
- ไลบรารีแบบ asm.js / wasm ขนาดใหญ่ → วางใน `public/vendor/` แล้วโหลดด้วย `<script>` (แบบ heic2any, three.js)
- เทสต์ `lib/__tests__/browser-only-libs.test.ts` จะล้มถ้าใช้ผิดวิธี

**ถ้าวันหนึ่งต้องใช้ไลบรารีในรายการฝั่งเซิร์ฟเวอร์จริง** (เช่นสร้าง PDF ใน API ด้วย `@pdfme/generator`) → เอาชื่อออกจาก `BROWSER_ONLY_LIBS` ก่อน ไม่งั้นฝั่งเซิร์ฟเวอร์จะได้ของว่าง

## ถ้าวันหน้ากลับมาล้มอีก

- log แจ้ง `JavaScript heap out of memory` = เพดาน 5120 ไม่พอแล้ว → ขยับเป็น 6144 (ระวังเกินเครื่อง 8 GB)
- log แจ้ง `SIGKILL` / `Out of Memory event` = เครื่องเต็ม → หาไลบรารีเบราว์เซอร์ตัวใหม่ที่หลุดเข้าฝั่งเซิร์ฟเวอร์ หรือพิจารณา Enhanced Builds (เครื่อง 16 GB · เสียเงินเพิ่ม · เจ้าของต้องตัดสินใจ)
- ดู log: `npx vercel inspect <deployment-url> --logs --scope weerapeace-3572s-projects`
