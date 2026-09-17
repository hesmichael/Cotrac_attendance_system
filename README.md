# COTRAC Attendance System

COTRAC is a web-based attendance and personnel management system for recording staff check-ins, check-outs, shifts, lateness, visitor activity, and operational notes in one workspace.

The application is built with React, TypeScript, and Vite. Supabase provides authentication, PostgreSQL data storage, and realtime updates, with browser storage used as a local fallback when the database is temporarily unavailable.

## Features

- Staff sign-in with role-aware access for administrators and personnel
- Attendance clock-in and clock-out workflows with shift and lateness tracking
- Personnel management, role updates, and account administration
- Live attendance and user updates through Supabase Realtime
- Searchable reports with date filtering and PDF export
- Operational activity logging and JSON data export
- Biometric verification and signature capture where enabled by the deployment
- Responsive interface for desktop and mobile use

## Local development

**Prerequisites:** Node.js 18 or newer

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable/anon key.

3. Start the development server:

   ```bash
   npm run dev
   ```

The local app is available at `http://localhost:3000`.

## Supabase setup

Run [supabase-schema.sql](supabase-schema.sql) in the Supabase SQL Editor before using the application. The deployment needs these Vite variables:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

The publishable/anon key is intended for browser use. Never expose a Supabase service-role key in this frontend or in Netlify environment variables.

## Production deployment

This repository includes a [netlify.toml](netlify.toml) configured for Netlify. The build command is `npm run build` and the published directory is `dist`. Add the Supabase variables under **Site configuration > Environment variables**, then deploy.

For a manual production check:

```bash
npm run build
npm run preview
```

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates the production bundle in `dist`.
- `npm run lint` runs the TypeScript compiler without emitting files.
- `npm run preview` serves the production bundle locally.
