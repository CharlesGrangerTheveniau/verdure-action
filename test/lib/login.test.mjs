// test/lib/login.test.mjs
import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('login.mjs — loadAndExecuteLogin()', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = join(tmpdir(), `verdure-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  it('calls the default export of the login script with the page object', async () => {
    const scriptPath = join(tmpDir, 'login.mjs')
    writeFileSync(scriptPath, `export default async function(page) { page.loginCalled = true }`)

    const mockPage = { loginCalled: false }
    const { loadAndExecuteLogin } = await import('../../src/lib/login.mjs')
    await loadAndExecuteLogin(mockPage, scriptPath)

    expect(mockPage.loginCalled).toBe(true)
  })

  it('does nothing when scriptPath is empty or undefined', async () => {
    const mockPage = { loginCalled: false }
    const { loadAndExecuteLogin } = await import('../../src/lib/login.mjs')

    await expect(loadAndExecuteLogin(mockPage, '')).resolves.toBeUndefined()
    await expect(loadAndExecuteLogin(mockPage, undefined)).resolves.toBeUndefined()
  })

  it('throws a clear error when the script file does not exist', async () => {
    const { loadAndExecuteLogin } = await import('../../src/lib/login.mjs')
    await expect(
      loadAndExecuteLogin({}, '/nonexistent/login.mjs')
    ).rejects.toThrow('Login script not found')
  })

  it('throws a clear error when the script has no default export', async () => {
    const scriptPath = join(tmpDir, 'bad-login.mjs')
    writeFileSync(scriptPath, `export const foo = 1`)

    const { loadAndExecuteLogin } = await import('../../src/lib/login.mjs')
    await expect(
      loadAndExecuteLogin({}, scriptPath)
    ).rejects.toThrow('must export a default function')
  })
})
