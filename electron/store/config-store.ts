import Store from 'electron-store'
import { DEFAULT_SETTINGS, type PostureSettings } from '../../src/types/settings'

interface StoreSchema {
  settings: PostureSettings
}

export class ConfigStore {
  private readonly store: Store<StoreSchema>

  constructor() {
    this.store = new Store({
      name: 'postret-config',
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
      clearInvalidConfig: true,
    })
  }

  getSettings(): PostureSettings {
    return this.store.get('settings', DEFAULT_SETTINGS) as PostureSettings
  }

  setSettings(settings: PostureSettings): void {
    this.store.set('settings', settings)
  }

  getPath(): string {
    return this.store.path
  }

  clear(): void {
    this.store.clear()
  }
}
