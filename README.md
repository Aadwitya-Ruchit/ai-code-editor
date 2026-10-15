# 🧠 VibeCode Editor – AI-Powered Cloud IDE

VibeCode Editor is a full-featured, in-browser AI-assisted Cloud Integrated Development Environment (IDE) built with **Next.js 16 (App Router)**, **React 19**, **Monaco Editor**, and **WebContainers**. Rather than relying on expensive, heavy server-side virtual machines or Docker containers, VibeCode boots a WebAssembly-based Node.js runtime directly inside the user's browser tab. 

With zero local setup, developers can create, edit, run, and debug multi-framework web applications in real time, accompanied by intelligent inline ghost-text code completions and a persistent, multi-turn AI copilot assistant.

---

## 🚀 Key Features

- **⚡ Zero-Server In-Browser Compute:** Boots a sandboxed Node.js micro-kernel directly in the browser via `@webcontainer/api` over WebAssembly and `SharedArrayBuffer`, eliminating cold starts and VM hosting overhead.
- **🔐 Modern OAuth Authentication:** Robust session management powered by Auth.js / NextAuth v5 with GitHub and Google OAuth providers and MongoDB account linking.
- **🧱 Multi-Framework Project Starters:** Instantly scaffold and run sandbox projects across **React (Vite/TS)**, **Next.js**, **Express**, **Vue**, **Hono**, and **Angular**.
- **🖊️ VS Code-Grade Monaco Editor:** Full-featured code editing with syntax highlighting, language diagnostics, theme switching, automatic bracket matching, and dirty tab tracking.
- **💡 Inline AI Code Completions:** Ghost-text suggestions powered by DeepSeek Chat via an AI API gateway, analyzing real-time AST context and surrounding code heuristics.
- **🤖 Persistent AI Copilot ("Junior"):** Multi-turn conversational coding assistant capable of answering questions, performing code reviews, fixing bugs, and optimizing algorithms. All conversations and message histories are persisted to MongoDB.
- **💻 Integrated Terminal with xterm.js:** Embedded terminal emulator supporting interactive shell commands, process streaming, ANSI color rendering, search, and dynamic resizing via `@xterm/addon-fit`.
- **🌐 Live Hot-Reloading Preview:** Automatically detects `server-ready` port events from the running WebContainer and binds live application output into a responsive in-browser `<iframe>`.
- **🔄 Multi-Layer State Synchronization:** Changes automatically synchronize across the Monaco text buffer, client Zustand state, WebContainer in-memory virtual filesystem, and MongoDB database via Server Actions.
- **🛡️ Production-Hardened Security:** Built with Cross-Origin Opener/Embedder policies (COOP/COEP), strict object-level authorization (IDOR defense), bounded request payloads, and sliding-window rate limiting backed by Upstash Redis or local memory.

---

## 🧱 Tech Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.2.9` | Server Components, Server Actions, API Route Handlers, and static optimization |
| **Frontend Library** | React | `19.2.4` | Modern UI rendering and concurrent hook primitives |
| **Language** | TypeScript | `^5` | Strict static type safety across client and server |
| **Styling & Components** | Tailwind CSS & shadcn/ui | `^4` / Radix UI | Modern responsive styling, dark/light theme, and accessible UI primitives |
| **Code Editor** | Monaco Editor | `^0.56.0` | In-browser VS Code editing engine via `@monaco-editor/react` |
| **In-Browser Runtime** | WebContainers | `^1.6.4` | StackBlitz WebAssembly-powered Node.js runtime (`@webcontainer/api`) |
| **Terminal Emulator** | xterm.js | `^6.0.0` | Terminal rendering via `@xterm/xterm` with fit, search, and web-links addons |
| **Database & ORM** | MongoDB & Prisma | `^6.19.3` | Document database connected via Prisma ORM client singleton |
| **Authentication** | NextAuth.js (Auth.js) | `5.0.0-beta.32` | Edge-compatible session management with `@auth/prisma-adapter` |
| **State Management** | Zustand | `^5.0.14` | Global state store managing open tabs, file tree nodes, and dirty flags |
| **AI Gateway & LLMs** | AI Gateway / OpenAI API | — | `openai/gpt-4o-mini` (Chat Copilot) & `deepseek/deepseek-chat` (Autocomplete) |
| **Rate Limiting** | Upstash Redis / Memory | — | Sliding-window request throttling with distributed REST or in-memory fallback |

---

## 🏛️ System Architecture

