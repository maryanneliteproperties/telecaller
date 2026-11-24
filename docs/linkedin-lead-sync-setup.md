# LinkedIn → Telecaller lead sync setup

This integration keeps both Supabase databases separate.

## 1. Telecaller database migration

In the Telecaller Supabase project, open SQL Editor and run:

`database/linkedin-assigned-leads.sql`

This creates `public.linkedin_assigned_leads`. It does not change the existing `telecaller_data` call/audio workflow.

## 2. Configure Vercel environment variables

Set the same strong random secret (at least 32 random bytes) in both projects:

### Telecaller Vercel project
- `LINKEDIN_LEAD_SYNC_SECRET` = shared secret value

### LinkedIn Data Scraping Vercel project
- `TELECALLER_LEAD_SYNC_URL` = `https://telecaller-76rg.vercel.app/api/integrations/linkedin-leads`
- `TELECALLER_LEAD_SYNC_SECRET` = the exact same shared secret value

Add variables for Production (and Preview only if testing preview deployments), then redeploy both projects. Never put this secret in frontend/VITE variables or commit it to Git.

## 3. Employee mapping and call association

LinkedIn sends the target Employee email. Telecaller resolves it against `profiles.email` and confirms the account has the `employee` role before saving.

The first six identity/assignment columns come from the LinkedIn profile and assignment. The seven Telecaller columns are populated from the linked call record when available.

When an Employee submits a Telecaller call with a phone number matching exactly one unlinked LinkedIn lead assigned to that Employee, the call is linked automatically. Ambiguous or non-matching phone numbers are intentionally not auto-linked.

## 4. Verification

1. Run the SQL migration before enabling the Vercel integration.
2. Confirm the Employee email is identical in both apps.
3. Assign one LinkedIn profile to that Employee.
4. Open Telecaller → Leads → Assign from LinkedIn.
5. Submit a Telecaller call using that lead's phone number. Audio, score, report and summary appear after the call processing completes.

If a sync request fails, LinkedIn assignment itself remains saved; the API response reports the failed sync. Do not expose or share the shared secret in screenshots or chat.
