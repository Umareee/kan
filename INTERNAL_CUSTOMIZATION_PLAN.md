# Kan → Internal Company Task Manager — Customization Plan

> Goal: convert the open-source **Kan** (Trello-like) app into a lean internal task-management tool for ~100 employees. No public SaaS, no billing, no marketing surface. Managers create projects, add/remove people, assign permission levels. Managers + team members view, comment, and work cards.

---

## 1. What Kan Is (Tech Stack)

| Layer | Tech |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, Node ≥ 20 |
| Frontend | Next.js (Pages Router), React, Tailwind, Lingui i18n (9+ languages) |
| API | tRPC + auto-generated OpenAPI REST (`/api/v1`) |
| DB | PostgreSQL + Drizzle ORM (Row-Level Security on every table) |
| Auth | Better Auth (email/password, magic link, OAuth, **generic OIDC**, API keys) |
| Email | React Email + SMTP |
| Billing | Stripe (`@better-auth/stripe`) — cloud-only |
| Storage | S3-compatible (R2) for avatars + attachments |
| Hosting | Docker Compose, Railway template |

Cloud-vs-self-host switch is a single env: `NEXT_PUBLIC_KAN_ENV`. Everything billing-related is already gated behind `=== "cloud"`, so most stripping = run as self-host + delete dead code.

---

## 1b. Deployment — Vercel (DECIDED)

All managed, all free-tier at ~100 internal users.

| Need | Service | Cost |
|---|---|---|
| App (Next.js) | **Vercel** — set project root to `apps/web` | Pro ~$20/mo (commercial use requires Pro, billed per dev-team seat, not end users) |
| Database | **Neon Postgres** | Free tier (enough for 100 users) |
| Attachments | **Cloudflare R2** (S3-compatible — Kan already supports it) | Free: 10 GB storage, **zero egress** |
| Redis | dropped (was only for API keys) | $0 |
| SMTP / email | dropped (no email notifications) | $0 |

**Total: ~$20/mo, no servers to manage.**

Vercel notes: serverless functions (cold starts fine for CRUD; no long-running jobs — Kan has none critical). No local filesystem → that's why attachments go to R2, not disk.

### Attachments — keep, on R2 (DECIDED)
- Kan's storage is already S3-compatible → just env-point to Cloudflare R2. No code change to storage layer.
- **R2 free tier:** 10 GB storage + zero egress fees + ~1M writes/10M reads per month.
- **Capacity at 5 MB cap:** ~2,000 files free. Beyond 10 GB → $0.015/GB/mo (e.g. 50 GB = $0.75/mo). Effectively free at this scale.
- **Enforce 5 MB max** in the presigned-upload step (`attachment.generateUploadUrl`) so storage grows slowly and no oversized files land.
- Alternative if you want zero storage at all: links-only (paste Drive/SharePoint URLs, swap `s3Key`→`url`). But R2 free tier makes real attachments viable — keep them.

---

## 2. Full Feature Inventory

### Core (keep — this is the product)
- **Workspaces** — top-level container. Map this to your **company** (one workspace) or to **departments** (a few workspaces).
- **Boards** — private/public visibility, regular + **template** type, archive, favorites.
- **Lists** (columns), **Cards** (number/prefix, due date, index, move between lists, duplicate, archive).
- **Labels** — per-board, colour-coded, filterable.
- **Card assignees** — assign workspace members to cards.
- **Comments** — full CRUD + `@mentions` → notifications/email.
- **Checklists** — nested items, reset-to-default on duplicate.
- **Attachments** — S3 presigned upload/download.
- **Activity log** — rich per-card audit trail (create/move/label/member/comment/checklist/due-date/archive).
- **Notifications** — in-app + email (mention, member added/removed, role changed).
- **Members & invites** — invite by email/magic-link, code-based invite links, remove, change role.
- **Permissions/RBAC** — see §4 (this is the part that needs the most work).
- **Command palette**, search, due-date filters.

### Cloud / SaaS surface (remove for internal)
- **Stripe billing** — plans (team/pro), checkout, billing portal, seat enforcement, trials.
- **Partner / license-key model** — external license activation, auto-claim slots.
- **Pricing / upgrade / plan-select pages**, FAQ, marketing **home** page.
- **Seat limits** on invites — internal tool has no seat cap.
- **Premium slug gating** (custom workspace slugs locked behind Pro).

### Integrations (remove unless wanted)
- **Trello import** — useful once for migration, then dead weight. Keep short-term, remove after.
- **GitHub import + GitHub OAuth integration**.
- **Outgoing webhooks** (HMAC-signed) — keep only if you'll wire to Slack/etc.
- **Public API + API keys** — remove unless scripting against it.
- **Public board sharing** — internal tool likely wants everything private. Remove `public` visibility.