```text
[ USER WORKSPACE (Browser) ]
  │
  ├── Monaco Editor ──────────► Inline Ghost Text (DeepSeek Chat API)
  ├── File Explorer (Zustand) ─► Active Tabs, Dirty State & File Tree
  ├── Terminal (xterm.js) ────► Bi-directional POSIX standard I/O streams
  └── Live Preview (iframe) ──► Listens for WebContainer 'server-ready' port
        │
        │ In-Memory Virtual File System
        ▼
[ CLIENT WEBASSEMBLY RUNTIME ]
  └── @webcontainer/api ──────► Executes Node.js, npm install, dev server in Wasm
        ▲
        │ Fetch Starters / Persist Saved Code Tree
        ▼
[ NEXT.JS 16 APPLICATION BACKEND ]
  ├── Security Middleware & Headers (COOP / COEP for SharedArrayBuffer)
  ├── Route Handlers:
  │     ├── /api/template/[id]       ──► Reads starter templates from disk into JSON AST
  │     ├── /api/code-completion     ──► Context-window analysis & DeepSeek completion
  │     ├── /api/chat                ──► Context-budgeted AI conversation response
  │     └── /api/conversations/[id]  ──► Persistent chat history management
  └── Server Actions:
        ├── createPlayground, deleteProjectById, editProjectById, duplicateProjectById
        └── SaveUpdatedCode, getPlaygroundById
        │
        ▼
[ PERSISTENCE & EXTERNAL SERVICES ]
  ├── MongoDB Atlas (Users, Accounts, Playgrounds, TemplateFiles, Conversations, Messages)
  ├── AI API Gateway (api.aicredits.in or direct OpenAI-compatible endpoint)
  └── OAuth Identity Providers (GitHub & Google)
```

---

## 🛠️ Getting Started

### Prerequisites

Ensure you have the following installed on your local machine:
- **Node.js**: `v20.0.0` or higher (Node 20+ LTS recommended)
- **Package Manager**: `npm` (v10+ recommended)
- **MongoDB**: A running MongoDB instance (local or MongoDB Atlas connection string)
- **OAuth Credentials**: GitHub and/or Google OAuth application credentials
- **AI Gateway Key**: API key for AICredits (`api.aicredits.in`) or an OpenAI-compatible provider

---

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ai-code-editor.git
cd ai-code-editor
```

---

### 2. Install Dependencies

Install project dependencies using `npm`:

```bash
npm install
```

---

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# On Linux/macOS
touch .env

# On Windows (PowerShell)
New-Item -ItemType File .env
```

Populate `.env` with the following variables:

```env
# =================================================================
# Database Configuration (MongoDB via Prisma)
# =================================================================
DATABASE_URL="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority"

# =================================================================
# Authentication (NextAuth v5 / Auth.js)
# =================================================================
# Generate a secure secret using: npx auth secret (or openssl rand -base64 32)
AUTH_SECRET="your_nextauth_secret_key"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth Credentials (https://github.com/settings/developers)
AUTH_GITHUB_ID="your_github_oauth_client_id"
AUTH_GITHUB_SECRET="your_github_oauth_client_secret"

# Google OAuth Credentials (https://console.cloud.google.com/apis/credentials)
AUTH_GOOGLE_ID="your_google_oauth_client_id"
AUTH_GOOGLE_SECRET="your_google_oauth_client_secret"

# =================================================================
# AI Services & LLM Gateway
# =================================================================
# Primary API key for code completion and chat copilot
AICREDITS_API_KEY="your_aicredits_api_key"

# Optional AI Configuration Overrides (defaults to AICredits gateway & openai/gpt-4o-mini)
# AI_PROVIDER="aicredits"                      # "aicredits" | "openai"
# AI_MODEL="openai/gpt-4o-mini"               # Default model for Junior Chat Copilot
# AI_BASE_URL="https://api.aicredits.in/v1/chat/completions"
# AI_API_KEY="your_custom_ai_api_key"         # Fallback if AICREDITS_API_KEY is not set
# AI_TEMPERATURE="0.7"
# AI_MAX_TOKENS="1500"
# AI_TIMEOUT_MS="45000"

# =================================================================
# Distributed Rate Limiting (Optional - Upstash Redis)
# If omitted, rate limiting falls back to an in-memory sliding window
# =================================================================
# UPSTASH_REDIS_REST_URL="https://<your-database>.upstash.io"
# UPSTASH_REDIS_REST_TOKEN="your_upstash_rest_token"
```

> [!WARNING]
> Never commit real secrets, private keys, database URLs, or OAuth credentials to version control. Keep `.env` listed in `.gitignore`.

---

### 4. Setup Prisma & Database Schema

Generate the Prisma Client and synchronize the schema with your MongoDB database:

```bash
# Generate the Prisma Client types
npx prisma generate

# Push the schema structure to MongoDB
npx prisma db push
```

---

