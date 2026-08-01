import type { ApiMode, AppSettings } from '../types'
import { normalizeBaseUrl } from './devProxy'
import {
  createDefaultOpenAIProfile,
  DEFAULT_BASE_URL,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_TEXT_PROFILE_ID,
  findEquivalentApiProfile,
  isDefaultConfigOnlyEnabled,
  mergeImportedSettings,
  normalizeSettings,
  normalizeReasoningEffort,
  normalizeStreamPartialImages,
} from './apiProfiles'

const URL_SETTING_KEYS = ['settings', 'apiUrl', 'apiKey', 'codexCli', 'apiMode', 'model', 'profileName', 'reasoningEffort', 'streamImages', 'streamPartialImages']

function getProfileDedupKey(profile: Pick<AppSettings['profiles'][number], 'provider' | 'baseUrl' | 'apiKey' | 'model' | 'apiMode' | 'reasoningEffort' | 'codexCli' | 'streamImages' | 'streamPartialImages'>) {
  return JSON.stringify([
    profile.provider,
    profile.baseUrl.trim().replace(/\/+$/, '').toLowerCase(),
    profile.apiKey.trim(),
    profile.model.trim(),
    profile.apiMode,
    profile.reasoningEffort,
    profile.codexCli === true,
    profile.streamImages === true,
    profile.streamPartialImages ?? 0,
  ])
}

function createUrlProfileId(usedIds: Set<string>) {
  let id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  return id
}

function pickUrlSettingsPayload(value: unknown): unknown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    customProviders: record.customProviders,
    profiles: record.profiles,
  }
}

function getUrlSettingsPayload(searchParams: URLSearchParams): unknown | null {
  const raw = searchParams.get('settings')
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'settings' in parsed) {
      return pickUrlSettingsPayload((parsed as { settings?: unknown }).settings ?? null)
    }
    return pickUrlSettingsPayload(parsed)
  } catch {
    return null
  }
}

export function activateFirstImportedProfile(settings: AppSettings, importedSettings: unknown): AppSettings {
  if (!importedSettings || typeof importedSettings !== 'object' || Array.isArray(importedSettings)) return settings

  const record = importedSettings as Record<string, unknown>
  if (!Array.isArray(record.profiles) || record.profiles.length === 0) return settings

  const imported = normalizeSettings({
    customProviders: record.customProviders,
    profiles: record.profiles,
  })
  const importedProfile = imported.profiles[0]
  const activeProfile = findEquivalentApiProfile(settings, importedProfile, imported.customProviders)

  return activeProfile
    ? normalizeSettings({ ...settings, activeProfileId: activeProfile.id })
    : settings
}

/** src_host 是中转 API 地址（可能不带路径），统一补上 /v1 */
function normalizeSrcHostBaseUrl(srcHost: string): string {
  const normalized = normalizeBaseUrl(srcHost)
  if (!normalized) return ''
  try {
    const pathSegments = new URL(normalized).pathname.split('/').filter(Boolean)
    if (pathSegments[pathSegments.length - 1]?.toLowerCase() === 'v1') return normalized
    return `${normalized.replace(/\/+$/, '')}/v1`
  } catch {
    return normalized
  }
}

/** sub2api 菜单跳转（src_host 为中转地址）：仅当 profile 仍是默认 OpenAI 地址时才替换为 src_host */
function applySrcHostBaseUrl(settings: AppSettings, srcHostParam: string | null): AppSettings {
  const srcHostUrl = srcHostParam?.trim() ? normalizeSrcHostBaseUrl(srcHostParam.trim()) : ''
  if (!srcHostUrl) return settings

  const targetIds = new Set([
    settings.activeProfileId,
    settings.agentImageProfileId ?? DEFAULT_OPENAI_PROFILE_ID,
    settings.agentTextProfileId ?? DEFAULT_TEXT_PROFILE_ID,
  ])
  let changed = false
  const profiles = settings.profiles.map((profile) => {
    if (!targetIds.has(profile.id)) return profile
    if (profile.baseUrl.trim() && normalizeBaseUrl(profile.baseUrl) !== DEFAULT_BASE_URL) return profile
    changed = true
    return { ...profile, baseUrl: srcHostUrl }
  })
  return changed ? { ...settings, profiles } : settings
}

