// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from '../lib/apiProfiles'
import { useStore } from '../store'
import Lightbox from './Lightbox'
import TaskGrid from './TaskGrid'

vi.mock('../lib/imageCache', () => ({
  ensureImageCached: vi.fn(async (id: string) => `data:image/png;base64,${id}`),
  ensureImageThumbnailCached: vi.fn(async (id: string) => ({
    dataUrl: `data:image/png;base64,${id}`,
    width: 1024,
    height: 1024,
  })),
  getCachedImage: vi.fn((id: string) => `data:image/png;base64,${id}`),
  subscribeImageThumbnail: vi.fn(() => () => undefined),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: 'task-a',
    prompt: '保留任务',
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
    isFavorite: true,
    ...overrides,
  }
}

async function render(element: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
    await Promise.resolve()
  })
  return container
}

function dispatchTouch(el: Element, type: string, touches: Array<{ clientX: number; clientY: number }>) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' ? [] : touches },
    changedTouches: { value: touches },
  })
  el.dispatchEvent(event)
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
    detailTaskId: null,
    lightboxImageId: null,
    lightboxImageList: [],
    inputImages: [],
    maskDraft: null,
    streamPreviews: {},
  })
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('画廊封面预览', () => {
  it('按当前筛选和显示顺序打开全部已完成输出并去重', async () => {
    useStore.setState({
      searchQuery: '保留',
      filterFavorite: true,
      tasks: [
        task({ id: 'old', prompt: '保留旧图', createdAt: 2, outputImages: ['shared', 'old-a'] }),
        task({ id: 'hidden-search', prompt: '不匹配', createdAt: 3, outputImages: ['hidden-search'] }),
        task({ id: 'hidden-favorite', prompt: '保留未收藏', createdAt: 4, outputImages: ['hidden-favorite'], isFavorite: false }),
        task({ id: 'new', prompt: '保留新图', createdAt: 5, outputImages: ['new-a', 'shared'] }),
        task({ id: 'running', prompt: '保留运行中', createdAt: 6, outputImages: ['running-a'], status: 'running', finishedAt: null }),
      ],
    })

    const container = await render(<TaskGrid />)
    const cover = container.querySelector('[data-task-cover="old"]') as HTMLElement

    act(() => cover.click())

    expect(useStore.getState().lightboxImageId).toBe('shared')
    expect(useStore.getState().lightboxImageList).toEqual(['new-a', 'shared', 'old-a'])
    expect(useStore.getState().detailTaskId).toBeNull()
  })

  it('保留详情点击和 Ctrl 多选行为', async () => {
    useStore.setState({
      tasks: [task({ id: 'task-a', prompt: '点击详情', outputImages: ['image-a', 'image-b'] })],
    })

    const container = await render(<TaskGrid />)
    const prompt = Array.from(container.querySelectorAll('p')).find((el) => el.textContent === '点击详情') as HTMLElement
    const cover = container.querySelector('[data-task-cover="task-a"]') as HTMLElement

    act(() => prompt.click())
    expect(useStore.getState().detailTaskId).toBe('task-a')
    expect(useStore.getState().lightboxImageId).toBeNull()

    act(() => {
      useStore.setState({ detailTaskId: null })
      cover.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    })

    expect(useStore.getState().selectedTaskIds).toEqual(['task-a'])
    expect(useStore.getState().lightboxImageId).toBeNull()
  })
})

describe('大图导航', () => {
  it('支持按钮、方向键、触屏滑动和首尾循环', async () => {
    useStore.setState({ lightboxImageId: 'image-a', lightboxImageList: ['image-a', 'image-b'] })
    const container = await render(<Lightbox />)

    const next = container.querySelector('button[aria-label="下一张"]') as HTMLButtonElement
    act(() => next.click())
    expect(useStore.getState().lightboxImageId).toBe('image-b')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(useStore.getState().lightboxImageId).toBe('image-a')

    const lightbox = container.querySelector('[data-lightbox-root]') as HTMLElement
    act(() => {
      dispatchTouch(lightbox, 'touchstart', [{ clientX: 120, clientY: 100 }])
      dispatchTouch(lightbox, 'touchmove', [{ clientX: 40, clientY: 100 }])
      dispatchTouch(lightbox, 'touchend', [{ clientX: 40, clientY: 100 }])
    })
    expect(useStore.getState().lightboxImageId).toBe('image-b')

    const previous = container.querySelector('button[aria-label="上一张"]') as HTMLButtonElement
    act(() => previous.click())
    expect(useStore.getState().lightboxImageId).toBe('image-a')

    act(() => previous.click())
    expect(useStore.getState().lightboxImageId).toBe('image-b')
  })
})
