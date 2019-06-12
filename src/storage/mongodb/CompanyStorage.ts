import Site from '../../entity/Site';  
import Company from '../../types/Company';
import { ObjectID } from 'mongodb';
import Constants from '../../utils/Constants';
import Database from '../../utils/Database';
import Utils from '../../utils/Utils';
import SiteStorage from './SiteStorage';
import BackendError from '../../exception/BackendError';
import DatabaseUtils from './DatabaseUtils';
import Logging from '../../utils/Logging';
import TSGlobal from '../../types/GlobalType';
import TenantStorage from './TenantStorage';
import TenantHolder from '../../types/TenantHolder';
import Editeable from '../../types/Editeable';
import fs from 'fs';

declare const global: TSGlobal;

export default class CompanyStorage {

  public static async getCompany(tenantID: string, id: string): Promise<Company> {
    // Debug
    const uniqueTimerID = Logging.traceStart('CompanyStorage', 'getCompany');
    
    /*
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Create Aggregation
    const aggregation = [];

    // Filters
    aggregation.push({
      $match: { _id: Utils.convertToObjectID(id) },
    });
    // Add Created By / Last Changed By
    DatabaseUtils.pushCreatedLastChangedInAggregation(tenantID, aggregation);

    //Add company logo
    aggregation.push({$lookup: {
        from: tenantID + '.companylogos',
        localField: '_id',
        foreignField: '_id',
        as: 'logo'}
      },
      {$unwind: {
        'path': '$logo'
        }
      },
      {$project: {
        'logo': '$logo.logo', 
        'id':{$toString: '$_id'}, 
        _id: 0, 
        createdBy: 1, 
        createdOn: 1, 
        lastChangedBy: 1, 
        lastChangedOn: 1, 
        name: 1, 
        address: 1}
      }
    );

    // Read DB
    const companiesMDB = await global.database.getCollection<Company>(tenantID, 'companies')
      .aggregate(aggregation)
      .limit(1)
      .toArray();

    */
    let companiesMDB = await CompanyStorage.getCompanies(tenantID, {search: id, withSites: false}, 1);

    fs.writeFileSync('./MYFILE.txt', '##T3: ' + JSON.stringify(companiesMDB), {flag: 'a'});

    let company: Company = null;
    // Check
    if (companiesMDB && companiesMDB.count > 0) {
      // Create
      company = companiesMDB.result[0];
    }
    // Debug
    Logging.traceEnd('CompanyStorage', 'getCompany', uniqueTimerID, { id });
    return company;
  }

  public static async saveCompany(tenantID: string, companyToSave: Company, saveLogo: boolean = true): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart('CompanyStorage', 'saveCompany');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    
    const set: any = {};
    set._id = new ObjectID(companyToSave.id);
    set.createdBy = new ObjectID(companyToSave.createdBy.id);
    set.createdOn = companyToSave.createdOn;
    if(companyToSave.lastChangedBy) {
      set.lastChangedBy = new ObjectID(companyToSave.lastChangedBy.id);
    }
    if(companyToSave.lastChangedOn) {
      set.lastChangedOn = companyToSave.lastChangedOn;
    }
    set.address = companyToSave.address;
    set.name = companyToSave.name;

    // Modify
    const result = await global.database.getCollection<Company>(tenantID, 'companies').findOneAndUpdate(
      { _id: new ObjectID(companyToSave.id) },
      { $set: set},
      { upsert: true });

    fs.writeFileSync('./MYFILE.txt', '##T: ' + JSON.stringify(result), {flag: 'a'});

    if(! result.ok) {
      throw new BackendError('CompanyStorage#saveCompany', 'Couldn\'t update company');
    }

    //Save Logo
    if(saveLogo) {
      CompanyStorage._saveCompanyLogo(tenantID, companyToSave.id, companyToSave.logo);
    }

