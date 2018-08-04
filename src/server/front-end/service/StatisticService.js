const Authorizations = require('../../../authorization/Authorizations');
const Logging = require('../../../utils/Logging');
const Utils = require('../../../utils/Utils');
const moment = require('moment');
const Constants = require('../../../utils/Constants');
const StatisticSecurity = require('./security/StatisticSecurity');

class StatisticService {
	static handleUserUsageStatistics(action, req, res, next) {
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = StatisticSecurity.filterUserStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getTransactions(null, filter, filteredRequest.SiteID, false,
			Constants.NO_LIMIT).then((transactions) => {
			// filters
			transactions = transactions.filter((transaction) => {
				// Check user
				if (!Authorizations.canReadTransaction(req.user, transaction)) {
					return false;
				}
				return true;
			});
			// Group Them By Month
			let monthStats = [];
			let monthStat;
			// Browse in reverse order
			for (var i = transactions.length-1; i >= 0; i--) {
				// First Init
				if (!monthStat) {
					monthStat = {};
					monthStat.month = moment(transactions[i].timestamp).month();
				}
				// Month changed?
				if (monthStat.month != moment(transactions[i].timestamp).month()) {
					// Add
					monthStats.push(monthStat);
					// Reset
					monthStat = {};
					monthStat.month = moment(transactions[i].timestamp).month();
				}

				// Set Usage
				let userName = Utils.buildUserFullName(transactions[i].user, false);
				if (!monthStat[userName]) {
					// Add Usage in Hours
					monthStat[userName] =
						(new Date(transactions[i].stop.timestamp).getTime() - new Date(transactions[i].timestamp).getTime()) / (3600 * 1000);
				} else {
					// Add Usage in Hours
					monthStat[userName] +=
						(new Date(transactions[i].stop.timestamp).getTime() - new Date(transactions[i].timestamp).getTime()) / (3600 * 1000);
				}
			}
			// Add the last month statistics
			if (monthStat) {
				monthStats.push(monthStat);
			}
			// Return
			res.json(monthStats);
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetUserConsumptionStatistics(action, req, res, next) {
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = StatisticSecurity.filterUserStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getUserConsumptions(filter, filteredRequest.SiteID).then((transactions) => {
			res.json(transactions);
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetChargingStationUsageStatistics(action, req, res, next) {
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = StatisticSecurity.filterChargingStationStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getTransactions(null, filter, filteredRequest.SiteID,false,
				Constants.NO_LIMIT).then((transactions) => {
			// filters
			transactions = transactions.filter((transaction) => {
				// Check user
				if (!Authorizations.canReadTransaction(req.user, transaction)) {
					return false;
				}
				return true;
			});
			// Group Them By Month
			let monthStats = [];
			let monthStat;
			// Browse in reverse order
			for (var i = transactions.length-1; i >= 0; i--) {
				// First Init
				if (!monthStat) {
					monthStat = {};
					monthStat.month = moment(transactions[i].timestamp).month();
				}
				// Month changed?
				if (monthStat.month != moment(transactions[i].timestamp).month()) {
					// Add
					monthStats.push(monthStat);
					// Reset
					monthStat = {};
					monthStat.month = moment(transactions[i].timestamp).month();
				}
				// Set Usage
				if (!monthStat[transactions[i].chargeBoxID]) {
					// Add Usage in Hours
					monthStat[transactions[i].chargeBoxID] =
						(new Date(transactions[i].stop.timestamp).getTime() - new Date(transactions[i].timestamp).getTime()) / (3600 * 1000);
				} else {
					// Add Usage in Hours
					monthStat[transactions[i].chargeBoxID] +=
						(new Date(transactions[i].stop.timestamp).getTime() - new Date(transactions[i].timestamp).getTime()) / (3600 * 1000);
				}
			}
			// Add the last month statistics
			if (monthStat) {
				monthStats.push(monthStat);
			}
			// Return
			res.json(monthStats);
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetChargingStationConsumptionStatistics(action, req, res, next) {
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = StatisticSecurity.filterChargingStationStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getChargingStationConsumptions(filter, filteredRequest.SiteID).then((transactions) => {
			res.json(transactions);
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}
}

module.exports = StatisticService;
