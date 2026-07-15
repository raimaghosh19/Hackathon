# Concept Breaker

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, select **Add New → Project** and import that repository.
3. In **Project Settings → Environment Variables**, add `OPENAI_API_KEY` using your OpenAI Platform key.
4. Deploy. The app calls `/api/concepts` and `/api/narration`; these Vercel server functions keep the API key private.

## Local development

Copy `.env.example` to `.env.local`, add your key there, then run `npx vercel dev`. Do not use a `VITE_OPENAI_API_KEY` variable.