    // Debug
    Logging.traceEnd('CompanyStorage', 'saveCompany', uniqueTimerID, { companyToSave });
  }

  //TODO: Every save method ever always uses checkTenant, which is yet another call to the DB. Seems cumbersome?

  private static async _saveCompanyLogo(tenantID: string, companyId: string, companyLogoToSave: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart('CompanyStorage', 'saveCompanyLogo');

    // Check Tenant
    await Utils.checkTenant(tenantID);

    // Modify
    await global.database.getCollection<any>(tenantID, 'companylogos').findOneAndUpdate(
      { '_id': new ObjectID(companyId) },
      { $set: { logo: companyLogoToSave } },
      { upsert: true });

    // Debug
    Logging.traceEnd('CompanyStorage', 'saveCompanyLogo', uniqueTimerID, {});
  }

  // Delegate
  public static async getCompanies(tenantID: string, params: {search?: string, companyIDs?: string[], onlyRecordCount?: boolean, withSites?:boolean}={}, limit?: number, skip?: number, sort?: boolean): Promise<{count: number, result: Company[]}> {
    // Debug
    const uniqueTimerID = Logging.traceStart('CompanyStorage', 'getCompanies');
    // Check Tenant
    await Utils.checkTenant(tenantID);
    // Check Limit
    limit = Utils.checkRecordLimit(limit);
    // Check Skip
    skip = Utils.checkRecordSkip(skip);
    // Set the filters
    const filters: {_id?:string, $or?:any[]} = {};
    // Build filter
    if (params.search) {
      // Valid ID?
      if (ObjectID.isValid(params.search)) {
        filters._id = Utils.convertToObjectID(params.search);
      } else {
        filters.$or = [
          { "name": { $regex: params.search, $options: 'i' } },
          { "address.city": { $regex: params.search, $options: 'i' } },
          { "address.country": { $regex: params.search, $options: 'i' } }
        ];
      }
    }
    // Create Aggregation
    const aggregation = [];

    // Limit on Company for Basic Users
    if (params.companyIDs && params.companyIDs.length > 0) {
      // Build filter
      aggregation.push({
        $match: {
          _id: { $in: params.companyIDs.map((companyID) => Utils.convertToObjectID(companyID)) }
        }
      });
    }

    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }

    // Limit records?
    if (!params.onlyRecordCount) {
      // Always limit the nbr of record to avoid perfs issues
      aggregation.push({ $limit: Constants.MAX_DB_RECORD_COUNT });
    }
    // Count Records
    const companiesCountMDB = await global.database.getCollection<{count: number}>(tenantID, 'companies')
      .aggregate([...aggregation, { $count: "count" }], { allowDiskUse: true })
      .toArray();
    // Check if only the total count is requested
    if (params.onlyRecordCount) {
      // Return only the count
      return {
        count: (companiesCountMDB.length > 0 ? companiesCountMDB[0].count : 0),
        result: []
      };
    }
    // Remove the limit
    aggregation.pop();

    //Site lookup TODO: modify if sites get typed as well
    if (params.withSites) {
      // Add Sites
      aggregation.push({
        $lookup: {
          from: DatabaseUtils.getCollectionName(tenantID, "sites"),
          localField: "_id",
          foreignField: "companyID",
          as: "sites"
        }
      });
    }

    // Add Created By / Last Changed By
    DatabaseUtils.pushCreatedLastChangedInAggregation(tenantID, aggregation);

    //Add company logo
    aggregation.push({$lookup: {
        from: tenantID + '.companylogos',
        localField: '_id',
        foreignField: '_id',
        as: 'logo'}
      },
      {$unwind: {
        'path': '$logo'}
      },
      {$project: {
        logo: '$logo.logo', 
        id:{$toString: '$_id'}, 
        _id: 0, 
        createdBy: 1, 
        createdOn: 1, 
        lastChangedBy: 1, 
        lastChangedOn: 1, 
        name: 1, 
        address: 1}
      }
    );

    // Sort
    if (sort) {
      // Sort
      aggregation.push({
        $sort: sort
      });
    } else {
      // Default
      aggregation.push({
        $sort: { name: 1 }
      });
    }
    // Skip
    if(skip && skip > 0){
      aggregation.push( { $skip: skip } );
    }
    // Limit
    aggregation.push({
      $limit: limit&&limit>0&&limit<Constants.MAX_DB_RECORD_COUNT?limit:Constants.MAX_DB_RECORD_COUNT
    });

    // Read DB
    const companiesMDB = await global.database.getCollection<Company>(tenantID, 'companies')
      .aggregate(aggregation, { collation: { locale: Constants.DEFAULT_LOCALE, strength: 2 }, allowDiskUse: true })
      .toArray();

    // Debug
    Logging.traceEnd('CompanyStorage', 'getCompanies', uniqueTimerID, { params, limit, skip, sort });
    
    //fs.writeFileSync('./MYFILE.txt', JSON.stringify(companiesMDB), {flag: 'a'});

    // Ok
    return {
      count: (companiesCountMDB.length > 0 ?
        (companiesCountMDB[0].count === Constants.MAX_DB_RECORD_COUNT ? -1 : companiesCountMDB[0].count) : 0),
      result: companiesMDB
    };
  }

  public static async deleteCompany(tenantID: string, id: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart('CompanyStorage', 'deleteCompany');

    // Check Tenant
    await Utils.checkTenant(tenantID);

    //Get sites to fetch IDs in order to delete site areas
    const sites = (await global.database.getCollection<any>(tenantID, 'sites')
      .find({ companyID: new ObjectID(id) }).project({_id: 1}).toArray()).map(site => site._id);
    
    //Delete sites
    await global.database.getCollection<any>(tenantID, 'sites')
      .deleteMany({ companyID: new ObjectID(id) });

    //Delete site areas
    await global.database.getCollection<any>(tenantID, 'siteareas')
      .deleteMany({ siteID: { $in: sites } });

    // Delete the Company
    await global.database.getCollection<Company>(tenantID, 'companies')
      .findOneAndDelete({ '_id': Utils.convertToObjectID(id) });

    // Delete Logo
    await global.database.getCollection<any>(tenantID, 'companylogos') //TODO: Add generic typing
      .findOneAndDelete({ '_id': Utils.convertToObjectID(id) });

    // Debug
    Logging.traceEnd('CompanyStorage', 'deleteCompany', uniqueTimerID, { id });
  }
}
