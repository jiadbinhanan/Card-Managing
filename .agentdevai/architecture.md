# Project Architecture

## Frontend
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS

## Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth

## Key Flows
1. **Authentication**: Users log in via `app/login/page.tsx` which calls `app/api/auth/route.ts`.
2. **Data Fetching**: Server components fetch directly from Supabase.
