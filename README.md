# FocoTA

The adaptive study companion — study without the shutdown. Built for [OpenAI Build Week](https://openai-build-week.devpost.com/) — Education track.

## The problem

A lot of students often struggle with course textbooks, notes, readings, lecture slides, and more due to heavy jargon and complex methods of teaching. When a concept does not land, most tools either repeat the same explanation at a slower pace or just move on. This leaves gaps as the material compounds and gets progressively more difficult. This build-up can lead students to dread their readings, coursework, and slides.

FocoTA was built around this real observation: students dread starting their work because the paragraphs in their textbooks seem complex and heavy, or struggle to even start because they feel so behind.

## What it does

- Paste notes, slides, or a textbook excerpt. FocoTA uses GPT-5.6 to break the material into core concepts in teaching order and map which concepts depend on which others.
- Learn concept by concept through narrated, presentation-style slides, with a choice of feminine or masculine voice.
- Ask a question at any time. Pause the narration, type what is confusing, and get a short, plain-language answer read aloud.
- Hit “I’m completely lost” for a full reset: a new explanation with jargon and notation stripped out.
- Use optional check-ins to confirm understanding or keep moving without forced quizzing.
- Get smart callbacks when a later concept depends on something you skipped or struggled with earlier, so confusion does not silently stack up.
- Finish with a final quiz that checks real understanding, followed by a plain-language summary of what is solid and worth revisiting.

## How Codex and GPT-5.6 were used

GPT-5.6 powers every piece of reasoning in the app: concept extraction and dependency mapping, clarifying answers, panic-mode re-explanations, comprehension-based answer evaluation rather than exact-match grading, and end-of-session gap analysis.

OpenAI TTS narrates every explanation aloud, with a user-selectable voice.

Codex built the application end-to-end in this session: the React/Vite frontend, Vercel serverless API routes (`/api/concepts`, `/api/concept-detail`, `/api/teaching-assist`, and `/api/narration`), structured-output schemas, the presentation-style UI redesign, and session-state logic tracking concepts as confirmed, skipped, or shaky.

Key decisions were mine to make and Codex’s to implement: the two-tier interrupt system (light clarification vs. full panic reset), the optional check-in design, the dependency-triggered callback mechanic, and the overall tone.

A notable debugging moment: an early integration bug came from assuming the OpenAI SDK’s `output_text` convenience field would exist on a raw fetch call to the Responses API. Using Codex’s logging, we traced the real cause and correctly parsed the raw output → message → content structure instead.

Codex session ID: `019f5c9d-bd43-7a70-b1e9-e02e19d1b8a8`

## Tech stack

- Frontend: React + Vite
- Backend: Vercel serverless functions
- AI: OpenAI GPT-5.6 (Responses API, structured outputs) + OpenAI TTS
- Hosting: Vercel

## Running it locally

1. Clone the repo:

   ```bash
   git clone https://github.com/raimaghosh19/Hackathon.git
   cd Hackathon
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Add your OpenAI API key. Create a `.env` file in the project root:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

   You will need an OpenAI account with API billing enabled.

4. Run the development server:

   ```bash
   npm run dev
   ```

Open the local URL it prints, such as `http://localhost:5173`.

> The `/api/*` routes are Vercel serverless functions. For full local functionality, use the [Vercel CLI](https://vercel.com/docs/cli) with `vercel dev` instead of a plain Vite development server, or deploy directly to Vercel.

## Deploying your own copy

1. Push this repo to your own GitHub account.
2. Import it into [Vercel](https://vercel.com/).
3. In **Project Settings → Environment Variables**, add `OPENAI_API_KEY`.
4. Deploy.

## Sample input

> “Stereotypic behaviour refers to repetitive, unvarying movements that seem to serve no obvious purpose, such as an animal pacing the same path back and forth or repeatedly bar-biting. These behaviours are most often seen in animals kept in captivity, especially when their environment doesn't allow them to perform natural behaviours like foraging, exploring, or socializing. Researchers believe stereotypic behaviour often develops as a coping response to stress, frustration, or a lack of stimulation. Because it's linked to poor welfare, scientists study these behaviours both to understand what's causing an animal distress and to find ways to prevent it, often by redesigning captive environments to better match an animal's natural needs.”

## Live demo

https://hackathon-iota-bice.vercel.app/

## Demo video

https://youtu.be/5H5EnwiQzPs?si=XeY0toYcYRQxuprb

## License

MIT License — see LICENSE file for details.

Built with Codex and GPT-5.6 for OpenAI Build Week, July 2026.
