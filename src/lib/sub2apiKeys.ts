// sub2api 用户 Key 获取：sub2api 菜单跳转时 URL 携带 src_host（sub2api 地址）/
// user_id / token，通过管理接口（GET /api/v1/keys，JWT Bearer 认证）拉取当前用户的
// Key 列表，供 API Key 弹窗下拉选择。兼容其他场景的 apiUrl 参数。

export interface Sub2ApiKey {
  id?: number
  key: string
  name?: string
  status?: string
}

export interface Sub2ApiKeyFetchParams {
  /** sub2api 中转地址（OpenAI 兼容接口地址） */
  baseUrl: string
  /** sub2api 用户 ID */
  userId: string
  /** sub2api 登录态 JWT */
  token: string
}

/** 兼容部分 fork 的 /api/v1/api-keys 路径 */
const SUB2_API_KEY_LIST_PATHS = ['/api/v1/keys', '/api/v1/api-keys']
const SUB2_API_KEY_LIST_QUERY = 'page=1&page_size=1000'

let sub2ApiKeysPromise: Promise<Sub2ApiKey[]> | null = null

export function parseSub2ApiKeyParams(searchParams: URLSearchParams): Sub2ApiKeyFetchParams | null {
  const baseUrl = (searchParams.get('src_host') ?? searchParams.get('apiUrl') ?? '').trim()
  const userId = searchParams.get('user_id')?.trim() ?? ''
  const token = searchParams.get('token')?.trim() ?? ''
  if (!baseUrl || !userId || !token) return null
  return { baseUrl, userId, token }
}

/** 从 sub2api 地址推导管理接口地址：以 origin 为根，去掉 /v1 等路径前缀 */
export function getSub2ApiKeyListUrl(baseUrl: string, path: string): string | null {
  try {
    return new URL(baseUrl).origin + path + '?' + SUB2_API_KEY_LIST_QUERY
  } catch {
    return null
  }
}

/** 防御性提取 Key 列表：兼容 {data:{items:[]}}、{data:[]}、裸数组，过滤空 Key、非 active 状态与非 OpenAI 供应商（group.platform） */
export function extractSub2ApiKeyItems(body: unknown): Sub2ApiKey[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return []
  const data = (body as Record<string, unknown>).data
  const rawItems = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>).items)
      ? ((data as Record<string, unknown>).items as unknown[])
      : null
  if (!rawItems) return []

  const keys: Sub2ApiKey[] = []
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const key = rec.key
    const status = rec.status
    if (typeof key !== 'string' || !key.trim()) continue
    if (typeof status === 'string' && status !== 'active') continue
    // 仅保留 OpenAI 供应商（本应用为 OpenAI 接口）；无分组信息的 Key 无法判断，保留
    const group = rec.group
    const platform = group && typeof group === 'object' && !Array.isArray(group)
      ? (group as Record<string, unknown>).platform
      : undefined
    if (typeof platform === 'string' && platform !== 'openai') continue
    keys.push({
      id: typeof rec.id === 'number' ? (rec.id as number) : undefined,
      key: key.trim(),
      name: typeof rec.name === 'string' ? (rec.name as string) : '',
      status: typeof status === 'string' ? status : undefined,
    })
  }
  return keys
}

export async function fetchSub2ApiKeys(params: Sub2ApiKeyFetchParams): Promise<Sub2ApiKey[]> {
  const headers = { Authorization: `Bearer ${params.token}` }
  for (const path of SUB2_API_KEY_LIST_PATHS) {
    const listUrl = getSub2ApiKeyListUrl(params.baseUrl, path)
    if (!listUrl) throw new Error('无效的 sub2api 地址')
    let response: Response | null = null
    try {
      response = await fetch(listUrl, { headers })
    } catch (error) {
      throw new Error(`sub2api 请求失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (response.status === 404) continue
    if (!response.ok) throw new Error(`sub2api 接口返回 ${response.status}`)
    const body: unknown = await response.json().catch(() => null)
    if (body === null) throw new Error('sub2api 响应解析失败')
    return extractSub2ApiKeyItems(body)
  }
  throw new Error('sub2api 接口不存在')
}

/** 会话级缓存：成功后复用结果，失败则不缓存以便下次重试 */
export function getSub2ApiKeys(params: Sub2ApiKeyFetchParams): Promise<Sub2ApiKey[]> {
  if (!sub2ApiKeysPromise) {
    sub2ApiKeysPromise = fetchSub2ApiKeys(params).catch((error) => {
      sub2ApiKeysPromise = null
      throw error
    })
  }
  return sub2ApiKeysPromise
}
