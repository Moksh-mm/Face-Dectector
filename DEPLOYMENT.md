# Deployment notes

Status: **ready to run on your own server; not ready for Vercel as-is.** The
blockers are listed below with what each one needs.

## Who can reach what

| Audience | Routes |
|---|---|
| **Public visitor** | `/` (redirects to `/scan`), `/scan`, `/photos` |
| Public APIs | `POST /api/recognize`, `POST /api/scan/select`, `POST /api/scan/logout`, `GET /api/photos/assets`, `GET /api/photos/assets/[id]/thumbnail`, `GET /api/photos/assets/[id]/original`, `GET /api/photos/avatar` |
| **Admin only** | `/admin`, `/people`, `/people/[id]`, everything under `/api/admin/*` and `/api/immich/*` |

A visitor's photos come only from their session. No route a visitor can call
takes a person id, and the person list is never exposed to them.

## Sessions

- A successful scan sets `scan_session`: an **HttpOnly, SameSite=Lax** cookie
  (Secure automatically behind HTTPS) holding an HMAC-signed token that names
  the person. It lasts 30 minutes (`SCAN_SESSION_TTL_MINUTES`).
- It is a cookie, not a URL, on purpose: a token in a URL leaks into browser
  history, referrers, screenshots and server logs, and can be edited or shared.
- Every photo the visitor is offered carries a signature binding that asset to
  their person. An asset that was not in their own list has no valid signature.
- Any new scan that does not match, and "Not you? Scan again", clear the cookie.
- Admin: `ADMIN_TOKEN` is exchanged at `/admin` for a signed, HttpOnly,
  SameSite=Strict cookie (8 h). Scripts may send `x-admin-token` instead.
- **Limitation:** tokens are stateless, so they cannot be revoked. Clearing the
  cookie removes it from that browser, but a copied token stays valid until it
  expires (30 min). Changing `SESSION_SECRET` invalidates every token at once.

## Rate limiting

In-memory, in this process. No Redis: right for one server, wrong for several
(each instance would count separately — see "Remaining risks").

| Limit | Default | Setting |
|---|---|---|
| Recognition, per client | 10 per minute | `RATE_LIMIT_RECOGNIZE_PER_MINUTE` |
| Recognition, everyone together | 60 per minute | `RATE_LIMIT_RECOGNIZE_GLOBAL_PER_MINUTE` |
| Failed admin sign-ins, per client | 5 per 15 minutes | `RATE_LIMIT_ADMIN_FAILURES` |

Every recognition attempt counts, successful or not, so a rejected upload cannot
be retried for free. Only *failed* admin sign-ins count, and a success clears the
count, so the administrator is never locked out by their own use. A wrong token
still takes 500 ms and gives the same answer however close the guess was.

**Who is "the client"?** Next.js fills in `x-forwarded-for` only when the caller
did not send one, so with no proxy in front it is whatever the caller claims.
Set `TRUSTED_PROXY_HOPS=1` behind a reverse proxy you control and the client is
taken from that proxy's entry instead. With `0` (the default) the per-client
limit is best-effort, and the **global** limit — which trusts no header — is the
real ceiling on ML load.

## Failure handling

- **Immich:** 8 s to start answering (`IMMICH_REQUEST_TIMEOUT_MS`). A dropped
  connection or a 502/503/504 is retried **once** after 150 ms, for reads only.
  A timeout is not retried: Immich is stalled, and asking again would stall
  twice. A healthy request pays nothing for this.
- **The index rebuild** gets 120 s instead (`IMMICH_BACKGROUND_TIMEOUT_MS`),
  because nobody is waiting on it and a busy Immich can take 30 s to answer.
- **The ML service:** 30 s, no retry (a call costs it a second of CPU).
- **Visitors** never see which part failed: every internal fault becomes
  "We couldn't complete that right now. Please try again in a moment." (503) or
  a generic 500. The specific cause goes to the server log, with secrets and
  URLs stripped and repeats collapsed to one line per 10 s.

## Face index safety

`saveIndex` writes a temp file, **reads it back and validates it**, then renames
it over the live file. The rename is atomic and happens last, so a failure at any
earlier point leaves the previous index untouched. Temp files are 0600, and stale
ones from a crashed build are swept on the next save.

