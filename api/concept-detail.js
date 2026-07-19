const DETAIL_PROMPT = `You are helping teach a student one concept from course material.

Use the supplied course material and concept metadata to produce only:
- A simple explanation of the concept in 3-5 plain-language sentences. Use a concrete example or analogy when it helps.
- One or two short check questions that test genuine understanding rather than simple recall.

Stay grounded in the supplied material. Do not repeat the title, summary, or dependency map.`

const detailSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    explanation: { type: 'string' },
    check_questions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 2,
    },
  },
  required: ['explanation', 'check_questions'],
}

const OPENAI_TIMEOUT_MS = 20_000

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const text = request.body?.text?.trim()
  const concept = request.body?.concept
  if (!text || !concept?.id || !concept?.title || !concept?.summary) {
    return response.status(400).json({ error: 'Course notes and concept metadata are required.' })
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
        model: 'gpt-5.6-terra',
        reasoning: { effort: 'none' },
        instructions: DETAIL_PROMPT,
        input: `Course material:\n${text}\n\nConcept metadata:\n${JSON.stringify(concept)}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'concept_teaching_detail',
            strict: true,
            schema: detailSchema,
          },
        },
      }),
    })

    const responseBody = await openaiResponse.text()
    if (!openaiResponse.ok) {
      let payload = null
      try {
        payload = JSON.parse(responseBody)
      } catch {
        // Keep the original response body in the server logs for investigation.
      }
      return response.status(openaiResponse.status).json({
        error: payload?.error?.message || 'OpenAI could not prepare this concept.',
      })
    }

    const payload = JSON.parse(responseBody)
    const message = payload.output?.find((item) => item.type === 'message')
    const outputText = message?.content?.find((item) => item.type === 'output_text')
    const refusal = message?.content?.find((item) => item.type === 'refusal')

    if (refusal) throw new Error(`OpenAI refused this request: ${refusal.refusal}`)
    if (!outputText?.text) throw new Error('OpenAI returned no output_text content in its response.')

    const detail = JSON.parse(outputText.text)
    if (!detail.explanation || !Array.isArray(detail.check_questions)) {
      throw new Error('The response did not include teaching details.')
    }

    return response.status(200).json(detail)
  } catch (error) {
    if (error.name === 'AbortError') {
      return response.status(504).json({ error: 'Preparing this concept took too long. Please try again.' })
    }

    console.error('Concept-detail request failed unexpectedly', {
      message: error.message,
      stack: error.stack,
    })
    return response.status(500).json({ error: error.message || 'Unable to prepare this concept.' })
  } finally {
    clearTimeout(timeout)
  }
}
