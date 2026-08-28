import { describe, expect, it } from 'vitest'
import { hasExplicitMultipleImageRequest } from './agentImageCount'

describe('hasExplicitMultipleImageRequest', () => {
  it('识别中英文明确的多图数量', () => {
    expect(hasExplicitMultipleImageRequest('生成两张不同风格的海报')).toBe(true)
    expect(hasExplicitMultipleImageRequest('请制作 12 页 PPT')).toBe(true)
    expect(hasExplicitMultipleImageRequest('Create three image variants')).toBe(true)
    expect(hasExplicitMultipleImageRequest('Generate 4 slides')).toBe(true)
  })

  it('未明确多图数量时保持单图限制', () => {
    expect(hasExplicitMultipleImageRequest('帮我生成图片')).toBe(false)
    expect(hasExplicitMultipleImageRequest('给我几个方案')).toBe(false)
    expect(hasExplicitMultipleImageRequest('生成一张海报')).toBe(false)
    expect(hasExplicitMultipleImageRequest('参考第 2 张图继续生成')).toBe(false)
  })

  it('识别分别或各自生成一张的多图请求', () => {
    expect(hasExplicitMultipleImageRequest('猫和狗分别生成一张图片')).toBe(true)
    expect(hasExplicitMultipleImageRequest('Create one image each')).toBe(true)
  })
})
