// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useStore, getAllApiKeyPromptProfileIds } from '../store'
import { DEFAULT_SETTINGS, getActiveApiProfile, normalizeSettings } from '../lib/apiProfiles'
import ApiKeyPromptModal from './ApiKeyPromptModal'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<ApiKeyPromptModal />)
  })
  return { container, root }
}

function typeKey(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function submitForm(el: Element | null) {
  act(() => {
    el?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('ApiKeyPromptModal 保存同步（简易配置 → 复杂配置）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useStore.setState({
      settings: normalizeSettings({ ...DEFAULT_SETTINGS }),
      appMode: 'gallery',
      apiKeyPrompt: null,
      apiKeyPromptDeferred: null,
      showSettings: false,
    })
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('保存后图像与文本模型 profile 的 key 都更新为同一值', () => {
    useStore.setState((st) => ({
      settings: normalizeSettings({
        ...st.settings,
        profiles: st.settings.profiles.map((p) => ({ ...p, apiKey: 'K1' })),
      }),
    }))

    const settings = useStore.getState().settings
    act(() => {
      useStore.getState().openApiKeyPrompt(getAllApiKeyPromptProfileIds(settings), { source: 'startup' })
    })
    setup()

    const input = document.getElementById('api-key-prompt-input') as HTMLInputElement
    typeKey(input, 'K2')
    submitForm(input?.closest('form'))

    const after = useStore.getState().settings
    const keys = after.profiles.map((p) => ({ id: p.id, key: p.apiKey }))
    console.log('保存后 profiles:', JSON.stringify(keys))
    for (const { id, key } of keys) expect(key).toBe('K2')
    expect(getActiveApiProfile(after).apiKey).toBe('K2')
  })

  it('sub2api 下拉选择 Key 后保存生效', async () => {
    useStore.setState((st) => ({
      settings: normalizeSettings({
        ...st.settings,
        profiles: st.settings.profiles.map((p) => ({ ...p, apiKey: 'sk-sub2api-key-A' })),
      }),
    }))
    window.history.replaceState(null, '', '/?src_host=https%3A%2F%2Fapi.sub2.example.com&user_id=1&token=abc.def')

    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          items: [
            { id: 1, key: 'sk-sub2api-key-A', name: '主Key', status: 'active', group: { platform: 'openai' } },
            { id: 2, key: 'sk-sub2api-key-B', name: '备用Key', status: 'active', group: { platform: 'openai' } },
          ],
        },
      }),
    }) as Response))

    act(() => {
      useStore.getState().openApiKeyPrompt(getAllApiKeyPromptProfileIds(useStore.getState().settings), { source: 'startup' })
    })
    setup()

    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    const select = document.getElementById('api-key-prompt-input') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    act(() => {
      select.value = 'sk-sub2api-key-B'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    submitForm(select?.closest('form'))

    const after = useStore.getState().settings
    expect(getActiveApiProfile(after).apiKey).toBe('sk-sub2api-key-B')
  })

  it('已配置的 key 不在 sub2api 列表中时保持手动输入模式（避免下拉显示与实际值脱节）', async () => {
    useStore.setState((st) => ({
      settings: normalizeSettings({
        ...st.settings,
        profiles: st.settings.profiles.map((p) => ({ ...p, apiKey: 'sk-manual-old-key' })),
      }),
    }))
    window.history.replaceState(null, '', '/?src_host=https%3A%2F%2Fapi.sub2.example.com&user_id=1&token=abc.def')

    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          items: [
            { id: 1, key: 'sk-sub2api-key-A', name: '主Key', status: 'active', group: { platform: 'openai' } },
          ],
        },
      }),
    }) as Response))

    act(() => {
      useStore.getState().openApiKeyPrompt(getAllApiKeyPromptProfileIds(useStore.getState().settings), { source: 'startup' })
    })
    setup()

    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    const input = document.getElementById('api-key-prompt-input') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    // 输入框展示真实的当前 key，修改后保存即生效
    expect(input.value).toBe('sk-manual-old-key')
    typeKey(input, 'sk-new-key')
    submitForm(input?.closest('form'))
    expect(getActiveApiProfile(useStore.getState().settings).apiKey).toBe('sk-new-key')
  })
})
