import { useEffect, useState } from 'react'
import { getAllApiKeyPromptProfileIds, regenerateAgentAssistantMessage, submitAgentMessage, submitTask, useStore } from '../store'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { getSub2ApiKeys, parseSub2ApiKeyParams, type Sub2ApiKey } from '../lib/sub2apiKeys'

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

  const profiles = apiKeyPrompt
    ? apiKeyPrompt.profileIds
      .map((id) => settings.profiles.find((profile) => profile.id === id) ?? null)
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    : []

  useEffect(() => {
    if (!apiKeyPrompt) return
    setApiKey(profiles.find((profile) => profile.apiKey.trim())?.apiKey ?? '')
    setShowApiKey(false)
    setError('')
  }, [apiKeyPrompt])

  // sub2api 菜单跳转（URL 携带 user_id / token / src_host）时拉取用户 Key 列表
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
        const configuredKey = profiles.find((profile) => profile.apiKey.trim())?.apiKey ?? ''
        if (!configuredKey) {
          setCustomKeyMode(false)
          if (keys.length > 0) setApiKey(keys[0].key)
        } else if (keys.some((key) => key.key === configuredKey)) {
          setCustomKeyMode(false)
        } else {
          setCustomKeyMode(true)
        }
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
    const nextApiKey = apiKey.trim()
    if (!nextApiKey) {
      setError('请输入 API Key')
      return
    }

    // 简易配置为同步源：在弹窗打开时的 profileIds 基础上，补充当前设置中的
    // 活跃 + Agent 图像/文本 profile，确保图像模型与文本模型的 key 始终一起更新。
    const targetIds = new Set([
      ...apiKeyPrompt.profileIds,
      ...getAllApiKeyPromptProfileIds(settings),
    ])
    setSettings({
      profiles: settings.profiles.map((profile) => targetIds.has(profile.id)
        ? { ...profile, apiKey: nextApiKey }
        : profile,
      ),
    })

    const retry = apiKeyPrompt.retry
    closeApiKeyPrompt()
    if (retry?.type === 'task') void submitTask()
    if (retry?.type === 'agent-submit') void submitAgentMessage()
    if (retry?.type === 'agent-regenerate') void regenerateAgentAssistantMessage(retry.conversationId, retry.roundId)
  }

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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="api-key-prompt-input">
            API Key
          </label>
          {sub2ApiKeysLoading ? (
            <div className="mt-2 w-full rounded-xl border border-blue-300 bg-white px-3.5 py-3 text-sm text-gray-500 dark:border-blue-500/60 dark:bg-white/[0.04] dark:text-gray-400">
              正在获取 Key 列表…
            </div>
          ) : !customKeyMode && sub2ApiKeys.length > 0 ? (
            <>
              <select
                id="api-key-prompt-input"
                autoFocus
                value={apiKey}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '') {
                    setCustomKeyMode(true)
                    setApiKey('')
                  } else {
                    setApiKey(value)
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
              <div className="relative mt-2">
                <input
                  id="api-key-prompt-input"
                  autoFocus
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
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
              {sub2ApiKeyError && (
                <p className="mt-2 text-xs text-red-500">{sub2ApiKeyError}</p>
              )}
              {customKeyMode && sub2ApiKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomKeyMode(false)
                    setApiKey(sub2ApiKeys[0]?.key ?? '')
                  }}
                  className="mt-2 text-xs text-blue-500 transition hover:text-blue-600"
                >
                  从 Key 列表选择
                </button>
              )}
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!apiKey.trim() || profiles.length === 0}
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
