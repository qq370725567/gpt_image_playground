import { afterEach, describe, expect, it, vi } from 'vitest'

// getSub2ApiKeys 有会话级缓存，每次用全新模块避免测试间互相污染
async function importFreshSub2ApiKeys() {
  vi.resetModules()
  return import('./sub2apiKeys')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseSub2ApiKeyParams', () => {
  it('extracts the origin from the new src_url param', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    expect(parseSub2ApiKeyParams(new URLSearchParams(
      'src_url=https%3A%2F%2Fimage2api.openai-vip.com%2Fcustom%2F939382ecb9cf2afc&user_id=1&token=abc.def',
    ))).toEqual({
      baseUrl: 'https://image2api.openai-vip.com',
      userId: '1',
      token: 'abc.def',
    })
  })

  it('decodes src_url when the encoded value carries an extra encodeURIComponent layer', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    const srcUrl = encodeURIComponent(encodeURIComponent('https://image2api.openai-vip.com/custom/939382ecb9cf2afc'))
    expect(parseSub2ApiKeyParams(new URLSearchParams(`src_url=${srcUrl}&user_id=1&token=abc.def`))).toEqual({
      baseUrl: 'https://image2api.openai-vip.com',
      userId: '1',
      token: 'abc.def',
    })
  })

  it('parses src_host / user_id / token params (sub2api 菜单跳转格式)', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    expect(parseSub2ApiKeyParams(new URLSearchParams(
      'src_host=https%3A%2F%2Fapi.sub2.example.com&user_id=1&token=abc.def&theme=light',
    ))).toEqual({
      baseUrl: 'https://api.sub2.example.com',
      userId: '1',
      token: 'abc.def',
    })
  })

  it('falls back to the apiUrl param when src_host is absent', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    expect(parseSub2ApiKeyParams(new URLSearchParams('apiUrl=https://sub2.example.com/v1&user_id=1&token=abc.def'))).toEqual({
      baseUrl: 'https://sub2.example.com/v1',
      userId: '1',
      token: 'abc.def',
    })
  })

  it('prefers src_host over apiUrl', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    expect(parseSub2ApiKeyParams(new URLSearchParams(
      'src_host=https://sub2.example.com&apiUrl=https://other.example.com/v1&user_id=1&token=abc',
    ))).toEqual({
      baseUrl: 'https://sub2.example.com',
      userId: '1',
      token: 'abc',
    })
  })

  it('prefers src_url over the legacy src_host param', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    expect(parseSub2ApiKeyParams(new URLSearchParams(
      'src_url=https://new.example.com/custom/app&src_host=https://old.example.com&user_id=1&token=abc',
    ))).toEqual({
      baseUrl: 'https://new.example.com',
      userId: '1',
      token: 'abc',
    })
  })

  it('returns null when any param is missing', async () => {
    const { parseSub2ApiKeyParams } = await importFreshSub2ApiKeys()
    expect(parseSub2ApiKeyParams(new URLSearchParams('user_id=1&token=abc'))).toBeNull()
    expect(parseSub2ApiKeyParams(new URLSearchParams('src_host=https://sub2.example.com&token=abc'))).toBeNull()
    expect(parseSub2ApiKeyParams(new URLSearchParams('src_host=https://sub2.example.com&user_id=1'))).toBeNull()
    expect(parseSub2ApiKeyParams(new URLSearchParams(''))).toBeNull()
  })
})

describe('getSub2ApiKeyListUrl', () => {
  it('builds the management URL from the sub2api origin', async () => {
    const { getSub2ApiKeyListUrl } = await importFreshSub2ApiKeys()
    expect(getSub2ApiKeyListUrl('https://sub2.example.com/v1', '/api/v1/keys')).toBe(
      'https://sub2.example.com/api/v1/keys?page=1&page_size=1000',
    )
    expect(getSub2ApiKeyListUrl('https://sub2.example.com', '/api/v1/keys')).toBe(
      'https://sub2.example.com/api/v1/keys?page=1&page_size=1000',
    )
  })

  it('returns null for an invalid sub2api address', async () => {
    const { getSub2ApiKeyListUrl } = await importFreshSub2ApiKeys()
    expect(getSub2ApiKeyListUrl('not a url', '/api/v1/keys')).toBeNull()
  })
})