/**
 * 仅展示默认配置模式：从 URL 参数中提取可覆盖的字段，patch 到当前活跃配置上。
 * 不新建配置、不导入自定义服务商、不切换 provider。
 */
function buildDefaultConfigOnlySettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams): Partial<AppSettings> {
  const settings = normalizeSettings(currentSettings)
  const activeProfile = settings.profiles.find((profile) => profile.id === settings.activeProfileId) ?? settings.profiles[0]
  if (!activeProfile) return {}

  const isOpenAI = activeProfile.provider === 'openai'
  const patch: Partial<typeof activeProfile> = {}

  // 从 ?settings= JSON 中提取同 provider 的 profile 字段
  const importedSettings = getUrlSettingsPayload(searchParams)
  if (importedSettings && typeof importedSettings === 'object' && !Array.isArray(importedSettings)) {
    const profiles = (importedSettings as Record<string, unknown>).profiles
    if (Array.isArray(profiles)) {
      const matched = profiles.find((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false
        const p = (item as Record<string, unknown>).provider
        return p === undefined || p === activeProfile.provider
      }) as Record<string, unknown> | undefined
      if (matched) {
        if (typeof matched.name === 'string' && matched.name.trim()) patch.name = matched.name.trim()
        if (typeof matched.baseUrl === 'string') patch.baseUrl = matched.baseUrl
        if (typeof matched.apiKey === 'string') patch.apiKey = matched.apiKey
        if (typeof matched.model === 'string' && matched.model.trim()) patch.model = matched.model.trim()
        if (typeof matched.timeout === 'number' && Number.isFinite(matched.timeout)) patch.timeout = matched.timeout
        if (typeof matched.apiProxy === 'boolean') patch.apiProxy = matched.apiProxy
        if (matched.responseFormatB64Json === true) patch.responseFormatB64Json = true
        if (isOpenAI) {
          if (matched.apiMode === 'images' || matched.apiMode === 'responses') patch.apiMode = matched.apiMode
          if (matched.reasoningEffort !== undefined) patch.reasoningEffort = normalizeReasoningEffort(matched.reasoningEffort)
          if (typeof matched.codexCli === 'boolean') patch.codexCli = matched.codexCli
          if (typeof matched.streamImages === 'boolean') patch.streamImages = matched.streamImages
          if (matched.streamPartialImages !== undefined) patch.streamPartialImages = normalizeStreamPartialImages(matched.streamPartialImages)
        }
      }
    }
  }

  // 查询参数覆盖（优先级高于 settings JSON）
  const apiUrlParam = searchParams.get('apiUrl')
  const apiKeyParam = searchParams.get('apiKey')
  const modelParam = searchParams.get('model')
  const profileNameParam = searchParams.get('profileName')
  const srcHostParam = searchParams.get('src_host')
  if (profileNameParam?.trim()) patch.name = profileNameParam.trim()
  if (apiUrlParam !== null) patch.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
  if (apiKeyParam !== null) patch.apiKey = apiKeyParam.trim()
  if (modelParam !== null && modelParam.trim()) patch.model = modelParam.trim()
  if (isOpenAI) {
    const apiModeParam = searchParams.get('apiMode')
    const reasoningEffortParam = searchParams.get('reasoningEffort')
    const codexCliParam = searchParams.get('codexCli')
    const streamImagesParam = searchParams.get('streamImages')
    const streamPartialImagesParam = searchParams.get('streamPartialImages')
    if (apiModeParam === 'images' || apiModeParam === 'responses') patch.apiMode = apiModeParam
    if (reasoningEffortParam !== null) patch.reasoningEffort = normalizeReasoningEffort(reasoningEffortParam)
    if (codexCliParam !== null) patch.codexCli = codexCliParam.trim().toLowerCase() === 'true'
    if (streamImagesParam !== null) patch.streamImages = streamImagesParam.trim().toLowerCase() === 'true'
    if (streamPartialImagesParam !== null) patch.streamPartialImages = normalizeStreamPartialImages(streamPartialImagesParam)
  }

  // sub2api 菜单跳转（src_host 为中转地址）：仅当当前还是默认 OpenAI 地址时才替换
  const srcHostUrl = srcHostParam?.trim() ? normalizeSrcHostBaseUrl(srcHostParam.trim()) : ''
  if (srcHostUrl && !patch.baseUrl && (!activeProfile.baseUrl.trim() || normalizeBaseUrl(activeProfile.baseUrl) === DEFAULT_BASE_URL)) {
    patch.baseUrl = srcHostUrl
  }

  if (Object.keys(patch).length === 0 && !srcHostUrl) return {}

  const textProfileId = settings.agentTextProfileId ?? DEFAULT_TEXT_PROFILE_ID
  return normalizeSettings({
    ...settings,
    profiles: settings.profiles.map((profile) => {
      if (profile.id === activeProfile.id) return { ...profile, ...patch, provider: profile.provider }
      if (srcHostUrl && profile.id === textProfileId && (!profile.baseUrl.trim() || normalizeBaseUrl(profile.baseUrl) === DEFAULT_BASE_URL)) {
        return { ...profile, baseUrl: srcHostUrl }
      }
      return profile
    }),
  })
}

