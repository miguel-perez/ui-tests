'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icon'

export function SessionVideo({ src = '/sessions/p3.webm', poster = '/sessions/p3.jpg', play = false, startAt = 0 }: { src?: string; poster?: string; play?: boolean; startAt?: number }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current!
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      if (media.matches || !play) { video.pause(); return }
      void video.play().catch(() => setPlaying(false))
    }
    const seek = () => { if (startAt) video.currentTime = startAt }
    video.addEventListener('loadedmetadata', seek)
    update(); media.addEventListener('change', update)
    return () => { media.removeEventListener('change', update); video.removeEventListener('loadedmetadata', seek); video.pause() }
  }, [play, src, startAt])
  return <div className="reel-player"><video ref={ref} className="reel-video" src={src} poster={poster} muted loop playsInline preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-label="This problem moment" /><button className="video-play" aria-label={playing ? 'Pause problem moment' : 'Play problem moment'} onClick={() => { if (playing) ref.current?.pause(); else void ref.current?.play().catch(() => setPlaying(false)) }}><Icon name={playing ? 'pause' : 'play'} /></button></div>
}
