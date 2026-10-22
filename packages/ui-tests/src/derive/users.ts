import { createHash } from 'node:crypto'
import type { Criteria, Users } from '../types.ts'

export type UsersError = { field: string; message: string }

const within = /^\d+\s*(day|week|month|year)s?$/i
const region = /^[A-Z]{2}$/
const language = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/
const OFTEN = ['daily', 'weekly', 'monthly', 'yearly']
const KNOWN = new Set(['are', 'did', 'within', 'often', 'role', 'uses', 'not', 'groups', 'insiders', 'professionals', 'where', 'language', 'age'])
const CRITERIA = new Set(['did', 'within', 'often', 'role', 'uses', 'not'])
const isList = (value: unknown) => Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim())

/** Checks what screens a group: a past-tense `did`, a window, a frequency, a role list or quotas, and lists of tools and exclusions. */
function checkCriteria(fields: Criteria, at: string, add: (field: string, message: string) => void, quotas: boolean) {
  if (fields.did !== undefined && (typeof fields.did !== 'string' || !fields.did.trim())) add(`${at}did`, 'did should say what people did, in the past tense')
  if (fields.within !== undefined && (typeof fields.within !== 'string' || !within.test(fields.within))) add(`${at}within`, `within "${String(fields.within)}" should look like "3 months"`)
  if (fields.often !== undefined && !OFTEN.includes(fields.often)) add(`${at}often`, `often "${String(fields.often)}" should be one of ${OFTEN.join(', ')}`)
  if (fields.role !== undefined) {
    if (Array.isArray(fields.role)) { if (!isList(fields.role) || !fields.role.length) add(`${at}role`, 'role should list the roles to accept') }
    else if (!quotas) add(`${at}role`, 'role inside a group is a list; the group has its own quota')
    else if (typeof fields.role !== 'object' || fields.role === null || !Object.keys(fields.role).length || Object.values(fields.role).some(q => !Number.isInteger(q) || q < 1)) add(`${at}role`, 'role should be a list, or each role with how many people, such as { Developer: 3, Designer: 2 }')
  }
  for (const key of ['uses', 'not'] as const) if (fields[key] !== undefined && !isList(fields[key])) add(`${at}${key}`, `${key} should be a list`)
}

/**
 * Checks the screening fields of `users`. In the object form `did` is required (in every group when there are groups), `role` is a
 * list or quotas, `groups` names each group once and differs in more than one field, and the overrides are `exclude` or `include`.
 */
export function validateUsers(users: Users): { errors: UsersError[] } {
  const errors: UsersError[] = []
  const add = (field: string, message: string) => errors.push({ field, message })
  if (users === undefined || users === null || (typeof users !== 'string' && typeof users !== 'object')) { add('users', 'the study needs users: a sentence, or an object with what they did under "did"'); return { errors } }
  if (typeof users === 'string') { if (!users.trim()) add('users', 'users needs a sentence saying who these people are'); return { errors } }
  for (const key of Object.keys(users)) if (!KNOWN.has(key)) add(key, `"${key}" is not a users field`)
  if (users.are !== undefined && (typeof users.are !== 'string' || !users.are.trim())) add('are', 'are should be a sentence saying who these people are')
  checkCriteria(users, '', add, true)
  const groups = users.groups
  if (groups !== undefined) {
    if (!Array.isArray(groups) || groups.length < 2) add('groups', 'groups lists two or more groups, each with a name')
    else {
      if (users.role !== undefined && !Array.isArray(users.role)) add('groups', 'write groups or role with counts, not both')
      const names = new Set<string>()
      groups.forEach((group, i) => {
        const at = `groups[${i}].`
        if (!group || typeof group.name !== 'string' || !group.name.trim()) { add(`${at}name`, 'each group needs a name'); return }
        if (names.has(group.name)) add(`${at}name`, `the group "${group.name}" is named twice`)
        names.add(group.name)
        for (const key of Object.keys(group)) if (key !== 'name' && key !== 'quota' && !CRITERIA.has(key)) add(`${at}${key}`, `"${key}" is not a group field`)
        if (group.quota !== undefined && (!Number.isInteger(group.quota) || group.quota < 1)) add(`${at}quota`, 'quota is a whole number of people, at least 1')
        checkCriteria(group, at, add, false)
        if (users.did === undefined && group.did === undefined) add(`${at}did`, `group "${group.name}" needs did: what these people did, in the past tense`)
        const own = Object.keys(group).filter(key => CRITERIA.has(key))
        if (own.length < 2) add(`${at}name`, `group "${group.name}" differs in ${own.length ? `only ${own[0]}` : 'nothing'}; write it as the object form of that field, such as role: { ${group.name}: ${group.quota ?? 3} }`)
      })
    }
  }
  if (users.did === undefined && !(Array.isArray(groups) && groups.length)) add('did', 'users needs did: what these people did, in the past tense, such as "booked a trip"')
  for (const key of ['insiders', 'professionals'] as const) if (users[key] !== undefined && users[key] !== 'exclude' && users[key] !== 'include') add(key, `${key} is "exclude" or "include"`)
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
  return { errors }
}

/** A short stable hash for text with no letters or digits to slug. */
function hash(text: string) { return createHash('sha256').update(text).digest('hex').slice(0, 8) }
function slug(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '')
}

/** The study's id: slug of who the users are and of the purpose, each cut to 40 characters, joined with an ellipsis. */
export function contextId(are: string, purpose: string): string {
  const head = slug(are) || hash(are)
  const tail = slug(purpose) || (purpose ? hash(purpose) : '')
  return tail ? `${head}…${tail}` : head
}
