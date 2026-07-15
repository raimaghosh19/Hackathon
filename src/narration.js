export async function createNarration(text, voice) {
  const response = await fetch('/api/narration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || 'Unable to create narration.')
  }

  return response.blob()
}
