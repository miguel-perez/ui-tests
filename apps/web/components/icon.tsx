import { ArrowRight, Check, ChevronRight, CircleAlert, CircleCheck, Copy, Github, Link, MicOff, Monitor, MousePointer2, Pause, Play, RotateCcw, Share, Users, VideoOff } from 'lucide-react'

/** One line-icon vocabulary: Lucide at a 1.5px stroke, drawn in the current text colour. */
const icons = { copy: Copy, play: Play, pause: Pause, replay: RotateCcw, check: Check, pass: CircleCheck, issue: CircleAlert, link: Link, users: Users, cursor: MousePointer2, github: Github, screen: Monitor, 'mic-off': MicOff, 'camera-off': VideoOff, arrow: ArrowRight, chevron: ChevronRight, share: Share }

export function Icon({ name, size = 18 }: { name: keyof typeof icons; size?: number }) {
  const Glyph = icons[name]
  return <Glyph className="line-icon" size={size} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
}
