import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import moment from 'moment';
import AppAuthError from '../../../exception/AppAuthError';
import Authorizations from '../../../authorization/Authorizations';
import Constants from '../../../utils/Constants';
import Logging from '../../../utils/Logging';
import StatisticsStorage from '../../../storage/mongodb/StatisticsStorage';
import StatisticSecurity from './security/StatisticSecurity';
import User from '../../../types/User';
import Utils from '../../../utils/Utils';
import UtilsService from './UtilsService';

export default class StatisticService {
  static async handleGetChargingStationConsumptionStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetChargingStationConsumptionStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetChargingStationConsumptionStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getChargingStationStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_CONSUMPTION);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'C');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetChargingStationUsageStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetChargingStationUsageStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetChargingStationUsageStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getChargingStationStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_USAGE);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'C');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetChargingStationInactivityStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetChargingStationInactivityStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetChargingStationInactivityStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getChargingStationStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_INACTIVITY);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'C');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetChargingStationTransactionsStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetChargingStationTransactionsStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetChargingStationTransactionsStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getChargingStationStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_TRANSACTIONS);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'C');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetUserConsumptionStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetUserConsumptionStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetUserConsumptionStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getUserStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_CONSUMPTION);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'U');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetUserUsageStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetUserUsageStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetUserUsageStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getUserStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_USAGE);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'U');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetUserInactivityStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetUserInactivityStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetUserInactivityStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getUserStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_INACTIVITY);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'U');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetUserTransactionsStatistics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetUserTransactionsStatistics');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetUserTransactionsStatistics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Get Stats
      const transactionStatsMDB = await StatisticsStorage.getUserStats(
        req.user.tenantID, filter, Constants.STATS_GROUP_BY_TRANSACTIONS);
      // Convert
      const transactions = StatisticService.convertToGraphData(transactionStatsMDB, 'U');
      // Return
      res.json(transactions);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetCurrentMetrics(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check auth
      if (!Authorizations.canListChargingStations(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_CHARGING_STATIONS,
          null, 560,
          'StatisticService', 'handleGetCurrentMetrics',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterMetricsStatisticsRequest(req.query, req.user);
      // Get Data
      const metrics = await StatisticsStorage.getCurrentMetrics(req.user.tenantID, filteredRequest);
      // Return
      res.json(metrics);
      next();
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static async handleGetStatisticsExport(action: string, req: Request, res: Response, next: NextFunction) {
    try {
      // Check if component is active
      UtilsService.assertComponentIsActiveFromToken(
        req.user, Constants.COMPONENTS.STATISTICS,
        Constants.ACTION_LIST, Constants.ENTITY_TRANSACTIONS, 'StatisticService', 'handleGetStatisticsExport');
      // Check auth
      if (!Authorizations.canListTransactions(req.user)) {
        // Not Authorized!
        throw new AppAuthError(
          Constants.ACTION_LIST,
          Constants.ENTITY_TRANSACTIONS,
          null, 560,
          'StatisticService', 'handleGetStatisticsExport',
          req.user);
      }
      // Filter
      const filteredRequest = StatisticSecurity.filterExportStatisticsRequest(req.query, req.user);
      // Build filter
      const filter = StatisticService.buildFilter(filteredRequest, req.user);
      // Decisions
      let groupBy: string;
      switch (filteredRequest.DataType) {
        case 'Consumption':
          groupBy = Constants.STATS_GROUP_BY_CONSUMPTION;
          break;
        case 'Usage':
          groupBy = Constants.STATS_GROUP_BY_USAGE;
          break;
        case 'Inactivity':
          groupBy = Constants.STATS_GROUP_BY_INACTIVITY;
          break;
        case 'Transactions':
          groupBy = Constants.STATS_GROUP_BY_TRANSACTIONS;
          break;
        default:
          groupBy = Constants.STATS_GROUP_BY_CONSUMPTION;
      }
      let method: string;
      if (filteredRequest.DataCategory === 'C') {
        method = 'getChargingStationStats';
      } else {
        method = 'getUserStats';
      }

      // Query data
      const transactionStatsMDB = await StatisticsStorage[method](req.user.tenantID, filter, groupBy);

      // Build the result
      const filename = 'export' + filteredRequest.DataType + 'Statistics.csv';
      fs.writeFile(filename, StatisticService.convertToCSV(transactionStatsMDB, filteredRequest.DataCategory,
        filteredRequest.DataType, filteredRequest.Year, filteredRequest.DataScope), (createError) => {
        if (createError) {
          throw createError;
        }
        res.download(filename, (downloadError) => {
          if (downloadError) {
            throw downloadError;
          }
          fs.unlink(filename, (unlinkError) => {
            if (unlinkError) {
              throw unlinkError;
            }
          });
        });
      });
    } catch (error) {
      // Log
      Logging.logActionExceptionMessageAndSendResponse(action, error, req, res, next);
    }
  }

  static buildFilter(filteredRequest, loggedUser) {
    // Only completed transactions
    const filter: any = { stop: { $exists: true } };
    // Date
    if ('Year' in filteredRequest) {
      if (filteredRequest.Year > 0) {
        filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
        filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
      }
    } else {
      // Current year
      filter.startDateTime = moment().startOf('year').toDate().toISOString();
      filter.endDateTime = moment().endOf('year').toDate().toISOString();
    }
    // Site
    if (filteredRequest.SiteID) {
      filter.siteID = filteredRequest.SiteID;
    }
    // Site Area
    if (filteredRequest.SiteAreaID) {
      filter.siteAreaID = filteredRequest.SiteAreaID;
    }
    // Charge Box
    if (filteredRequest.ChargeBoxID) {
      filter.chargeBoxID = filteredRequest.ChargeBoxID;
    }
    // User
    if (Authorizations.isBasic(loggedUser.role)) {
      // Only for current user
      filter.userID = loggedUser.id;
    } else if (!Authorizations.isBasic(loggedUser.role) && filteredRequest.UserID) {
      filter.userID = filteredRequest.UserID;
    }
    return filter;
  }

  static convertToGraphData(transactionStatsMDB: any[], dataCategory: string) {
    const transactions = [];
    // Create
    if (transactionStatsMDB && transactionStatsMDB.length > 0) {
      // Create
      let month = -1;
      let transaction;
      let userName: string;
      for (const transactionStatMDB of transactionStatsMDB) {
        // Init
        if (month !== transactionStatMDB._id.month) {
          // Set
          month = transactionStatMDB._id.month;
          // Create new
          transaction = {};
          transaction.month = transactionStatMDB._id.month - 1;
          // Add
          if (transaction) {
            transactions.push(transaction);
          }
        }
        // Set key figure (total)
        if (dataCategory === 'C') {
          transaction[transactionStatMDB._id.chargeBox] = transactionStatMDB.total;
        } else {
          // We can have duplicate user names, like 'Unknown'
          userName = Utils.buildUserFullName(transactionStatMDB.user, false, false, true);
          if (userName in transaction) {
            transaction[userName] += transactionStatMDB.total;
          } else {
            transaction[userName] = transactionStatMDB.total;
          }
        }
      }
    }
    return transactions;
  }

  static convertToCSV(transactionStatsMDB: any[], dataCategory: string, dataType: string, year: number | string, dataScope?: string) {
    let user: User;
    let unknownUser = Utils.buildUserFullName(user, false, false, true);
    if (!unknownUser) {
      unknownUser = 'Unknown';
    }
    let csv: string;
    if (dataCategory === 'C') {
      csv = 'chargeBoxId,';
    } else {
      csv = 'userName,firstName,';
    }
    if (year && year !== '0') {
      csv += 'year,';
      if (dataScope && dataScope === 'month') {
        csv += 'month,';
      }
    }
    switch (dataType) {
      case 'Consumption':
        csv += 'consumptionKwH\r\n';
        break;
      case 'Usage':
        csv += 'usageHours\r\n';
        break;
      case 'Inactivity':
        csv += 'inactivityHours\r\n';
        break;
      case 'Transactions':
        csv += 'numberOfSessions\r\n';
        break;
      default:
        return csv;
    }
    let index: number;
    let transaction: any;
    const transactions = [];
    if (transactionStatsMDB && transactionStatsMDB.length > 0) {
      for (const transactionStatMDB of transactionStatsMDB) {
        transaction = transactionStatMDB;
        if (dataCategory !== 'C') {
          if (!transaction.user) {
            transaction.user = { 'name': unknownUser, 'firstName': ' ' };
          }
          if (!transaction.user.name) {
            transaction.user.name = unknownUser;
          }
          if (!transaction.user.firstName) {
            transaction.user.firstName = ' ';
          }
        }
        if (!year || year == '0' || !dataScope || (dataScope && dataScope !== 'month')) {
          transaction._id.month = 0;
          index = -1;
          if (transactions && transactions.length > 0) {
            if (dataCategory === 'C') {
              index = transactions.findIndex((record) => (record._id.chargeBox === transaction._id.chargeBox));
            } else {
              index = transactions.findIndex((record) => ((record.user.name === transaction.user.name)
                  && (record.user.firstName === transaction.user.firstName)));
            }
          }
          if (index < 0) {
            transactions.push(transaction);
          } else {
            transactions[index].total += transaction.total;
          }
        } else if (dataCategory === 'C') {
          transactions.push(transaction);
        } else {
          // Duplicate names are possible, like 'Unknown'
          index = transactions.findIndex((record) => ((record._id.month === transaction._id.month) &&
              (record.user.name === transaction.user.name) &&
              (record.user.firstName === transaction.user.firstName)));
          if (index < 0) {
            transactions.push(transaction);
          } else {
            transactions[index].total += transaction.total;
          }
        }
      }
      if (dataCategory === 'U') {
        // Sort by user name
        transactions.sort((rec1, rec2) => {
          if (rec1.user.name > rec2.user.name) {
            return 1;
          }
          if (rec1.user.name < rec2.user.name) {
            return -1;
          }
          // Names are identical, now compare first name
          if (rec1.user.firstName > rec2.user.firstName) {
            return 1;
          }
          if (rec1.user.firstName < rec2.user.firstName) {
            return -1;
          }
          return 0;
        });
      }
      let number: number;
      for (transaction of transactions) {
        csv += (dataCategory === 'C') ? `${transaction._id.chargeBox},` :
          `${transaction.user.name},${transaction.user.firstName},`;
        csv += (year && year !== '0') ? `${year},` : '';
        csv += (transaction._id.month > 0) ? `${transaction._id.month},` : '';
        number = Math.round(transaction.total * 100) / 100;
        // Use raw numbers - it makes no sense to format numbers here,
        // anyway only locale 'en-US' is supported here as could be seen by:
        // const supportedLocales = Intl.NumberFormat.supportedLocalesOf(['fr-FR', 'en-US', 'de-DE']);
        csv += number + '\r\n';
      }
    }
    return csv;
  }
}
