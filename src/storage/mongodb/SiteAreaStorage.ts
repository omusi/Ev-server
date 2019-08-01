import { ObjectID } from 'mongodb';
import BackendError from '../../exception/BackendError';
import Constants from '../../utils/Constants';
import DatabaseUtils from './DatabaseUtils';
import DbParams from '../../types/database/DbParams';
import global from '../../types/GlobalType';
import Logging from '../../utils/Logging';
import SiteArea from '../../types/SiteArea';
import Utils from '../../utils/Utils';

export default class SiteAreaStorage {
  public static async getSiteAreaImage(tenantID: string, id: string): Promise<{id: string; image: string}> {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'getSiteAreaImage');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Read DB
    const siteAreaImagesMDB = await global.database.getCollection<{_id: string; image: string}>(tenantID, 'siteareaimages')
      .find({ _id: Utils.convertToObjectID(id) })
      .limit(1)
      .toArray();
    let siteAreaImage: {id: string; image: string} = null;
    // Set
    if (siteAreaImagesMDB && siteAreaImagesMDB.length > 0) {
      siteAreaImage = {
        id: siteAreaImagesMDB[0]._id,
        image: siteAreaImagesMDB[0].image
      };
    }
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'getSiteAreaImage', uniqueTimerID, { id });
    return siteAreaImage;
  }

  public static async getSiteArea(tenantID: string, id: string,
    params: { withSite?: boolean; withChargeBoxes?: boolean } = {}): Promise<SiteArea> {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'getSiteArea');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Exec
    const siteAreaResult = await SiteAreaStorage.getSiteAreas(
      tenantID,
      { siteAreaID: id, withSite: params.withSite, withChargeBoxes: params.withChargeBoxes, withAvailableChargers: true },
      { limit: 1, skip: 0, onlyRecordCount: false }
    );
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'getSiteArea', uniqueTimerID, { id, withChargeBoxes: params.withChargeBoxes, withSite: params.withSite });
    return siteAreaResult.result[0];
  }

  public static async saveSiteArea(tenantID: string, siteAreaToSave: SiteArea, saveImage = false): Promise<string> {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'saveSiteArea');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Set
    const siteAreaMDB: any = {
      _id: !siteAreaToSave.id ? new ObjectID() : Utils.convertToObjectID(siteAreaToSave.id),
      name: siteAreaToSave.name,
      accessControl: siteAreaToSave.accessControl,
      siteID: Utils.convertToObjectID(siteAreaToSave.siteID)
    };
    if (siteAreaToSave.address) {
      siteAreaMDB.address = siteAreaToSave.address;
    }
    if (siteAreaToSave.maximumPower) {
      siteAreaMDB.maximumPower = siteAreaToSave.maximumPower;
    }
    // Add Last Changed/Created props
    DatabaseUtils.addLastChangedCreatedProps(siteAreaMDB, siteAreaToSave);
    // Modify
    const result = await global.database.getCollection<SiteArea>(tenantID, 'siteareas').findOneAndUpdate(
      { _id: siteAreaMDB._id },
      { $set: siteAreaMDB },
      { upsert: true, returnOriginal: false }
    );
    if (!result.ok) {
      throw new BackendError(
        Constants.CENTRAL_SERVER,
        'Couldn\'t update SiteArea',
        'SiteAreaStorage', 'saveSiteArea');
    }
    if (saveImage) {
      await SiteAreaStorage._saveSiteAreaImage(tenantID, siteAreaMDB._id.toHexString(), siteAreaToSave.image);
    }
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'saveSiteArea', uniqueTimerID, { siteAreaToSave });
    return siteAreaMDB._id.toHexString();
  }

  public static async getSiteAreas(tenantID: string,
    params: {siteAreaID?: string; search?: string; siteIDs?: string[]; withSite?: boolean;
      withChargeBoxes?: boolean; withAvailableChargers?: boolean; } = {},
    dbParams: DbParams, projectFields?: string[]): Promise<{count: number; result: SiteArea[]}> {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'getSiteAreas');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Check Limit
    const limit = Utils.checkRecordLimit(dbParams.limit);
    // Check Skip
    const skip = Utils.checkRecordSkip(dbParams.skip);
    // Set the filters
    const filters: any = {};
    // Query by Site Area ID if available
    if (params.siteAreaID) {
      filters._id = Utils.convertToObjectID(params.siteAreaID);
    // Otherwise check if search is present
    } else if (params.search) {
      if (ObjectID.isValid(params.search)) {
        filters._id = Utils.convertToObjectID(params.search);
      } else {
        filters.$or = [
          { 'name': { $regex: params.search, $options: 'i' } }
        ];
      }
    }
    // Set Site thru a filter in the dashboard
    if (params.siteIDs && Array.isArray(params.siteIDs) && params.siteIDs.length > 0) {
      filters.siteID = {
        $in: params.siteIDs.map((site) => {
          return Utils.convertToObjectID(site);
        })
      };
    }
    // Create Aggregation
    const aggregation = [];
    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }
    // Limit on Site Area for Basic Users
    if (params.siteIDs && params.siteIDs.length > 0) {
      aggregation.push({
        $match: {
          siteID: { $in: params.siteIDs.map((siteID) => {
            return Utils.convertToObjectID(siteID);
          }) }
        }
      });
    }
    // Sites
    if (params.withSite) {
      DatabaseUtils.pushSiteLookupInAggregation(
        { tenantID, aggregation, localField: 'siteID', foreignField: '_id',
          asField: 'site', oneToOneCardinality: true });
    }
    // Limit records?
    if (!dbParams.onlyRecordCount) {
      // Always limit the nbr of record to avoid perfs issues
      aggregation.push({ $limit: Constants.DB_RECORD_COUNT_CEIL });
    }
    // Count Records
    const siteAreasCountMDB = await global.database.getCollection<{count: number}>(tenantID, 'siteareas')
      .aggregate([...aggregation, { $count: 'count' }], { allowDiskUse: true })
      .toArray();
    // Check if only the total count is requested
    if (dbParams.onlyRecordCount) {
      // Return only the count
      return {
        count: (siteAreasCountMDB.length > 0 ? siteAreasCountMDB[0].count : 0),
        result: []
      };
    }
    // Remove the limit
    aggregation.pop();
    // Charging Stations
    if (params.withChargeBoxes || params.withAvailableChargers) {
      DatabaseUtils.pushChargingStationLookupInAggregation(
        { tenantID, aggregation, localField: '_id', foreignField: 'siteAreaID',
          asField: 'chargingStations' });
    }
    // Convert Object ID to string
    DatabaseUtils.convertObjectIDToString(aggregation, 'siteID');
    // Add Last Changed / Created
    DatabaseUtils.pushCreatedLastChangedInAggregation(tenantID, aggregation);
    // Handle the ID
    DatabaseUtils.renameDatabaseID(aggregation);
    // Sort
    if (dbParams.sort) {
      // Sort
      aggregation.push({
        $sort: dbParams.sort
      });
    } else {
      // Default
      aggregation.push({
        $sort: { name: 1 }
      });
    }
    // Skip
    aggregation.push({
      $skip: skip
    });
    // Limit
    aggregation.push({
      $limit: limit
    });
    // Project
    if (projectFields) {
      DatabaseUtils.projectFields(aggregation,
        [...projectFields, 'chargingStations.id', 'chargingStations.connectors', 'chargingStations.lastHeartBeat', 'chargingStations.deleted']);
    }
    // Read DB
    const siteAreasMDB = await global.database.getCollection<any>(tenantID, 'siteareas')
      .aggregate(aggregation, { collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 }, allowDiskUse: true })
      .toArray();
    const siteAreas: SiteArea[] = [];
    // Check
    if (siteAreasMDB && siteAreasMDB.length > 0) {
      // Create
      for (const siteAreaMDB of siteAreasMDB) {
        // pragma let chargingStations: ChargingStation[];
        let availableChargers = 0, totalChargers = 0, availableConnectors = 0, totalConnectors = 0;
        // Count Available/Occupied Chargers/Connectors
        if (params.withAvailableChargers) {
          // Chargers
          for (const chargeBox of siteAreaMDB.chargingStations) {
            // Check not deleted
            if (chargeBox.deleted) {
              continue;
            }
            // Set Inactive flag
            chargeBox.inactive = DatabaseUtils.chargingStationIsInactive(chargeBox);
            totalChargers++;
            // Handle Connectors
            if(!chargeBox.connectors) {
              chargeBox.connectors = [];
            }
            for (const connector of chargeBox.connectors) {
              if (!connector) {
                continue;
              }
              totalConnectors++;
              // Check if Available
              if (!chargeBox.inactive && connector.status === Constants.CONN_STATUS_AVAILABLE) {
                availableConnectors++;
              }
            }
            // Handle Chargers
            for (const connector of chargeBox.connectors) {
              if (!connector) {
                continue;
              }
              // Check if Available
              if (!chargeBox.inactive && connector.status === Constants.CONN_STATUS_AVAILABLE) {
                availableChargers++;
                break;
              }
            }
          }
          // Set
          siteAreaMDB.availableChargers = availableChargers;
          siteAreaMDB.totalChargers = totalChargers;
          siteAreaMDB.availableConnectors = availableConnectors;
          siteAreaMDB.totalConnectors = totalConnectors;
        }
        // Chargers
        if (!params.withChargeBoxes && siteAreaMDB.chargingStations) {
          delete siteAreaMDB.chargingStations;
        }
        // Add
        siteAreas.push(siteAreaMDB);
      }
    }
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'getSiteAreas', uniqueTimerID,
      { params, limit: dbParams.limit, skip: dbParams.skip, sort: dbParams.sort });
    // Ok
    return {
      count: (siteAreasCountMDB.length > 0 ?
        (siteAreasCountMDB[0].count === Constants.DB_RECORD_COUNT_CEIL ? -1 : siteAreasCountMDB[0].count) : 0),
      result: siteAreas
    };
  }

  public static async deleteSiteArea(tenantID: string, id: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'deleteSiteArea');
    // Delete singular site area
    await SiteAreaStorage.deleteSiteAreas(tenantID, [id]);
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'deleteSiteArea', uniqueTimerID, { id });
  }

  public static async deleteSiteAreas(tenantID: string, siteAreaIDs: string[]) {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'deleteSiteAreas');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Remove Charging Station's Site Area
    await global.database.getCollection<any>(tenantID, 'chargingstations').updateMany(
      { siteAreaID: { $in: siteAreaIDs.map((ID) => {
        return Utils.convertToObjectID(ID);
      }) } },
      { $set: { siteAreaID: null } },
      { upsert: false }
    );
    // Delete SiteArea
    await global.database.getCollection<any>(tenantID, 'siteareas').deleteMany(
      { '_id': { $in: siteAreaIDs.map((ID) => {
        return Utils.convertToObjectID(ID);
      }) } }
    );
    // Delete Image
    await global.database.getCollection<any>(tenantID, 'sitesareaimages').deleteMany(
      { '_id': { $in: siteAreaIDs.map((ID) => {
        return Utils.convertToObjectID(ID);
      }) } }
    );
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'deleteSiteAreas', uniqueTimerID, { siteAreaIDs });
  }

  public static async deleteSiteAreasFromSites(tenantID: string, siteIDs: string[]) {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'deleteSiteAreasFromSites');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Find site areas to delete
    const siteareas: string[] = (await global.database.getCollection<any>(tenantID, 'siteareas')
      .find({ siteID: { $in: siteIDs.map((id) => {
        return Utils.convertToObjectID(id);
      }) } })
      .project({ _id: 1 }).toArray()).map((idWrapper): string => {
      /* eslint-disable @typescript-eslint/indent */
        return idWrapper._id.toHexString();
      });
    /* eslint-enable @typescript-eslint/indent */
    // Delete site areas
    await SiteAreaStorage.deleteSiteAreas(tenantID, siteareas);
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'deleteSiteAreasFromSites', uniqueTimerID, { siteIDs });
  }

  private static async _saveSiteAreaImage(tenantID: string, siteAreaID: string, siteAreaImageToSave: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart('SiteAreaStorage', 'saveSiteAreaImage');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Modify
    await global.database.getCollection<any>(tenantID, 'siteareaimages').findOneAndUpdate(
      { '_id': Utils.convertToObjectID(siteAreaID) },
      { $set: { image: siteAreaImageToSave } },
      { upsert: true, returnOriginal: false }
    );
    // Debug
    Logging.traceEnd('SiteAreaStorage', 'saveSiteAreaImage', uniqueTimerID);
  }
}
