const voiceByPreference = {
  feminine: 'nova',
  masculine: 'onyx',
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const text = request.body?.text?.trim()
  const voice = voiceByPreference[request.body?.voice] || voiceByPreference.feminine
  if (!text) return response.status(400).json({ error: 'Narration text is required.' })

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
        instructions: 'Speak clearly, warmly, and at a calm teaching pace.',
        response_format: 'mp3',
      }),
    })

    if (!openaiResponse.ok) {
      const payload = await openaiResponse.json().catch(() => null)
      return response.status(openaiResponse.status).json({
        error: payload?.error?.message || 'OpenAI could not create narration.',
      })
    }

    response.setHeader('Content-Type', openaiResponse.headers.get('content-type') || 'audio/mpeg')
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).send(Buffer.from(await openaiResponse.arrayBuffer()))
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unable to create narration.' })
  }
}
