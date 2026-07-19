const OPENAI_TIMEOUT_MS = 45_000

function buildPrompt(action, explanation, question, answer) {
  if (action === 'clarify') {
    return `A student is learning this concept: ${explanation}\n\nThey asked: ${question}\n\nGive a short, clear answer to their specific question in plain language, no jargon. Keep it under 4 sentences.`
  }

  if (action === 'check_understanding') {
    return `A student is learning this concept: ${explanation}\n\nCheck question: ${question}\n\nStudent's answer: ${answer}\n\nGive brief, casual feedback on whether their answer shows real understanding. Do not require exact wording. Point out one useful correction if needed. Give a fair 0-100 comprehension score. Keep the feedback under 3 sentences.`
  }

  if (action === 'reteach') {
    return `A student is learning this concept: ${explanation}\n\nThey said this part did not click: ${question}\n\nReteach the concept specifically around that confusion. Use plain language, a concrete real-world analogy, and no jargon. Keep it under 4 sentences.`
  }

  return `The student said they are completely lost and this makes no sense at all. Completely re-explain this concept from scratch using a totally different, very concrete real-world analogy. Avoid all jargon and mathematical notation. Keep it under 4 sentences. End by asking if this version makes more sense.\n\nConcept: ${explanation}`
}

const understandingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    feedback: { type: 'string' },
    understanding: { type: 'string', enum: ['confirmed', 'shaky'] },
    score: { type: 'integer', minimum: 0, maximum: 100 },
  },
  required: ['feedback', 'understanding', 'score'],
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const { action, explanation, question, answer } = request.body || {}
  if (!['clarify', 'panic', 'reteach', 'check_understanding'].includes(action) || !explanation?.trim()) {
    return response.status(400).json({ error: 'A teaching action and concept explanation are required.' })
  }
  if (['clarify', 'reteach'].includes(action) && !question?.trim()) {
    return response.status(400).json({ error: 'A clarification question is required.' })
  }
  if (action === 'check_understanding' && (!question?.trim() || !answer?.trim())) {
    return response.status(400).json({ error: 'A check question and answer are required.' })
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
        reasoning: { effort: 'none' },
        input: buildPrompt(action, explanation.trim(), question?.trim(), answer?.trim()),
        ...(action === 'check_understanding' && {
          text: {
            format: {
              type: 'json_schema',
              name: 'understanding_feedback',
              strict: true,
              schema: understandingSchema,
            },
          },
        }),
      }),
    })

    const responseBody = await openaiResponse.text()
    if (!openaiResponse.ok) {
      let payload = null
      try {
        payload = JSON.parse(responseBody)
      } catch {
        // The unparsed response remains available in provider logs.
      }
      return response.status(openaiResponse.status).json({
        error: payload?.error?.message || 'OpenAI could not prepare a teaching response.',
      })
    }

    const payload = JSON.parse(responseBody)
    const message = payload.output?.find((item) => item.type === 'message')
    const outputText = message?.content?.find((item) => item.type === 'output_text')
    const refusal = message?.content?.find((item) => item.type === 'refusal')

    if (refusal) throw new Error(`OpenAI refused this request: ${refusal.refusal}`)
    if (!outputText?.text) throw new Error('OpenAI returned no teaching response.')

    if (action === 'check_understanding') {
      const feedback = JSON.parse(outputText.text)
      if (!feedback.feedback || !['confirmed', 'shaky'].includes(feedback.understanding) || !Number.isInteger(feedback.score)) {
        throw new Error('OpenAI returned incomplete understanding feedback.')
      }
      return response.status(200).json(feedback)
    }

    return response.status(200).json({ answer: outputText.text.trim() })
  } catch (error) {
    if (error.name === 'AbortError') {
      return response.status(504).json({ error: 'The teaching response took too long. Please try again.' })
    }

    console.error('Teaching-assist request failed unexpectedly', {
      message: error.message,
      stack: error.stack,
    })
    return response.status(500).json({ error: error.message || 'Unable to create a teaching response.' })
  } finally {
    clearTimeout(timeout)
  }
}
