const SYSTEM_PROMPT = `You are helping build an adaptive learning tool. Given course material, extract the core concepts a student needs to understand in the order they should be taught.

For each concept, return only:
- a short title (2-6 words)
- a one-sentence, plain-language summary
- the titles of concepts a student needs to understand first; use an empty array for a foundational concept

Keep concepts grounded in the provided material. Do not create explanations or check questions in this request.`

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
        },
        required: ['id', 'title', 'summary', 'depends_on'],
      },
    },
  },
  required: ['concepts'],
}

const OPENAI_TIMEOUT_MS = 120_000

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const text = request.body?.text?.trim()
  if (!text) return response.status(400).json({ error: 'Course notes are required.' })

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
        model: 'gpt-5.6-terra',
        reasoning: { effort: 'none' },
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
    const message = payload.output?.find((item) => item.type === 'message')
    const outputText = message?.content?.find((item) => item.type === 'output_text')
    const refusal = message?.content?.find((item) => item.type === 'refusal')

    if (refusal) throw new Error(`OpenAI refused this request: ${refusal.refusal}`)
    if (!outputText?.text) throw new Error('OpenAI returned no output_text content in its response.')

    const { concepts } = JSON.parse(outputText.text)
    if (!Array.isArray(concepts)) throw new Error('The response did not include a concepts array.')

    return response.status(200).json({
      concepts: concepts.map((concept) => ({ ...concept, description: concept.summary })),
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
