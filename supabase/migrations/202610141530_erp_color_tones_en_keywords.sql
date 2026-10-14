-- 🎨 โทนสีตั้งต้น: เพิ่มคำภาษาอังกฤษ (ร้านที่ตั้งชื่อสีเป็นอังกฤษ เช่น Pixiedustie "Hot Pink (02)" · "Midnight Black")
-- คำอังกฤษจับแบบ "คำเต็มอยู่ตรงไหนก็ได้ · คำท้ายสุดชนะ" (lib/color-tone.ts) · เพิ่มเฉพาะคำที่ยังไม่มี ไม่ทับที่เจ้าของแก้ไว้
update public.erp_color_tones t
set keywords = (select array(select distinct unnest(t.keywords || v.kw))), updated_at = now()
from (values
  ('black',  array['black','ebony','onyx']),
  ('white',  array['white','cream','ivory','vanilla','milky','beige','snow']),
  ('grey',   array['grey','gray','silver','sliver','charcoal','ash']),
  ('brown',  array['brown','mocha','bronze','hazel','coffee','caramel','tan','chocolate','camel','มอคค่า']),
  ('red',    array['red','cherry','strawberry','wine','burgundy','maroon','scarlet']),
  ('pink',   array['pink','pinky','rose','rosy','rosey','blossom','bubblegum','peach','coral','blush','พิงค์','พีช']),
  ('orange', array['orange','yellow','mustard','gold','golden','honey','hunny','sunny','lemon']),
  ('green',  array['green','mint','minty','olive','sage','emerald','มิ้นท์']),
  ('blue',   array['blue','sky','denim','aqua','butterblue','teal','turquoise','cobalt']),
  ('navy',   array['navy']),
  ('purple', array['purple','lilac','lavender','amethyst','plum','violet','ลาเวนเดอร์']),
  ('pattern',array['leopard','zebra','camo','plaid','stripe','dot'])
) as v(key, kw)
where t.key = v.key;
