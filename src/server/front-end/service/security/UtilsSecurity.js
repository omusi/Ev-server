const sanitize = require('mongo-sanitize');
const Authorizations = require('../../../../authorization/Authorizations');
const Utils = require('../../../../utils/Utils');
const Constants = require('../../../../utils/Constants');

class UtilsSecurity {
	static filterBoolean(value) {
		let result = false;
		// Check boolean
		if(value) {
			// Sanitize
			value = sanitize(value);
			// Check the type
			if (typeof value == "boolean") {
				// Already a boolean
				result = value;
			} else {
				// Convert
				result = (value === "true");
			}
		}
		return result;
	}

	static filterSkipAndLimit(request, filteredRequest) {
		// Limit
		UtilsSecurity.filterLimit(request, filteredRequest);
		// Skip
		UtilsSecurity.filterSkip(request, filteredRequest);
	}

	static filterLimit(request, filteredRequest) {
		// Exist?
		if (!request.Limit) {
			// Default
			filteredRequest.Limit = Constants.DEFAULT_DB_LIMIT;
		} else {
			// Parse
			filteredRequest.Limit = parseInt(sanitize(request.Limit));
			if (isNaN(filteredRequest.Limit)) {
				filteredRequest.Limit = Constants.DEFAULT_DB_LIMIT;
			// Negative limit?
			} else if (filteredRequest.Limit < 0) {
				filteredRequest.Limit = Constants.DEFAULT_DB_LIMIT;
			}
		}
	}

	static filterSkip(request, filteredRequest) {
		// Exist?
		if (!request.Skip) {
			// Default
			filteredRequest.Skip = 0;
		} else {
			// Parse
			filteredRequest.Skip = parseInt(sanitize(request.Skip));
			if (isNaN(filteredRequest.Skip)) {
				filteredRequest.Skip = 0;
			// Negative?
			} else if (filteredRequest.Skip < 0) {
				filteredRequest.Skip = 0;
			}
		}
	}

	static filterAddressRequest(address, loggedUser) {
		let filteredAddress = {};
		if (address) {
			filteredAddress.address1 = sanitize(address.address1);
			filteredAddress.address2 = sanitize(address.address2);
			filteredAddress.postalCode = sanitize(address.postalCode);
			filteredAddress.city = sanitize(address.city);
			filteredAddress.department = sanitize(address.department);
			filteredAddress.region = sanitize(address.region);
			filteredAddress.country = sanitize(address.country);
			filteredAddress.latitude = sanitize(address.latitude);
			filteredAddress.longitude = sanitize(address.longitude);
		}
		return filteredAddress;
	}

	static filterCreatedAndLastChanged(filteredEntity, entity, loggedUser) {
		if (entity.createdBy && typeof entity.createdBy == "object" &&
				Authorizations.canReadUser(loggedUser, entity.createdBy)) {
			// Build user
			filteredEntity.createdBy = Utils.buildUserFullName(entity.createdBy, false);
		}
		if (entity.lastChangedBy && typeof entity.lastChangedBy == "object" &&
				Authorizations.canReadUser(loggedUser, entity.lastChangedBy)) {
			// Build user
			filteredEntity.lastChangedBy = Utils.buildUserFullName(entity.lastChangedBy, false);
		}
		if (entity.lastChangedOn) {
			filteredEntity.lastChangedOn = entity.lastChangedOn;
		}
		if (entity.createdOn) {
			filteredEntity.createdOn = entity.createdOn;
		}
	}
}

module.exports = UtilsSecurity;