export function hasUrlSettingParams(searchParams: URLSearchParams) {
  return URL_SETTING_KEYS.some((key) => searchParams.has(key))
}

export function clearUrlSettingParams(searchParams: URLSearchParams) {
  for (const key of URL_SETTING_KEYS) searchParams.delete(key)
}

export function buildSettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams): Partial<AppSettings> {
  if (isDefaultConfigOnlyEnabled()) return buildDefaultConfigOnlySettingsFromUrlParams(currentSettings, searchParams)

  const importedSettings = getUrlSettingsPayload(searchParams)
  const apiUrlParam = searchParams.get('apiUrl')
  const apiKeyParam = searchParams.get('apiKey')
  const codexCliParam = searchParams.get('codexCli')
  const apiModeParam = searchParams.get('apiMode')
  const modelParam = searchParams.get('model')
  const reasoningEffortParam = searchParams.get('reasoningEffort')
  const profileNameParam = searchParams.get('profileName')
  const profileName = profileNameParam?.trim() ?? ''
  const srcHostParam = searchParams.get('src_host')
  const streamImagesParam = searchParams.get('streamImages')
  const streamPartialImagesParam = searchParams.get('streamPartialImages')
  const apiMode: ApiMode | undefined = apiModeParam === 'images' || apiModeParam === 'responses' ? apiModeParam : undefined

  const hasLegacyOpenAIParams = apiUrlParam !== null || apiKeyParam !== null || codexCliParam !== null || apiMode !== undefined || modelParam !== null || profileNameParam !== null || reasoningEffortParam !== null || streamImagesParam !== null || streamPartialImagesParam !== null
  const settings = importedSettings == null
    ? normalizeSettings(currentSettings)
    : activateFirstImportedProfile(mergeImportedSettings(currentSettings, importedSettings), importedSettings)
  const srcHostSettings = applySrcHostBaseUrl(settings, srcHostParam)

  if (hasLegacyOpenAIParams) {
    const profileApiMode = apiMode ?? 'images'
    const profile = createDefaultOpenAIProfile({
      id: createUrlProfileId(new Set(settings.profiles.map((item) => item.id))),
      name: 'URL 参数配置',
      apiMode: profileApiMode,
      model: profileApiMode === 'responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL,
    })
    if (apiUrlParam !== null) profile.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
    if (apiKeyParam !== null) profile.apiKey = apiKeyParam.trim()
    if (modelParam !== null && modelParam.trim()) profile.model = modelParam.trim()
    if (reasoningEffortParam !== null) profile.reasoningEffort = normalizeReasoningEffort(reasoningEffortParam)
    if (profileName) profile.name = profileName
    if (codexCliParam !== null) profile.codexCli = codexCliParam.trim().toLowerCase() === 'true'
    if (streamImagesParam !== null) profile.streamImages = streamImagesParam.trim().toLowerCase() === 'true'
    if (streamPartialImagesParam !== null) profile.streamPartialImages = normalizeStreamPartialImages(streamPartialImagesParam)

    const existingProfile = settings.profiles.find((item) =>
      getProfileDedupKey(item) === getProfileDedupKey(profile) &&
      (!profileName || item.name.trim() === profileName)
    )
    if (existingProfile) {
      return normalizeSettings({ ...settings, activeProfileId: existingProfile.id })
    }

    return normalizeSettings({
      ...settings,
      profiles: [...settings.profiles, profile],
      activeProfileId: profile.id,
    })
  }

  return importedSettings == null
    ? srcHostSettings === settings ? {} : srcHostSettings
    : srcHostSettings
}
