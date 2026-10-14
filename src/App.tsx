import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Camera,
  Check,
  CircleHelp,
  Focus,
  Download,
  LoaderCircle,
  Pause,
  RotateCcw,
  ScanLine,
  Sparkles,
  Share,
  Volume2,
} from 'lucide-react'
import { createWorker } from 'tesseract.js'
import { lookupWord, normalizeWord, type DictionaryEntry } from './wordnet'
import './App.css'

type WordBox = {
  text: string
  confidence: number
  x0: number
  y0: number
  x1: number
  y1: number
  sightings: number
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const fallbackDefinitions: Record<string, DictionaryEntry> = {
  curious: {
    partOfSpeech: 'adjective',
    meaning: 'Eager to know or learn something; showing interest in the world.',
    example: 'A curious reader notices the small details.',
  },
  luminous: {
    partOfSpeech: 'adjective',
    meaning: 'Full of or shedding light; bright or shining.',
    example: 'The luminous page caught the afternoon sun.',
  },
  quiet: {
    partOfSpeech: 'adjective',
    meaning: 'Making little or no noise; calm and still.',
  },
  journey: {
    partOfSpeech: 'noun',
    meaning: 'An act of travelling from one place to another, often over a long distance.',
  },
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null)
  const wordsRef = useRef<WordBox[]>([])
  const timeoutRef = useRef<number | null>(null)
  const sessionRef = useRef(0)
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 })
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle')
  const [cameraError, setCameraError] = useState('')
  const [scanMessage, setScanMessage] = useState('Camera is off')
  const [words, setWords] = useState<WordBox[]>([])
  const [aim, setAim] = useState({ x: 50, y: 50 })
  const [definition, setDefinition] = useState<DictionaryEntry | null>(null)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [definitionLoadingTerm, setDefinitionLoadingTerm] = useState('')
  const [definitionSource, setDefinitionSource] = useState('')
  const [definitionTerm, setDefinitionTerm] = useState('')
  const [savedWords, setSavedWords] = useState<string[]>([])
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [showInstallHint, setShowInstallHint] = useState(false)
  const [isIos] = useState(() => {
    const browser = navigator as Navigator & { standalone?: boolean }
    return /iPad|iPhone|iPod/.test(browser.userAgent) && !browser.standalone
  })

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const selectedWord = (() => {
    const frameX = (aim.x / 100) * frameSize.width
    const frameY = (aim.y / 100) * frameSize.height
    const selectableWords = words.filter((word) => word.sightings >= 2 && word.confidence >= 42 && normalizeWord(word.text))
    const within = selectableWords.find((word) => frameX >= word.x0 && frameX <= word.x1 && frameY >= word.y0 && frameY <= word.y1)
    if (within) return within

    const closest = selectableWords.reduce<{ word: WordBox | null; distance: number }>(
      (result, word) => {
        const centerX = (word.x0 + word.x1) / 2
        const centerY = (word.y0 + word.y1) / 2
        const distance = Math.hypot(frameX - centerX, frameY - centerY)
        return distance < result.distance ? { word, distance } : result
      },
      { word: null, distance: Number.POSITIVE_INFINITY },
    )
    return closest.distance < frameSize.width * 0.022 ? closest.word : null
  })()

  const selectedTerm = selectedWord ? normalizeWord(selectedWord.text) : ''
  const stableWords = words.filter((word) => word.sightings >= 2 && word.confidence >= 42)
  const currentDefinition = definitionTerm === selectedTerm ? definition : null
  const currentDefinitionSource = definitionTerm === selectedTerm ? definitionSource : ''
  const currentDefinitionLoading = definitionLoading && definitionLoadingTerm === selectedTerm

  useEffect(() => {
    if (!selectedTerm) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setDefinitionLoading(true)
      setDefinitionLoadingTerm(selectedTerm)
      void lookupWord(selectedTerm, controller.signal)
        .then((entry) => {
          if (controller.signal.aborted) return
          const fallback = fallbackDefinitions[selectedTerm]
          setDefinition(entry ?? fallback ?? null)
          setDefinitionTerm(selectedTerm)
          setDefinitionSource(entry ? 'WordNet 3.1' : fallback ? 'Built-in definition' : 'Not in WordNet')
        })
        .catch(() => {
          if (controller.signal.aborted) return
          const fallback = fallbackDefinitions[selectedTerm]
          setDefinition(fallback ?? null)
          setDefinitionTerm(selectedTerm)
          setDefinitionSource(fallback ? 'Built-in definition' : 'Offline dictionary unavailable')
        })
        .finally(() => {
          if (!controller.signal.aborted) setDefinitionLoading(false)
        })
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [selectedTerm])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    sessionRef.current += 1
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    void workerRef.current?.terminate()
  }, [])

  const startCamera = async () => {
    const session = ++sessionRef.current
    setCameraState('starting')
    setCameraError('')
    setWords([])
    wordsRef.current = []
    setScanMessage('Requesting camera access')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1000 } },
      })
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (!videoRef.current) throw new Error('Camera preview is unavailable')
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setScanMessage('Preparing text recognition')

      const worker = await createWorker('eng', 1, {
        logger: (event) => {
          if (session === sessionRef.current && event.status === 'recognizing text') {
            setScanMessage('Reading the page')
          }
        },
      })
      if (session !== sessionRef.current) {
        await worker.terminate()
        return
      }
      workerRef.current = worker
      setCameraState('live')
      setScanMessage('Finding words on the page')

      const recognizeFrame = async () => {
        if (session !== sessionRef.current) return
        const video = videoRef.current
        const canvas = frameRef.current
        const context = canvas?.getContext('2d', { willReadFrequently: true })
        if (!video || !canvas || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          timeoutRef.current = window.setTimeout(recognizeFrame, 350)
          return
        }

        const scale = Math.min(1, 1280 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const recognitionFrameWidth = canvas.width
        setFrameSize((current) => current.width === canvas.width && current.height === canvas.height
          ? current
          : { width: canvas.width, height: canvas.height })
        context.filter = 'grayscale(1) contrast(1.35) brightness(1.05)'
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        context.filter = 'none'

        try {
          const result = await worker.recognize(canvas, {}, { blocks: true })
          if (session !== sessionRef.current) return
          const recognizedWords = result.data.blocks?.flatMap((block) =>
            block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
          ) ?? []
          const previousWords = wordsRef.current
          const matchedPrevious = new Set<number>()
          const foundWords = recognizedWords
            .filter((word) => word.confidence >= 22 && normalizeWord(word.text))
            .map((word) => {
              const detected = {
              text: word.text.trim(),
              confidence: word.confidence,
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
              }
              const normalizedText = normalizeWord(detected.text)
              let matchIndex = -1
              let nearestDistance = Number.POSITIVE_INFINITY

              previousWords.forEach((previous, index) => {
                if (matchedPrevious.has(index) || normalizeWord(previous.text) !== normalizedText) return
                const distance = Math.hypot(
                  (detected.x0 + detected.x1 - previous.x0 - previous.x1) / 2,
                  (detected.y0 + detected.y1 - previous.y0 - previous.y1) / 2,
                )
                if (distance < nearestDistance && distance < recognitionFrameWidth * 0.035) {
                  matchIndex = index
                  nearestDistance = distance
                }
              })

              if (matchIndex < 0) return { ...detected, sightings: 1 }
              matchedPrevious.add(matchIndex)
              const previous = previousWords[matchIndex]
              const blend = (oldValue: number, newValue: number) => oldValue * 0.58 + newValue * 0.42
              return {
                ...detected,
                x0: blend(previous.x0, detected.x0),
                y0: blend(previous.y0, detected.y0),
                x1: blend(previous.x1, detected.x1),
                y1: blend(previous.y1, detected.y1),
                sightings: previous.sightings + 1,
              }
            })
          wordsRef.current = foundWords
          setWords(foundWords)
          const recognizedText = result.data.text.trim()
          const stableCount = foundWords.filter((word) => word.sightings >= 2 && word.confidence >= 42).length
          setScanMessage(stableCount
            ? `${stableCount} steady words · tap or point to explore`
            : foundWords.length
              ? 'Holding the page steady to confirm words…'
            : recognizedText
                ? 'Text is uncertain · steady the page and reduce glare'
                : 'No text found · flatten the page and check the light')
        } catch {
          if (session === sessionRef.current) setScanMessage('Having trouble reading; adjusting focus…')
        }

        if (session === sessionRef.current) timeoutRef.current = window.setTimeout(recognizeFrame, 1150)
      }

      void recognizeFrame()
    } catch (error) {
      if (session !== sessionRef.current) return
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const message = error instanceof Error ? error.message : 'Camera could not be started.'
      setCameraError(message.includes('Permission') ? 'Allow camera access in your browser to scan a page.' : message)
      setCameraState('error')
      setScanMessage('Camera unavailable')
    }
  }

  const stopCamera = () => {
    sessionRef.current += 1
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    const worker = workerRef.current
    workerRef.current = null
    if (worker) void worker.terminate()
    setCameraState('idle')
    setWords([])
    wordsRef.current = []
    setScanMessage('Camera is off')
  }

  const getWordStyle = (word: WordBox): React.CSSProperties => {
    const bounds = stageSize
    if (!bounds.width || !bounds.height) return {}
    const scale = Math.max(bounds.width / frameSize.width, bounds.height / frameSize.height)
    const renderedWidth = frameSize.width * scale
    const renderedHeight = frameSize.height * scale
    const offsetX = (bounds.width - renderedWidth) / 2
    const offsetY = (bounds.height - renderedHeight) / 2
    return {
      left: `${((word.x0 * scale + offsetX) / bounds.width) * 100}%`,
      top: `${((word.y0 * scale + offsetY) / bounds.height) * 100}%`,
      width: `${(((word.x1 - word.x0) * scale) / bounds.width) * 100}%`,
      height: `${(((word.y1 - word.y0) * scale) / bounds.height) * 100}%`,
    }
  }

  const moveAim = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    const scale = Math.max(bounds.width / frameSize.width, bounds.height / frameSize.height)
    const offsetX = (bounds.width - frameSize.width * scale) / 2
    const offsetY = (bounds.height - frameSize.height * scale) / 2
    const x = ((event.clientX - bounds.left - offsetX) / (frameSize.width * scale)) * 100
    const y = ((event.clientY - bounds.top - offsetY) / (frameSize.height * scale)) * 100
    setAim({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
  }

  const toggleSavedWord = () => {
    if (!selectedWord) return
    const word = selectedWord.text.toLowerCase()
    setSavedWords((current) => current.includes(word) ? current.filter((item) => item !== word) : [...current, word])
  }

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstallHint((visible) => !visible)
      return
    }
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  const saved = selectedWord ? savedWords.includes(selectedWord.text.toLowerCase()) : false

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#reader" aria-label="Margin home">
          <span className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></span>
          <span>margin<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-center"><span className="chapter-index">01</span><span className="topbar-divider" /><span>Live reader</span></div>
        <div className="topbar-actions">
          {(installPrompt || isIos) && <button type="button" className="install-button" onClick={handleInstall}><Download size={15} />Install</button>}
          <div className="topbar-status"><span className={`status-dot ${cameraState === 'live' ? 'is-live' : ''}`} />{cameraState === 'live' ? 'Camera active' : 'Ready'}</div>
        </div>
      </header>

      <section className="reader-page" id="reader">
        {showInstallHint && isIos && <div className="install-hint" role="status"><Share size={16} />Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> to install Margin.<button type="button" onClick={() => setShowInstallHint(false)} aria-label="Dismiss install tip">×</button></div>}
        <div className="page-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" />READ ALONG / 01</p>
            <h1>A little help<br className="mobile-break" /> with the <em>hard words.</em></h1>
            <p className="page-intro">Hold a page in view. We’ll find the words and bring their meaning into the margin.</p>
          </div>
          <div className="page-number" aria-hidden="true"><span>FIELD</span><strong>01</strong><span>NOTES</span></div>
        </div>

        <div className="reader-grid">
          <section className="camera-column" aria-label="Live book camera">
            <div className="section-heading">
              <div><span className="section-kicker">YOUR PAGE</span><h2>Reading window</h2></div>
              <div className="live-counter"><span className={`status-dot ${cameraState === 'live' ? 'is-live' : ''}`} />{cameraState === 'live' ? 'LIVE' : 'STANDBY'}</div>
            </div>

            <div
              className={`camera-stage ${cameraState === 'live' ? 'camera-stage-live' : ''}`}
              ref={stageRef}
              onPointerMove={moveAim}
              onPointerDown={moveAim}
            >
              <video ref={videoRef} className="camera-video" autoPlay muted playsInline aria-label="Live view of your book page" />
              <canvas ref={frameRef} className="recognition-canvas" aria-hidden="true" />

              {cameraState !== 'live' && (
                <div className="camera-empty">
                  <span className="camera-emblem"><Camera size={27} strokeWidth={1.5} /></span>
                  <p className="empty-title">A page, in focus.</p>
                  <p className="empty-copy">Set your book in good light and bring a page into view.</p>
                  {cameraState === 'error' && <p className="camera-error" role="alert">{cameraError}</p>}
                  <button className="primary-button" type="button" onClick={startCamera} disabled={cameraState === 'starting'}>
                    {cameraState === 'starting' ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}
                    {cameraState === 'starting' ? 'Waking the camera…' : 'Turn on camera'}
                  </button>
                </div>
              )}

              {cameraState === 'live' && (
                <>
                  <div className="camera-corners" aria-hidden="true"><i /><i /><i /><i /></div>
                  {stableWords.map((word, index) => {
                    const style = getWordStyle(word)
                    const isSelected = word === selectedWord
                    return <span key={`${word.text}-${word.x0}-${index}`} className={`word-box ${isSelected ? 'word-box-selected' : ''}`} style={style} aria-hidden="true" />
                  })}
                  <div className="aim-reticle" style={{ left: `${aim.x}%`, top: `${aim.y}%` }} aria-hidden="true"><span /><i /></div>
                  {selectedWord && (
                    <div
                      className="word-tooltip"
                      style={{
                        left: `clamp(0.6rem, ${aim.x}%, calc(100% - 15rem))`,
                        top: `${Math.max(14, aim.y)}%`,
                      }}
                    >
                      <span className="tooltip-label">IN THE MARGIN</span>
                      <strong>{selectedWord.text}</strong>
                      <span>{currentDefinitionLoading ? 'Finding its meaning…' : currentDefinition?.meaning ?? 'No definition found yet.'}</span>
                    </div>
                  )}
                  <div className="stage-top-label"><ScanLine size={14} /> LIVE TEXT</div>
                  <button className="stage-aim-reset" type="button" onClick={() => setAim({ x: 50, y: 50 })} aria-label="Center aim point" title="Center aim point"><RotateCcw size={15} /></button>
                  <button className="stage-stop" type="button" onClick={stopCamera} aria-label="Stop camera" title="Stop camera"><Pause size={15} /></button>
                </>
              )}

              <div className="stage-caption"><span className={`status-dot ${cameraState === 'live' ? 'is-live' : ''}`} />{scanMessage}</div>
            </div>

            <div className="camera-footer">
              <span><Focus size={15} />{cameraState === 'live' ? 'Tap or point at a word' : 'Aim at a printed page'}</span>
              <span className="word-count">{cameraState === 'live' ? `${stableWords.length} steady` : 'No photo is taken'}</span>
            </div>
          </section>

          <aside className="meaning-column" aria-label="Word meaning">
            <div className="section-heading meaning-heading">
              <div><span className="section-kicker">A CLOSER LOOK</span><h2>In the margin</h2></div>
              <Sparkles size={18} className="meaning-sparkle" strokeWidth={1.6} />
            </div>

            <div className={`meaning-panel ${selectedWord ? 'meaning-panel-active' : ''}`} aria-live="polite">
              {selectedWord ? (
                <>
                  <div className="meaning-panel-top"><span className="meaning-overline">WORD IN FOCUS</span><button className={`save-button ${saved ? 'is-saved' : ''}`} type="button" onClick={toggleSavedWord} aria-label={saved ? 'Remove saved word' : 'Save word'} title={saved ? 'Remove saved word' : 'Save word'}>{saved ? <Check size={17} /> : <BookOpen size={17} />}</button></div>
                  <h3 className="focus-word">{selectedWord.text.replace(/[^\p{L}'-]/gu, '')}</h3>
                  <div className="word-meta"><span>{currentDefinition?.partOfSpeech ?? (currentDefinitionLoading ? 'looking it up' : 'word')}</span></div>
                  <div className="meaning-rule" />
                  {currentDefinitionLoading ? (
                    <p className="definition-loading"><LoaderCircle size={15} className="spin" /> Finding a clear definition…</p>
                  ) : currentDefinition ? (
                    <>
                      <p className="definition-text">{currentDefinition.meaning}</p>
                      {currentDefinition.example && <blockquote>“{currentDefinition.example}”</blockquote>}
                      <div className="definition-source"><span>{currentDefinitionSource}</span><button type="button" className="audio-button" aria-label="Listen to pronunciation" title="Pronunciation audio is not available yet"><Volume2 size={16} /></button></div>
                    </>
                  ) : (
                    <p className="definition-text">{currentDefinitionSource === 'Not in WordNet' ? 'No meaning for this word was found in the offline WordNet dictionary.' : currentDefinitionSource === 'Offline dictionary unavailable' ? 'The offline dictionary could not be loaded. Reconnect to load this letter for next time.' : 'Looking this word up in the offline dictionary…'}</p>
                  )}
                </>
              ) : (
                <div className="meaning-empty">
                  <span className="empty-ornament"><BookOpen size={22} strokeWidth={1.4} /></span>
                  <p className="empty-title">A word will find its way here.</p>
                  <p>Once the page is in view, tap or point at a word to see what it means.</p>
                </div>
              )}
            </div>

            <div className="how-it-works">
              <div className="how-heading"><CircleHelp size={15} /><span>ABOUT THIS READER</span></div>
              <p>WordNet meanings are looked up on-device. Each letter is cached after its first load; eye-gaze tracking needs a separate calibrated model.</p>
            </div>

            {savedWords.length > 0 && (
              <div className="saved-words"><div className="saved-heading"><BookOpen size={14} />SAVED WORDS <span>{savedWords.length}</span></div><p>{savedWords.join(' · ')}</p></div>
            )}
          </aside>
        </div>

        <footer className="page-footer"><span>READ AT YOUR OWN PACE</span><span className="footer-mark"><span />MARGIN READER</span><span>CAMERA SESSION STAYS ON THIS DEVICE</span></footer>
      </section>
    </main>
  )
}

export default App
