const AuthenticatedApi = require('./AuthenticatedApi');

class CentralServiceApi extends AuthenticatedApi {
  constructor(baseURL, user, password, tenant) {
    super(baseURL,user,password,tenant);
  }

  async getCompanies(params) {
    return await this.send({
      method: 'GET',
      url: '/client/api/Companies',
      params: params
    });
  }

  async getSites(params) {
    return await this.send({
      method: 'GET',
      url: '/client/api/Sites',
      params: params
    });
  }

  async getSiteAreas(params) {
    return await this.send({
      method: 'GET',
      url: '/client/api/SiteAreas',
      params: params
    });
  }

  async getChargingStations(params) {
    return await this.send({
      method: 'GET',
      url: '/client/api/ChargingStations',
      params: params
    });
  }

  async getTransactionsCompleted(params) {
    return await this.send({  
      method: 'GET',
      url: '/client/api/TransactionsCompleted',
      params: params
    });
  }

  async getUsers(params) {
    return await this.send({  
      method: 'GET',
      url: '/client/api/Users',
      params: params
    });
  }

}

module.exports = CentralServiceApi