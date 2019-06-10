import ODataTransactions from './odata-entities/ODataTransactions';
import oDataCompanies from './odata-entities/ODataCompanies';
import oDataSites from './odata-entities/ODataSites';
import oDataSiteAreas from './odata-entities/ODataSiteAreas';
import oDataChargingStations from './odata-entities/ODataChargingStations';
import oDataStatusNotifications from './odata-entities/ODataStatusNotifications';
import oDataBootNotifications from './odata-entities/ODataBootNotifications';
import oDataUsers from './odata-entities/ODataUsers';
import oDataModel from './odata-model/ODataModel';
import auth from 'basic-auth';
import Constants from '../../utils/Constants';
import CentralServiceApi from './client/CentralServiceApi';
import Tenant from '../../entity/Tenant';
import Logging from '../../utils/Logging';

const MODULE_NAME = "ODataServer";
export default class ODataRestAdapter {
  public static restServerUrl: any;

  static async query(collection, query?, req?, cb?) {
    // get tenant from url
    const requestedHost = req.host;

    // split 
    const split = requestedHost.split('.');

    // get tenant at first place
    let subdomain = split[0];

    // get user/password
    const authentication = auth(req);

    // TODO: for testing at home
    if (subdomain === '109') {
      subdomain = 'slf';
    }
    // handle error
    try {
      // get tenant
      const tenant = await Tenant.getTenantBySubdomain(subdomain);

      // check if tenant available
      if (!tenant) {
        cb(Error("Invalid tenant"));
        return;
      }

      // check if sac setting is active
      if (!tenant.isComponentActive(Constants.COMPONENTS.ANALYTICS)) {
        cb(Error("SAP Analytics Clound Interface not enabled"));
        return;
      }

      // default timezone
      req.timezone = 'UTC';

      // get settings
      const sacSetting = await tenant.getSetting(Constants.COMPONENTS.ANALYTICS);

      if (sacSetting) {
        const configuration = sacSetting.getContent();

        if (configuration && configuration.sac && configuration.sac.timezone) {
          req.timezone = configuration.sac.timezone;
        }
      }

      // build AuthenticatedApi
      const centralServiceApi = new CentralServiceApi(this.restServerUrl, authentication.name, authentication.pass, subdomain);

      // set tenant
      req.tenant = subdomain;
      req.tenantID = tenant.getID();

      switch (collection) {
        case 'Transactions':
          ODataTransactions.getTransactionsCompleted(centralServiceApi, query, req, cb);
          break;
        case 'TransactionsCompleted':
          ODataTransactions.getTransactionsCompleted(centralServiceApi, query, req, cb);
          break;
        case 'Companies':
          oDataCompanies.getCompanies(centralServiceApi, query, req, cb);
          break;
        case 'Sites':
          oDataSites.getSites(centralServiceApi, query, req, cb);
          break;
        case 'SiteAreas':
          oDataSiteAreas.getSiteAreas(centralServiceApi, query, req, cb);
          break;
        case 'ChargingStations':
          oDataChargingStations.getChargingStations(centralServiceApi, query, req, cb);
          break;
        case 'StatusNotifications':
          oDataStatusNotifications.getStatusNotifications(centralServiceApi, query, req, cb);
          break;
        case 'BootNotifications':
          oDataBootNotifications.getBootNotifications(centralServiceApi, query, req, cb);
          break;
        case 'Users':
          oDataUsers.getUsers(centralServiceApi, query, req, cb);
          break;
        default:
          cb('Invalid Entity');
      }
    } catch (error) {
      // add logging
      Logging.logError({
        tenantID: req.tenantID,
        module: MODULE_NAME,
        source: MODULE_NAME,
        method: "query",
        action: "query",
        message: error.message,
        detailedMessages: error.stack
      });
      cb(error);
    }
  }

  // register adapter on ODataServer
  static registerAdapter(oDataServer) {
    if (!oDataServer) { return; }
    oDataServer.model(oDataModel).query(ODataRestAdapter.query);
  }
}


