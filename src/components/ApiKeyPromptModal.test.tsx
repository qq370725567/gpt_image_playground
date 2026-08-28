// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useStore, getAllApiKeyPromptProfileIds } from '../store'
import { DEFAULT_OPENAI_PROFILE_ID, DEFAULT_SETTINGS, DEFAULT_TEXT_PROFILE_ID, getActiveApiProfile, normalizeSettings } from '../lib/apiProfiles'
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

function toggleSeparateKeys() {
  act(() => {
    ;(document.querySelector('button[role="switch"]') as HTMLElement | null)?.click()
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

describe('ApiKeyPromptModal 分别设置模式', () => {
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

  it('默认关闭：仅显示单个 API Key 输入框', () => {
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

    const switchEl = document.querySelector('button[role="switch"]')
    expect(switchEl).not.toBeNull()
    expect(switchEl?.getAttribute('aria-checked')).toBe('false')
    expect(document.getElementById('api-key-prompt-image-input')).toBeNull()
    expect(document.getElementById('api-key-prompt-input')?.tagName).toBe('INPUT')
  })

  it('开启后显示图像与文本两个独立输入框', () => {
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

    toggleSeparateKeys()

    expect(useStore.getState().settings.separateAgentProfileKeys).toBe(true)
    expect(document.getElementById('api-key-prompt-image-input')?.tagName).toBe('INPUT')
    expect(document.getElementById('api-key-prompt-text-input')?.tagName).toBe('INPUT')
    expect(document.getElementById('api-key-prompt-input')).toBeNull()
  })

  it('分别设置模式下两个 Key 独立保存', () => {
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

    toggleSeparateKeys()

    const imageInput = document.getElementById('api-key-prompt-image-input') as HTMLInputElement
    const textInput = document.getElementById('api-key-prompt-text-input') as HTMLInputElement
    typeKey(imageInput, 'IMG-K')
    typeKey(textInput, 'TXT-K')
    submitForm(imageInput.closest('form'))

    const after = useStore.getState().settings
    expect(after.profiles.find((p) => p.id === DEFAULT_OPENAI_PROFILE_ID)?.apiKey).toBe('IMG-K')
    expect(after.profiles.find((p) => p.id === DEFAULT_TEXT_PROFILE_ID)?.apiKey).toBe('TXT-K')
    expect(getActiveApiProfile(after).apiKey).toBe('IMG-K')
  })

  it('分别设置模式下只填写一个 Key 时两套配置共用该 Key', () => {
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

    toggleSeparateKeys()

    const imageInput = document.getElementById('api-key-prompt-image-input') as HTMLInputElement
    const textInput = document.getElementById('api-key-prompt-text-input') as HTMLInputElement
    typeKey(imageInput, 'IMG-K')
    typeKey(textInput, '')
    submitForm(imageInput.closest('form'))

    const after = useStore.getState().settings
    expect(after.profiles.find((p) => p.id === DEFAULT_OPENAI_PROFILE_ID)?.apiKey).toBe('IMG-K')
    expect(after.profiles.find((p) => p.id === DEFAULT_TEXT_PROFILE_ID)?.apiKey).toBe('IMG-K')
  })

  it('开启后图像与文本都显示 sub2api 下拉，可分别选择 Key 保存', async () => {
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

    const settings = useStore.getState().settings
    act(() => {
      useStore.getState().openApiKeyPrompt(getAllApiKeyPromptProfileIds(settings), { source: 'startup' })
    })
    setup()

    toggleSeparateKeys()
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    const imageSelect = document.getElementById('api-key-prompt-image-input') as HTMLSelectElement
    const textSelect = document.getElementById('api-key-prompt-text-input') as HTMLSelectElement
    expect(imageSelect.tagName).toBe('SELECT')
    expect(textSelect.tagName).toBe('SELECT')

    act(() => {
      imageSelect.value = 'sk-sub2api-key-B'
      imageSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    submitForm(imageSelect.closest('form'))

    const after = useStore.getState().settings
    expect(after.profiles.find((p) => p.id === DEFAULT_OPENAI_PROFILE_ID)?.apiKey).toBe('sk-sub2api-key-B')
    expect(after.profiles.find((p) => p.id === DEFAULT_TEXT_PROFILE_ID)?.apiKey).toBe('sk-sub2api-key-A')
  })

  it('开启后已配置但不在 sub2api 列表中的 Key 保持手动输入模式', async () => {
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

    const settings = useStore.getState().settings
    act(() => {
      useStore.getState().openApiKeyPrompt(getAllApiKeyPromptProfileIds(settings), { source: 'startup' })
    })
    setup()

    toggleSeparateKeys()
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    const imageInput = document.getElementById('api-key-prompt-image-input') as HTMLInputElement
    const textInput = document.getElementById('api-key-prompt-text-input') as HTMLInputElement
    expect(imageInput.tagName).toBe('INPUT')
    expect(textInput.tagName).toBe('INPUT')
    expect(imageInput.value).toBe('sk-manual-old-key')
    expect(textInput.value).toBe('sk-manual-old-key')
  })

  it('非 hybrid 模式仍显示分别设置开关，保存后自动切换为混合模式', () => {
    useStore.setState((st) => ({
      settings: normalizeSettings({ ...st.settings, agentApiConfigMode: 'off' }),
    }))

    const settings = useStore.getState().settings
    act(() => {
      useStore.getState().openApiKeyPrompt(getAllApiKeyPromptProfileIds(settings), { source: 'startup' })
    })
    setup()

    expect(document.querySelector('button[role="switch"]')).not.toBeNull()
    expect(document.getElementById('api-key-prompt-input')?.tagName).toBe('INPUT')

    const input = document.getElementById('api-key-prompt-input') as HTMLInputElement
    typeKey(input, 'K2')
    submitForm(input.closest('form'))

    const after = useStore.getState().settings
    expect(after.agentApiConfigMode).toBe('hybrid')
    expect(after.agentImageProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(after.agentTextProfileId).toBe(DEFAULT_TEXT_PROFILE_ID)
  })

  it('只有图像配置时自动创建并绑定文本配置', () => {
    useStore.setState((st) => ({
      settings: normalizeSettings({
        ...st.settings,
        agentApiConfigMode: 'off',
        profiles: [st.settings.profiles.find((p) => p.id === DEFAULT_OPENAI_PROFILE_ID)!],
        activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
        agentTextProfileId: null,
        agentImageProfileId: DEFAULT_OPENAI_PROFILE_ID,
      }),
    }))

    act(() => {
      useStore.getState().openApiKeyPrompt([DEFAULT_OPENAI_PROFILE_ID], { source: 'startup' })
    })
    setup()

    const input = document.getElementById('api-key-prompt-input') as HTMLInputElement
    typeKey(input, 'SHARED-K')
    submitForm(input.closest('form'))

    const after = useStore.getState().settings
    expect(after.profiles).toHaveLength(2)
    expect(after.agentApiConfigMode).toBe('hybrid')
    expect(after.agentImageProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(after.agentTextProfileId).toBe(DEFAULT_TEXT_PROFILE_ID)
    expect(after.profiles.find((p) => p.id === DEFAULT_OPENAI_PROFILE_ID)).toMatchObject({
      apiKey: 'SHARED-K',
      apiMode: 'images',
    })
    expect(after.profiles.find((p) => p.id === DEFAULT_TEXT_PROFILE_ID)).toMatchObject({
      apiKey: 'SHARED-K',
      apiMode: 'responses',
    })
  })
})
