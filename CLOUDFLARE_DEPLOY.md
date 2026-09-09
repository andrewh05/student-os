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

## Groq students-by-kazaa report

Create a Groq API key at https://console.groq.com/keys, then configure it securely:

```bash
npx wrangler secret put GROQ_API_KEY
```

For local development, set `GROQ_API_KEY` in `.env`. The key stays server-side.
The report selects an available Groq model (Llama 3.3, GPT-OSS 120B/20B, or Llama 3.1)
to suggest districts from origin text;
no student names, notes or other profile fields are sent to Groq. Districts and
manual corrections are saved encrypted in Supabase under `students.kazaa`.
Run `supabase_kazaa_migration.sql` in the Supabase SQL Editor once before saving assignments.

References: https://console.groq.com/docs/structured-outputs and
https://www.dglac.gov.lb/en/municipalities (district labels; Beirut shown separately).
