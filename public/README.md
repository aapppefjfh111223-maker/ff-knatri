# بطلة فري فاير — منصة البطولات

## التشغيل محليًا
```
npm install
npm start
```
الموقع يبدأ على `http://localhost:3000`

## النشر على VPS
1. حمّل المجلد كامل للسيرفر (عبر `scp` أو `git`).
2. `npm install --production`
3. استعمل `pm2` باش يخلي السيرفر شغال دائماً حتى بعد ما تسكر الترمينال:
   ```
   npm install -g pm2
   pm2 start server.js --name ff-arena
   pm2 save
   pm2 startup
   ```
4. حط Nginx كـ reverse proxy على البورت 3000 وفعّل SSL بـ Certbot باش يكون عندك دومين ب https.

## ملاحظات مهمة
- كود دخول الإدارة موجود في `server.js` (المتغير `ADMIN_CODE`). بدّلو قبل ما تنشر الموقع.
- البيانات تتخزن في `data/db.json` (ملف JSON بسيط). لعدد كبير من اللاعبين يستحسن الانتقال لقاعدة بيانات حقيقية (SQLite/Postgres) — نجم نعملها بعد إذا حبيت.
- صور "إثبات الفوز" تتخزن في مجلد `uploads/` — تأكد تعمل نسخة احتياطية دورية.
- بدّل `secret` متاع الجلسة (`session secret`) في `server.js` قبل النشر الحقيقي.
