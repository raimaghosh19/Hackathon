export async function requestTeachingAssist(action, explanation, question) {
  const response = await fetch('/api/teaching-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, explanation, question }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to create a teaching response.')
  }

  return payload.answer
}

export async function assessUnderstanding(explanation, question, answer) {
  const response = await fetch('/api/teaching-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'check_understanding', explanation, question, answer }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to check that answer.')
  }

  return payload
}
