<<<<<<< HEAD
# Campus Fit Finder

An independent student-guidance prototype for the NxtWave / NIAT growth challenge. It is not an official NIAT product and does not make admissions, placement, or eligibility promises.

## What's included

- React + Vite responsive student experience.
- Six-step assessment with UTM source capture.
- Personalized decision report with a **real server-side Gemini API integration** when `GEMINI_API_KEY` is configured; clearly labeled rules-based fallback otherwise.
- Six language selector options: English, Hindi, Kannada, Tamil, Telugu, Malayalam. Core navigation and assessment strings are translated; the generated report asks Gemini to answer in the selected language.
- Optional consent-based contact form.
- Supabase server-side persistence for consented leads and growth events.
- n8n webhook call on explicit consent only.
- Honest integration health panel and demo-only dashboard labels.
- Official-source links for independent verification.

## Requirements

Node.js 20+ recommended.

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend: Vite local URL (usually http://localhost:5173)
API: http://localhost:8787

## Gemini (real AI)

1. Get an API key from Google AI Studio.
2. Put it in `.env` as `GEMINI_API_KEY=...`.
3. Restart the server.
4. Complete the assessment and check the report badge says **Live AI**.
5. Inspect server logs if it falls back to Demo mode.

The key must stay server-side; never add it to a `VITE_` variable or commit `.env`.

## Supabase (persistent database)

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in server environment variables.
4. Restart and open Growth dashboard → Check connections.
5. Submit a consented test lead and verify the row in `consented_leads`; verify events in `growth_events`.

The service-role key bypasses RLS and must only be used server-side. This starter intentionally does not expose lead PII on a public dashboard. Add real admin authentication and server-side authorization before building a private lead-management page.

## n8n automation (actual workflow)

1. Create an n8n workflow with a **Webhook** trigger using POST.
2. Add a test node, e.g. Edit Fields or a notification step to your own test destination. Do not send unsolicited outreach.
3. Activate the workflow and copy its production webhook URL.
4. Set `N8N_WEBHOOK_URL` on the server and restart.
5. Submit a lead with the consent box checked.
6. Confirm the n8n execution appears in the workflow history. The app reports `sent`, `failed`, or `demo_not_sent` based on the HTTP result.

Never put the webhook URL in frontend code. Test only with your own details until privacy and outreach handling are approved.

## Deploy

You can deploy the frontend to Vercel, but **the Express API also needs a compatible server host** (or it must be adapted into Vercel serverless functions). The simplest beginner-friendly path is to deploy the full Node app to a host that supports persistent Node processes, set the three server secrets there, and use its public HTTPS URL. If using separate frontend/API hosts, configure Vite's API base URL and CORS origin allowlist; do not leave broad CORS enabled in production.

A published URL is not included in this source archive. You must deploy it to create one.

## Before submission checklist

- [ ] App builds: `npm run build`
- [ ] Live AI: run an assessment with `GEMINI_API_KEY` set and verify report badge says Live AI
- [ ] Database: consented test lead is saved and real events appear in Supabase
- [ ] Automation: consented test lead creates a successful n8n execution
- [ ] Multilingual: test all six languages and inspect key form labels / report language
- [ ] Public deployment works in a fresh/incognito browser
- [ ] Record a Loom <= 3 minutes: start assessment → generate live report → opt-in test lead → show database row and n8n execution → show dashboard/health panel
- [ ] Do not claim metrics are real if using seeded/demo values.

## Data protection notes

This is a challenge starter, not a security audit. Add rate limiting, stronger contact validation, privacy notice, retention/deletion process, admin authentication, and production CORS restrictions before collecting real student data at scale. Avoid collecting personal data from minors unless you have the appropriate consent and safeguards.
=======
# campus-fit-finder
this is for the students who want to find there college according to there needs so this platform help to student find the college now this is a prototype and it generate the report using the ai
>>>>>>> f84ad32c8bfd6fefdbeaac5fa11b54b3c0880ea4
