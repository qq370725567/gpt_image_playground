import type { ApiProfile, AppSettings } from '../types'
import {
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_TEXT_PROFILE_ID,
  createDefaultOpenAIProfile,
  isAgentTextApiProfile,
  normalizeSettings,
} from './apiProfiles'

function createProfileId(preferredId: string, profiles: ApiProfile[]): string {
  if (!profiles.some((profile) => profile.id === preferredId)) return preferredId

  let idx = 2
  while (profiles.some((profile) => profile.id === `${preferredId}-${idx}`)) idx += 1
  return `${preferredId}-${idx}`
}

export function applyApiKeyPromptSettings(settings: AppSettings, imageApiKey: string, textApiKey: string): AppSettings {
  const normalized = normalizeSettings(settings)
  const imageKey = imageApiKey.trim() || textApiKey.trim()
  const textKey = textApiKey.trim() || imageKey
  const fixedImageProfile = normalized.profiles.find((profile) =>
    profile.id === DEFAULT_OPENAI_PROFILE_ID || profile.name === '图像模型',
  )
  const fixedTextProfile = normalized.profiles.find((profile) =>
    (profile.id === DEFAULT_TEXT_PROFILE_ID || profile.name === '文本模型') && isAgentTextApiProfile(profile),
  )
  const selectedImageProfile = fixedImageProfile ?? normalized.profiles.find((profile) =>
    profile.id === normalized.agentImageProfileId && profile.id !== fixedTextProfile?.id,
  ) ?? normalized.profiles.find((profile) =>
    profile.id === normalized.activeProfileId && profile.id !== fixedTextProfile?.id,
  ) ?? normalized.profiles.find((profile) => profile.id !== fixedTextProfile?.id) ?? null
  const selectedTextProfile = fixedTextProfile ?? normalized.profiles.find((profile) =>
    profile.id === normalized.agentTextProfileId && profile.id !== selectedImageProfile?.id && isAgentTextApiProfile(profile),
  ) ?? normalized.profiles.find((profile) =>
    profile.id !== selectedImageProfile?.id && isAgentTextApiProfile(profile),
  ) ?? null

  const imageProfile = selectedImageProfile ?? createDefaultOpenAIProfile({
    id: createProfileId(DEFAULT_OPENAI_PROFILE_ID, normalized.profiles),
    name: '图像模型',
    apiKey: imageKey,
    model: DEFAULT_IMAGES_MODEL,
    apiMode: 'images',
    responseFormatB64Json: true,
    streamImages: false,
    ...(selectedTextProfile ? {
      baseUrl: selectedTextProfile.baseUrl,
      timeout: selectedTextProfile.timeout,
      apiProxy: selectedTextProfile.apiProxy,
    } : {}),
  })
  const profilesWithImage = selectedImageProfile
    ? normalized.profiles.map((profile) => profile.id === imageProfile.id
      ? { ...profile, name: '图像模型', apiKey: imageKey }
      : profile,
    )
    : [...normalized.profiles, imageProfile]
  const textProfile = selectedTextProfile ?? createDefaultOpenAIProfile({
    id: createProfileId(DEFAULT_TEXT_PROFILE_ID, profilesWithImage),
    name: '文本模型',
    apiKey: textKey,
    model: DEFAULT_RESPONSES_MODEL,
    timeout: imageProfile.timeout,
    apiMode: 'responses',
    codexCli: false,
    responseFormatB64Json: undefined,
    streamImages: true,
    ...(imageProfile.provider === 'fal' ? {} : {
      baseUrl: imageProfile.baseUrl,
      apiProxy: imageProfile.apiProxy,
    }),
  })
  const profiles = selectedTextProfile
    ? profilesWithImage.map((profile) => profile.id === textProfile.id
      ? { ...profile, name: '文本模型', apiKey: textKey }
      : profile,
    )
    : [...profilesWithImage, textProfile]

  return normalizeSettings({
    ...normalized,
    agentApiConfigMode: 'hybrid',
    agentImageProfileId: imageProfile.id,
    agentTextProfileId: textProfile.id,
    activeProfileId: imageProfile.id,
    profiles,
  })
}
