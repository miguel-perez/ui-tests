/** What the person is paid for recording their screen as well as their clicks: one and a half times the base amount. */
export function recordingMultiplier(record: 'events' | 'video'): 1 | 1.5 {
  return record === 'video' ? 1.5 : 1
}
