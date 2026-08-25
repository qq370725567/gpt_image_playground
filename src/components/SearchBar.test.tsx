// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TaskRecord } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from '../lib/apiProfiles'
import { useStore } from '../store'
import SearchBar from './SearchBar'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: '匹配任务',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: ['image-a'],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<SearchBar />)
    await Promise.resolve()
  })
  return container
}

beforeEach(() => {
  document.body.innerHTML = ''
  useStore.setState({
    settings: DEFAULT_SETTINGS,
    tasks: [],
    searchQuery: '',
    filterStatus: 'all',
    filterFavorite: false,
    activeFavoriteCollectionId: null,
    selectedTaskIds: [],
    confirmDialog: null,
  })
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
})

describe('画廊搜索栏操作', () => {
  it('清空按钮显示整个画廊范围并保留 Agent 数据说明', async () => {
    useStore.setState({
      searchQuery: '匹配',
      tasks: [
        task({ id: 'gallery-a' }),
        task({ id: 'gallery-b', prompt: '不匹配' }),
        task({ id: 'agent-a', sourceMode: 'agent', agentConversationId: 'conversation-a', agentRoundId: 'round-a' }),
      ],
    })

    const container = await render()
    expect(container.querySelector('button[aria-label="全选当前可见任务"]')).toBeNull()
    const clearButton = container.querySelector('button[aria-label="清空整个画廊"]') as HTMLButtonElement

    act(() => clearButton.click())

    const dialog = useStore.getState().confirmDialog
    expect(dialog?.title).toBe('清空画廊')
    expect(dialog?.message).toContain('2 个画廊任务')
    expect(dialog?.message).toContain('Agent 对话、Agent 生成记录')
  })
})
