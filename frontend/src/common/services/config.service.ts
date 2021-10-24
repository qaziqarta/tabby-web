import * as semverCompare from 'semver/functions/compare-loose'
import { AsyncSubject, Subject } from 'rxjs'
import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Config, User, Version } from '../../api'
import { LoginService } from './login.service'


@Injectable({ providedIn: 'root' })
export class ConfigService {
  activeConfig$ = new Subject<Config>()
  activeVersion$ = new Subject<Version>()
  user: User

  configs: Config[] = []
  versions: Version[] = []
  ready$ = new AsyncSubject<void>()

  get activeConfig (): Config | null { return this._activeConfig }
  get activeVersion (): Version | null { return this._activeVersion }

  private _activeConfig: Config|null = null
  private _activeVersion: Version|null = null

  constructor (
    private http: HttpClient,
    private loginService: LoginService,
  ) {
    this.init()
  }

  async updateUser (): Promise<void> {
    if (!this.loginService.user) {
      return
    }
    await this.http.put('/api/1/user', this.user).toPromise()
  }

  async createNewConfig (): Promise<Config> {
    const configData = {
      content: '{}',
      last_used_with_version: this._activeVersion?.version ?? this.getLatestStableVersion().version,
    }
    if (!this.loginService.user) {
      const config = {
        id: Date.now(),
        name: `Temporary config at ${new Date()}`,
        created_at: new Date(),
        modified_at: new Date(),
        ...configData,
      }
      this.configs.push(config)
      return config
    }
    const config = await this.http.post('/api/1/configs', configData).toPromise()
    this.configs.push(config)
    return config
  }

  getLatestStableVersion (): Version {
    return this.versions[0]
  }

  async duplicateActiveConfig (): Promise<void> {
    let copy = { ...this._activeConfig, pk: undefined, id: undefined }
    if (this.loginService.user) {
      copy = await this.http.post('/api/1/configs', copy).toPromise()
    }
    this.configs.push(copy as any)
  }

  async selectVersion (version: Version): Promise<void> {
    this._activeVersion = version
    this.activeVersion$.next(version)
  }

  async selectConfig (config: Config): Promise<void> {
    let matchingVersion = this.versions.find(x => x.version === config.last_used_with_version)
    if (!matchingVersion) {
      // TODO ask to upgrade
      matchingVersion = this.versions[0]
    }

    this._activeConfig = config
    this.activeConfig$.next(config)
    this.selectVersion(matchingVersion)
    if (this.loginService.user) {
      this.loginService.user.active_config = config.id
      await this.loginService.updateUser()
    }
  }

  async selectDefaultConfig (): Promise<void> {
    await this.ready$.toPromise()
    await this.loginService.ready$.toPromise()
    this.selectConfig(this.configs.find(c => c.id === this.loginService.user?.active_config) ?? this.configs[0])
  }

  async deleteConfig (config: Config): Promise<void> {
    if (this.loginService.user) {
      await this.http.delete(`/api/1/configs/${config.id}`).toPromise()
    }
    this.configs = this.configs.filter(x => x.id !== config.id)
  }

  private async init () {
    if (this.loginService.user) {
      this.configs = await this.http.get('/api/1/configs').toPromise()
    }
    this.versions = await this.http.get('/api/1/versions').toPromise()
    this.versions.sort((a, b) => -semverCompare(a.version, b.version))

    if (!this.configs.length) {
      await this.createNewConfig()
    }

    this.ready$.next()
    this.ready$.complete()
  }
}
