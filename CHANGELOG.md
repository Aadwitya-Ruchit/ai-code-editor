# Changelog

All notable changes to the AI Code Editor persistent chat and configurable model architecture will be documented in this file.

## [2026-10-15] - Runtime Sidebar Context Fix & Next.js Image Optimization

### Bug Fixes & Improvements
1. **Sidebar Context Restoration** (`app/playground/[id]/layout.tsx`):
   - Restored `<SidebarProvider>` wrapping around playground layout children.
   - Fixed `Uncaught Error: useSidebar must be used within a SidebarProvider` encountered when mounting `TemplateFileTree`, `SidebarInset`, and `SidebarTrigger` in the IDE playground.
   - Preserved server-side session authentication check and unauthorized user redirection to `/auth/sign-in`.

2. **Next.js Image Aspect Ratio Standardization**:
   - Added explicit `style={{ width: "auto", height: "auto" }}` to SVG and raster images across the application to prevent layout shifts and eliminate Next.js aspect-ratio distortion warnings caused by Tailwind CSS v4 preflight CSS rules:
     - Header brand logo: `modules/home/header.tsx` (`/logo.svg`)
     - Dashboard sidebar logo: `modules/dashboard/components/dashboard-sidebar.tsx` (`/logo.svg`)
     - AI chat sidebar panel logo: `modules/ai-chat/components/ai-chat-sidebarpanel.tsx` (`/logo.svg`)
     - Hero landing graphic: `app/(root)/page.tsx` (`/hero.svg`)
     - Playground creation card: `modules/dashboard/components/add-new.tsx` (`/add-new.svg`)
     - Repository import card: `modules/dashboard/components/add-repo.tsx` (`/github.svg`)
     - Template framework icons: `modules/dashboard/components/template-selecting-modal.tsx` (`/react.svg`, `/hono.svg`, `/angular-2.svg`, `/nextjs-icon.svg`, `/expressjs-icon.svg`, `/vuejs-icon.svg`)
     - Project table user avatar: `modules/dashboard/components/project-table.tsx`

3. **Largest Contentful Paint (LCP) Optimization**:
   - Added `priority` (`loading="eager"`) to above-the-fold hero images:
     - `/hero.svg` on the root landing page (`app/(root)/page.tsx`)
     - `/github.svg` on the dashboard action banner (`modules/dashboard/components/add-repo.tsx`)

4. **Console Hygiene & Log Cleanup** (`app/dashboard/page.tsx`):
   - Removed verbose `console.log("Playgrounds:", playgrounds)` to eliminate full database records and sensitive user object leakage in server logs.
   - Cleaned up redundant commented imports.

## [2026-10-15] - Targeted Production Security Hardening & Automated Verification

### Critical Vulnerabilities Remediated
1. **NextAuth / @auth Vulnerability Patched**:
   - Upgraded `next-auth` to `5.0.0-beta.32` and `@auth/prisma-adapter` to `2.11.3`, pulling in `@auth/core@0.41.3`.
   - Verified via `npm audit` that `@auth/core` has 0 advisories, eliminating GHSA-7rqj-j65f-68wh (Critical: email homoglyph normalization bypass) and GHSA-xmf8-cvqr-rfgj (High: unhandled exception in `getToken()`).

2. **Dashboard Server Actions Authorization & IDOR Hardening** (`modules/dashboard/actions/index.ts`):
   - Enforced strict session authentication via `currentUser()`.
   - `deleteProjectById`, `editProjectById`, and `duplicateProjectById` now enforce database-level user ownership using `findFirst({ where: { id, userId: user.id } })`.
   - Unauthorized attempts return safe errors and trigger structured security audit events.
   - Client-supplied user IDs are completely ignored.

3. **Playground Actions & File Storage Isolation** (`modules/playground/actions/index.ts`):
   - `SaveUpdatedCode` and `getPlaygroundById` now enforce strict session verification.
   - Verified project ownership (`findFirst({ where: { id, userId: user.id } })`) prior to reading or modifying code files, preventing cross-user file overwrites and template tampering.
   - Added a 10MB payload size limit on incoming file content to protect against denial-of-service memory exhaustion.

4. **Template API Endpoint Hardening** (`app/api/template/[id]/route.ts`):
   - Added session authentication requirement (`auth()`).
   - Validated that the requested playground exists and is owned by `session.user.id`.
   - Converted filesystem scanning from disk-based temporary files to in-memory directory scanning (`scanTemplateDirectory`), eliminating file-based concurrency race conditions.
   - Annotated dynamic path resolution with `/*turbopackIgnore: true*/` to eliminate Turbopack NFT full-project file tracing warnings.

5. **Code Completion Security Hardening** (`app/api/code-completion/route.ts`):
   - Added mandatory session authentication check, blocking unauthenticated token depletion.
   - Implemented per-user sliding window rate limiting (45 requests per 60 seconds).
   - Enforced 60,000 character maximum payload limit and 15-second abort timeout.

