import { useEffect, useRef, useState } from 'react'
import { extractConcepts } from './extractConcepts.js'
import { getConceptDetails } from './conceptDetails.js'
import { createNarration } from './narration.js'
import { assessUnderstanding, requestTeachingAssist } from './teachingAssist.js'

function App() {
  const [notes, setNotes] = useState('')
  const [concepts, setConcepts] = useState([])
  const [conceptDetails, setConceptDetails] = useState({})
  const [understanding, setUnderstanding] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isClarifying, setIsClarifying] = useState(false)
  const [isSimplifying, setIsSimplifying] = useState(false)
  const [checkingQuestion, setCheckingQuestion] = useState('')
  const [error, setError] = useState('')
  const [retryAction, setRetryAction] = useState(null)
  const [detailRetry, setDetailRetry] = useState(0)
  const [currentConceptIndex, setCurrentConceptIndex] = useState(0)
  const [sessionView, setSessionView] = useState('lesson')
  const [dependencyGate, setDependencyGate] = useState(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkAnswers, setCheckAnswers] = useState({})
  const [checkFeedback, setCheckFeedback] = useState({})
  const [checkScores, setCheckScores] = useState({})
  const [helpRequestOpen, setHelpRequestOpen] = useState(false)
  const [helpRequest, setHelpRequest] = useState('')
  const [isReteaching, setIsReteaching] = useState(false)
  const [voice, setVoice] = useState('feminine')
  const [playbackState, setPlaybackState] = useState('idle')
  const [question, setQuestion] = useState('')
  const [clarification, setClarification] = useState('')
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizAnswer, setQuizAnswer] = useState('')
  const [quizResults, setQuizResults] = useState([])
  const [isQuizChecking, setIsQuizChecking] = useState(false)
  const audioRef = useRef(null)
  const audioUrlRef = useRef(null)

  const currentConcept = concepts[currentConceptIndex]
  const currentDetail = currentConcept ? conceptDetails[currentConcept.id] : null
  const currentStatus = currentConcept ? understanding[currentConcept.id] : null
  const displayedExplanation = currentDetail?.explanation || currentConcept?.summary || currentConcept?.description || ''
  const progress = concepts.length ? Math.round(((currentConceptIndex + 1) / concepts.length) * 100) : 0
  const finalQuizItems = concepts.flatMap((concept) => (
    (conceptDetails[concept.id]?.check_questions || []).slice(0, 2).map((checkQuestion) => ({
      conceptId: concept.id,
      conceptTitle: concept.title,
      explanation: conceptDetails[concept.id]?.explanation || concept.summary || concept.description,
      checkQuestion,
    }))
  ))

  function showError(message, retry) {
    setError(message)
    setRetryAction(() => retry)
  }

  function clearError() {
    setError('')
    setRetryAction(null)
  }

  useEffect(() => {
    if (!currentConcept || currentDetail) return undefined

    let isCurrent = true
    setIsDetailLoading(true)
    clearError()

    getConceptDetails(notes, currentConcept)
      .then((detail) => {
        if (isCurrent) setConceptDetails((details) => ({ ...details, [currentConcept.id]: detail }))
      })
      .catch((requestError) => {
        if (isCurrent) {
          showError(
            requestError.message || 'Unable to prepare this concept.',
            () => setDetailRetry((value) => value + 1),
          )
        }
      })
      .finally(() => {
        if (isCurrent) setIsDetailLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [currentConcept, currentDetail, detailRetry, notes])

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
    setClarification('')
    setCheckInOpen(false)
    setCheckAnswers({})
    setCheckFeedback({})
    setCheckScores({})
    setHelpRequestOpen(false)
    setHelpRequest('')

    return stopNarration
  }, [currentConceptIndex])

  useEffect(() => stopNarration, [])

  async function playNarration(text = displayedExplanation) {
    if (!text) return

    setPlaybackState('loading')
    try {
      stopNarration()
      const audioBlob = await createNarration(text, voice)
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioUrlRef.current = audioUrl
      audioRef.current = audio
      audio.onended = () => setPlaybackState('idle')
      await audio.play()
      setPlaybackState('playing')
    } catch (requestError) {
      stopNarration()
      setPlaybackState('idle')
      showError(requestError.message || 'Unable to play narration.', () => playNarration(text))
    }
  }

  async function handleBreakIntoConcepts() {
    setIsLoading(true)
    clearError()
    try {
      const extractedConcepts = await extractConcepts(notes)
      setConcepts(extractedConcepts)
      setConceptDetails({})
      setUnderstanding({})
      setDependencyGate(null)
      setCurrentConceptIndex(0)
      setSessionView('lesson')
      setQuizIndex(0)
      setQuizAnswer('')
      setQuizResults([])
    } catch (requestError) {
      showError(requestError.message || 'Something went wrong while extracting concepts.', handleBreakIntoConcepts)
    } finally {
      setIsLoading(false)
    }
  }

  async function handlePlay() {
    clearError()
    if (audioRef.current && playbackState === 'paused') {
      try {
        await audioRef.current.play()
        setPlaybackState('playing')
      } catch (requestError) {
        showError(requestError.message || 'Unable to resume narration.', handlePlay)
      }
      return
    }
    await playNarration()
  }

  function handlePause() {
    audioRef.current?.pause()
    setPlaybackState('paused')
  }

  async function handleClarify(text) {
    if (!displayedExplanation) return
    setIsClarifying(true)
    clearError()
    try {
      const answer = await requestTeachingAssist('clarify', displayedExplanation, text)
      setClarification(answer)
      await playNarration(answer)
    } catch (requestError) {
      showError(requestError.message || 'Unable to answer that question.', () => handleClarify(text))
    } finally {
      setIsClarifying(false)
    }
  }

  async function handlePanic() {
    if (!currentConcept || !currentDetail?.explanation) return
    setIsSimplifying(true)
    clearError()
    try {
      const simplifiedExplanation = await requestTeachingAssist('panic', displayedExplanation)
      setConceptDetails((details) => ({
        ...details,
        [currentConcept.id]: { ...details[currentConcept.id], explanation: simplifiedExplanation },
      }))
      setUnderstanding((statuses) => {
        const next = { ...statuses }
        delete next[currentConcept.id]
        return next
      })
      await playNarration(simplifiedExplanation)
    } catch (requestError) {
      showError(requestError.message || 'Unable to simplify this concept.', handlePanic)
    } finally {
      setIsSimplifying(false)
    }
  }

  async function handleCheckAnswer(checkQuestion) {
    const answer = checkAnswers[checkQuestion]?.trim()
    if (!answer || !displayedExplanation || !currentConcept) return

    setCheckingQuestion(checkQuestion)
    clearError()
    try {
      const result = await assessUnderstanding(displayedExplanation, checkQuestion, answer)
      setCheckFeedback((feedback) => ({ ...feedback, [checkQuestion]: result.feedback }))
      setCheckScores((scores) => ({ ...scores, [checkQuestion]: result.score }))
      setUnderstanding((statuses) => ({ ...statuses, [currentConcept.id]: result.understanding }))
    } catch (requestError) {
      showError(requestError.message || 'Unable to check that answer.', () => handleCheckAnswer(checkQuestion))
    } finally {
      setCheckingQuestion('')
    }
  }

  function submitQuestion(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return
    setQuestion('')
    handleClarify(trimmedQuestion)
  }

  function tryNavigate(targetIndex) {
    const target = concepts[targetIndex]
    if (!target) return

    const dependency = target.depends_on
      ?.map((title) => concepts.find((concept) => concept.title === title))
      .find((concept) => concept && ['skipped', 'shaky'].includes(understanding[concept.id]))

    if (dependency) {
      setDependencyGate({ targetIndex, dependency })
      return
    }

    setCurrentConceptIndex(targetIndex)
  }

  function requestNext() {
    if (!currentConcept || isDetailLoading || !currentDetail) return
    const targetIndex = currentConceptIndex + 1
    const checkQuestions = currentDetail.check_questions || []
    const allQuestionsAnswered = checkQuestions.every((checkQuestion) => checkFeedback[checkQuestion])

    if (checkQuestions.length > 0 && (!checkInOpen || !allQuestionsAnswered)) {
      setCheckInOpen(true)
      return
    }

    if (targetIndex === concepts.length) {
      setSessionView(finalQuizItems.length ? 'quiz' : 'summary')
      return
    }

    tryNavigate(targetIndex)
  }

  async function handleReteach() {
    if (!currentConcept || !helpRequest.trim() || !displayedExplanation) return

    setIsReteaching(true)
    clearError()
    try {
      const reteach = await requestTeachingAssist('reteach', displayedExplanation, helpRequest.trim())
      setConceptDetails((details) => ({
        ...details,
        [currentConcept.id]: { ...details[currentConcept.id], explanation: reteach },
      }))
      setUnderstanding((statuses) => {
        const next = { ...statuses }
        delete next[currentConcept.id]
        return next
      })
      setCheckAnswers({})
      setCheckFeedback({})
      setCheckScores({})
      setHelpRequestOpen(false)
      setHelpRequest('')
      await playNarration(reteach)
    } catch (requestError) {
      showError(requestError.message || 'Unable to re-teach this concept.', handleReteach)
    } finally {
      setIsReteaching(false)
    }
  }

  function revisitDependency() {
    if (!dependencyGate) return
    const { dependency } = dependencyGate
    setUnderstanding((statuses) => {
      const next = { ...statuses }
      delete next[dependency.id]
      return next
    })
    setDependencyGate(null)
    setCurrentConceptIndex(concepts.findIndex((concept) => concept.id === dependency.id))
  }

  async function handleFinalQuizAnswer() {
    const item = finalQuizItems[quizIndex]
    const answer = quizAnswer.trim()
    if (!item || !answer) return

    setIsQuizChecking(true)
    clearError()
    try {
      const result = await assessUnderstanding(item.explanation, item.checkQuestion, answer)
      setQuizResults((results) => [...results, { ...item, answer, ...result, index: quizIndex }])
    } catch (requestError) {
      showError(requestError.message || 'Unable to check that answer.', handleFinalQuizAnswer)
    } finally {
      setIsQuizChecking(false)
    }
  }

  function advanceFinalQuiz() {
    if (quizIndex >= finalQuizItems.length - 1) {
      setSessionView('summary')
      return
    }
    setQuizIndex((index) => index + 1)
    setQuizAnswer('')
  }

  function revisitFromSummary(conceptId) {
    const index = concepts.findIndex((concept) => concept.id === conceptId)
    if (index < 0) return
    setUnderstanding((statuses) => {
      const next = { ...statuses }
      delete next[conceptId]
      return next
    })
    setSessionView('lesson')
    setCurrentConceptIndex(index)
  }

  if (sessionView === 'quiz') {
    const item = finalQuizItems[quizIndex]
    const result = quizResults.find((quizResult) => quizResult.index === quizIndex)

    if (!item) {
      return (
        <main className="page-shell teaching-shell">
          <section className="teaching-card quiz-card">
            <article className="quiz-content">
              <h1>Ready for your wrap-up?</h1>
              <p>There aren&apos;t any check questions available for this set, so let&apos;s look at your session summary.</p>
              <button type="button" onClick={() => setSessionView('summary')}>See my summary</button>
            </article>
          </section>
        </main>
      )
    }

    return (
      <main className="page-shell teaching-shell">
        <section className="teaching-card quiz-card" aria-labelledby="quiz-title">
          <header className="slide-header">
            <p className="slide-progress">Final check-in · {quizIndex + 1} of {finalQuizItems.length}</p>
            <div className="progress-track" aria-hidden="true"><span style={{ width: `${Math.round(((quizIndex + 1) / finalQuizItems.length) * 100)}%` }} /></div>
          </header>
          <article className="quiz-content">
            <p className="eyebrow">{item.conceptTitle}</p>
            <h1 id="quiz-title">One more quick thought</h1>
            <p className="quiz-question">{item.checkQuestion}</p>
            {!result ? (
              <>
                <label htmlFor="final-quiz-answer">Your answer</label>
                <textarea
                  id="final-quiz-answer"
                  value={quizAnswer}
                  onChange={(event) => setQuizAnswer(event.target.value)}
                  placeholder="Put it in your own words"
                  rows="5"
                  disabled={isQuizChecking}
                />
                <button type="button" onClick={handleFinalQuizAnswer} disabled={!quizAnswer.trim() || isQuizChecking}>
                  {isQuizChecking ? 'Checking your answer…' : 'Check my answer'}
                </button>
              </>
            ) : (
              <div className={`quiz-feedback ${result.understanding}`}>
                <p>{result.feedback}</p>
                <button type="button" onClick={advanceFinalQuiz}>
                  {quizIndex === finalQuizItems.length - 1 ? 'See my summary' : 'Next question'}
                </button>
              </div>
            )}
          </article>
          {error && <div className="error quiz-error" role="alert"><span>{error}</span>{retryAction && <button type="button" className="retry-button" onClick={retryAction}>Try again</button>}</div>}
        </section>
      </main>
    )
  }

  if (sessionView === 'summary') {
    const summary = concepts.map((concept) => {
      const quizEvidence = quizResults.filter((result) => result.conceptId === concept.id)
      const earlierStatus = understanding[concept.id]
      const hasGap = earlierStatus === 'skipped'
        || earlierStatus === 'shaky'
        || quizEvidence.some((result) => result.understanding === 'shaky')
        || quizEvidence.length === 0
      return { concept, hasGap }
    })
    const solidConcepts = summary.filter(({ hasGap }) => !hasGap)
    const revisitConcepts = summary.filter(({ hasGap }) => hasGap)

    return (
      <main className="page-shell teaching-shell">
        <section className="teaching-card summary-card" aria-labelledby="summary-title">
          <article className="summary-content">
            <p className="eyebrow">Session wrap-up</p>
            <h1 id="summary-title">Nice work showing up for it.</h1>
            <p>You worked through {concepts.length} concepts and finished the final check-in.</p>

            <section className="summary-section" aria-labelledby="solid-title">
              <h2 id="solid-title">Looking solid</h2>
              {solidConcepts.length > 0 ? (
                <ul>{solidConcepts.map(({ concept }) => <li key={concept.id}>{concept.title}</li>)}</ul>
              ) : (
                <p>Keep practicing — the final check-in is just a snapshot, not the whole story.</p>
              )}
            </section>

            <section className="summary-section gaps" aria-labelledby="revisit-title">
              <h2 id="revisit-title">Worth revisiting</h2>
              {revisitConcepts.length > 0 ? (
                <div className="revisit-list">
                  {revisitConcepts.map(({ concept }) => (
                    <div key={concept.id}>
                      <span>{concept.title}</span>
                      <button type="button" className="secondary-button" onClick={() => revisitFromSummary(concept.id)}>Revisit this concept</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Nothing is calling for a revisit right now. Keep that momentum going.</p>
              )}
            </section>
          </article>
        </section>
      </main>
    )
  }

  if (dependencyGate) {
    const { dependency, targetIndex } = dependencyGate
    return (
      <main className="page-shell teaching-shell">
        <section className="teaching-card dependency-card" aria-labelledby="dependency-title">
          <article className="dependency-content">
            <p className="eyebrow">Quick heads-up</p>
            <h1 id="dependency-title">Before we jump ahead…</h1>
            <p>
              This next idea builds on <strong>{dependency.title}</strong>. You {understanding[dependency.id] === 'skipped' ? 'skipped the check-in for' : 'had a tougher time with'} that one earlier.
              Want to revisit it first, or keep going?
            </p>
            <div className="dependency-actions">
              <button type="button" onClick={revisitDependency}>Revisit {dependency.title}</button>
              <button type="button" className="secondary-button" onClick={() => {
                setDependencyGate(null)
                setCurrentConceptIndex(targetIndex)
              }}>
                Keep going
              </button>
            </div>
          </article>
        </section>
      </main>
    )
  }

  if (currentConcept) {
    const readyForCheckIn = currentDetail?.check_questions?.length > 0 && !isDetailLoading && !isClarifying && !isSimplifying

    return (
      <main className="page-shell teaching-shell">
        <section className="teaching-card" aria-labelledby="concept-title">
          <header className="slide-header">
            <p className="slide-progress">Concept {currentConceptIndex + 1} of {concepts.length}</p>
            <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          </header>

          <article className="slide-content">
            <p className="eyebrow">Today&apos;s idea</p>
            <h1 id="concept-title">{currentConcept.title}</h1>
            <p className="concept-explanation">{displayedExplanation}</p>
            {isDetailLoading && <p className="detail-loading" role="status">Preparing the teaching explanation…</p>}
            {currentConcept.depends_on?.length > 0 && <p className="dependencies">Builds on: {currentConcept.depends_on.join(', ')}</p>}
          </article>

          {readyForCheckIn && checkInOpen && (
            <section className="check-questions" aria-labelledby="check-questions-title">
              <p className="quick-check-label">Quick check-in</p>
              <h2 id="check-questions-title">Answer these questions to see how well it clicked</h2>
              <p className="check-in-copy">Answer each question in your own words. You’ll get a score and quick feedback before moving on.</p>
              {currentDetail.check_questions.map((checkQuestion) => (
                <div className="check-question" key={checkQuestion}>
                  <p>{checkQuestion}</p>
                  <div>
                    <input
                      value={checkAnswers[checkQuestion] || ''}
                      onChange={(event) => setCheckAnswers((answers) => ({ ...answers, [checkQuestion]: event.target.value }))}
                      placeholder="Write your answer in your own words"
                      disabled={checkingQuestion === checkQuestion}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleCheckAnswer(checkQuestion)}
                      disabled={!checkAnswers[checkQuestion]?.trim() || checkingQuestion === checkQuestion}
                    >
                      {checkingQuestion === checkQuestion ? 'Checking…' : 'Check it'}
                    </button>
                  </div>
                  {checkFeedback[checkQuestion] && (
                    <div className="check-feedback">
                      <strong>Score: {checkScores[checkQuestion]}%</strong>
                      <p>{checkFeedback[checkQuestion]}</p>
                    </div>
                  )}
                </div>
              ))}
              {!helpRequestOpen ? (
                <button type="button" className="help-button" onClick={() => setHelpRequestOpen(true)}>
                  I need more help getting it
                </button>
              ) : (
                <div className="reteach-form">
                  <label htmlFor="reteach-request">What part didn&apos;t click for you?</label>
                  <textarea
                    id="reteach-request"
                    value={helpRequest}
                    onChange={(event) => setHelpRequest(event.target.value)}
                    placeholder="Tell me what feels confusing"
                    rows="3"
                    disabled={isReteaching}
                  />
                  <button type="button" onClick={handleReteach} disabled={!helpRequest.trim() || isReteaching}>
                    {isReteaching ? 'Re-teaching…' : 'Help me get it'}
                  </button>
                </div>
              )}
            </section>
          )}

          {currentStatus && (
            <p className={`understanding-status ${currentStatus}`}>
              {currentStatus === 'confirmed' ? 'Nice — that sounds like it clicked.' : currentStatus === 'shaky' ? 'You gave it a go. We’ll flag it as a good one to revisit.' : 'All good — you can keep moving.'}
            </p>
          )}

          <section className="teaching-tools" aria-label="Teaching tools">
            <div className="narration-tools">
              <span className="tool-label">Listen</span>
              <div className="voice-picker" aria-label="Narration voice">
                <button type="button" className={voice === 'feminine' ? 'selected' : ''} onClick={() => setVoice('feminine')} aria-pressed={voice === 'feminine'} disabled={playbackState === 'playing' || playbackState === 'loading'}>Feminine voice</button>
                <button type="button" className={voice === 'masculine' ? 'selected' : ''} onClick={() => setVoice('masculine')} aria-pressed={voice === 'masculine'} disabled={playbackState === 'playing' || playbackState === 'loading'}>Masculine voice</button>
              </div>
              {playbackState === 'playing' ? (
                <button type="button" className="secondary-button" onClick={handlePause}>Pause</button>
              ) : (
                <button type="button" className="secondary-button" onClick={handlePlay} disabled={playbackState === 'loading'}>{playbackState === 'loading' ? 'Preparing narration…' : 'Play'}</button>
              )}
            </div>

            <form className="clarify-form" onSubmit={submitQuestion}>
              <label htmlFor="clarify-question">Questions?</label>
              <div>
                <input id="clarify-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this concept" disabled={isClarifying} />
                <button type="submit" className="secondary-button" disabled={!question.trim() || isClarifying}>{isClarifying ? 'Answering…' : 'Ask'}</button>
              </div>
              {isClarifying && <p className="tool-loading" role="status">Finding a clear answer…</p>}
              {clarification && <p className="clarification-answer">{clarification}</p>}
            </form>
          </section>

          {isSimplifying && <p className="tool-loading card-message" role="status">Rebuilding this idea from scratch…</p>}
          {error && <div className="error" role="alert"><span>{error}</span>{retryAction && <button type="button" className="retry-button" onClick={retryAction}>Try again</button>}</div>}

          <footer className="slide-footer">
            <div className="concept-navigation">
              <button type="button" className="secondary-button" onClick={() => setCurrentConceptIndex((index) => index - 1)} disabled={currentConceptIndex === 0}>Back</button>
              <button
                type="button"
                className="secondary-button"
                onClick={requestNext}
                disabled={isDetailLoading || !currentDetail}
              >
                {currentConceptIndex === concepts.length - 1 ? 'Finish & review' : 'Next'}
              </button>
            </div>
            <button type="button" className="panic-button" onClick={handlePanic} disabled={isSimplifying || isDetailLoading || !currentDetail?.explanation}>{isSimplifying ? 'Simplifying…' : 'I’m completely lost'}</button>
          </footer>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <section className="card" aria-labelledby="page-title">
        <p className="eyebrow">FocoTA - Study Helper</p>
        <h1 id="page-title">Turn course notes into concepts</h1>
        <p className="intro">Paste your notes below and we’ll identify the ideas worth studying.</p>
        <label htmlFor="course-notes">Course notes</label>
        <textarea id="course-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Paste your course notes here…" rows="12" />
        <button type="button" onClick={handleBreakIntoConcepts} disabled={!notes.trim() || isLoading}>{isLoading ? 'Extracting concepts…' : 'Break into Concepts'}</button>
        {isLoading && <p className="request-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Hang in there! Uploading your documents…</p>}
        {error && <div className="error" role="alert"><span>{error}</span>{retryAction && <button type="button" className="retry-button" onClick={retryAction}>Try again</button>}</div>}
      </section>
    </main>
  )
}

export default App