### Auth methods (trim to one)
- Email/password, magic link, many social OAuth providers, **generic OIDC**, API keys.
- For a company: keep **one** path. Best = **OIDC/SSO** against your identity provider (Google Workspace / Microsoft Entra / Okta). Disable public sign-up; only invited or SSO-domain users get in.

---

## 3. Requirements → Gap Analysis

| Your requirement | Kan today | Action |
|---|---|---|
| Internal only, ~100 users | SaaS + self-host modes | Run self-host (`KAN_ENV != cloud`), delete billing |
| Manager creates a **project**, adds people **to it** | Boards exist, but membership is **workspace-level, not per-board** | **ADD per-board/project membership** (biggest change — see §5) |
| Manager adds/removes people | Workspace invite/remove exists | Reuse, scope to project |
| Multiple managers | Roles are per-workspace; `admin` role exists | Make "Manager" a role; allow many |
| Permission levels for team members | RBAC engine exists (resource:action) | Reuse — define Manager / Member / Viewer roles |
| Members can view + comment | Comments + view permissions exist | Reuse |
| Not overengineered | App has lots of SaaS scaffolding | Strip §2 "remove" list |

### The one real architectural gap
Kan authorization is **workspace-scoped**. Any member with `board:view` sees **every private board** in the workspace. There is **no per-project membership or per-board ACL**. Your requirement "Manager creates a project and adds *specific* people to it" needs project-level access control that does not exist yet.

Two ways to satisfy it (pick in §5).

### Invites & Notifications — removable (decision)

Both are partly extra. Depends on SSO.

**Invites — remove the email flow if using SSO/OIDC.**
- With company IdP, users auto-provision on first login → no email invite needed.
- "Manager adds people to project" is **not** an invite — it's a member picker: search existing directory users → add to `board_members`. Reuse `workspace.search` + member-add, drop the email path.
- Remove: email invites, magic-link invite emails, code-based invite links (`createInviteLink`, `acceptInviteLink`, `getInviteByCode`, JOIN_WORKSPACE template, `workspace_invite_links` table).
- Keep ONLY if no SSO: one invite path to bootstrap users.

**Notifications — split.**
- Email notifications → **remove** (needs SMTP, adds noise). Drop `packages/email` mention/notify templates, `unsubscribe` route, email send calls.
- In-app notifications → cheap (table + bell UI already there). Keep or drop, low cost.
- If dropping in-app too: simplify `@mentions` to plain text (mention with no notification does nothing). Drop `notification` table + `packages/shared/src/utils/mentions.ts` notify path.

Recommended: **SSO + member-picker, no invites. Drop email notifications. Keep in-app (or drop both + plain mentions).**

---

## 4. Current Permissions Model (what you'll build on)

Defined in code: `packages/shared/src/permissions.ts`.

- **Roles** (numeric hierarchy): `admin` (100), `member` (50), `guest` (10).
- **Resources**: workspace, board, list, card, comment, member.
- **Actions**: view, create, edit, delete, manage → 24 permission strings (`board:create`, `member:invite`, …).
- **Defaults**: admin = all; member = create/edit/delete boards/lists/cards/comments + view members; guest = view-only.

Storage:
- On workspace create, 3 **system roles** seeded into `workspace_roles` + permissions into `workspace_role_permissions`.
- `workspace_members` carries both legacy `role` enum and `roleId` FK (transitional dual model).
- **Effective permissions** = role perms + per-member overrides (`workspace_member_permissions`, granted true/false).
- Hierarchy enforcement (`canManageRole`) blocks acting on equal/higher roles. Entity creator can always edit/delete own.
- Custom roles + per-member overrides already supported via `permission` tRPC router + `PermissionsSettings.tsx` UI.

**Verdict:** the RBAC engine is solid and more than enough. It just operates at the wrong *scope* (workspace, not project) for your "add people to a project" need.

---

## 5. Recommended Target Design (lean)

### Decision A — How to model "projects with their own members"

