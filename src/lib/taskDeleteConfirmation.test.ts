// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { shouldSkipTaskDeleteConfirmation, skipTaskDeleteConfirmationForToday } from './taskDeleteConfirmation'

describe('task delete confirmation preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('suppresses task deletion confirmation only for the current day', () => {
    expect(shouldSkipTaskDeleteConfirmation()).toBe(false)

    skipTaskDeleteConfirmationForToday()

    expect(shouldSkipTaskDeleteConfirmation()).toBe(true)
  })
})
