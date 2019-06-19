import Tenant from '../../entity/Tenant';
import MigrationTask from '../MigrationTask';
import Cypher from '../../utils/Cypher';
import Constants from '../../utils/Constants';
import TSGlobal from '../../types/GlobalType';
declare const global: TSGlobal;

export default class AddSensitiveDataInSettingsTask extends MigrationTask {
  public async migrate() {
    const tenants = await Tenant.getTenants();

    for (const tenant of tenants.result) {
      await this.migrateTenant(tenant);
    }
  }

  public async migrateTenant(tenant) {
    // Read all Settings
    const settings: any = await global.database.getCollection(tenant.getID(), 'settings')
      .aggregate([{
        $match: {
          "sensitiveData": { $exists: false }
        }
      }])
      .toArray();
    // Process each setting
    for (const setting of settings) {
      // Add sensitiveData property if not present
      setting.sensitiveData = [];
      // Concur
      if (setting.content.type === Constants.SETTING_REFUND_CONTENT_TYPE_CONCUR) {
        setting.sensitiveData = ['content.concur.clientSecret'];
        // Encrypt
        if (setting.content.concur.clientSecret) {
          setting.content.concur.clientSecret = Cypher.encrypt(setting.content.concur.clientSecret);
        } else {
          setting.content.concur.clientSecret = '';
        }
      // Convergent Charging
      } else if (setting.content.type === Constants.SETTING_PRICING_CONTENT_TYPE_CONVERGENT_CHARGING) {
        setting.sensitiveData = ['content.convergentCharging.password'];
        if (setting.content.convergentCharging.password) {
          setting.content.convergentCharging.password = Cypher.encrypt(setting.content.convergentCharging.password);
        } else {
          setting.content.convergentCharging.password = '';
        }
      }
      // Update
      await global.database.getCollection(tenant.getID(), 'settings').findOneAndUpdate(
        { "_id": setting._id },
        { $set: setting },
        { upsert: true, returnOriginal: false }
      );
    }
  }

  public getVersion() {
    return "1.0";
  }

  public getName() {
    return "AddSensitiveDataInSettings";
  }
}
