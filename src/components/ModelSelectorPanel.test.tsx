// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../lib/apiProfiles'
import { useStore } from '../store'
import ModelSelectorPanel from './ModelSelectorPanel'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('ModelSelectorPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useStore.setState({ settings: normalizeSettings({ ...DEFAULT_SETTINGS }) })
  })

  it('图像和文本模型悬浮提示同时显示模型名称与介绍', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<ModelSelectorPanel />))

    const triggers = container.querySelectorAll('.cursor-pointer')
    act(() => triggers[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(document.body.textContent).toContain('gpt-image-2\n旗舰级图像模型')

    act(() => triggers[0].dispatchEvent(new MouseEvent('mouseout', { bubbles: true })))
    act(() => triggers[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(document.body.textContent).toContain('gpt-5.6-sol\n旗舰级文本模型')

    act(() => root.unmount())
  })
})
