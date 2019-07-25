import auth from 'basic-auth';
import CentralServiceApi from './client/CentralServiceApi';
import Constants from '../../utils/Constants';
import Logging from '../../utils/Logging';
import ODataBootNotifications from './odata-entities/ODataBootNotifications';
import ODataChargingStations from './odata-entities/ODataChargingStations';
import ODataCompanies from './odata-entities/ODataCompanies';
import ODataModel from './odata-model/ODataModel';
import ODataSites from './odata-entities/ODataSites';
import ODataSiteAreas from './odata-entities/ODataSiteAreas';
import ODataStatusNotifications from './odata-entities/ODataStatusNotifications';
import ODataTransactions from './odata-entities/ODataTransactions';
import ODataUsers from './odata-entities/ODataUsers';
import Tenant from '../../entity/Tenant';

const MODULE_NAME = 'ODataServer';
export default class ODataRestAdapter {
  public static restServerUrl: any;

  static async query(collection, query?, req?, cb?) {
    // Get tenant from url
    const requestedHost = req.host;
    // Split
    const split = requestedHost.split('.');
    // Get tenant at first place
    let subdomain = split[0];
    // Get user/password
    const authentication = auth(req);
    // For testing at home
    if (subdomain === '109') {
      subdomain = 'slf';
    }
    // Handle error
    try {
      // Get tenant
      const tenant = await Tenant.getTenantBySubdomain(subdomain);
      // Check if tenant available
      if (!tenant) {
        cb(Error('Invalid tenant'));
        return;
      }
      // Check if sac setting is active
      if (!tenant.isComponentActive(Constants.COMPONENTS.ANALYTICS)) {
        cb(Error('SAP Analytics Cloud Interface not enabled'));
        return;
      }
      // Default timezone
      req.timezone = 'UTC';
      // Get settings
      const sacSetting = await tenant.getSetting(Constants.COMPONENTS.ANALYTICS);
      if (sacSetting) {
        const configuration = sacSetting.getContent();
        if (configuration && configuration.sac && configuration.sac.timezone) {
          req.timezone = configuration.sac.timezone;
        }
      }

      // Build AuthenticatedApi
      const centralServiceApi = new CentralServiceApi(ODataRestAdapter.restServerUrl, authentication.name, authentication.pass, subdomain);
      // Set tenant
      req.tenant = subdomain;
      if (!req.user) {
        req.user = {};
      }
      req.user.tenantID = tenant.getID();
      switch (collection) {
        case 'Transactions':
          await new ODataTransactions().getTransactionsCompleted(centralServiceApi, query, req, cb);
          break;
        case 'TransactionsCompleted':
          await new ODataTransactions().getTransactionsCompleted(centralServiceApi, query, req, cb);
          break;
        case 'Companies':
          await new ODataCompanies().getCompanies(centralServiceApi, query, req, cb);
          break;
        case 'Sites':
          await new ODataSites().getSites(centralServiceApi, query, req, cb);
          break;
        case 'SiteAreas':
          await new ODataSiteAreas().getSiteAreas(centralServiceApi, query, req, cb);
          break;
        case 'ChargingStations':
          await new ODataChargingStations().getChargingStations(centralServiceApi, query, req, cb);
          break;
        case 'StatusNotifications':
          await new ODataStatusNotifications().getStatusNotifications(centralServiceApi, query, req, cb);
          break;
        case 'BootNotifications':
          await new ODataBootNotifications().getBootNotifications(centralServiceApi, query, req, cb);
          break;
        case 'Users':
          await new ODataUsers().getUsers(centralServiceApi, query, req, cb);
          break;
        default:
          cb('Invalid Entity');
      }
    } catch (error) {
      // Add logging
      Logging.logError({
        tenantID: req.user.tenantID,
        module: MODULE_NAME,
        source: MODULE_NAME,
        method: 'query',
        action: 'query',
        message: error.message,
        detailedMessages: error.stack
      });
      cb(error);
    }
  }

  static registerAdapter(oDataServer) {
    if (!oDataServer) {
      return;
    }
    oDataServer.model(ODataModel).query(ODataRestAdapter.query);
  }
}

