/** 新版 src_url 携带具体页面路径，只取协议和域名；兼容旧版 src_host */
export function getSub2ApiHostParam(searchParams: URLSearchParams): string {
  let srcUrl = searchParams.get('src_url')?.trim() ?? ''
  for (let idx = 0; srcUrl && idx < 3; idx += 1) {
    try {
      const url = new URL(srcUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    } catch {
      // URLSearchParams 已解码一层，这里兼容调用方额外 encodeURIComponent 的情况
    }

    try {
      const decoded = decodeURIComponent(srcUrl)
      if (decoded === srcUrl) break
      srcUrl = decoded
    } catch {
      break
    }
  }

  return searchParams.get('src_host')?.trim() ?? ''
}
