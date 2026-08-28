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

  it('唯一配置使用 Responses API 时仍将它作为图像配置，不会颠倒两个 Key', () => {
    const imageProfile = createDefaultOpenAIProfile({
      id: 'preset-image',
      name: '默认配置',
      apiMode: 'responses',
      apiKey: '',
      streamImages: true,
    })
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      profiles: [imageProfile],
      activeProfileId: imageProfile.id,
      agentImageProfileId: imageProfile.id,
      agentTextProfileId: imageProfile.id,
    })

    const result = applyApiKeyPromptSettings(settings, 'image-key', 'text-key')
    const savedImageProfile = result.profiles.find((profile) => profile.id === imageProfile.id)
    const savedTextProfile = result.profiles.find((profile) => profile.id === result.agentTextProfileId)

    expect(result.profiles).toHaveLength(2)
    expect(result.agentImageProfileId).toBe(imageProfile.id)
    expect(result.agentTextProfileId).not.toBe(imageProfile.id)
    expect(savedImageProfile).toMatchObject({ name: '图像模型', apiKey: 'image-key' })
    expect(savedTextProfile).toMatchObject({ name: '文本模型', apiKey: 'text-key', apiMode: 'responses' })
  })

  it('保存时将已有配置名称固定为图像模型和文本模型', () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      profiles: DEFAULT_SETTINGS.profiles.map((profile) => ({
        ...profile,
        name: profile.id === DEFAULT_OPENAI_PROFILE_ID ? '旧图像名称' : '旧文本名称',
      })),
    })

    const result = applyApiKeyPromptSettings(settings, 'image-key', 'text-key')

    expect(result.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)?.name).toBe('图像模型')
    expect(result.profiles.find((profile) => profile.id === DEFAULT_TEXT_PROFILE_ID)?.name).toBe('文本模型')
  })
})
