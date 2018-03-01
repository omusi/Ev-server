const SecurityRestObjectFiltering = require('../SecurityRestObjectFiltering');
const CentralRestServerAuthorization = require('../CentralRestServerAuthorization');
const Logging = require('../../../utils/Logging');
const Database = require('../../../utils/Database');
const AppError = require('../../../exception/AppError');
const AppAuthError = require('../../../exception/AppAuthError');
const Companies = require('../../../utils/Companies');
const Sites = require('../../../utils/Sites');
const SiteAreas = require('../../../utils/SiteAreas');
const Constants = require('../../../utils/Constants');
const Utils = require('../../../utils/Utils');
const Users = require('../../../utils/Users');
const Company = require('../../../model/Company');
const Site = require('../../../model/Site');
const SiteArea = require('../../../model/SiteArea');

class SiteService {

	static handleDeleteSite(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService",
			method: "handleDeleteSite",
			message: `Delete Site '${req.query.ID}'`,
			detailedMessages: req.query
		});
		// Filter
		let site;
		let filteredRequest = SecurityRestObjectFiltering.filterSiteDeleteRequest(
			req.query, req.user);
		// Check Mandatory fields
		if(!filteredRequest.ID) {
			Logging.logActionExceptionMessageAndSendResponse(
				action, new Error(`The Site's ID must be provided`), req, res, next);
			return;
		}
		// Get
		global.storage.getSite(filteredRequest.ID).then((foundSite) => {
			site = foundSite;
			// Found?
			if (!site) {
				// Not Found!
				throw new AppError(`Site with ID '${filteredRequest.ID}' does not exist`,
					500, "SiteService", "handleDeleteSite");
			}
			// Check auth
			if (!CentralRestServerAuthorization.canDeleteSite(req.user, site.getModel())) {
				// Not Authorized!
				throw new AppAuthError(
					CentralRestServerAuthorization.ACTION_DELETE,
					CentralRestServerAuthorization.ENTITY_SITE,
					site.getID(),
					500, "SiteService", "handleDeleteSite",
					req.user);
			}
			// Delete
			return site.delete();
		}).then(() => {
			// Log
			Logging.logSecurityInfo({
				user: req.user, module: "SiteService", method: "handleDeleteSite",
				message: `Site '${site.getName()}' has been deleted successfully`,
				action: action, detailedMessages: site});
			// Ok
			res.json({status: `Success`});
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetSite(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService",
			method: "handleGetSite",
			message: `Read Site '${req.query.ID}'`,
			detailedMessages: req.query
		});
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterSiteRequest(req.query, req.user);
		// Charge Box is mandatory
		if(!filteredRequest.ID) {
			Logging.logActionExceptionMessageAndSendResponse(
				action, new Error(`The Site ID is mandatory`), req, res, next);
			return;
		}
		// Get it
		global.storage.getSite(filteredRequest.ID).then((site) => {
			if (site) {
				// Return
				res.json(
					// Filter
					SecurityRestObjectFiltering.filterSiteResponse(
						site.getModel(), req.user)
				);
			} else {
				res.json({});
			}
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetSites(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService",
			method: "handleGetSites",
			message: `Read All Sites`,
			detailedMessages: req.query
		});
		// Check auth
		if (!CentralRestServerAuthorization.canListSites(req.user)) {
			// Not Authorized!
			throw new AppAuthError(
				CentralRestServerAuthorization.ACTION_LIST,
				CentralRestServerAuthorization.ENTITY_SITES,
				null,
				500, "SiteService", "handleGetSites",
				req.user);
		}
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterSitesRequest(req.query, req.user);
		// Get the sites
		global.storage.getSites(filteredRequest.Search, filteredRequest.WithSiteAreas,
			filteredRequest.WithChargeBoxes, filteredRequest.WithCompanyLogo,
				Constants.NO_LIMIT).then((sites) => {
			let sitesJSon = [];
			sites.forEach((site) => {
				// Set the model
				sitesJSon.push(site.getModel());
			});
			// Return
			res.json(
				// Filter
				SecurityRestObjectFiltering.filterSitesResponse(
					sitesJSon, req.user)
			);
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetSiteImage(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService",
			method: "handleGetSiteImage",
			message: `Read Site Image '${req.query.ID}'`,
			detailedMessages: req.query
		});
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterSiteRequest(req.query, req.user);
		// Charge Box is mandatory
		if(!filteredRequest.ID) {
			Logging.logActionExceptionMessageAndSendResponse(
				action, new Error(`The Site ID is mandatory`), req, res, next);
			return;
		}
		// Get it
		global.storage.getSite(filteredRequest.ID).then((site) => {
			if (!site) {
				throw new AppError(`The Site with ID '${filteredRequest.ID}' does not exist anymore`,
					550, "SiteService", "handleUpdateSite");
			}
			// Check auth
			if (!CentralRestServerAuthorization.canReadSite(req.user, site.getModel())) {
				// Not Authorized!
				throw new AppAuthError(
					CentralRestServerAuthorization.ACTION_READ,
					CentralRestServerAuthorization.ENTITY_SITE,
					site.getID(),
					500, "SiteService", "handleGetSiteImage",
					req.user);
			}
			// Get the image
			return global.storage.getSiteImage(filteredRequest.ID);
		}).then((siteImage) => {
			// Found?
			if (siteImage) {
				Logging.logSecurityInfo({
					user: req.user,
					action: action,
					module: "SiteService", method: "handleGetSiteImage",
					message: 'Read Site Image'
				});
				// Set the user
				res.json(siteImage);
			} else {
				res.json(null);
			}
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleGetSiteImages(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService", method: "handleGetSiteImages",
			message: `Read Site Images`,
			detailedMessages: req.query
		});
		// Check auth
		if (!CentralRestServerAuthorization.canListSites(req.user)) {
			// Not Authorized!
			throw new AppAuthError(
				CentralRestServerAuthorization.ACTION_LIST,
				CentralRestServerAuthorization.ENTITY_SITES,
				null,
				500, "SiteService", "handleGetSiteImages",
				req.user);
		}
		// Get the site image
		global.storage.getSiteImages().then((siteImages) => {
			Logging.logSecurityInfo({
				user: req.user,
				action: action,
				module: "SiteService", method: "handleGetSiteImages",
				message: 'Read Site Images'
			});
			res.json(siteImages);
			next();
		}).catch((err) => {
			// Log
			Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
		});
	}

	static handleCreateSite(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService",
			method: "handleCreateSite",
			message: `Create Site '${req.body.name}'`,
			detailedMessages: req.body
		});
		// Check auth
		if (!CentralRestServerAuthorization.canCreateSite(req.user)) {
			// Not Authorized!
			throw new AppAuthError(
				CentralRestServerAuthorization.ACTION_CREATE,
				CentralRestServerAuthorization.ENTITY_SITE,
				null,
				500, "SiteService", "handleCreateSite",
				req.user);
		}
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterSiteCreateRequest( req.body, req.user );
		// Check Mandatory fields
		if (Sites.checkIfSiteValid(action, filteredRequest, req, res, next)) {
			// Check Company
			global.storage.getCompany(filteredRequest.companyID).then((company) => {
				// Found?
				if (!company) {
					// Not Found!
					throw new AppError(`The Company ID '${filteredRequest.companyID}' does not exist`,
						500, "SiteService", "handleCreateSite");
				}
				// Get the logged user
				return global.storage.getUser(req.user.id);
			// Logged User
			}).then((loggedUser) => {
				// Create site
				let newSite = new Site(filteredRequest);
				// Update timestamp
				newSite.setCreatedBy(loggedUser);
				newSite.setCreatedOn(new Date());
				// Save
				return newSite.save();
			}).then((createdSite) => {
				Logging.logSecurityInfo({
					user: req.user, module: "SiteService", method: "handleCreateSite",
					message: `Site '${createdSite.getName()}' has been created successfully`,
					action: action, detailedMessages: createdSite});
				// Ok
				res.json({status: `Success`});
				next();
			}).catch((err) => {
				// Log
				Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
			});
		}
	}

	static handleUpdateSite(action, req, res, next) {
		Logging.logSecurityInfo({
			user: req.user, action: action,
			module: "SiteService",
			method: "handleUpdateSite",
			message: `Update Site '${req.body.name}' (ID '${req.body.id}')`,
			detailedMessages: req.body
		});
		// Filter
		let filteredRequest = SecurityRestObjectFiltering.filterSiteUpdateRequest( req.body, req.user );
		// Check Mandatory fields
		if (Sites.checkIfSiteValid(action, filteredRequest, req, res, next)) {
			let site;
			// Check email
			global.storage.getSite(filteredRequest.id).then((foundSite) => {
				site = foundSite;
				if (!site) {
					throw new AppError(`The Site with ID '${filteredRequest.id}' does not exist anymore`,
						550, "SiteService", "handleUpdateSite");
				}
				// Check auth
				if (!CentralRestServerAuthorization.canUpdateSite(req.user, site.getModel())) {
					// Not Authorized!
					throw new AppAuthError(
						CentralRestServerAuthorization.ACTION_UPDATE,
						CentralRestServerAuthorization.ENTITY_SITE,
						site.getID(),
						500, "SiteService", "handleUpdateSite",
						req.user);
				}
				// Get the logged user
				return global.storage.getUser(req.user.id);
			// Logged User
			}).then((loggedUser) => {
				// Update
				Database.updateSite(filteredRequest, site.getModel());
				// Update timestamp
				site.setLastChangedBy(loggedUser);
				site.setLastChangedOn(new Date());
				// Update
				return site.save();
			}).then((updatedSite) => {
				// Log
				Logging.logSecurityInfo({
					user: req.user, module: "SiteService", method: "handleUpdateSite",
					message: `Site '${updatedSite.getName()}' has been updated successfully`,
					action: action, detailedMessages: updatedSite});
				// Ok
				res.json({status: `Success`});
				next();
			}).catch((err) => {
				// Log
				Logging.logActionExceptionMessageAndSendResponse(action, err, req, res, next);
			});
		}
	}
}

module.exports = SiteService;
