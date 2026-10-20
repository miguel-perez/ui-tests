import { describe, expect, it } from 'vitest'
import { lanAddress, linkBaseFor, reachabilityOf } from '../src/runner/hosts.ts'

const info = (address: string, internal: boolean, family: 'IPv4' | 'IPv6' = 'IPv4') => ({ address, internal, family, netmask: '', mac: '', cidr: null }) as never

describe('reachabilityOf', () => {
  it('reads an internal address as inside the perimeter', () => {
    expect(reachabilityOf('http://10.0.0.5:3100', {}, undefined)).toBe('perimeter')
    expect(reachabilityOf('http://192.168.1.20:3100', {}, undefined)).toBe('perimeter')
    expect(reachabilityOf('http://172.20.0.2', {}, undefined)).toBe('perimeter')
    expect(reachabilityOf('https://staging.corp.internal', {}, undefined)).toBe('perimeter')
    expect(reachabilityOf('http://wiki', {}, undefined)).toBe('perimeter')
  })
  it('reads this machine as local', () => {
    expect(reachabilityOf('http://127.0.0.1', {}, undefined)).toBe('local')
    expect(reachabilityOf('http://localhost:3000', {}, undefined)).toBe('local')
    expect(reachabilityOf('http://[::1]:3000', {}, undefined)).toBe('local')
  })
  it('reads a vercel host as a preview and another public host as a deploy', () => {
    expect(reachabilityOf('https://app-git-x-team.vercel.app', {}, undefined)).toBe('preview')
    expect(reachabilityOf('https://example.com', {}, undefined)).toBe('deploy')
    expect(reachabilityOf('https://172.32.0.1', {}, undefined)).toBe('deploy')
  })
  it('lets a tunnel win, and counts the machine\'s own LAN address as inside the perimeter', () => {
    expect(reachabilityOf('http://127.0.0.1:3000', { tunnel: true }, undefined)).toBe('tunnel')
    expect(reachabilityOf('http://203.0.113.9:3100', {}, '203.0.113.9')).toBe('perimeter')
  })
})

describe('lanAddress', () => {
  it('is the first IPv4 address that is not loopback', () => {
    expect(lanAddress({ lo0: [info('127.0.0.1', true)], en0: [info('fe80::1', false, 'IPv6'), info('192.168.1.7', false)], en1: [info('10.0.0.2', false)] })).toBe('192.168.1.7')
  })
  it('is undefined when the machine has none', () => {
    expect(lanAddress({ lo0: [info('127.0.0.1', true)] })).toBeUndefined()
  })
})

describe('linkBaseFor', () => {
  it('puts the hostname on the target\'s scheme and port', () => {
    expect(linkBaseFor('http://127.0.0.1:3100', '10.0.0.5')).toBe('http://10.0.0.5:3100')
    expect(linkBaseFor('http://localhost:3000/', 'staging.corp.internal')).toBe('http://staging.corp.internal:3000')
  })
  it('keeps a port or origin the author gave', () => {
    expect(linkBaseFor('http://127.0.0.1:3100', 'wiki:8080')).toBe('http://wiki:8080')
    expect(linkBaseFor('http://127.0.0.1:3100', 'https://tests.corp.internal')).toBe('https://tests.corp.internal')
  })
})
