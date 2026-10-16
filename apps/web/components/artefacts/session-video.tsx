'use client'
import { useEffect, useRef, useState } from 'react'

export function SessionVideo({ hero = false, src = '/sessions/p3.webm', poster = '/sessions/p3.jpg', play = false, startAt = 0 }: { hero?: boolean; src?: string; poster?: string; play?: boolean; startAt?: number }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current!
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      if (media.matches || !(hero || play)) {
        video.pause()
        if (hero && media.matches) { video.removeAttribute('src'); video.load() }
        return
      }
      video.src = src
      video.playbackRate = hero ? 0.6 : 1
      void video.play().catch(() => {})
    }
    const seek = () => { if (startAt) video.currentTime = startAt }
    video.addEventListener('loadedmetadata', seek)
    // Poster first: defer the hero download until after the page's initial paint.
    const timer = hero && !media.matches ? setTimeout(update, 1200) : undefined
    if (!hero && !media.matches) update()
    media.addEventListener('change', update)
    return () => { clearTimeout(timer); media.removeEventListener('change', update); video.removeEventListener('loadedmetadata', seek); video.pause() }
  }, [hero, play, src, startAt])
  const video = <video ref={ref} className={hero ? 'hero-video' : 'reel-video'} src={hero ? undefined : src} data-src={src} poster={poster} muted loop playsInline preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-label={hero ? 'Example session on Weekboard' : 'This problem moment'} />
  return hero ? video : <div className="reel-player">{video}<button className="video-play" aria-label={playing ? 'Pause problem moment' : 'Play problem moment'} onClick={() => { if (playing) ref.current?.pause(); else void ref.current?.play().catch(() => {}) }}>{playing ? 'Ⅱ' : '▷'}</button></div>
}
