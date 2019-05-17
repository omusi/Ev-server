const sanitize = require('mongo-sanitize');
const Authorizations = require('../../../../authorization/Authorizations');
const UtilsSecurity = require('./UtilsSecurity');

class TenantSecurity {
  // eslint-disable-next-line no-unused-vars
  static filterTenantDeleteRequest(request, loggedUser) {
    const filteredRequest = {};
    // Set
    filteredRequest.ID = sanitize(request.ID);
    filteredRequest.forced = sanitize(request.forced);
    return filteredRequest;
  }

  // eslint-disable-next-line no-unused-vars
  static filterTenantRequest(request, loggedUser) {
    const filteredRequest = {};
    filteredRequest.ID = sanitize(request.ID);
    return filteredRequest;
  }

  static filterVerifyTenantRequest(request) {
    const filteredRequest = {};
    filteredRequest.tenant = sanitize(request.tenant);
    return filteredRequest;
  }

  // eslint-disable-next-line no-unused-vars
  static filterTenantsRequest(request, loggedUser) {
    const filteredRequest = {};
    filteredRequest.Search = sanitize(request.Search);
    UtilsSecurity.filterSkipAndLimit(request, filteredRequest);
    UtilsSecurity.filterSort(request, filteredRequest);
    return filteredRequest;
  }

  static filterTenantUpdateRequest(request, loggedUser) {
    const filteredRequest = TenantSecurity._filterTenantRequest(request, loggedUser);
    filteredRequest.id = sanitize(request.id);
    return filteredRequest;
  }

  static filterTenantCreateRequest(request, loggedUser) {
    return TenantSecurity._filterTenantRequest(request, loggedUser);
  }

  // eslint-disable-next-line no-unused-vars
  static _filterTenantRequest(request, loggedUser) {
    const filteredRequest = {};
    filteredRequest.name = sanitize(request.name);
    filteredRequest.subdomain = sanitize(request.subdomain);
    filteredRequest.email = sanitize(request.email);
    filteredRequest.components = sanitize(request.components);
    return filteredRequest;
  }

  static filterTenantResponse(tenant, loggedUser) {
    let filteredTenant;

    if (!tenant) {
      return null;
    }
    // Check auth
    if (Authorizations.canReadTenant(loggedUser, tenant)) {
      // Set only necessary info
      filteredTenant = {};
      filteredTenant.id = tenant.id;
      filteredTenant.name = tenant.name;
      filteredTenant.email = tenant.email;
      filteredTenant.subdomain = tenant.subdomain;
      filteredTenant.components = tenant.components;

      // Created By / Last Changed By
      UtilsSecurity.filterCreatedAndLastChanged(
        filteredTenant, tenant, loggedUser);
    }
    return filteredTenant;
  }

  static filterTenantsResponse(tenants, loggedUser) {
    const filteredTenants = [];

    if (!tenants.result) {
      return null;
    }
    if (!Authorizations.canListTenants(loggedUser)) {
      return null;
    }
    for (const tenant of tenants.result) {
      // Filter
      const filteredTenant = TenantSecurity.filterTenantResponse(tenant, loggedUser);
      // Ok?
      if (filteredTenant) {
        // Add
        filteredTenants.push(filteredTenant);
      }
    }
    tenants.result = filteredTenants;
  }
}

module.exports = TenantSecurity;