A finished build is also **refused** if it looks wrong: no faces at all, more
than 20% of photos failed, or fewer than half the faces or people of the index it
would replace. Recognition keeps using the previous index and the admin sees why.

This matters: before it was added, a rebuild while the ML service was unreachable
"succeeded" with **zero** faces and overwrote a working 407-face index. Verified
again afterwards — same conditions, index untouched, admin told what to check.

## Environment variables

All server-only; none has a `NEXT_PUBLIC_` prefix. See `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `IMMICH_URL` | yes | Base URL of Immich. Must be reachable from where the app runs. |
| `IMMICH_API_KEY` | yes | Immich API key: `person.read`, `person.statistics`, `asset.read`, `asset.view`, `face.read`. |
| `IMMICH_ML_URL` | yes | Immich's ML service. **Unauthenticated: never expose it publicly.** |
| `SESSION_SECRET` | yes | 32+ random chars. Signs sessions and the admin cookie. The app refuses to issue or verify sessions without it. |
| `ADMIN_TOKEN` | yes | 16+ random chars. In production, shorter values and `change-me…` are refused (admin returns 503). |
| `SCAN_SESSION_TTL_MINUTES` | no | Default 30, maximum 240. |

Never commit `.env.local` (git-ignored). `.env.example` is committed and holds no
values.

## Vercel blockers

Verified against Vercel's docs (Functions limits, updated 2026-08).

1. **The face index is a file on local disk** (`data/face-index.json`, written and
   read with `node:fs`). It is git-ignored, so it would not be deployed, and it
   holds biometric data that should not go into a repository. Vercel Functions
   cannot rely on local disk (Vercel's docs pages fetched here do not state the
   filesystem rules, so confirm them before designing around `/tmp`). The index
   must live somewhere the running app can read: private object storage, or a
   service next to Immich.
2. **The ML service is unreachable from Vercel.** `IMMICH_ML_URL` is
   `127.0.0.1:3004`, deliberately bound to loopback because the service has no
   authentication. Vercel cannot reach it, and it must not be put on the internet.
3. **Index building cannot run on Vercel.** The builder is a multi-minute
   background job with progress held in module memory, and it writes the index
   file. A serverless function stops when its response is sent, and instances do
   not share memory. Vercel's default function duration is 300 s; a build here
   took ~200 s, but the state and the file write still do not fit.
4. **Immich must be reachable from Vercel over HTTPS.** `localhost` will not work.
   Vercel's outbound IPs are dynamic unless you pay for Static IPs, so you cannot
   simply allow-list them on Immich.
5. **4.5 MB response limit.** Vercel caps function request *and* response bodies
   at 4.5 MB. In a 185-asset sample of your library, **9.2 % of originals
   exceed it** (all 7 videos, 10 images; largest 104 MB; median 0.15 MB). Thumbnails
   and previews are fine. Downloading originals through Vercel would fail for those.
6. **No rate limiting.** Anyone can call `/api/recognize` and `/api/admin/session`
   repeatedly. Add Vercel's firewall/rate limiting (or equivalent) before exposing it.

Not blockers (checked): no client component imports server code; no edge runtime;
no `localhost` in source; images use `unoptimized` so Vercel image optimisation is
not used; the upload limit is 4 MB, under Vercel's 4.5 MB request limit.

## Recommended architecture

Keep the ML and the face index next to Immich, and let the web tier stay thin:

```
Phone -> Vercel (UI + sessions) -> recognition service (same host as Immich)
                                        |-- face index (local disk, fine there)
                                        |-- Immich ML   (loopback)
                                        `-- Immich API
```

The recognition service is this repo's existing recognition, index and builder
code exposed behind one authenticated endpoint (e.g. `POST /match` returning a
person id). Alternatively, host the whole Next.js app on the Immich machine
behind HTTPS and skip Vercel: no blocker above applies there.

For originals (blocker 5), either keep `/original` off Vercel, or hand the browser
a short-lived signed link straight to Immich.

## Before any deployment

- [ ] Set every variable above; generate `SESSION_SECRET` and `ADMIN_TOKEN` fresh.
- [ ] Resolve blockers 1-5 (or host on your own server).
- [ ] Add rate limiting (blocker 6).
- [ ] Serve over HTTPS: phone browsers only allow a live camera on secure origins.
- [ ] `npm run lint && npm run build`.
