import { AssetConnectionSetting, AssetConnectionTokenSetting } from '../../types/Setting';

import { AbstractCurrentConsumption } from '../../types/Consumption';
import Asset from '../../types/Asset';
import Tenant from '../../types/Tenant';
import Utils from '../../utils/Utils';
import moment from 'moment';

export default abstract class AssetIntegration<AssetSettings> {
  protected readonly tenant: Tenant;
  protected settings: AssetSettings;
  protected connection: AssetConnectionSetting;

  protected constructor(tenant: Tenant, settings: AssetSettings, connection: AssetConnectionSetting) {
    this.tenant = tenant;
    this.settings = settings;
    this.connection = connection;
  }

  public checkIfIntervalExceeded(asset: Asset): boolean {
    if (asset.lastConsumption?.timestamp && this.connection.refreshIntervalMins &&
      moment() < moment(asset.lastConsumption.timestamp).add(this.connection.refreshIntervalMins, 'minutes')) {
      return false;
    }
    return true;
  }

  public checkIfTokenExpired(token: AssetConnectionTokenSetting): boolean {
    if (!Utils.isNullOrUndefined(token)) {
      const expireTime = new Date(token.expires).getTime() - 60000; // 1 minute buffer
      const now = new Date().getTime();
      return expireTime <= now;
    }
    return true;
  }

  abstract checkConnection(): Promise<void>;

  abstract retrieveConsumptions(asset: Asset, manualCall?: boolean): Promise<AbstractCurrentConsumption[]>;
}
