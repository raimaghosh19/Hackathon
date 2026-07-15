export async function extractConcepts(text) {
  const response = await fetch('/api/concepts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to extract concepts from these notes.')
  }

  return payload.concepts
}
