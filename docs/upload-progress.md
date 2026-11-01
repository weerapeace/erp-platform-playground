# UploadProgress — แถบ "กำลังอัปโหลด" กลาง

> ให้ผู้ใช้เห็นว่าไฟล์กำลังส่งอยู่ ไม่ใช่ค้าง · โค้ด: `components/upload-progress/index.tsx`

## ใช้ทำอะไร

ระหว่างส่งไฟล์ โชว์ในช่องอัปเลย (ไม่ใช่ป๊อปคลุมจอ):

- ตัวหมุน + **ชื่อไฟล์ · ขนาด**
- แถบ % (รู้ %) — ครบ 100 แล้วขึ้น "กำลังบันทึก…" (รอที่เก็บไฟล์ตอบ)
- แถบกระพริบ + "รอสักครู่…" (ไม่รู้ % เช่น ทางส่งผ่านเว็บ `/api/admin/upload`)
- ปุ่ม "ยกเลิก" (ส่ง `onCancel` · โชว์เฉพาะตอนรู้ % และยังไม่ครบ)

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่

- ✅ ช่องอัปไฟล์/รูปทุกแบบ ระหว่างส่งไฟล์
- ❌ งานยาวที่ต้องกันกดหนีทั้งจอ → ใช้ `LoadingOverlay` (`components/spinner`)
- ❌ ปุ่มทั่วไปที่รอสั้น ๆ → `Spinner` ในปุ่ม

## ตัวอย่าง

```tsx
const [up, setUp] = useState<UploadProgressState | null>(null);
const handle = useRef<FileUploadHandle | null>(null);

setUp({ name: file.name, size: file.size, pct: null });
try {
  const ref = await uploadFileByRule({
    category, file, r2Folder,
    onProgress: (pct) => setUp((u) => u && { ...u, pct }),
    onStart: (h) => { handle.current = h; },
  });
} catch (e) {
  if (!(e instanceof FileUploadError && e.aborted)) showError(e); // กดยกเลิกเอง = ไม่ใช่ข้อผิดพลาด
} finally { setUp(null); }

{up && <UploadProgress {...up} onCancel={() => handle.current?.abort()} />}
```

## ตัวส่งไฟล์ที่ให้ % ได้

| ตัวส่ง | ได้ % เมื่อ |
|---|---|
| `uploadFileByRule` (`lib/file-upload`) | กฎ = Supabase (ส่งตรงเข้าลิงก์อัปชั่วคราวด้วย XHR) · กฎ = R2 ไม่ได้ % |
| `uploadMediaFile` (`lib/media-upload`) | ไฟล์ > 4 MB (ส่งตรงเข้า R2) |
| `uploadImagesWithDupCheck` (`components/duplicate-upload`) | `onProgress(state)` ส่ง state พร้อมโชว์มาเลย: ขั้น **ย่อรูป → ตรวจรูปซ้ำ → อัปโหลด** + "รูป 2/5" · % = จำนวนรูปที่เสร็จ (ไฟล์เดียว = แถบกระพริบ) |

อัปรูปหลายรูปเองทีละขั้น (เช่น ใช้ `askDuplicateUploads` ตรง) → `imageStepProgress(step, file, current, total)` สร้าง state ให้ (ดู `ImageAttach`)

```tsx
const r = await uploadImagesWithDupCheck(files, { folder, max: 2000, onProgress: setUp });
setUp(null);
```

## ที่ใช้แล้ว

- `FileInput` (ไฟล์แนบ/บิลซัพพลายเออร์ · 7 ช่อง) — ทั้งตอนแนบใหม่ และตอนกด "เปลี่ยน" (คลุมรูปเดิมไว้จนเสร็จ)
- `ImageAttach` / `ImageAttachKeys` (กล่องแนบรูปของงาน/บรีฟ/คอนเทนต์) — แทน "⏳ กำลังอัปโหลด..."
- หน้าขายบนเว็บของรุ่น (`parent-web-listings`): **แถวสี "SKU ในรุ่นนี้"** และ **"รูปบนเว็บ"** — แถบขึ้นในแถวที่กำลังอัป (ทั้งกดปุ่มอัปโหลด และลากรูปมาวาง)

## ข้อจำกัด

- `MediaUploadField` (Hero/วิดีโอ) ยังใช้แถบ % ของตัวเอง · ช่องอัปรูปอื่นที่เรียก `uploadImagesWithDupCheck` (ไอคอนแอป, โลโก้, ตราประทับ ฯลฯ) ยังไม่ได้ส่ง `onProgress` — รูปเดียวเล็ก เสร็จเร็ว · ค่อยใส่ทีละช่อง (ส่ง `onProgress` + วาง `<UploadProgress>`)
- ทางส่งผ่านเว็บ (`apiFetch`) ไม่มี % ต่อไฟล์ → แถบกระพริบ (ไฟล์เดียว) หรือ % ตามจำนวนรูป (หลายรูป)
