import type { Users } from '../types.ts'

export type UsersError = { field: string; message: string }

const within = /^\d+\s*(day|week|month|year)s?$/i
const region = /^[A-Z]{2}$/
const language = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/

/** Checks the screening fields of `users`; `are` is required. */
export function validateUsers(users: Users): { errors: UsersError[] } {
  const errors: UsersError[] = []
  const add = (field: string, message: string) => errors.push({ field, message })
  const fields = typeof users === 'string' ? { are: users } : users
  if (!fields || typeof fields.are !== 'string' || !fields.are.trim()) add('are', 'users needs an "are" sentence saying who these people are')
  if (typeof users === 'string') return { errors }
  if (users.within !== undefined && !within.test(users.within)) add('within', `within "${users.within}" should look like "3 months"`)
  if (users.where !== undefined) {
    const codes = Array.isArray(users.where) ? users.where : [users.where]
    for (const code of codes) if (!region.test(code)) add('where', `where "${code}" should be a two-letter country code such as "US"`)
  }
  if (users.language !== undefined && !language.test(users.language)) add('language', `language "${users.language}" should be a language code such as "en" or "pt-BR"`)
  if (users.age !== undefined) {
    const range = typeof users.age === 'string' ? /^(\d+)\s*-\s*(\d+)$/.exec(users.age) : undefined
    const min = typeof users.age === 'object' ? users.age.min : range ? Number(range[1]) : undefined
    const max = typeof users.age === 'object' ? users.age.max : range ? Number(range[2]) : undefined
    if (typeof users.age === 'string' && !range) add('age', `age "${users.age}" should look like "18-65"`)
    else if (min !== undefined && max !== undefined && min > max) add('age', `age min ${min} is above max ${max}`)
  }
  for (const key of ['uses', 'not'] as const) if (users[key] !== undefined && !Array.isArray(users[key])) add(key, `${key} should be a list`)
  return { errors }
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '')
}

/** The study's id: slug of the `are` sentence and of the purpose, each cut to 40 characters, joined with an ellipsis. */
export function contextId(users: Users, purpose: string): string {
  const are = typeof users === 'string' ? users : users.are
  const tail = slug(purpose)
  return tail ? `${slug(are)}…${tail}` : slug(are)
}
