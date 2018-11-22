const AbstractEndpoint = require('../AbstractEndpoint');
const Site = require('../../../../entity/Site');
const OCPIMapping = require('./OCPIMapping');
const OCPIUtils = require('../../OCPIUtils');

require('source-map-support').install();

const EP_IDENTIFIER = "locations";

/**
 * Locations Endpoint
 */
class LocationsEndpoint extends AbstractEndpoint {
  // Create OCPI Service
  constructor() {
    super(EP_IDENTIFIER);
  }

  /**
   * Main Process Method for the endpoint
   */
  process(req, res, next, tenant) { // eslint-disable-line
    switch (req.method) {
      case "GET":
        // call method
        this.getLocationRequest(req, res, next, tenant);
        break;
      default:
        res.sendStatus(501);
        break;
    }
  }

  /**
   * Get Locations according to the requested url Segement
   */
  async getLocationRequest(req, res, next, tenant) { // eslint-disable-line
    // Split URL Segments
    //    /ocpi/cpo/2.0/locations/{location_id}
    //    /ocpi/cpo/2.0/locations/{location_id}/{evse_uid}
    //    /ocpi/cpo/2.0/locations/{location_id}/{evse_uid}/{connector_id}
    const urlSegment = req.path.substring(1).split('/');
    // remove action
    urlSegment.shift();
    // get filters
    const location_id = urlSegment.shift();
    const evse_id = urlSegment.shift();
    const connector_id = urlSegment.shift();

    // Get all sites
    const sites = await Site.getSites(
      tenant.getID(),
      {
        'withChargeBoxes': true,
        "withSiteAreas": true
      },
      100, 0, null);

    // convert Sites to Locations
    const locations = await Promise.all(sites.result.map(async site => { // eslint-disable-line
      // convert Site to Location
      return await OCPIMapping.convertSite2Location(tenant, site);
    }));

    // return Payload
    res.json(OCPIUtils.success(locations));
  }

  async getAllLocations(tenant) {
    // locations
    const locations = [];
    
    // Get all sites
    const sites = await Site.getSites(
      tenant.getID(),
      {
        'withChargeBoxes': true,
        "withSiteAreas": true
      },
      100, 0, null);

    // convert Sites to Locations
    for (const site of sites) {
      locations.push(await OCPIMapping.convertSite2Location(tenant, site));
    }
  }

  async getLocation(tenant, locationId) {
    // get site
    const site = await Site.getSite(tenant.getID(), locationId);

    // convert
    return await OCPIMapping.convertSite2Location(tenant, site);
  }

}

module.exports = LocationsEndpoint;