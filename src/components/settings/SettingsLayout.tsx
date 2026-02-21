import { useState, useCallback } from 'react'
import { GeneralSettings } from './GeneralSettings'
import { DetectionSettings } from './DetectionSettings'
import { ReminderSettings } from './ReminderSettings'
import { ScheduleSettings } from './ScheduleSettings'
import { DebugPanel } from './DebugPanel'
import { useDebugMode } from '@/hooks/useDebugMode'
import { useSettings } from '@/hooks/useSettings'
import type { UsePostureDetectionReturn } from '@/hooks/usePostureDetection'

const APP_VERSION = 'v0.1.0'

export type SettingsTab = 'general' | 'detection' | 'reminder' | 'schedule' | 'debug'

export interface SettingsLayoutProps {
  readonly onStartCalibration?: () => void
  readonly detection?: UsePostureDetectionReturn
}

const BASE_TABS: readonly { readonly id: SettingsTab; readonly label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'detection', label: '检测' },
  { id: 'reminder', label: '提醒' },
  { id: 'schedule', label: '计划' },
]

export function SettingsLayout({ onStartCalibration, detection }: SettingsLayoutProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const { settings, updateSettings } = useSettings()

  const handleDebugToggle = useCallback(
    (enabled: boolean) => {
      updateSettings({
        advanced: { ...settings.advanced, debugMode: enabled },
      })
    },
    [settings.advanced, updateSettings],
  )

  const { debugMode, handleVersionClick, closeDebugMode } = useDebugMode(
    settings.advanced.debugMode,
    handleDebugToggle,
  )

  const handleTabClick = useCallback((tab: SettingsTab) => {
    setActiveTab(tab)
  }, [])

  const handleCloseDebug = useCallback(() => {
    closeDebugMode()
    setActiveTab('general')
  }, [closeDebugMode])

  const tabs = debugMode
    ? [...BASE_TABS, { id: 'debug' as const, label: '调试' }]
    : BASE_TABS

  return (
    <div className="settings-layout" data-testid="settings-layout">
      <nav className="settings-sidebar" data-testid="settings-sidebar">
        <ul className="settings-tab-list">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                className={`settings-tab-btn${activeTab === tab.id ? ' settings-tab-active' : ''}${tab.id === 'debug' ? ' settings-tab-debug' : ''}`}
                onClick={() => handleTabClick(tab.id)}
                data-testid={`settings-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                role="tab"
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <div
          className="version-text"
          onClick={handleVersionClick}
          data-testid="version-text"
          role="button"
          tabIndex={0}
        >
          {APP_VERSION}
        </div>
      </nav>
      <main className="settings-content" data-testid="settings-content" role="tabpanel">
        {activeTab === 'general' && (
          <GeneralSettings
            onStartCalibration={onStartCalibration}
            detection={detection}
          />
        )}
        {activeTab === 'detection' && <DetectionSettings />}
        {activeTab === 'reminder' && <ReminderSettings />}
        {activeTab === 'schedule' && <ScheduleSettings />}
        {activeTab === 'debug' && detection && (
          <DebugPanel
            detection={detection}
            calibration={settings.calibration}
            onClose={handleCloseDebug}
          />
        )}
        {activeTab === 'debug' && !detection && (
          <div className="settings-panel" data-testid="debug-no-detection">
            <h2 className="settings-panel-title">调试</h2>
            <p className="settings-description">
              检测未启动，无法显示调试数据。
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
