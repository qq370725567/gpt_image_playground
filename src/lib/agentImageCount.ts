const CHINESE_NUMBERS: Record<string, number> = {
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function parseChineseNumber(value: string): number {
  if (CHINESE_NUMBERS[value]) return CHINESE_NUMBERS[value]
  if (value.startsWith('十')) return 10 + (CHINESE_NUMBERS[value.slice(1)] ?? 0)
  if (value.includes('十')) {
    const parts = value.split('十')
    return (CHINESE_NUMBERS[parts[0]] ?? 0) * 10 + (CHINESE_NUMBERS[parts[1]] ?? 0)
  }
  return 0
}

export function hasExplicitMultipleImageRequest(prompt: string): boolean {
  const text = prompt.normalize('NFKC')
  const chinesePattern = /(\d{1,3}|[二两三四五六七八九十]{1,3})\s*(?:张|幅|页|个(?:图片|图像|画面|版本|方案|变体)|(?:图片|图像|插画|海报|封面|幻灯片|PPT))/gi
  const englishPattern = /\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:images?|pictures?|photos?|illustrations?|posters?|covers?|slides?|pages?|variants?|versions?)\b/gi

  for (const match of text.matchAll(chinesePattern)) {
    if (match.index != null && text.slice(0, match.index).trimEnd().endsWith('第')) continue
    const count = /^\d+$/.test(match[1]) ? Number(match[1]) : parseChineseNumber(match[1])
    if (count > 1) return true
  }

  const englishNumbers: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  }
  for (const match of text.matchAll(englishPattern)) {
    const value = match[1].toLowerCase()
    if ((/^\d+$/.test(value) ? Number(value) : englishNumbers[value] ?? 0) > 1) return true
  }

  return /(?:分别|各自|每个|每种).{0,20}(?:生成|制作|画|绘制|做).{0,8}(?:一张|一幅|一个)|(?:one|an)\s+(?:image|picture|illustration)\s+each\b/i.test(text)
}
