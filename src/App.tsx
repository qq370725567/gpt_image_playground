import { useEffect, useRef, useState } from 'react'
import { getApiKeyPromptProfileIds, initStore, restoreExplicitPresetConfig, useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, getExplicitUrlSettingsIds, hasUrlSettingParams } from './lib/urlSettings'
import { createDefaultOpenAIProfile, hasDefaultPresetConfig, isAgentTextApiProfile, normalizeSettings } from './lib/apiProfiles'
import { getCustomProviderConfigUrl, hasEmbeddedDefaultConfig, loadCustomProviderSettingsFromUrl, loadEmbeddedDefaultConfig } from './lib/customProviderConfigUrl'
import { getDefaultPresetProfileId, getPresetProfileIds, isPresetConfigOnlyEnabled, setPresetConfig } from './lib/presetConfig'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import type { AppSettings } from './types'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import AgentWorkspace from './components/AgentWorkspace'
import InputBar from './components/InputBar'
import ModelSelectorPanel from './components/ModelSelectorPanel'
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

let defaultConfigImportStarted = false

export default function App() {
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
    if (defaultConfigImportStarted || initializationStartedRef.current) return
    defaultConfigImportStarted = true
    initializationStartedRef.current = true

    const searchParams = new URLSearchParams(window.location.search)
    const customProviderConfigUrl = getCustomProviderConfigUrl()
    const embeddedDefaultConfig = hasEmbeddedDefaultConfig()
    const loadDefaultConfig = () => embeddedDefaultConfig
      ? Promise.resolve().then(() => loadEmbeddedDefaultConfig())
      : loadCustomProviderSettingsFromUrl(customProviderConfigUrl)

    const applyUrlSettings = async (baseSettings: Partial<AppSettings>) => {
      const ids = getExplicitUrlSettingsIds(searchParams)
      const restored = await restoreExplicitPresetConfig(ids)
      const restoredSettings = useStore.getState().settings
      const sourceSettings = restored
        ? { ...restoredSettings, ...baseSettings, customProviders: restoredSettings.customProviders, profiles: restoredSettings.profiles }
        : baseSettings
      const nextSettings = buildSettingsFromUrlParams(sourceSettings, searchParams)
      return Object.keys(nextSettings).length ? nextSettings : sourceSettings
    }

    const clearAppliedUrlSettings = () => {
      if (!hasUrlSettingParams(searchParams)) return

      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    const initialize = async () => {
      try {
        await initStore()

        const importedSettings = embeddedDefaultConfig || customProviderConfigUrl
          ? await loadDefaultConfig()
          : hasDefaultPresetConfig()
            ? {
                customProviders: [],
                profiles: [{ ...createDefaultOpenAIProfile(), isDefault: true }],
              }
            : null
        setPresetConfig(importedSettings)

        const state = useStore.getState()
        if (importedSettings) {
          await state.setPresetImportedSettings(importedSettings)
        } else if (state.previousPresetConfig) {
          await state.setPresetImportedSettings({ customProviders: [], profiles: [] })
        }

        const syncedState = useStore.getState()
        if (!importedSettings) {
          useStore.setState({ dismissedPresetProfileIds: [], dismissedPresetProviderIds: [] })
          if (syncedState.settings.profiles.some((profile) => profile.isDefault)) {
            syncedState.setSettings({
              profiles: syncedState.settings.profiles.map((profile) => profile.isDefault ? { ...profile, isDefault: undefined } : profile),
            })
          }
        }

        const current = useStore.getState()
        const presetIds = getPresetProfileIds()
        const defaultPresetId = getDefaultPresetProfileId()
        const nextSettings = isPresetConfigOnlyEnabled()
          ? normalizeSettings({
              ...current.settings,
              activeProfileId: presetIds.has(current.settings.activeProfileId)
                ? current.settings.activeProfileId
                : defaultPresetId ?? [...presetIds][0],
              agentTextProfileId: current.settings.agentTextProfileId && presetIds.has(current.settings.agentTextProfileId)
                ? current.settings.agentTextProfileId
                : current.settings.profiles.find((profile) => presetIds.has(profile.id) && isAgentTextApiProfile(profile))?.id ?? null,
              agentImageProfileId: current.settings.agentImageProfileId && presetIds.has(current.settings.agentImageProfileId)
                ? current.settings.agentImageProfileId
                : defaultPresetId ?? [...presetIds][0],
            })
          : current.settings
        current.setSettings(await applyUrlSettings(nextSettings))
        clearAppliedUrlSettings()
      } catch (error) {
        console.warn('Failed to import preset config:', error)
        setPresetConfig(null)
        try {
          const nextSettings = await applyUrlSettings(useStore.getState().settings)
          useStore.getState().setSettings(nextSettings)
          clearAppliedUrlSettings()
        } catch (fallbackError) {
          console.warn('Failed to apply URL settings:', fallbackError)
        }
      } finally {
        setAppReady(true)
      }
    }

    void initialize()
  }, [])

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
      <ModelSelectorPanel />
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
