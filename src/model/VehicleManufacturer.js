const Database = require('../utils/Database');
const User = require('./User');
const Vehicle = require('./Vehicle');
const Constants = require('../utils/Constants');
const AppError = require('../exception/AppError');

class VehicleManufacturer {
	constructor(vehicleManufacturer) {
		// Init model
		this._model = {};
		// Set it
		Database.updateVehicleManufacturer(vehicleManufacturer, this._model);
	}

	getModel() {
		return this._model;
	}

	getID() {
		return this._model.id;
	}

	setName(name) {
		this._model.name = name;
	}

	getName() {
		return this._model.name;
	}

	getLogo() {
		return this._model.logo;
	}

	setLogo(logo) {
		this._model.logo = logo;
	}

	getCreatedBy() {
		if (this._model.createdBy) {
			return new User(this._model.createdBy);
		}
		return null;
	}

	setCreatedBy(user) {
		this._model.createdBy = user.getModel();
	}

	getCreatedOn() {
		return this._model.createdOn;
	}

	setCreatedOn(createdOn) {
		this._model.createdOn = createdOn;
	}

	getLastChangedBy() {
		if (this._model.lastChangedBy) {
			return new User(this._model.lastChangedBy);
		}
		return null;
	}

	setLastChangedBy(user) {
		this._model.lastChangedBy = user.getModel();
	}

	getLastChangedOn() {
		return this._model.lastChangedOn;
	}

	setLastChangedOn(lastChangedOn) {
		this._model.lastChangedOn = lastChangedOn;
	}

	static checkIfVehicleManufacturerValid(filteredRequest, request) {
		// Update model?
		if(request.method !== 'POST' && !filteredRequest.id) {
			throw new AppError(
				Constants.CENTRAL_SERVER,
				`The Vehicle Manufacturer ID is mandatory`, 500, 
				'VehicleManufacturer', 'checkIfVehicleManufacturerValid');
		}
		if(!filteredRequest.name) {
			throw new AppError(
				Constants.CENTRAL_SERVER,
				`The Vehicle Manufacturer Name is mandatory`, 500, 
				'VehicleManufacturer', 'checkIfVehicleManufacturerValid');
		}
	}

	async getVehicles() {
		if (this._model.vehicles) {
			return this._model.vehicles.map((vehicle) => new Vehicle(vehicle));
		} else {
			// Get from DB
			let vehicles = await global.storage.getVehicles(null, this.getID());
			// Keep it
			this.setVehicles(vehicles);
			return vehicles;
		}
	}

	setVehicles(vehicles) {
		this._model.vehicles = vehicles.map((vehicle) => {
			return vehicle.getModel();
		});
	}

	save() {
		return global.storage.saveVehicleManufacturer(this.getModel());
	}

	saveLogo() {
		return global.storage.saveVehicleManufacturerLogo(this.getModel());
	}

	delete() {
		return global.storage.deleteVehicleManufacturer(this.getID());
	}
}

module.exports = VehicleManufacturer;