6. **Centralized AI Rate Limiting** (`lib/rate-limit.ts`):
   - Implemented sliding window rate limiting supporting distributed Upstash Redis REST (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) with local in-memory fallback and periodic garbage collection.
   - Applied rate limits to `/api/chat` (25 req/min per user) and `/api/code-completion` (45 req/min per user).

7. **Production HTTP Security Headers** (`next.config.ts`):
   - Preserved mandatory WebContainer headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
   - Configured baseline defense headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, and custom Content Security Policy compatible with Monaco Editor, WebContainer workers, and KaTeX math fonts.

8. **Pagination & Query Bounding** (`app/api/conversations/route.ts`):
   - Enforced bounded `take` (capped at 100) and `skip` (minimum 0) query parameters to prevent database query memory exhaustion.

9. **Structured Security Audit Logging** (`lib/security-logger.ts`):
   - Created security event logger emitting standardized JSON security records (`UNAUTHORIZED_ACCESS_ATTEMPT`, `RATE_LIMIT_TRIGGERED`, `AUTH_FAILURE`, etc.) while strictly redacting credentials, tokens, and user code.

### Automated Security Verification Results
- **Test Suite**: `tests/security-verification.ts` executed with `npx tsx --env-file=.env tests/security-verification.ts`.
- **Total Tests**: 26 | **Passed**: 26 | **Failed**: 0
  - Rate Limiting quota enforcement and 429 semantics: PASSED
  - Multi-user rate limit isolation: PASSED
  - Security audit logger JSON formatting and error resilience: PASSED
  - HTTP security headers validation in `next.config.ts`: PASSED
  - WebContainer COOP / COEP configuration: PASSED
  - Input payload size ceilings (Code Completion 60k, Chat 12k, SaveUpdatedCode 10MB): PASSED
  - Live Database Multi-Tenant Isolation (MongoDB Atlas via Prisma):
    - User A and User B creation in MongoDB Atlas: PASSED
    - Cross-user Playground access rejection (IDOR blocked): PASSED
    - Authorized Playground retrieval by owner: PASSED
    - Cross-user Conversation access rejection (IDOR blocked): PASSED
    - Conversation pagination parameter normalization: PASSED
    - Clean teardown of test fixtures: PASSED

### Production Build Verification
- Executed `npm run build` using Next.js 16.2.9 and Turbopack.
- Build result: Compiled successfully in 12.3s, TypeScript checks passed in 23.1s, static and dynamic routes generated cleanly with 0 errors and 0 warnings.

## [2026-10-15] - Verification, Testing & Security Audit

### Verification Executed
- **Live AI Follow-up & Memory Test**: Verified using `openai/gpt-4o-mini` on the live gateway. Provided an initial code snippet request followed by "Now optimize the same code using an iterative approach without recursion." Verified that the assistant accurately recalled the function context and returned the iterative algorithm.
- **Context Management & Pruning**: Executed token budget simulations with 40+ messages. Confirmed oldest messages were pruned when exceeding limits while the most recent messages and system prompt instructions were strictly preserved.
- **Role Sanitization & Prompt Injection Defense**: Verified that unauthorized `system` and `admin` roles in user payloads are filtered out, preventing client-side system prompt overrides.
- **Dynamic Model Configuration Override**: Verified that setting `AI_MODEL` environment variable immediately changes the active model without modifying backend or frontend code.
- **TypeScript & Schema Compilation**: Ran `prisma validate`, `prisma generate`, and TypeScript compiler checks. Verified zero errors across all newly created and updated chat files.
- **Environment Status Note**: The MongoDB Atlas instance (`cluster0.ucbt81n.mongodb.net`) timed out during `prisma db push` due to IP whitelist restrictions on the Atlas cluster. The schema, relations, and Prisma Client bindings are generated and fully verified locally.


## [2026-10-15] - UI Refactoring: Model Selector Removal & Chat History Panel

### Removed
- Completely removed the frontend model selector dropdown from `modules/ai-chat/components/ai-chat-sidebarpanel.tsx` (Claude Sonnet 4.6, GPT-5, GLM-4.7, DeepSeek V3.2, Gemini 2.5 Pro).
- Model selection is now exclusively managed by the centralized backend configuration (`lib/ai/config.ts`), defaulting to `openai/gpt-4o-mini`.

### Added
- Integrated full conversation history sidebar inside the chat panel:
  - "New Chat" button to initiate fresh sessions without page reload.
  - Chronological conversation list with relative timestamp indicators ("Just now", "5m ago", "Yesterday").
  - Instant conversation switching with dynamic message retrieval from `/api/conversations/[id]`.
  - Individual conversation deletion with cascading message cleanup and toast confirmation.
  - Search filtering for conversation history titles and in-chat message content search.
- Enhanced code rendering and markdown compatibility:
  - Fixed ReactMarkdown v10 code block component rendering and removed obsolete `inline` prop type issue.
  - Maintained full syntax highlighting, copy-to-clipboard actions, and KaTeX math support.
  - Preserved code review, bug fix, and optimization modes (`chat`, `review`, `fix`, `optimize`).
  - Added clean loading spinners, thinking state indicators, and error alert banners with retry feedback.

