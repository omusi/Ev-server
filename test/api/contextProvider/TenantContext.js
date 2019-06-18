const faker = require('faker');
const Factory = require('../../factories/Factory');
const config = require('../../config');
const OCPPJsonService16 = require('../ocpp/json/OCPPJsonService16');
const OCPPJsonService15 = require('../ocpp/soap/OCPPSoapService15');
const SiteContext = require('./SiteContext');
const SiteAreaContext = require('./SiteAreaContext');
const ChargingStationContext = require('./ChargingStationContext');
const CentralServerService = require('../client/CentralServerService');
const {
  TENANT_USER_LIST,
  SITE_AREA_CONTEXTS
} = require('./ContextConstants');

class TenantContext {

  constructor(tenantName, tenant, centralService, ocppRequestHandler) {
    this.tenantName = tenantName;
    this.tenant = tenant;
    this.centralAdminServerService = centralService;
    this.ocpp16 = new OCPPJsonService16(`${config.get('ocpp.json.scheme')}://${config.get('ocpp.json.host')}:${config.get('ocpp.json.port')}/OCPP16/${this.tenant.id}`, ocppRequestHandler);
    this.ocpp15 = new OCPPJsonService15(`${config.get('ocpp.json.scheme')}://${config.get('ocpp.json.host')}:${config.get('ocpp.json.port')}/OCPP15/${this.tenant.id}`);
    this.context = {
      companies: [],
      users: [],
      siteContexts: [],
      createdUsers: [],
      createdCompanies: [],
      createdSites: [],
      createdSiteAreas: [],
      createdChargingStations: []
    };
  }

  getTenant() {
    return this.tenant;
  }

  getAdminCentralServerService() {
    return this.centralAdminServerService;
  }

  getUserCentralServerService(params) {
    const user = this.getContextUser(params);
    return user.centralServerService;
  }

  getOCPPService(ocppVersion) {
    if (ocppVersion === '1.6') {
      return this.ocpp16;
    } else if (ocppVersion === '1.5') {
      return this.ocpp15;
    } else {
      throw new Error('unkown ocpp version');
    }
  }

  getContext() {
    return this.context;
  }

  getSiteContexts() {
    return this.context.siteContexts;
  }

  getSiteContext(siteName = null) {
    if (siteName) {
      return this.context.siteContexts.concat(this.context.createdSites).find((siteContext) => {
        return siteContext.getSiteName() === siteName;
      });
    } else {
      return this.context.siteContexts[0]; // by default return the first context
    }
  }

  addSiteContext(siteContext) {
    this.context.siteContexts.push(siteContext);
  }

  async cleanUpCreatedData() {
    // clean up charging stations
    for (const chargingStation of this.context.createdChargingStations) {
      // Delegate
      await chargingStation.cleanUpCreatedData();
      // Delete CS
      await this.centralAdminServerService.deleteEntity(this.centralAdminServerService.chargingStationApi, chargingStation, false);
    }
    // clean up site areas
    for (const siteArea of this.context.createdSiteAreas) {
      // delegate
      await siteArea.cleanUpCreatedData();
      // Delete
      await this.getAdminCentralServerService().deleteEntity(this.getAdminCentralServerService().siteAreaApi, siteArea.getSiteArea(), false);
    }
    for (const site of this.context.siteContexts) {
      await site.cleanUpCreatedData();
    }
    for (const company of this.context.createdCompanies) {
      await this.centralAdminServerService.deleteEntity(this.centralAdminServerService.companyApi, company);
    }
    for (const user of this.context.createdUsers) {
      await this.centralAdminServerService.deleteEntity(this.centralAdminServerService.userApi, user);
    }
    for (const site of this.context.createdSites) {
      // Delegate
      await site.cleanUpCreatedData();
      // Delete
      await this.centralAdminServerService.deleteEntity(this.centralAdminServerService.siteApi, site.getSite());
    }
  }

  getContextUser(params) { // Structure { id = user ID, email = user mail, role = user role, status = user status, assignedToSite = boolean) {
    if (params.id || params.email) {
      return this.context.users.find((user) => user.id === params.id || user.email === params.email);
    } else {
      return this.context.users.find((user) => {
        let conditionMet = null;
        for (const key in params) {
          const userContextDef = TENANT_USER_LIST.find((userList) => userList.id === user.id);
          if (user.hasOwnProperty(key)) {
            if (conditionMet !== null) {
              conditionMet = conditionMet && user[key] === params[key];
            } else {
              conditionMet = user[key] === params[key];
            }
          } else if (key === 'assignedToSite') {
            if (conditionMet !== null) {
              conditionMet = conditionMet && (userContextDef ? params[key] === userContextDef.assignedToSite : false);
            } else {
              conditionMet = (userContextDef ? params[key] === userContextDef.assignedToSite : false);
            }
          } else if (key === 'withTagIDs') {
            if (conditionMet !== null) {
              conditionMet = conditionMet && (params[key] ?  user.hasOwnProperty('tagIDs') && Array.isArray(user.tagIDs) && user.tagIDs.length > 0 : 
                (user.hasOwnProperty('tagIDs') ? user.tagIDs.length === 0 : true));
            } else {
              conditionMet = (params[key] ?  user.hasOwnProperty('tagIDs') && Array.isArray(user.tagIDs) && user.tagIDs.length > 0 : 
                (user.hasOwnProperty('tagIDs') ? user.tagIDs.length === 0 : true));
            }
          } 
        }
        return conditionMet;
      });
    }
  }

