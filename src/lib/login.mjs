// src/lib/login.mjs
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'

/**
 * Load and execute a user-supplied login script.
 * The script must export a default async function that accepts a Playwright page.
 *
 * @param {import('playwright').Page} page
 * @param {string|undefined} scriptPath - Absolute or relative path to the login script
 */
export async function loadAndExecuteLogin(page, scriptPath) {
  if (!scriptPath) return

  if (!existsSync(scriptPath)) {
    throw new Error(`Login script not found: ${scriptPath}`)
  }

  const module = await import(pathToFileURL(scriptPath).href)

  if (typeof module.default !== 'function') {
    throw new Error(`Login script must export a default function. Got: ${typeof module.default}`)
  }

  await module.default(page)
}
