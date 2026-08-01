import { useEffect, useRef, useState } from 'react'
import { getApiKeyPromptProfileIds, initStore, useStore } from './store'
import { activateFirstImportedProfile, buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { isDefaultConfigOnlyEnabled, mergeImportedSettings } from './lib/apiProfiles'
import { getCustomProviderConfigUrl, loadCustomProviderSettingsFromUrl } from './lib/customProviderConfigUrl'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import type { AppSettings } from './types'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import AgentWorkspace from './components/AgentWorkspace'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import ApiKeyPromptModal from './components/ApiKeyPromptModal'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'

let customProviderConfigUrlImportStarted = false

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const settings = useStore((s) => s.settings)
  const appMode = useStore((s) => s.appMode)
  const showSettings = useStore((s) => s.showSettings)
  const openApiKeyPrompt = useStore((s) => s.openApiKeyPrompt)
  const apiKeyPrompt = useStore((s) => s.apiKeyPrompt)
  const apiKeyPromptDeferred = useStore((s) => s.apiKeyPromptDeferred)
  const clearDeferredApiKeyPrompt = useStore((s) => s.clearDeferredApiKeyPrompt)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const [appReady, setAppReady] = useState(false)
  const initializationStartedRef = useRef(false)
  const startupApiKeyCheckRef = useRef(false)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    if (initializationStartedRef.current) return
    initializationStartedRef.current = true

    const searchParams = new URLSearchParams(window.location.search)
    const customProviderConfigUrl = getCustomProviderConfigUrl()
    const defaultConfigOnly = isDefaultConfigOnlyEnabled()

    const applyUrlSettings = (baseSettings: Partial<AppSettings>) => {
      const nextSettings = buildSettingsFromUrlParams(baseSettings, searchParams)
      return Object.keys(nextSettings).length ? nextSettings : baseSettings
    }

    const clearAppliedUrlSettings = () => {
      if (!hasUrlSettingParams(searchParams)) return

      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    const initialize = async () => {
      let configImportPromise: Promise<void> = Promise.resolve()

      if (customProviderConfigUrl && defaultConfigOnly) {
        if (!customProviderConfigUrlImportStarted) {
          customProviderConfigUrlImportStarted = true
          configImportPromise = loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
            .then((importedSettings) => {
              const state = useStore.getState()
              const baseSettings = importedSettings
                ? activateFirstImportedProfile(mergeImportedSettings(state.settings, importedSettings), importedSettings)
                : state.settings
              state.setSettings(applyUrlSettings(baseSettings))
              clearAppliedUrlSettings()
            })
            .catch((error) => {
              console.warn('Failed to import custom provider config URL:', error)
              const state = useStore.getState()
              state.setSettings(applyUrlSettings(state.settings))
              clearAppliedUrlSettings()
            })
        }
      } else {
        const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)
        setSettings(nextSettings)
        clearAppliedUrlSettings()

        if (customProviderConfigUrl && !customProviderConfigUrlImportStarted) {
          customProviderConfigUrlImportStarted = true
          configImportPromise = loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
            .then((importedSettings) => {
              if (!importedSettings) return
              const state = useStore.getState()
              state.setSettings(mergeImportedSettings(state.settings, importedSettings))
            })
            .catch((error) => {
              console.warn('Failed to import custom provider config URL:', error)
            })
        }
      }

      const results = await Promise.allSettled([initStore(), configImportPromise])
      const initResult = results[0]
      if (initResult.status === 'rejected') {
        console.warn('Failed to initialize local data:', initResult.reason)
      }
      setAppReady(true)
    }

    void initialize()
  }, [setSettings])

  useEffect(() => {
    if (!appReady || startupApiKeyCheckRef.current || apiKeyPrompt || showSettings) return
    startupApiKeyCheckRef.current = true

    const profileIds = getApiKeyPromptProfileIds(settings, appMode)
    if (profileIds.some((id) => !settings.profiles.find((profile) => profile.id === id)?.apiKey.trim())) {
      openApiKeyPrompt(profileIds, { source: 'startup' })
    }
  }, [appMode, apiKeyPrompt, appReady, openApiKeyPrompt, settings, showSettings])

  useEffect(() => {
    if (showSettings || apiKeyPrompt || !apiKeyPromptDeferred) return

    const profileIds = apiKeyPromptDeferred.profileIds
    const hasMissingApiKey = profileIds.some((id) => !settings.profiles.find((profile) => profile.id === id)?.apiKey.trim())
    if (hasMissingApiKey) {
      openApiKeyPrompt(profileIds, {
        source: apiKeyPromptDeferred.source,
        retry: apiKeyPromptDeferred.retry,
      })
      return
    }

    clearDeferredApiKeyPrompt()
  }, [apiKeyPrompt, apiKeyPromptDeferred, clearDeferredApiKeyPrompt, openApiKeyPrompt, settings, showSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      {appMode === 'agent' ? (
        <AgentWorkspace />
      ) : (
        <main data-home-main data-drag-select-surface className="pb-48">
          <div className="safe-area-x max-w-7xl mx-auto">
            <SearchBar />
            {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
          </div>
        </main>
      )}
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <ApiKeyPromptModal />
      <SupportPromptModal />
      <FavoriteCollectionPickerModal />
      <ManageCollectionsModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
