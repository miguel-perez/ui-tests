'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../icon'
import { clock } from '../../lib/sessions'

/**
 * Reel: a 16:10 clip with a timestamp overlay and its progress, the moment label and the person's words inside its chrome
 * as the caption. Muted; plays when its row opens and on its control; under reduced motion only on the control.
 */
export function ReelFrame({ src, poster, from, to, label, words, play = false, example = true }: { src: string; poster: string; from: number; to?: number; label: string; words?: string; play?: boolean; example?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  useEffect(() => {
    const video = ref.current!
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { if (media.matches || !play) { video.pause(); return } void video.play().catch(() => setPlaying(false)) }
    const seek = () => { if (from) video.currentTime = from }
    video.addEventListener('loadedmetadata', seek)
    update(); media.addEventListener('change', update)
    return () => { media.removeEventListener('change', update); video.removeEventListener('loadedmetadata', seek); video.pause() }
  }, [play, src, from])
  // Clips cut per problem start at zero; whole sessions start at the moment and are shown against its window.
  const start = src.includes('problem-') ? 0 : from
  const length = to !== undefined ? to - from : 8
  const progress = Math.max(0, Math.min(1, (time - start) / length))
  return <figure className="reel-frame theme-light" data-artefact="reel-frame">
    <figcaption className="reel-chrome"><span className="reel-label">{label}</span>{example && <span className="example-label">Example run</span>}{words && <span className="reel-words">{words}</span>}</figcaption>
    <div className="reel-player">
      <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} aria-label={label} />
      <button className="video-play" aria-label={playing ? 'Pause problem moment' : 'Play problem moment'} onClick={() => { if (playing) ref.current?.pause(); else void ref.current?.play().catch(() => setPlaying(false)) }}><Icon name={playing ? 'pause' : 'play'} /></button>
      <span className="reel-stamp">{clock(from)}{to !== undefined && ` → ${clock(to)}`}</span>
      <span className="reel-progress" style={{ '--progress': progress } as CSSProperties} aria-hidden="true" />
    </div>
  </figure>
}