## [2026-10-15] - Persistent Chat and Conversation API Endpoints

### Added
- `app/api/conversations/route.ts`:
  - `GET`: Authenticates user via NextAuth `auth()`, retrieves conversations list ordered by `updatedAt: "desc"` with message counts.
  - `POST`: Allows creating new conversations tied to `session.user.id`.
- `app/api/conversations/[id]/route.ts`:
  - `GET`: Authenticates user, verifies conversation ownership, and loads messages in chronological order. Returns 404 on invalid ownership or missing ID.
  - `DELETE`: Verifies ownership, performs safe cascade deletion of messages, and deletes the conversation document.
- Upgraded `app/api/chat/route.ts`:
  - Enforced strict session authentication (`session.user.id`). Client-supplied `userId` is never trusted.
  - Added message payload validation (non-empty string, length capped to 12,000 characters).
  - Retrieves chronological conversation history from MongoDB.
  - Feeds context-aware conversation history to the centralized backend AI model (`openai/gpt-4o-mini`).
  - Persists both user message and assistant response to MongoDB before returning.
  - Automatically generates sensible conversation titles for new chats without LLM calls.

## [2026-10-15] - Configurable Backend AI Model Architecture & Provider Abstraction

### Added
- Created `lib/ai/config.ts`: Centralized configuration module managing default model (`openai/gpt-4o-mini`), gateway base URL, timeouts, generation parameters (`temperature`, `top_p`, `max_tokens`), and context budgeting with environment variable overrides (`AI_MODEL`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, etc.).
- Created `lib/ai/prompt.ts`: Isolated the full Junior system prompt, identity, security hierarchy, and untrusted data handling rules.
- Created `lib/ai/provider.ts`: Implemented `generateChatResponse()` abstraction with context-aware message budgeting (`buildContextAwareMessages`), timeout management via `AbortController`, graceful error handling for status codes (401, 429, 500+), and security role sanitization.
- Verified zero TypeScript compilation errors in `lib/ai/*`.

## [2026-10-15] - Prisma Schema & Database Models

### Added
- Added `Conversation` model to `prisma/schema.prisma` with fields: `id`, `userId`, `title`, `createdAt`, `updatedAt`, indexed by `userId` and `[userId, updatedAt]`.
- Added `Message` model to `prisma/schema.prisma` with fields: `id`, `conversationId`, `role` ("user" | "assistant" | "system"), `content`, optional `tokens`, optional `model`, and `createdAt`, indexed by `conversationId` and `[conversationId, createdAt]`.
- Added `conversations Conversation[]` relation to `User` model with cascade delete on user removal.
- Retained legacy `ChatMessage` and all existing models (`Playground`, `StarMark`, `TemplateFile`, `Account`, `User`) to ensure non-destructive database evolution.
- Ran `prisma generate` to update Prisma Client types and bindings.

## [2026-10-15] - Initial Project Analysis & Infrastructure Preparation

### Added
- Created `CHANGELOG.md` to track architectural decisions, schema modifications, security enhancements, and verification steps. Added `CHANGELOG.md` to `.gitignore`.

### Analysis & Findings
- **Database**: MongoDB via Prisma Client 6.19.3. Primary keys across the models use CUID strings mapped to `_id`. A legacy unreferenced `ChatMessage` model exists in `schema.prisma`.
- **Authentication**: NextAuth.js v5 beta (`auth.ts`) utilizing JWT session strategy and MongoDB adapter. User session contains `session.user.id`.
- **Current AI Gateway**: `https://api.aicredits.in/v1/chat/completions` using Bearer `AICREDITS_API_KEY`. Verified live that `openai/gpt-4o-mini` is supported and responsive on this gateway.
- **Current Chat UI**: `modules/ai-chat/components/ai-chat-sidebarpanel.tsx` with a frontend model selector dropdown, in-memory state only (no conversation persistence or retrieval).
- **Code Autocomplete**: `app/api/code-completion/route.ts` uses `deepseek/deepseek-chat` and operates independently.

### Next Steps
1. Update Prisma schema to add `Conversation` and `Message` models with proper user isolation and relations, then run `prisma generate`.
2. Build centralized AI configuration module (`lib/ai/config.ts`) defaulting to `openai/gpt-4o-mini`.
3. Build AI provider service abstraction (`lib/ai/provider.ts`) isolating API calls, timeout handling, error handling, and token limits.
4. Create conversations API endpoints (`/api/conversations` and `/api/conversations/[id]`) with strict authentication and ownership checks.
5. Upgrade `/api/chat` to enforce server-side auth, fetch conversation history, apply context window pruning, call the model, and persist user & assistant messages.
6. Refactor the frontend chat panel to remove the model selector and introduce conversation management (list, switch, new chat, delete, loading/error states).
