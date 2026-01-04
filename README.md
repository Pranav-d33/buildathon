# Opero

**AI copilot for getting things done on complex websites**

Opero is a hybrid AI automation system (web app + browser extension) that helps users complete complex online tasks by giving simple instructions while staying in control.

## 🏗️ Project Structure

```
opero/
├── web/          # Next.js web app (Mission Control)
├── extension/    # Chrome extension (Execution Layer)
└── shared/       # Shared types and schemas
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm
- Chrome browser

### 1. Web App Setup

```bash
cd web
cp env.example .env.local
# Edit .env.local with your Supabase and OpenRouter credentials
npm install
npm run dev
```

Open http://localhost:3000

### 2. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension` folder
5. The Opero icon should appear in your toolbar

### 3. Environment Variables

Create `web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENROUTER_API_KEY=your_openrouter_api_key
```

## 📋 Features

### Web App
- User onboarding (name, email, phone, state, address)
- Email OTP authentication
- Task selection (RTI, Scholarships, Generic)
- AI conversation interface

### Chrome Extension
- Side panel assistant
- DOM scanning and understanding
- Live form automation (typing, clicking, selecting)
- Voice input (push-to-talk)
- Pause/Resume/Take Control buttons
- Activity log

## 🔐 Security Principles

1. **User always sees what's happening**
2. **User can interrupt, edit, or override anytime**
3. **AI assists, user authorizes**
4. **No hidden automation**
5. **Sensitive info (Aadhaar, etc.) is never stored**

## 🎯 Demo Workflows

### RTI Filing
1. User describes their RTI request
2. Opero asks clarifying questions
3. Opero drafts the RTI application
4. User approves the draft
5. Opero opens RTI portal and fills non-sensitive fields
6. User completes CAPTCHA and submits

### Scholarship Discovery
- Rule-based eligibility checking
- Clear eligible/not-eligible results

## 📁 Key Files

### Web App
- `src/app/page.tsx` - Landing page
- `src/app/dashboard/page.tsx` - Task selection dashboard
- `src/lib/llm.ts` - OpenRouter LLM client
- `src/lib/orchestrator.ts` - Task state machine
- `src/lib/planner.ts` - Browser action planner
- `src/store/useAppStore.ts` - Zustand global state

### Extension
- `manifest.json` - Extension configuration
- `background.js` - Service worker (message hub)
- `contentScript.js` - DOM scanner and executor
- `sidepanel/` - Assistant UI

### Shared
- `shared/task.ts` - Task types and RTI field mapping

## 🛠️ Development

```bash
# Web app development
cd web
npm run dev

# Build for production
npm run build
```

## 📄 License

MIT
