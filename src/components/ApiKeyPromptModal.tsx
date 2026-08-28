import { useEffect, useState } from 'react'
import { regenerateAgentAssistantMessage, submitAgentMessage, submitTask, useStore } from '../store'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { applyApiKeyPromptSettings } from '../lib/apiKeyPrompt'
import { getSub2ApiKeys, parseSub2ApiKeyParams, type Sub2ApiKey } from '../lib/sub2apiKeys'
import { DEFAULT_OPENAI_PROFILE_ID, DEFAULT_TEXT_PROFILE_ID } from '../lib/apiProfiles'

function formatSub2ApiKeyLabel(key: Sub2ApiKey): string {
  const masked = key.key.length > 12 ? `${key.key.slice(0, 8)}•••${key.key.slice(-4)}` : key.key
  return key.name ? `${key.name}（${masked}）` : masked
}

export default function ApiKeyPromptModal() {
  const apiKeyPrompt = useStore((s) => s.apiKeyPrompt)
  const settings = useStore((s) => s.settings)
  const appMode = useStore((s) => s.appMode)
  const setSettings = useStore((s) => s.setSettings)
  const closeApiKeyPrompt = useStore((s) => s.closeApiKeyPrompt)
  const deferApiKeyPrompt = useStore((s) => s.deferApiKeyPrompt)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [error, setError] = useState('')
  const [sub2ApiKeys, setSub2ApiKeys] = useState<Sub2ApiKey[]>([])
  const [sub2ApiKeysLoading, setSub2ApiKeysLoading] = useState(false)
  const [sub2ApiKeyError, setSub2ApiKeyError] = useState('')
  const [customKeyMode, setCustomKeyMode] = useState(false)
  const [imageKey, setImageKey] = useState('')
  const [textKey, setTextKey] = useState('')
  const [imageCustomKeyMode, setImageCustomKeyMode] = useState(false)
  const [textCustomKeyMode, setTextCustomKeyMode] = useState(false)

  const profiles = apiKeyPrompt
    ? apiKeyPrompt.profileIds
      .map((id) => settings.profiles.find((profile) => profile.id === id) ?? null)
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    : []

  const separateKeys = settings.separateAgentProfileKeys
  const imageProfileId = settings.agentImageProfileId ?? DEFAULT_OPENAI_PROFILE_ID
  const textProfileId = settings.agentTextProfileId ?? DEFAULT_TEXT_PROFILE_ID

  useEffect(() => {
    if (!apiKeyPrompt) return
    setApiKey(profiles.find((profile) => profile.apiKey.trim())?.apiKey ?? '')
    setImageKey(settings.profiles.find((profile) => profile.id === imageProfileId)?.apiKey ?? '')
    setTextKey(settings.profiles.find((profile) => profile.id === textProfileId)?.apiKey ?? '')
    setShowApiKey(false)
    setError('')
  }, [apiKeyPrompt])

  // sub2api 菜单跳转（URL 携带 user_id / token / src_url）时拉取用户 Key 列表
  useEffect(() => {
    if (!apiKeyPrompt) return
    const params = parseSub2ApiKeyParams(new URLSearchParams(window.location.search))
    if (!params) return

    setSub2ApiKeysLoading(true)
    setSub2ApiKeyError('')
    getSub2ApiKeys(params)
      .then((keys) => {
        setSub2ApiKeys(keys)
        // 已配置的 key（弹窗预填值）：不在 sub2api Key 列表中时保持手动输入模式，
        // 避免下拉框显示与实际 state 不一致（下拉显示首项但保存的仍是旧 key）。
        const applySub2ApiMode = (
          configuredKey: string,
          setCustom: (value: boolean) => void,
          setKey: (value: string) => void,
        ) => {
          if (!configuredKey) {
            setCustom(false)
            if (keys.length > 0) setKey(keys[0].key)
          } else if (keys.some((key) => key.key === configuredKey)) {
            setCustom(false)
          } else {
            setCustom(true)
          }
        }
        const configuredKey = profiles.find((profile) => profile.apiKey.trim())?.apiKey ?? ''
        applySub2ApiMode(configuredKey, setCustomKeyMode, setApiKey)
        // 分别设置模式：图像/文本各自的 Key 按同一规则判断是否显示下拉。
        const imageProfile = settings.profiles.find((profile) => profile.id === imageProfileId)
        const textProfile = settings.profiles.find((profile) => profile.id === textProfileId)
        applySub2ApiMode(imageProfile?.apiKey.trim() ?? '', setImageCustomKeyMode, setImageKey)
        applySub2ApiMode(textProfile?.apiKey.trim() ?? '', setTextCustomKeyMode, setTextKey)
      })
      .catch((err) => {
        console.warn('Failed to fetch sub2api keys:', err)
        setSub2ApiKeyError('获取 sub2api Key 列表失败，请手动输入')
      })
      .finally(() => setSub2ApiKeysLoading(false))
  }, [apiKeyPrompt])

  usePreventBackgroundScroll(Boolean(apiKeyPrompt))

  if (!apiKeyPrompt) return null

  const handleSave = () => {
    const retry = apiKeyPrompt.retry

    if (separateKeys) {
      const nextImageKey = imageKey.trim()
      const nextTextKey = textKey.trim()
      if (!nextImageKey && !nextTextKey) {
        setError('请输入 API Key')
        return
      }
      setSettings(applyApiKeyPromptSettings(settings, nextImageKey, nextTextKey))
    } else {
      const nextApiKey = apiKey.trim()
      if (!nextApiKey) {
        setError('请输入 API Key')
        return
      }

      setSettings(applyApiKeyPromptSettings(settings, nextApiKey, nextApiKey))
    }

    closeApiKeyPrompt()
    if (retry?.type === 'task') void submitTask()
    if (retry?.type === 'agent-submit') void submitAgentMessage()
    if (retry?.type === 'agent-regenerate') void regenerateAgentAssistantMessage(retry.conversationId, retry.roundId)
  }

  const renderKeyInput = (inputId: string, label: string, value: string, onChange: (value: string) => void, autoFocus = false) => (
    <>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="relative mt-2">
        <input
          id={inputId}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            if (error) setError('')
          }}
          type={showApiKey ? 'text' : 'password'}
          placeholder="sk-..."
          className="w-full rounded-xl border border-blue-300 bg-white px-3.5 py-3 pr-11 text-sm text-gray-800 outline-none ring-2 ring-blue-500/15 transition placeholder:text-gray-400 focus:border-blue-500 dark:border-blue-500/60 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600"
        />
        <button
          type="button"
          onClick={() => setShowApiKey((value) => !value)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
          aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
        >
          {showApiKey ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A9.5 9.5 0 0112 4c6.5 0 10 8 10 8a17.5 17.5 0 01-3.1 4.5M6.2 6.2C3.8 8 2 12 2 12s3.5 8 10 8c1.8 0 3.4-.5 4.8-1.2" />
            </svg>
          )}
        </button>
      </div>
    </>
  )

  const renderKeyField = (
    inputId: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    customMode: boolean,
    setCustomMode: (value: boolean) => void,
    autoFocus = false,
  ) => (
    !customMode && sub2ApiKeys.length > 0 ? (
      <>
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor={inputId}>
            {label}
          </label>
        )}
        <select
          id={inputId}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            if (nextValue === '') {
              setCustomMode(true)
              onChange('')
            } else {
              onChange(nextValue)
            }
            if (error) setError('')
          }}
          className="mt-2 w-full rounded-xl border border-blue-300 bg-white px-3.5 py-3 text-sm text-gray-800 outline-none ring-2 ring-blue-500/15 transition focus:border-blue-500 dark:border-blue-500/60 dark:bg-white/[0.04] dark:text-gray-100"
        >
          {sub2ApiKeys.map((key) => (
            <option key={key.id ?? key.key} value={key.key}>{formatSub2ApiKeyLabel(key)}</option>
          ))}
          <option value="">自定义输入…</option>
        </select>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">来自 sub2api 账户的 Key</p>
      </>
    ) : (
      <>
        {renderKeyInput(inputId, label, value, onChange, autoFocus)}
        {customMode && sub2ApiKeys.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCustomMode(false)
              onChange(sub2ApiKeys[0]?.key ?? '')
            }}
            className="mt-2 text-xs text-blue-500 transition hover:text-blue-600"
          >
            从 Key 列表选择
          </button>
        )}
      </>
    )
  )

  const handleAdvancedSettings = () => {
    deferApiKeyPrompt()
    setShowSettings(true, appMode === 'agent' ? 'agent' : 'api')
  }

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/25 backdrop-blur-md dark:bg-black/45" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/60 bg-white/95 p-6 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">配置 API Key</h2>
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault()
            handleSave()
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">分别设置图像模型和文本模型的 API Key</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">开启后可为两个模型配置不同的 Key，关闭时共用同一个 Key</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({ separateAgentProfileKeys: !settings.separateAgentProfileKeys })}
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${settings.separateAgentProfileKeys ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              role="switch"
              aria-checked={settings.separateAgentProfileKeys}
              aria-label="分别设置图像模型和文本模型的 API Key"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${settings.separateAgentProfileKeys ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>
          {separateKeys ? (
            <>
              {renderKeyField('api-key-prompt-image-input', '图像模型 API Key', imageKey, setImageKey, imageCustomKeyMode, setImageCustomKeyMode, true)}
              <div className="mt-4">
                {renderKeyField('api-key-prompt-text-input', '文本模型 API Key', textKey, setTextKey, textCustomKeyMode, setTextCustomKeyMode)}
              </div>
              {sub2ApiKeyError && (
                <p className="mt-2 text-xs text-red-500">{sub2ApiKeyError}</p>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="api-key-prompt-input">
                API Key
              </label>
              {sub2ApiKeysLoading ? (
                <div className="mt-2 w-full rounded-xl border border-blue-300 bg-white px-3.5 py-3 text-sm text-gray-500 dark:border-blue-500/60 dark:bg-white/[0.04] dark:text-gray-400">
                  正在获取 Key 列表…
                </div>
              ) : renderKeyField('api-key-prompt-input', '', apiKey, setApiKey, customKeyMode, setCustomKeyMode, true)}
              {sub2ApiKeyError && (
                <p className="mt-2 text-xs text-red-500">{sub2ApiKeyError}</p>
              )}
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={separateKeys ? !imageKey.trim() && !textKey.trim() : !apiKey.trim()}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            保存并使用
          </button>
        </form>

        <div className="mt-4 flex justify-center text-xs">
          <button
            type="button"
            onClick={handleAdvancedSettings}
            className="text-gray-500 transition hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400"
          >
            高级设置
          </button>
        </div>
      </div>
    </div>
  )
}