describe('extractSub2ApiKeyItems', () => {
  it('extracts items from the standard envelope', async () => {
    const { extractSub2ApiKeyItems } = await importFreshSub2ApiKeys()
    const body = {
      code: 0,
      message: 'success',
      data: {
        items: [
          { id: 1, key: 'sk-aaa', name: '主 Key', status: 'active' },
          { id: 2, key: 'sk-bbb', name: '', status: 'active' },
        ],
        total: 2,
      },
    }
    expect(extractSub2ApiKeyItems(body)).toEqual([
      { id: 1, key: 'sk-aaa', name: '主 Key', status: 'active' },
      { id: 2, key: 'sk-bbb', name: '', status: 'active' },
    ])
  })

  it('extracts items from a bare data array', async () => {
    const { extractSub2ApiKeyItems } = await importFreshSub2ApiKeys()
    expect(extractSub2ApiKeyItems({ data: [{ key: 'sk-ccc' }] })).toEqual([{ key: 'sk-ccc', name: '' }])
  })

  it('drops non-active keys and items without a key string', async () => {
    const { extractSub2ApiKeyItems } = await importFreshSub2ApiKeys()
    const body = {
      data: {
        items: [
          { id: 1, key: 'sk-active', status: 'active' },
          { id: 2, key: 'sk-disabled', status: 'disabled' },
          { id: 3, key: 'sk-expired', status: 'expired' },
          { id: 4, key: '', status: 'active' },
          { id: 5, name: 'no key field', status: 'active' },
        ],
      },
    }
    expect(extractSub2ApiKeyItems(body)).toEqual([{ id: 1, key: 'sk-active', name: '', status: 'active' }])
  })

  it('keeps only OpenAI platform keys and keys without a group', async () => {
    const { extractSub2ApiKeyItems } = await importFreshSub2ApiKeys()
    const body = {
      data: {
        items: [
          { id: 1, key: 'sk-openai', status: 'active', group: { platform: 'openai' } },
          { id: 2, key: 'sk-grok', status: 'active', group: { platform: 'grok' } },
          { id: 3, key: 'sk-claude', status: 'active', group: { platform: 'anthropic' } },
          { id: 4, key: 'sk-ungrouped', status: 'active', group: null },
          { id: 5, key: 'sk-no-group', status: 'active' },
        ],
      },
    }
    expect(extractSub2ApiKeyItems(body).map((key) => key.key)).toEqual(['sk-openai', 'sk-ungrouped', 'sk-no-group'])
  })

  it('returns an empty list for unexpected shapes', async () => {
    const { extractSub2ApiKeyItems } = await importFreshSub2ApiKeys()
    expect(extractSub2ApiKeyItems(null)).toEqual([])
    expect(extractSub2ApiKeyItems('x')).toEqual([])
    expect(extractSub2ApiKeyItems([{ key: 'sk-bare' }])).toEqual([])
    expect(extractSub2ApiKeyItems({ data: 'x' })).toEqual([])
  })
})

describe('fetchSub2ApiKeys', () => {
  const PARAMS = { baseUrl: 'https://sub2.example.com/v1', userId: '1', token: 'jwt-token' }

  it('fetches /api/v1/keys with the Bearer token and returns the key list', async () => {
    const { fetchSub2ApiKeys } = await importFreshSub2ApiKeys()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { items: [{ id: 1, key: 'sk-123', name: 'Key1', status: 'active' }] },
    })))

    const keys = await fetchSub2ApiKeys(PARAMS)

    expect(keys).toEqual([{ id: 1, key: 'sk-123', name: 'Key1', status: 'active' }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sub2.example.com/api/v1/keys?page=1&page_size=1000',
      { headers: { Authorization: 'Bearer jwt-token' } },
    )
  })

  it('falls back to /api/v1/api-keys when the first path returns 404', async () => {
    const { fetchSub2ApiKeys } = await importFreshSub2ApiKeys()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { items: [{ id: 9, key: 'sk-fallback', status: 'active' }] },
      })))

    const keys = await fetchSub2ApiKeys(PARAMS)

    expect(keys).toEqual([{ id: 9, key: 'sk-fallback', name: '', status: 'active' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://sub2.example.com/api/v1/api-keys?page=1&page_size=1000')
  })

  it('throws when the server responds with an error status', async () => {
    const { fetchSub2ApiKeys } = await importFreshSub2ApiKeys()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }))
    await expect(fetchSub2ApiKeys(PARAMS)).rejects.toThrow('401')
  })

  it('throws on network failure', async () => {
    const { fetchSub2ApiKeys } = await importFreshSub2ApiKeys()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchSub2ApiKeys(PARAMS)).rejects.toThrow('sub2api 请求失败')
  })
})

describe('getSub2ApiKeys cache', () => {
  it('reuses the cached result within a session', async () => {
    const { getSub2ApiKeys } = await importFreshSub2ApiKeys()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { items: [{ id: 1, key: 'sk-cached', status: 'active' }] },
    })))
    const params = { baseUrl: 'https://sub2.example.com/v1', userId: '1', token: 'jwt-token' }

    const first = await getSub2ApiKeys(params)
    const second = await getSub2ApiKeys(params)

    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed fetch', async () => {
    const { getSub2ApiKeys } = await importFreshSub2ApiKeys()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { items: [{ id: 2, key: 'sk-retry', status: 'active' }] },
      })))
    const params = { baseUrl: 'https://sub2.example.com/v1', userId: '1', token: 'jwt-token' }

    await expect(getSub2ApiKeys(params)).rejects.toThrow()
    const keys = await getSub2ApiKeys(params)

    expect(keys).toEqual([{ id: 2, key: 'sk-retry', name: '', status: 'active' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