**Option 1 — Project = Board + new board-membership table (recommended).**
- Add `board_members` table (boardId, workspaceId, userId, roleId/role).
- Gate board/card/list/comment access on board membership, not just workspace.
- Manager creating a board auto-becomes board manager; adds people to that board only.
- Keeps one workspace (the company), clean "add people to project" UX.
- Cost: medium. Touches schema, board/card/list routers, RLS, and board-list UI (only show boards you're a member of).

**Option 2 — Project = Workspace (no code change to access model).**
- Each project is its own workspace; managers invite people per workspace.
- Zero new access-control code — workspace scoping already isolates.
- Cost: low. But: clunky for 100 people across many projects (workspace switching), no company-wide overview, members re-invited per project.

> Recommendation: **Option 1** if projects share a company directory and people float across projects (typical). **Option 2** only if projects are fully siloed and few.

> **DECIDED: Option 1 — project-level access via `board_members`.** SSO confirmed; one company workspace; projects = boards with their own member list.

#### Concrete spec — `board_members`

**Schema** (`packages/db/src/schema/boards.ts`):
```
board_members
  id            serial pk
  publicId      nanoid
  boardId       fk -> board.id (cascade delete)
  workspaceId   fk -> workspace.id          // denormalized for RLS + queries
  userId        fk -> user.id
  role          enum(manager|member|viewer) // per-project role
  createdBy, createdAt, deletedAt
  UNIQUE(boardId, userId)                    // one membership per user per board
  enableRLS()
```
Note: project role lives **here**, per board — a user can be Manager on project A, Viewer on project B. Workspace-level role becomes just "can create projects" (any employee) + "company admin" (rare, manages directory).

**Access gating** — single helper, used everywhere:
```
assertBoardAccess(userId, boardId, action)
  1. load board_members row for (userId, boardId)
  2. if none -> NOT_FOUND (don't leak existence) unless company-admin
  3. map board role -> permissions (manager=all, member=cards/comments, viewer=view+comment)
  4. assert action allowed
```
Reuse the existing `permissions.ts` action set (`card:edit`, `comment:create`, …) — just resolve the role from `board_members` instead of `workspace_members`. Engine unchanged; only the **scope lookup** changes.

**Wire into routers** (`board.ts`, `card.ts`, `list.ts`, `label.ts`, `checklist.ts`, `attachment.ts`, `card`-comment):
- `board.all` → only boards where caller has a `board_members` row.
- every card/list/comment mutation/query → resolve `boardId` (card→list→board), call `assertBoardAccess`.
- `board.create` → creator auto-inserted as `manager`.

**New endpoints** (`routers/board.ts` or new `boardMember.ts`):
- `board.addMember(boardId, userId, role)` — manager only.
- `board.removeMember(boardId, userId)` — manager only.
- `board.updateMemberRole(boardId, userId, role)` — manager only.
- `board.members(boardId)` — list project members.
- member picker feeds from `workspace.search` (existing directory).

**RLS** — board's RLS policies must check membership via `board_members`, not workspace membership. Update Postgres policies for board/list/card/comment/checklist/attachment.

**UI**:
- Board view → "Members" panel: list + add (picker) + role dropdown + remove. Manager-only controls.
- Board list → only show projects you belong to.
- New project form → creator becomes manager; optional "add members now" step.

**Migration** — for existing boards: backfill `board_members` from current `workspace_members` (everyone → member, board creator → manager), so nothing breaks. New boards start empty + creator.

**Effort**: schema + 1 helper + ~6 router touchpoints + RLS policies + 2 UI pieces. Medium. This is Phase 3, the core build.

### Decision B — Role set for an internal tool

Rename/repurpose the existing 3 roles — no new engine needed:

| Role | Maps to | Permissions |
|---|---|---|
| **Manager** | `admin` | create/edit/delete projects, add/remove members, manage roles, all card ops |
| **Member** | `member` | create/edit cards, comment, assign, checklists, attachments |
| **Viewer** | `guest` | view + comment only (grant `comment:create` to guest default) |

Multiple managers = just assign Manager role to many members (hierarchy already allows it).

---

## 6. Removal Checklist (strip the SaaS)

Delete / disable, grouped by effort:

**Env / config (instant)**
- Set `NEXT_PUBLIC_KAN_ENV` ≠ `cloud` → disables Stripe plugin, partner slots, seat checks, premium slug gate.
- Set `NEXT_PUBLIC_DISABLE_SIGN_UP=true`, configure OIDC.

**Code to delete (low risk — cloud-gated)**
- `packages/stripe/`, Stripe plugin block in `packages/auth/src/plugins.ts`.
- `apps/web/src/pages/api/stripe/*`, `apps/web/src/pages/api/partner/*`, `apps/web/src/pages/partner/`.
- `apps/web/src/pages/upgrade/`, `pricing/`, marketing `home/`, FAQ.
- `BillingSettings.tsx`; seat logic in `routers/member.ts`; partner-slot logic in `routers/workspace.ts`.
- `subscription` table + `partnerLicenseKey/partnerTier` (drop in a migration once billing code gone).

**Integrations (optional removal)**
- Trello import: keep until migrated, then delete `routers/import.ts` trello subrouter + `api/trello/*`.
- GitHub import + integration, webhooks, public API/API keys — delete if unused.

**Public sharing**
- Remove `public` board visibility option, `views/public/*`, public tRPC procedures (make `board.bySlug` etc. protected).

**Invites (if SSO)**
- Remove `createInviteLink`/`deactivateInviteLink`/`getInviteByCode`/`acceptInviteLink`/`getActiveInviteLink` in `routers/member.ts`, `workspace_invite_links` table, JOIN_WORKSPACE email template, magic-link invite branch.
- Replace `member.invite` (email) with `member.add` (pick existing user). Keep `workspace.search` for the picker.

**Notifications**
- Email: delete mention/member/role-change templates in `packages/email/src/templates/`, `unsubscribe` route, email send calls in mention path.
- In-app (optional): drop `notification` table, bell UI, mention-notify in `packages/shared/src/utils/mentions.ts` → mentions become plain text.

**Auth trim — DECIDED: pure SSO/OIDC**
- Keep only generic OIDC against company IdP. Remove email/password, magic-link, all social providers from config/UI (`packages/auth/src/{auth,providers}.ts`).
- `NEXT_PUBLIC_DISABLE_SIGN_UP=true`; users auto-provision on first SSO login (`user.create.before` hook).

**Also removable (extended — lean internal)**
- API keys plugin + public REST/OpenAPI (`openapi.ts`, `api/v1/*`, `ApiSettings.tsx`).
- Redis + rate limiting (`packages/db/src/redis.ts`) — only existed for API keys.
- Webhooks (`routers/webhook.ts`, `workspace_webhooks`, `WebhookSettings.tsx`) — keep only if Slack wiring planned.
- GitHub + Trello import + integrations (`routers/import.ts`, `api/trello/*`, `integration`/`import` tables) — after migration.
- Board templates (`type=template`, `pages/templates/`, `NewTemplateForm.tsx`).
- In-app feedback (`routers/feedback.ts`, `feedback` table).
- Analytics: Umami + PostHog env/scripts.
- `apps/docs` — drop from deploy.
- Workspace `plan` enum + reserved/premium slugs (`workspace_slugs`, `workspace_slug_checks`).
- Marketing assets / Lottie tied to `home/`, `pricing/`.

**i18n**
- Keep only your company's languages; drop the rest from `apps/web/src/locales` to cut bundle.

---

## 7. Additions Worth Considering (don't over-build)

Only if actually needed:
- **Per-project membership** (§5 Option 1) — the one genuinely needed addition.
- **Company directory / user admin page** — list all users, deactivate leavers (SSO mostly handles this).
- **Slack/email digest** via existing webhook system — low effort, high value for a team.
- **"My tasks" view** — cards assigned to me across projects (assignee data already exists; just a new query/view).

Skip (overengineering for 100 internal users): public API, multi-tenant billing, partner licensing, custom-domain white-label, real-time presence.

---

## 8. Suggested Phasing

1. **Phase 0 — Run it.** Self-host via Docker Compose, Postgres + S3 + SMTP, OIDC against company IdP. Confirm boards/cards/comments work.
2. **Phase 1 — Strip SaaS.** Remove billing/partner/pricing/public-sharing/unused integrations (§6). One workspace = company.
3. **Phase 2 — Roles.** Rename admin/member/guest → Manager/Member/Viewer; grant Viewer comment rights.
4. **Phase 3 — Per-project membership** (§5 Option 1): `board_members` table + access gating + "add people to project" UI. *This is the main build.*
5. **Phase 4 — Nice-to-haves.** "My tasks" view, Slack digest, user-admin page — as demand appears.

---

## 9. Key File Map (for whoever implements)

- Permissions engine: `packages/shared/src/permissions.ts`, `packages/api/src/utils/permissions.ts`, `packages/db/src/repository/permission.repo.ts`, `packages/db/src/schema/permissions.ts`
- Permissions UI: `apps/web/src/views/settings/PermissionsSettings.tsx`, `apps/web/src/hooks/usePermissions.ts`
- Role seeding: `packages/db/src/repository/workspace.repo.ts` (`SYSTEM_ROLES`, `create`)
- Boards (where per-project membership lands): `packages/api/src/routers/board.ts`, `packages/db/src/schema/boards.ts`
- Members/invites: `packages/api/src/routers/member.ts`
- Billing to strip: `packages/auth/src/plugins.ts`, `apps/web/src/pages/api/stripe/*`, `api/partner/*`, `routers/member.ts` (seats), `routers/workspace.ts` (partner/slug)
- Auth/SSO: `packages/auth/src/{auth,plugins,providers}.ts` (OIDC block)
- Schema root: `packages/db/src/schema/index.ts`
