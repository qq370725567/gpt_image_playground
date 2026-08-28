import { describe, expect, it } from 'vitest'
import { applyApiKeyPromptSettings } from './apiKeyPrompt'
import {
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_SETTINGS,
  DEFAULT_TEXT_PROFILE_ID,
  createDefaultOpenAIProfile,
  normalizeSettings,
} from './apiProfiles'

describe('applyApiKeyPromptSettings', () => {
  it('为单个图像配置创建文本配置并切换为混合模式', () => {
    const imageProfile = createDefaultOpenAIProfile({
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
    })
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      agentApiConfigMode: 'off',
      profiles: [imageProfile],
      activeProfileId: imageProfile.id,
      agentTextProfileId: null,
      agentImageProfileId: imageProfile.id,
    })

    const result = applyApiKeyPromptSettings(settings, 'shared-key', 'shared-key')

    expect(result.profiles).toHaveLength(2)
    expect(result.agentApiConfigMode).toBe('hybrid')
    expect(result.agentImageProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(result.agentTextProfileId).toBe(DEFAULT_TEXT_PROFILE_ID)
    expect(result.profiles.find((profile) => profile.id === DEFAULT_TEXT_PROFILE_ID)).toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'shared-key',
      apiMode: 'responses',
    })
  })

  it('分别为已有图像和文本配置保存 Key 并自动绑定', () => {
    const result = applyApiKeyPromptSettings(DEFAULT_SETTINGS, 'image-key', 'text-key')

    expect(result.agentApiConfigMode).toBe('hybrid')
    expect(result.agentImageProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(result.agentTextProfileId).toBe(DEFAULT_TEXT_PROFILE_ID)
    expect(result.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)?.apiKey).toBe('image-key')
    expect(result.profiles.find((profile) => profile.id === DEFAULT_TEXT_PROFILE_ID)?.apiKey).toBe('text-key')
  })

  it('只提供一个 Key 时图像和文本配置共用该 Key', () => {
    const result = applyApiKeyPromptSettings(DEFAULT_SETTINGS, '', 'shared-key')

    expect(result.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)?.apiKey).toBe('shared-key')
    expect(result.profiles.find((profile) => profile.id === DEFAULT_TEXT_PROFILE_ID)?.apiKey).toBe('shared-key')
  })
})