### 5. Start the Development Server

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> [!NOTE]
> WebContainers require cross-origin isolation. Ensure you access the app via `http://localhost:3000` (or `http://127.0.0.1:3000`) so the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers work as intended.

---

## 📜 Available Scripts

The following scripts are defined in `package.json`:

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run dev` | `next dev` | Launches the Next.js development server with hot-module reloading |
| `npm run build` | `next build` | Generates an optimized production build |
| `npm run start` | `next start` | Runs the compiled Next.js production server |
| `npm run lint` | `eslint` | Runs ESLint to check for code quality and syntax issues |

### Automated Security & Integration Verification

While there is no standalone `npm test` script configured in `package.json`, an automated security test suite is included in `tests/security-verification.ts`. It verifies rate limiting quotas, multi-user isolation, IDOR protections, and payload ceilings:

```bash
npx tsx --env-file=.env tests/security-verification.ts
```

---

## 🎯 Keyboard Shortcuts & Editor Usage

| Keybinding | Action | Description |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | **Save Active File** | Writes changes to WebContainer virtual OS and persists to MongoDB |
| <kbd>Ctrl</kbd> + <kbd>Space</kbd> | **Trigger AI Suggestion** | Manually requests an inline code completion at the cursor position |
| <kbd>Tab</kbd> | **Accept AI Suggestion** | Accepts active ghost text suggestion (falls back to indentation if none) |
| <kbd>Esc</kbd> | **Dismiss Suggestion** | Rejects and hides the currently active inline ghost suggestion |

---

## 🧭 How to Use the Editor

### 1. Creating and Managing Projects
1. Sign in via GitHub or Google OAuth.
2. From the **Dashboard** (`/dashboard`), click **Add New Playground** or choose a template card.
3. Select your desired framework (**React**, **Next.js**, **Express**, **Vue**, **Hono**, or **Angular**), enter a title and description, and submit.
4. Manage projects from the project table: rename, duplicate, mark/star, or delete.

### 2. Editing and Executing Code
1. Click on a project to enter `/playground/[id]`.
2. Browse files and folders in the left sidebar tree. Add, rename, or delete files directly in the explorer.
3. Open files in editor tabs. Files with unsaved changes display a dirty indicator dot.
4. Press <kbd>Ctrl</kbd> + <kbd>S</kbd> or click **Save** in the top bar to save changes.
5. Watch the **Terminal** at the bottom right as WebContainers automatically run `npm install` and start the local development server.
6. As soon as the dev server spins up, the **Live Preview** tab will render the running application with full hot-reloading support.

### 3. Using Inline AI Code Autocomplete
- As you type in Monaco Editor, background heuristics analyze your cursor position, surrounding lines, framework, and language context.
- When an AI suggestion is ready, it appears as grey ghost text right at your cursor.
- Press <kbd>Tab</kbd> to accept and insert the suggestion, or press <kbd>Esc</kbd> to dismiss it.
- You can also press <kbd>Ctrl</kbd> + <kbd>Space</kbd> anytime to manually invoke a suggestion.

### 4. Interacting with the Persistent AI Copilot ("Junior")
- Click the **AI Assistant** button in the editor navigation to open the slide-out copilot drawer.
- Select your preferred assistance mode:
  - **Chat:** General programming advice, questions, and explanations.
  - **Code Review:** Detailed analysis of selected code for maintainability and best practices.
  - **Bug Fix:** Identifying errors and generating corrective snippets.
  - **Optimize:** Algorithmic optimization and performance tuning.
- **Conversation Management:** Use the sidebar inside the panel to start a "New Chat", switch between past conversations, search chat history, or delete conversations. All messages are stored in MongoDB and preserved across browser sessions.

---

## 📂 Repository Structure

```text
ai-code-editor/
├── app/                              # Next.js App Router root
│   ├── (auth)/auth/                  # Authentication pages (Sign-in)
│   ├── (root)/                       # Marketing landing page & hero section
│   ├── api/                          # REST API route handlers
│   │   ├── auth/[...nextauth]/       # NextAuth OAuth callback handler
│   │   ├── chat/                     # AI assistant endpoint with MongoDB persistence
│   │   ├── code-completion/          # Monaco inline AST context completion endpoint
│   │   ├── conversations/            # Conversation collection CRUD endpoint
│   │   │   └── [id]/                 # Single conversation & message management
│   │   └── template/[id]/            # Starter folder disk-to-JSON serialization
│   ├── dashboard/                    # User dashboard (projects table & templates)
│   ├── playground/[id]/              # Main IDE playground page (Monaco + WebContainer)
│   ├── layout.tsx                    # Root layout with theme provider & fonts
│   └── globals.css                   # Global Tailwind CSS directives
├── components/                       # Shared UI components
│   ├── ui/                           # shadcn/ui & Radix design primitives
│   └── providers/                    # Client providers (Themes, Auth Session)
├── hooks/                            # Shared React utility hooks
├── lib/                              # Core application libraries & utilities
│   ├── ai/                           # AI subsystem configuration & providers
│   │   ├── config.ts                 # Centralized AI parameter & model settings
│   │   ├── prompt.ts                 # Assistant system prompts & guardrails
│   │   └── provider.ts               # Gateway API client & context budgeter
│   ├── db.ts                         # Prisma Client global singleton for MongoDB
│   ├── rate-limit.ts                 # Sliding-window rate limiting (Upstash / Memory)
│   ├── security-logger.ts            # Structured security audit logger
│   ├── template.ts                   # Mapping between template enums and disk paths
│   └── utils.ts                      # General helper utilities (e.g. cn merge)
├── modules/                          # Modular domain features
│   ├── ai-chat/                      # AI chat sidebar panel & markdown renderer
│   ├── auth/                         # Authentication actions & components
│   ├── dashboard/                    # Dashboard tables, actions, and template modal
│   ├── home/                         # Landing page navigation and components
│   ├── playground/                   # Monaco editor, Zustand store, file explorer
│   └── webcontainers/                # WebContainer hooks, transformer, xterm.js terminal
├── prisma/
│   └── schema.prisma                 # MongoDB schema definition (User, Playground, Conversation, Message)
├── public/                           # Static assets, SVG logos, and icons
├── starters/                         # Multi-framework starter boilerplates on disk
│   ├── angular/                      # Angular starter
│   ├── express-simple/               # Express.js starter
│   ├── hono-nodejs-starter/          # Hono.js starter
│   ├── nextjs-new/                   # Next.js starter
│   ├── react-ts/                     # React Vite + TypeScript starter
│   └── vue/                          # Vue 3 starter
├── tests/                            # Automated verification & security test suites
├── auth.config.ts                    # NextAuth provider definitions (GitHub & Google)
├── auth.ts                           # NextAuth v5 lifecycle callbacks & adapter init
├── next.config.ts                    # Next.js configuration (COOP/COEP headers & CSP)
├── package.json                      # Dependencies and npm script definitions
├── proxy.ts                          # Route protection middleware
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## 🔒 Security & Deployment Notes

