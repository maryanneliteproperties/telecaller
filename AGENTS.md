<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Audio and report persistence use the external destination clients in src/lib/destination*. Auth and report reads use the same destination; leave generated Cloud clients unchanged so the source remains recoverable. Only the publishable key may be returned by the public configuration function; the secret key stays server-only. This keeps reads and writes on one database without deleting the source.
- Audio transcription goes through src/routes/api/transcribe.ts (multipart + SSE); the AI key stays server-side. Audio is saved to private call-audio, its X-Audio-Path is stored with call_reports, and authenticated users read reports/audio under /reports.
- Keep the transcription provider helper server-only and dynamically import it inside the upload handler; normalize recording MIME labels without transcoding, and enforce the selected provider's file cap separately from upload acceptance.
- Upload acceptance is "is this audio?" (src/lib/audio-limits.ts), never a fixed allow-list; the speech service's own format limits are surfaced to the user through friendlyTranscriptionError instead of being pre-blocked — callers send whatever their phone exported, and a silent refusal hides where the real limit is.
- Conversation analysis uses a streamed server-only Gemini call on the existing completed transcript; shared schemas validate quotes and scores, deterministic scoring handles missing evidence, and report state prevents duplicate clicks. Each validated report is saved to public.call_reports (transcript + report JSONB) via supabaseAdmin inside the analyse handler; a save failure is logged and never breaks the report stream. Writes are server-only; signed-in users may read.
- Report output language is colloquial spoken Tamil in Tamil script (பேச்சு வழக்கு தமிழ்) for all AI analysis text, headings, labels and exports; only the next-call script stays Tanglish and HOT/WARM/COLD labels stay in English. Never switch back to Tanglish or formal written Tamil without an explicit user request.
- Summary and detailed report UI and text exports project the existing ConversationReport shape through compactReport and detailedReport; do not change stored fields or scoring for presentation, so previously generated reports remain compatible. Format switching is client-side only and must not trigger analysis. Map existing priority labels without promoting insufficient information to a qualified lead.
- Every analysed call is also flattened into the external destination telecaller_data table via src/lib/telecaller-data.ts (one column per detailed-report sub-heading; the destination names the introduction score column introduction_score_1). Save failures are logged and never break the report stream.
- Workspace accounts use the external destination: usernames in profiles, permissions in user_roles, and PIN-only Admin sessions as opaque server-validated HttpOnly cookies with durable attempt limits; generated Cloud auth middleware is replaced by the destination bearer attacher because Cloud tokens belong to a different database.
- The global destination bearer attacher reads only an already initialized client and never invokes configuration RPCs; root hydration initializes it before protected identity checks to prevent middleware recursion and hard-refresh signed-out flashes.
- Submission creates the existing telecaller_data row before AI work; analysis updates that same row and preserves customer fields, while employee reads are owner-scoped and Admin reads include history. This prevents duplicate lead rows and cross-employee data exposure.
- External schema changes are delivered as idempotent SQL under database/ for the destination owner to apply; never apply them to the managed source database, which must remain recoverable.
- Saved-call playback uses a shared player with a dedicated browser worker: OpenCORE AMR decodes AMR-NB/WB headers, with single-thread FFmpeg WASM fallback for other unsupported codecs. Original private audio and transcription stay unchanged; decoder assets are local, with no third-party audio disclosure or cross-origin isolation requirement.
