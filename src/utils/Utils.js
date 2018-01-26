const Configuration = require('./Configuration');
const Logging = require('./Logging');
const uuidV4 = require('uuid/v4');
require('source-map-support').install();

let _centralSystemFrontEndConfig = Configuration.getCentralSystemFrontEndConfig();

module.exports = {
	generateGUID() {
		return uuidV4();
	},

	buildUserFullName(user, withID=true) {
		if (!user) {
			return "Unknown";
		}
		// First name?
		if (!user.firstName) {
			return user.name;
		}
		// Set the ID?
		if (withID) {
			return `${user.firstName} ${user.name} (${user.id})`;
		} else {
			return `${user.firstName} ${user.name}`;
		}
	},

	// Save the users in file
	saveFile(filename, content) {
		// Save
		fs.writeFileSync(path.join(__dirname, filename), content, 'UTF-8');
	},

	getRandomInt() {
		return Math.floor((Math.random() * 1000000000) + 1);
	},

	buildEvseURL() {
		return _centralSystemFrontEndConfig.protocol + "://" +
			_centralSystemFrontEndConfig.host + ":" +
			_centralSystemFrontEndConfig.port;
	},

	getDefaultLocale() {
		return "en_US";
	},

	buildEvseUserURL(user) {
		let _evseBaseURL = this.buildEvseURL();
		// Add : https://localhost:8080/#/pages/chargers/charger/REE001
		return _evseBaseURL + "/#/pages/users/user/" + user.getID();
	},

	buildEvseChargingStationURL(chargingStation, connectorId) {
		let _evseBaseURL = this.buildEvseURL();
		// Add : https://localhost:8080/#/pages/chargers/charger/REE001
		return _evseBaseURL + "/#/pages/chargers/charger/" + chargingStation.getChargeBoxIdentity() +
		"/connector/" + connectorId;
	},

	buildEvseTransactionURL(chargingStation, connectorId, transactionId) {
		let _evseBaseURL = this.buildEvseURL();
		// Add : https://localhost:8080/#/pages/chargers/charger/REE001
		return _evseBaseURL + "/#/pages/chargers/charger/" + chargingStation.getChargeBoxIdentity() +
		"/connector/" + connectorId + "/transaction/" + transactionId;
	},

	isServerInProductionMode() {
		var env = process.env.NODE_ENV || 'dev';
		return (env !== "dev");
	},

	hideShowMessage(message) {
		// Check Prod
		if (this.isServerInProductionMode()) {
			return "An unexpected server error occurred. Check the server's logs!";
		} else {
			return message;
		}
	},

	checkRecordLimit(recordLimit) {
		// Not provided?
		if (!recordLimit || isNaN(recordLimit)) {
			// Default
			recordLimit = 50;
		}
		// Limit Exceeded?
		if(recordLimit > 500) {
			recordLimit = 500;
		}
		if (typeof recordLimit == "string" ) {
			recordLimit = parseInt(recordLimit);
		}
		console.log(recordLimit);
		return recordLimit;
	}
};
