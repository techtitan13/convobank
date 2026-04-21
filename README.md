# ConvoBank — Fiverr Conversation Platform

Store real Fiverr client conversations (PDF), analyze patterns, and generate new realistic conversations from stored data — no AI used for generation.

## Features
- PDF Upload — Upload real Fiverr conversation PDFs, auto-parsed into buyer/seller messages
- Library — Browse, search, and filter 500-1000+ stored conversations  
- Generate — Create new conversations from stored message patterns using a topic prompt
- Export — Download any conversation as .txt
- Vercel-ready — Deploy in minutes

## Tech Stack
- Frontend & API: Next.js 14 (App Router)
- Database: Supabase (PostgreSQL)
- Deployment: Vercel
- PDF Parsing: pdf-parse

---

## SETUP INSTRUCTIONS

### Step 1 — Create Supabase Project
1. Go to https://supabase.com and create a free project
2. In the SQL Editor, run the full contents of `supabase-schema.sql`
3. Copy your Project URL and Anon Key from Settings > API

### Step 2 — Configure Environment Variables
```
cp .env.local.example .env.local
```
Edit .env.local:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### Step 3 — Install & Run Locally
```
npm install
npm run dev
```
Open http://localhost:3000

---

## DEPLOY TO VERCEL

Option A — Vercel CLI:
```
npm install -g vercel
vercel
```

Option B — GitHub + Vercel Dashboard:
1. Push this folder to a GitHub repo
2. Go to https://vercel.com/new and import your repo
3. Add environment variables in Vercel dashboard:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
4. Click Deploy

---

## HOW GENERATION WORKS

No AI is used. The generator:
1. Scores all stored conversations by relevance to your topic (keyword matching)
2. Takes the top 10-15 most relevant conversations
3. Splits messages into pools: openers, responses, follow-ups, closings
4. Assembles a new conversation by picking randomly from each pool
5. Saves the result to your generated_conversations table

The more real conversations you upload, the better the output.

---

## PDF FORMAT TIPS

Label each line with Buyer: or Seller: for best results:
  Buyer: Hi, I need a logo for my restaurant
  Seller: Hello! I would be happy to help. What style are you after?
  Buyer: Something modern and clean, green and white colors
  Seller: Perfect. I have some great examples — shall I share?

The parser also handles unlabeled text by alternating buyer/seller.

---

## FOLDER STRUCTURE

app/
  page.tsx                 Main dashboard UI
  layout.tsx               Root layout
  globals.css              Design system
  api/
    upload/route.ts        PDF upload & parsing
    conversations/
      route.ts             List, search, delete
      [id]/route.ts        Single conversation detail
    generate/route.ts      Generate & list generated

lib/
  supabase.ts              Supabase client & types
  parser.ts                PDF text to structured messages
  generator.ts             Pattern-based conversation generator

supabase-schema.sql        Run this in Supabase SQL Editor
.env.local.example         Copy to .env.local and fill in values
