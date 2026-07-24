# FormFlow

A self-hosted **conversational form and survey builder** — one full-screen
question at a time, so people actually reach the end. Build a form by dragging
questions into place, branch people down different paths with conditional logic,
theme it to match your brand, then share a link or embed it. Responses,
completion rates and per-question drop-off land in your own dashboard.

Everything lives in a single SQLite file inside a Docker volume you control.
No third-party account, no per-response pricing, no data leaving your server.

![FormFlow's builder — question list, live preview and per-question settings with conditional logic](docs/screenshots/builder.png)

| The respondent's view — one question at a time | Analytics — completion rate and drop-off |
| --- | --- |
| ![A form question with an opinion scale, showing an earlier answer recalled into the question text](docs/screenshots/question-scale.png) | ![Analytics with views, completion rate, a 30-day trend and per-question drop-off](docs/screenshots/analytics.png) |
| **Design — themes, fonts and backgrounds** | **Responses — a row per submission, exportable** |
| ![The design tab with theme presets, colour pickers and a live preview](docs/screenshots/design.png) | ![The responses table with one row per response](docs/screenshots/responses.png) |

## Features

- **One question at a time** — a full-screen, keyboard-driven flow with smooth
  transitions. `Enter` continues, `A`/`B`/`C` pick a choice, `Y`/`N` answer
  yes-no, and the arrows in the corner move back and forth.
- **14 question types** — short and long text, email, phone, number, website,
  multiple choice (single or multi-select), dropdown, yes/no, star rating,
  opinion scale, date, file upload, and statement screens.
- **Conditional logic** — per-question rules that jump to another question or
  straight to an ending. Rules can test *any earlier* answer, not just the
  current one, and run in order so the first match wins.
- **Answer recall** — quote an earlier answer inside a later question:
  *"How likely are you to recommend us, Ada?"*
- **Themes** — six presets plus your own accent, background and text colours,
  three font families, and solid, gradient or dotted backgrounds. Every form
  gets its own look.
- **Multiple endings** — send happy and unhappy respondents to different closing
  screens, each with an optional call-to-action button or an automatic redirect.
- **Welcome screens**, progress bar and question numbering, all optional.
- **Live preview while you build** — the middle pane *is* the real form,
  rendered by the same code respondents get. Nothing is recorded.
- **Analytics** — views, starts, completions, completion rate, average time to
  complete, a 30-day trend, drop-off per question, and aggregates for every
  question (option counts, averages and distributions, recent free-text answers).
- **Responses** — a sortable table, a detail view per response, partial-response
  tracking, and one-click **CSV** or **JSON** export.
- **File uploads** — respondents attach files, you download them from the
  responses table. Size and type limits are yours to set.
- **Accounts** — email and password sign-in; each account only ever sees its own
  forms and responses. Respondents never need an account.
- **Embeddable** — copy an `<iframe>` snippet from the Share tab and drop the
  form into any page.
- **Light and dark** — the editor follows your system theme, or you can pin it.
- **Responsive** — the builder works down to a tablet; the form itself is built
  for phones first.

![The dashboard listing forms with view, completion and rate counters](docs/screenshots/dashboard.png)

## Run it

### With Docker (recommended)

```bash
docker compose up -d
```

Then open <http://localhost:8080> and create your account. The image is built
and published automatically to GitHub Container Registry on every push to
`main`, for both `amd64` and `arm64`.

To change the port, pin an image tag, or adjust upload and rate limits, copy the
environment template first:

```bash
cp .env.example .env    # edit as needed
docker compose up -d
```

To build the image from source instead of pulling it, uncomment the `build:`
block in [`compose.yaml`](compose.yaml) and run `docker compose up -d --build`.

### Development server

Requires **Node 24 or newer** — FormFlow uses Node's built-in `node:sqlite`, so
there is no native module to compile and nothing to install beyond npm packages.

```bash
npm install
npm run dev
```

This starts two processes together: the Vite dev server with hot reload on
<http://localhost:5173>, and the API on port 8080 which Vite proxies to. Open
the 5173 address.

Data goes to `./data/` (gitignored) rather than a Docker volume.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite + API together, with reload on both |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm start` | Serve `dist/` and the API from one Node process |
| `npm run preview` | Preview the built bundle with Vite's static server |

You can also run the dev environment in a container, with no local Node at all:

```bash
docker compose --profile dev up dev     # -> http://localhost:5173
```

## How it fits together

```
server/                Node + Express API, no build step
  db.mjs               node:sqlite connection, schema migrations, ids
  auth.mjs             scrypt password hashing, DB-backed sessions
  model.mjs            form document <-> tables, answer flattening
  routes/auth.mjs      register, login, logout, session
  routes/forms.mjs     owner API: forms, responses, export, analytics, files
  routes/public.mjs    respondent API: read form, save answers, upload, submit
  index.mjs            app wiring, security headers, static bundle, SPA fallback

src/                   React + TypeScript front end
  lib/                 types, API client, logic engine, validation, theming
  components/          shared UI, the form runner, chart primitives
  components/builder/  question rail, inspector, logic editor, design, share
  pages/               auth, dashboard, builder, results, analytics, fill
```

A few decisions worth knowing about:

- **One runtime process.** In production a single Node process serves both the
  API and the built React bundle, with a SPA fallback so deep links work.
- **`node:sqlite`, not a driver.** SQLite ships with Node 24, so the runtime
  image needs no compiler and no native rebuild when Node updates. WAL mode is
  on, because every public form view writes an analytics row.
- **Sessions, not JWTs.** Session tokens are random and stored in the database,
  so signing out actually revokes access. Passwords use scrypt from
  `node:crypto` — memory-hard, and no bcrypt build step.
- **The whole form saves at once.** The builder autosaves the entire document
  (fields and endings included) as one transaction. Field ids are preserved
  across saves, so logic rules and collected answers keep pointing at the same
  question.
- **Answers save as you go.** Each answer is written when the respondent moves
  on, which is what makes partial responses and drop-off analytics possible.
- **Response ids are capabilities.** A response id is 24 random characters,
  given only to the browser that started it, and it stops accepting writes once
  submitted.

## Configuration

Every setting is an environment variable with a sensible default, so an
unconfigured container still runs correctly.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | Port the server listens on |
| `FORMFLOW_DATA_DIR` | `/data` (Docker), `./data` (dev) | Where `formflow.db` and `uploads/` live |
| `FORMFLOW_MAX_UPLOAD_MB` | `10` | Largest file a respondent may attach |
| `FORMFLOW_RATE_LIMIT` | `120` | Public write requests per IP per minute |
| `FORMFLOW_SESSION_TTL_DAYS` | `30` | How long a sign-in lasts |
| `FORMFLOW_SECURE_COOKIES` | `false` | Force the `Secure` cookie flag (see below) |
| `FORMFLOW_TRUST_PROXY` | `true` | Trust `X-Forwarded-*` for client IP and scheme |

See [`.env.example`](.env.example) for the annotated version.

## Deploying behind a proxy

Session cookies are marked `Secure` automatically when the request arrives over
HTTPS, which works as long as your proxy sets `X-Forwarded-Proto`. If it does
not, set `FORMFLOW_SECURE_COOKIES=true` and make sure the app is never reachable
over plain HTTP — otherwise sign-in will silently fail.

Public form pages (`/f/...`) deliberately allow framing so embeds work. Every
other route is `SAMEORIGIN`.

## Backups

Everything is in the volume: `formflow.db` (plus its `-wal` and `-shm`
companions) and the `uploads/` directory. The simplest safe backup is to stop
the container and copy the directory:

```bash
docker compose stop web
docker run --rm -v formflow_formflow-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/formflow-backup.tar.gz -C /data .
docker compose start web
```

To keep the data somewhere you can back up directly, swap the named volume in
`compose.yaml` for a host path such as `./data:/data` — that directory must be
writable by uid 1000.

## A note on accounts

Anyone who can reach the instance can register an account and build their own
forms. Accounts are isolated from each other — nobody can see anyone else's
forms or responses — but registration itself is open. If that is not what you
want, keep the port behind a VPN, Tailscale, or an authenticating reverse proxy,
or register your accounts and then block `POST /api/auth/register` at the proxy.

There is deliberately no password reset flow, because there is no mail server to
send one. To reset a password, delete the row from the `users` table and
register again.

## Licence

[MIT](LICENSE)
