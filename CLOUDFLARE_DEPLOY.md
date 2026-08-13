# Deploy student-os.com to Cloudflare Workers

## 1. Authenticate

```bash
npx wrangler login
```

## 2. Configure production secrets

Use the rotated Supabase secret key and the exact existing `DATA_ENCRYPTION_KEY` from the local `.env` file:

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put DATA_ENCRYPTION_KEY
```

Never commit either value. Losing or changing `DATA_ENCRYPTION_KEY` makes existing encrypted records unreadable.

## 3. Deploy

```bash
npm run deploy:cloudflare
```

## 4. Attach the domain

In Cloudflare, open **Workers & Pages → student-os → Settings → Domains & Routes**, select **Add → Custom domain**, and enter `student-os.com`.

If `www.student-os.com` should also work, add it as a second custom domain and configure a redirect to the preferred hostname.