### 1. Cross-Origin Isolation (COOP & COEP)
WebContainers execute WebAssembly threads utilizing `SharedArrayBuffer`. Browsers mandate strict cross-origin isolation headers for `SharedArrayBuffer` to mitigate CPU side-channel attacks (Spectre/Meltdown). These headers are enforced in `next.config.ts`:
```typescript
{
  key: 'Cross-Origin-Opener-Policy',
  value: 'same-origin',
},
{
  key: 'Cross-Origin-Embedder-Policy',
  value: 'require-corp',
}
```
If you deploy behind a reverse proxy (e.g., Nginx or Cloudflare), ensure these two response headers are preserved.

### 2. Multi-Tenant Authorization & IDOR Protection
All Server Actions (`deleteProjectById`, `editProjectById`, `duplicateProjectById`, `SaveUpdatedCode`) and API route handlers (`/api/template/[id]`, `/api/conversations/[id]`) verify project and conversation ownership against `session.user.id`. Cross-user data access is rejected and logged via `lib/security-logger.ts`.

### 3. Distributed Rate Limiting
To prevent token exhaustion and DoS attacks, `/api/code-completion` (45 req/min) and `/api/chat` (25 req/min) enforce sliding-window rate limiting. For multi-instance production environments, supply `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to ensure rate limits are shared across replicas.

### 4. Deploying to Vercel or Node Servers
- Set all required environment variables in your deployment dashboard (`DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_GITHUB_*`, `AUTH_GOOGLE_*`, `AICREDITS_API_KEY`).
- Update your GitHub and Google OAuth application settings with your production authorization callback URLs:
  - GitHub: `https://your-domain.com/api/auth/callback/github`
  - Google: `https://your-domain.com/api/auth/callback/google`
- Ensure your MongoDB Atlas cluster has network access rules permitting connections from your hosting provider's IP range (or `0.0.0.0/0` with strong database user credentials).

---

## 🙏 Acknowledgements

- [Next.js](https://nextjs.org/) by Vercel
- [WebContainers](https://webcontainers.io/) by StackBlitz
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) by Microsoft
- [Auth.js / NextAuth](https://authjs.dev/)
- [xterm.js](https://xtermjs.org/)
- [Prisma](https://www.prisma.io/)
- [shadcn/ui](https://ui.shadcn.com/)
