# I’ll Ask For It: moderated comments

Scope: only the 19 article paths in `articles.json`, only `https://illaskforit.com` and its www alias. No changes to the user's other websites.

## Current state

Implementation is prepared on the feature branch. **Not activated.** `COMMENTS_API` in `../article-comments.js` is deliberately empty until the backend exists and live tests pass. Do not merge the privacy/terms changes independently of activation.

## Deployment

1. Sign into the existing Cloudflare account. Stay on the free Workers/D1 plan; do not enable paid upgrades.
2. Create D1 database `illaskforit-comments`. Copy its actual ID into `wrangler.jsonc`.
3. Apply `migrations/0001_comments.sql` to the database (`npm run db:migrate`).
4. Create a strong, random moderation key of at least 32 characters. Store it as the Worker secret `ADMIN_KEY`, never in this repository. Keep it in the owner's password manager. The service refuses to run without it.
5. Deploy the Worker from this folder with its `DB` binding. Ensure the daily cleanup cron is enabled.
6. Visit the deployed Worker's `/admin`, sign in, and test submission → pending → approval → public visibility → rejection → removal. Use a clearly marked temporary test comment and remove it before handoff. Verify unauthorized moderation returns 401/403 and other origins cannot submit.
7. Set `COMMENTS_API` to the exact deployed HTTPS origin (no trailing slash). Merge the feature branch to the existing GitHub Pages main branch. Verify the public article form in mobile and desktop layouts.
8. Give the owner the exact `/admin` URL and explain that comments appear only after approval. There are no automatic email notifications in this version.

Run checks before publication:

```sh
node --test comments-service/test/*.test.mjs
python scripts/check-seo.py
```

## Moderation

Open `/admin` on the comment service and sign in. Filter by Waiting for approval, Published, or Rejected. Approve publishes; Reject keeps/removes a comment from public view; Hold returns it to the private queue. Sign out when finished. Sign-in expires after eight hours.

Readers provide only a display name and comment. No email, account, links, rich text, ads, or tracking cookies are added by the comment feature. Text is rendered with `textContent`, so submitted HTML is not executed. Moderation uses a Secure/HttpOnly/SameSite=Strict cookie and checks same-origin requests.

## Spam and retention

Basic spam protection: hidden honeypot, signed one-time challenge with a five-second wait, article allowlist, body limits, consent check, five submissions per network per hour, ten moderation sign-in attempts per network per fifteen minutes, and a site-wide submission ceiling of 500 per day. All submissions still require human approval; these measures do not eliminate every bot. Raw visitor IPs are not stored. Temporary rate-limit digests are deleted by the daily scheduled job. Pending/rejected submissions older than 90 days are deleted; approved comments are retained. The owner can delete a specific stored record through D1 when processing a removal request.

## New articles

Add the filename to `articles.json`, add `<script src="article-comments.js" defer></script>` before `</body>`, redeploy the Worker allowlist, then publish the article. Keep category, product, and legal pages outside the allowlist.

## Verification boundary

The Node tests exercise the Worker against an in-memory SQLite adapter with real SQL. They are not a substitute for a deployed Cloudflare/D1 test. Until deployment and browser checks pass, do not describe the feature as live or fully verified.
