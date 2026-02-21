import { useState, useCallback } from 'react'
import { GeneralSettings } from './GeneralSettings'
import { ReminderSettings } from './ReminderSettings'

export type SettingsTab = 'general' | 'reminder'

export interface SettingsLayoutProps {
  readonly onStartCalibration?: () => void
}

const TABS: readonly { readonly id: SettingsTab; readonly label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'reminder', label: '提醒' },
]

export function SettingsLayout({ onStartCalibration }: SettingsLayoutProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const handleTabClick = useCallback((tab: SettingsTab) => {
    setActiveTab(tab)
  }, [])

  return (
    <div className="settings-layout" data-testid="settings-layout">
      <nav className="settings-sidebar" data-testid="settings-sidebar">
        <ul className="settings-tab-list">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                className={`settings-tab-btn${activeTab === tab.id ? ' settings-tab-active' : ''}`}
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
      </nav>
      <main className="settings-content" data-testid="settings-content" role="tabpanel">
        {activeTab === 'general' && (
          <GeneralSettings onStartCalibration={onStartCalibration} />
        )}
        {activeTab === 'reminder' && <ReminderSettings />}
      </main>
    </div>
  )
}
