import { useEffect, useRef, useState } from 'react'
import { extractConcepts } from './extractConcepts.js'
import { createNarration } from './narration.js'

function App() {
  const [notes, setNotes] = useState('')
  const [concepts, setConcepts] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentConceptIndex, setCurrentConceptIndex] = useState(0)
  const [voice, setVoice] = useState('feminine')
  const [playbackState, setPlaybackState] = useState('idle')
  const [question, setQuestion] = useState('')
  const audioRef = useRef(null)
  const audioUrlRef = useRef(null)

  const currentConcept = concepts[currentConceptIndex]

  function stopNarration() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }

  useEffect(() => {
    stopNarration()
    setPlaybackState('idle')
    setQuestion('')

    return stopNarration
  }, [currentConceptIndex])

  useEffect(() => stopNarration, [])

  async function handleBreakIntoConcepts() {
    setIsLoading(true)
    setError('')

    try {
      const extractedConcepts = await extractConcepts(notes)
      setConcepts(extractedConcepts)
      setCurrentConceptIndex(0)
    } catch (error) {
      setError(error.message || 'Something went wrong while extracting concepts.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handlePlay() {
    setError('')

    if (audioRef.current && playbackState === 'paused') {
      try {
        await audioRef.current.play()
        setPlaybackState('playing')
      } catch (error) {
        setError(error.message || 'Unable to resume narration.')
      }
      return
    }

    if (!currentConcept) return

    setPlaybackState('loading')
    try {
      stopNarration()
      const audioBlob = await createNarration(
        currentConcept.explanation || currentConcept.description,
        voice,
      )
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      audioUrlRef.current = audioUrl
      audioRef.current = audio
      audio.onended = () => setPlaybackState('idle')
      await audio.play()
      setPlaybackState('playing')
    } catch (error) {
      stopNarration()
      setPlaybackState('idle')
      setError(error.message || 'Unable to play narration.')
    }
  }

  function handlePause() {
    audioRef.current?.pause()
    setPlaybackState('paused')
  }

  // Placeholder until clarification responses are wired to an AI call.
  function handleClarify(text) {
    console.log('Clarification question:', text)
  }

  // Placeholder until the panic/help flow is designed.
  function handlePanic() {
    console.log("Student selected: I'm completely lost")
  }

  function submitQuestion(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return

    handleClarify(trimmedQuestion)
    setQuestion('')
  }

  if (currentConcept) {
    return (
      <main className="page-shell">
        <section className="card teaching-card" aria-labelledby="concept-title">
          <p className="eyebrow">Concept {currentConceptIndex + 1} of {concepts.length}</p>
          <h1 id="concept-title">{currentConcept.title}</h1>
          <p className="concept-explanation">{currentConcept.explanation || currentConcept.description}</p>

          {currentConcept.depends_on?.length > 0 && (
            <p className="dependencies">Depends on: {currentConcept.depends_on.join(', ')}</p>
          )}

          <section className="narration" aria-labelledby="narration-title">
            <h2 id="narration-title">Narration</h2>
            <div className="voice-picker" aria-label="Narration voice">
              <button
                type="button"
                className={voice === 'feminine' ? 'selected' : ''}
                onClick={() => setVoice('feminine')}
                aria-pressed={voice === 'feminine'}
                disabled={playbackState === 'playing' || playbackState === 'loading'}
              >
                Feminine voice
              </button>
              <button
                type="button"
                className={voice === 'masculine' ? 'selected' : ''}
                onClick={() => setVoice('masculine')}
                aria-pressed={voice === 'masculine'}
                disabled={playbackState === 'playing' || playbackState === 'loading'}
              >
                Masculine voice
              </button>
            </div>

            {playbackState === 'playing' ? (
              <button type="button" onClick={handlePause}>Pause</button>
            ) : (
              <button type="button" onClick={handlePlay} disabled={playbackState === 'loading'}>
                {playbackState === 'loading' ? 'Preparing narration…' : 'Play'}
              </button>
            )}

            {playbackState === 'paused' && (
              <form className="clarify-form" onSubmit={submitQuestion}>
                <label htmlFor="clarify-question">Yes? question?</label>
                <div>
                  <input
                    id="clarify-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask about this concept"
                  />
                  <button type="submit" disabled={!question.trim()}>Send</button>
                </div>
              </form>
            )}
          </section>

          {error && <p className="error" role="alert">{error}</p>}

          <div className="concept-navigation">
            <button
              type="button"
              onClick={() => setCurrentConceptIndex((index) => index - 1)}
              disabled={currentConceptIndex === 0}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentConceptIndex((index) => index + 1)}
              disabled={currentConceptIndex === concepts.length - 1}
            >
              Next
            </button>
          </div>

          <button type="button" className="panic-button" onClick={handlePanic}>
            I&apos;m completely lost
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <section className="card" aria-labelledby="page-title">
        <p className="eyebrow">Study helper</p>
        <h1 id="page-title">Turn course notes into concepts</h1>
        <p className="intro">Paste your notes below and we’ll identify the ideas worth studying.</p>

        <label htmlFor="course-notes">Course notes</label>
        <textarea
          id="course-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Paste your course notes here…"
          rows="12"
        />

        <button type="button" onClick={handleBreakIntoConcepts} disabled={!notes.trim() || isLoading}>
          {isLoading ? 'Extracting concepts…' : 'Break into Concepts'}
        </button>

        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default App
