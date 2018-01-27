const SecurityRestObjectFiltering = require('../SecurityRestObjectFiltering');
const CentralRestServerAuthorization = require('../CentralRestServerAuthorization');
const Logging = require('../../../utils/Logging');
const AppError = require('../../../exception/AppError');
const AppAuthError = require('../../../exception/AppAuthError');
const Utils = require('../../../utils/Utils');
const moment = require('moment');
const Users = require('../../../utils/Users');

class StatisticService {
	static handleUserUsageStatistics(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "StatisticService",
			method: "handleUserUsageStatistics",
			message: `Read User Usage Statistics`
		});
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterUserStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getTransactions(null, filter, Users.WITH_NO_IMAGE, 0).then((transactions) => {
			// filters
			transactions = transactions.filter((transaction) => {
				return CentralRestServerAuthorization.canReadUser(req.user, transaction.userID) &&
					CentralRestServerAuthorization.canReadChargingStation(req.user, transaction.chargeBoxID);
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
				let userName = Utils.buildUserFullName(transactions[i].userID, false);
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
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "StatisticService",
			method: "handleGetUserConsumptionStatistics",
			message: `Read User Consumption Statistics`
		});
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterUserStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getTransactions(null, filter, Users.WITH_NO_IMAGE, 0).then((transactions) => {
			// filters
			transactions = transactions.filter((transaction) => {
				return CentralRestServerAuthorization.canReadUser(req.user, transaction.userID) &&
					CentralRestServerAuthorization.canReadChargingStation(req.user, transaction.chargeBoxID);
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
				// Set consumption
				let userName = Utils.buildUserFullName(transactions[i].userID, false);
				if (!monthStat[userName]) {
					// Add conso in kW.h
					monthStat[userName] = transactions[i].stop.totalConsumption / 1000;
				} else {
					// Add conso in kW.h
					monthStat[userName] += transactions[i].stop.totalConsumption / 1000;
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

	static handleGetChargingStationUsageStatistics(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "StatisticService",
			method: "handleGetChargingStationUsageStatistics",
			message: `Read Charging Station Usage Statistics`
		});
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterChargingStationStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getTransactions(null, filter, Users.WITH_NO_IMAGE, 0).then((transactions) => {
			// filters
			transactions = transactions.filter((transaction) => {
				return CentralRestServerAuthorization.canReadUser(req.user, transaction.userID) &&
					CentralRestServerAuthorization.canReadChargingStation(req.user, transaction.chargeBoxID);
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
				if (!monthStat[transactions[i].chargeBoxID.chargeBoxIdentity]) {
					// Add Usage in Hours
					monthStat[transactions[i].chargeBoxID.chargeBoxIdentity] =
						(new Date(transactions[i].stop.timestamp).getTime() - new Date(transactions[i].timestamp).getTime()) / (3600 * 1000);
				} else {
					// Add Usage in Hours
					monthStat[transactions[i].chargeBoxID.chargeBoxIdentity] +=
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
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "StatisticService",
			method: "handleGetChargingStationConsumptionStatistics",
			message: `Read Charging Station Consumption Statistics`
		});
		let filter = {stop: {$exists: true}};
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterChargingStationStatisticsRequest(req.query, req.user);
		// Date
		if (filteredRequest.Year) {
			filter.startDateTime = moment().year(filteredRequest.Year).startOf('year').toDate().toISOString();
			filter.endDateTime = moment().year(filteredRequest.Year).endOf('year').toDate().toISOString();
		} else {
			filter.startDateTime = moment().startOf('year').toDate().toISOString();
			filter.endDateTime = moment().endOf('year').toDate().toISOString();
		}
		// Check email
		global.storage.getTransactions(null, filter, Users.WITH_NO_IMAGE, 0).then((transactions) => {
			// filters
			transactions = transactions.filter((transaction) => {
				return CentralRestServerAuthorization.canReadUser(req.user, transaction.userID) &&
					CentralRestServerAuthorization.canReadChargingStation(req.user, transaction.chargeBoxID);
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
				// Set consumption
				if (!monthStat[transactions[i].chargeBoxID.chargeBoxIdentity]) {
					// Add conso in kW.h
					monthStat[transactions[i].chargeBoxID.chargeBoxIdentity] = transactions[i].stop.totalConsumption / 1000;
				} else {
					// Add conso in kW.h
					monthStat[transactions[i].chargeBoxID.chargeBoxIdentity] += transactions[i].stop.totalConsumption / 1000;
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
}

module.exports = StatisticService;
