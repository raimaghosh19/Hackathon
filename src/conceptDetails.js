export async function getConceptDetails(text, concept) {
  const response = await fetch('/api/concept-detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, concept }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to prepare this concept.')
  }

  return payload
}
