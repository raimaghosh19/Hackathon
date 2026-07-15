const SYSTEM_PROMPT = `You are helping build an adaptive learning tool. I'm going to give you a piece of course material (notes, slides, or textbook text). Your job is to break it down for teaching purposes.

Do the following:

1. Extract the CORE CONCEPTS from this material — the distinct ideas a student needs to understand, in the order they should be taught (earlier concepts should be foundational to later ones where possible).

2. For each concept, identify:
   - A short title (2-6 words)
   - A one-sentence plain-language summary (no jargon, explain it like you're talking to a friend, not a textbook)
   - DEPENDS ON: which other concepts (by title) a student needs to understand FIRST before this one will make sense. If none, say "none — foundational."

3. For each concept, also write:
   - A "simple explanation" (3-5 sentences, avoiding jargon, using a concrete example or analogy if helpful)
   - 1-2 short check questions to verify a student actually understood it (not just recall — test real comprehension)

Return this as clean JSON in this exact structure:

{
  "concepts": [
    {
      "id": "concept_1",
      "title": "",
      "summary": "",
      "depends_on": [],
      "explanation": "",
      "check_questions": ["", ""]
    }
  ]
}`

const conceptSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          depends_on: { type: 'array', items: { type: 'string' } },
          explanation: { type: 'string' },
          check_questions: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'summary', 'depends_on', 'explanation', 'check_questions'],
      },
    },
  },
  required: ['concepts'],
}

const OPENAI_TIMEOUT_MS = 25_000

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const text = request.body?.text?.trim()
  if (!text) {
    return response.status(400).json({ error: 'Course notes are required.' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-5.6',
        instructions: SYSTEM_PROMPT,
        input: text,
        text: {
          format: {
            type: 'json_schema',
            name: 'concept_dependency_map',
            strict: true,
            schema: conceptSchema,
          },
        },
      }),
    })

    const responseBody = await openaiResponse.text()
    if (!openaiResponse.ok) {
      console.error('OpenAI Responses API request failed', {
        status: openaiResponse.status,
        statusText: openaiResponse.statusText,
        requestId: openaiResponse.headers.get('x-request-id'),
        body: responseBody,
      })

      let payload = null
      try {
        payload = JSON.parse(responseBody)
      } catch {
        // Keep the original response body in the server logs for investigation.
      }

      return response.status(openaiResponse.status).json({
        error: payload?.error?.message || 'OpenAI could not extract concepts.',
      })
    }

    const payload = JSON.parse(responseBody)
    const { concepts } = JSON.parse(payload.output_text)
    if (!Array.isArray(concepts)) throw new Error('The response did not include a concepts array.')

    return response.status(200).json({
      concepts: concepts.map(({ summary, ...concept }) => ({ ...concept, description: summary })),
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`OpenAI Responses API request timed out after ${OPENAI_TIMEOUT_MS}ms`)
      return response.status(504).json({
        error: 'Concept extraction took too long. Please try shorter notes or try again.',
      })
    }

    console.error('Concept extraction failed unexpectedly', {
      message: error.message,
      stack: error.stack,
    })
    return response.status(500).json({ error: error.message || 'Unable to extract concepts.' })
  } finally {
    clearTimeout(timeout)
  }
}