  /**
   * Add default context user
   * Do not user for newly created users
   * @param {*} users
   * @memberof TenantContext
   */
  addUsers(users) {
    for (const user of users) {
      if (!user.hasOwnProperty('password')) {
        user.password = config.get('admin.password');
      }
      if (!user.hasOwnProperty('centralServerService')) {
        user.centralServerService = new CentralServerService(this.tenant.subdomain, user);
      }
      this.context.users.push(user);
    }
  }

  async createUser(user = Factory.user.build(), loggedUser = null) {
    const createdUser = await this.centralAdminServerService.createEntity(this.centralAdminServerService.userApi, user);
    if (!createdUser.hasOwnProperty('password')) {
      createdUser.password = config.get('admin.password');
    }
    if (!createdUser.hasOwnProperty('centralServerService')) {
      createdUser.centralServerService = new CentralServerService(this.tenant.subdomain, createdUser);
    }
    this.context.createdUsers.push(createdUser);
    return createdUser;
  }

  async createCompany(company = Factory.company.build(), loggedUser = null) {
    const createdCompany = await this.centralAdminServerService.createEntity(this.centralAdminServerService.companyApi, company);
    this.context.createdCompanies.push(createdCompany);
    return createdCompany;
  }

  async createSite(company, users, site = Factory.site.build({
    companyID: company.id,
    userIDs: users.map(user => user.id)
  }), loggedUser = null) {
    const siteContext = new SiteContext(site.name, this);
    const createdSite = await this.centralAdminServerService.createEntity(this.centralAdminServerService.companySite, site);
    siteContext.setSite(createdSite);
    this.context.siteContexts.push(siteContext);
    return siteContext;
  }

  async createSiteArea(site, chargingStations, siteArea) {
    siteArea.siteID = (site && site.id ? (!siteArea.siteID || siteArea.siteID !== site.id ? site.id : siteArea.siteID) : null);
    siteArea.chargeBoxIDs = (Array.isArray(chargingStations) && (!siteArea.chargeBoxIDs || siteArea.chargeBoxIDs.length === 0)  ? chargingStations.map(chargingStation => chargingStation.id) : []);
    const createdSiteArea = await this.centralAdminServerService.createEntity(this.centralAdminServerService.siteAreaApi, siteArea);
    this.context.createdSiteAreas.push(new SiteAreaContext(createdSiteArea, this));
    return createdSiteArea;
  }

  async createChargingStation(ocppVersion, chargingStation = Factory.chargingStation.build({
    id: faker.random.alphaNumeric(12)
  }), connectorsDef = null) {
    const response = await this.getOCPPService(ocppVersion).executeBootNotification(
      chargingStation.id, chargingStation);
    const createdChargingStation = await this.getAdminCentralServerService().getEntityById(
      this.getAdminCentralServerService().chargingStationApi, chargingStation);
    chargingStation.connectors = [];
    for (let i = 0; i < (connectorsDef ? connectorsDef.length : 2); i++) {
      createdChargingStation.connectors[i] = {
        connectorId: i + 1,
        status: (connectorsDef && connectorsDef.status ? connectorsDef.status : 'Available'),
        errorCode: (connectorsDef && connectorsDef.errorCode ? connectorsDef.errorCode : 'NoError'),
        timestamp: (connectorsDef && connectorsDef.timestamp ? connectorsDef.timestamp : new Date().toISOString()),
        type: (connectorsDef && connectorsDef.type ? connectorsDef.type : 'U'),
        power: (connectorsDef && connectorsDef.power ? connectorsDef.power : 22170)
      };
    }
    for (const connector of createdChargingStation.connectors) {
      const responseNotif = await this.getOCPPService(ocppVersion).executeStatusNotification(createdChargingStation.id, connector);
    }
    if (this.siteArea) {
      //assign to Site Area
      createdChargingStation.siteArea = this.siteArea;
      await this.getAdminCentralServerService().updateEntity(
        this.getAdminCentralServerService().chargingStationApi, createdChargingStation);
    }
    const createdCS = new ChargingStationContext(createdChargingStation, this);
    this.context.createdChargingStations.push(createdCS);
    return createdCS;
  }

  findSiteContextFromSiteArea(siteArea) {
    return this.getSiteContexts().find((context) => context.siteAreas.find((tmpSiteArea) => siteArea.id === tmpSiteArea.id));
  }

  findSiteContextFromChargingStation(chargingStation) {
    return this.getSiteContexts().find((context) => context.chargingStations.find((tmpChargingStation) => 
      tmpChargingStation.id === chargingStation.id));
  }

  async close() {
    if (this.ocpp16) {
      this.ocpp16.closeConnection();
    }
  }

}

module.exports = TenantContext;