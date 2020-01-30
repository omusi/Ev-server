import { Action, Entity } from '../../../types/Authorization';
import { HTTPAuthError, HTTPUserError, HTTPError } from '../../../types/HTTPError';
import { NextFunction, Request, Response } from 'express';
import AppAuthError from '../../../exception/AppAuthError';
import AppError from '../../../exception/AppError';
import Authorizations from '../../../authorization/Authorizations';
import BillingFactory from '../../../integration/billing/BillingFactory';
import ConnectionStorage from '../../../storage/mongodb/ConnectionStorage';
import Constants from '../../../utils/Constants';
import ERPService from '../../../integration/pricing/convergent-charging/ERPService';
import EmspOCPIClient from '../../../client/ocpi/EmspOCPIClient';
import Logging from '../../../utils/Logging';
import NotificationHandler from '../../../notification/NotificationHandler';
import OCPIClientFactory from '../../../client/ocpi/OCPIClientFactory';
import RatingService from '../../../integration/pricing/convergent-charging/RatingService';
import SettingStorage from '../../../storage/mongodb/SettingStorage';
import SiteStorage from '../../../storage/mongodb/SiteStorage';
import TenantStorage from '../../../storage/mongodb/TenantStorage';
import UserNotifications from '../../../types/UserNotifications';
import UserSecurity from './security/UserSecurity';
import UserStorage from '../../../storage/mongodb/UserStorage';
import Utils from '../../../utils/Utils';
import UtilsService from './UtilsService';
import fs from 'fs';

export default class UserService {

  public static async handleAssignSitesToUser(action: string, req: Request, res: Response, next: NextFunction) {
    UtilsService.assertComponentIsActiveFromToken(
      req.user, Constants.COMPONENTS.ORGANIZATION,
      Action.UPDATE, Entity.SITES, 'SiteService', 'handleAssignSitesToUser');
    // Filter
    const filteredRequest = UserSecurity.filterAssignSitesToUserRequest(req.body);
    // Check Mandatory fields
    if (!filteredRequest.userID) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s ID must be provided',
        module: 'UserService',
        method: 'handleAssignSitesToUser',
        user: req.user,
        action: action
      });
    }
    if (!filteredRequest.siteIDs || (filteredRequest.siteIDs && filteredRequest.siteIDs.length <= 0)) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'Site\'s IDs must be provided',
        module: 'UserService',
        method: 'handleAssignSitesToUser',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canUpdateUser(req.user, filteredRequest.userID)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.UPDATE,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleAssignSitesToUser',
        value: filteredRequest.userID
      });
    }
    // Get the User
    const user = await UserStorage.getUser(req.user.tenantID, filteredRequest.userID);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.userID}' does not exist anymore`,
        module: 'UserService',
        method: 'handleAssignSitesToUser',
        user: req.user,
        action: action
      });
    }
    // Get Sites
    for (const siteID of filteredRequest.siteIDs) {
      if (!await SiteStorage.siteExists(req.user.tenantID, siteID)) {
        throw new AppError({
          source: Constants.CENTRAL_SERVER,
          errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
          message: `Site with ID '${siteID}' does not exist anymore`,
          module: 'UserService',
          method: 'handleAssignSitesToUser',
          user: req.user,
          action: action
        });
      }
      // Check auth
      if (!Authorizations.canUpdateSite(req.user, siteID)) {
        throw new AppAuthError({
          errorCode: HTTPAuthError.ERROR,
          user: req.user,
          action: Action.UPDATE,
          entity: Entity.SITE,
          module: 'UserService',
          method: 'handleAssignSitesToUser',
          value: siteID
        });
      }
    }
    // Save
    if (action.toLowerCase().includes('add')) {
      await UserStorage.addSitesToUser(req.user.tenantID, filteredRequest.userID, filteredRequest.siteIDs);
    } else {
      await UserStorage.removeSitesFromUser(req.user.tenantID, filteredRequest.userID, filteredRequest.siteIDs);
    }
    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: req.user, module: 'UserService', method: 'handleAssignSitesToUser',
      message: 'User\'s Sites have been assigned successfully', action: action
    });
    // Ok
    res.json(Constants.REST_RESPONSE_SUCCESS);
    next();
  }

  public static async handleDeleteUser(action: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Filter
    const id = UserSecurity.filterUserByIDRequest(req.query);
    // Check Mandatory fields
    if (!id) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s ID must be provided',
        module: 'UserService',
        method: 'handleDeleteUser',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canDeleteUser(req.user, id)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.DELETE,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleDeleteUser',
        value: id
      });
    }
    // Check Mandatory fields
    if (id === req.user.id) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User cannot delete himself',
        module: 'UserService',
        method: 'handleDeleteUser',
        user: req.user,
        action: action
      });
    }
    // Check user
    const user = await UserStorage.getUser(req.user.tenantID, id);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${id}' does not exist anymore`,
        module: 'UserService',
        method: 'handleDeleteUser',
        user: req.user,
        action: action
      });
    }
    // Deleted
    if (user.deleted) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${id}' is already deleted`,
        module: 'UserService',
        method: 'handleDeleteUser',
        user: req.user,
        action: action
      });
    }
    // For integration with billing
    const billingImpl = await BillingFactory.getBillingImpl(req.user.tenantID);
    if (billingImpl) {
      try {
        await billingImpl.checkIfUserCanBeDeleted(user);
      } catch (e) {
        Logging.logError({
          tenantID: req.user.tenantID,
          module: 'UserService',
          method: 'handleDeleteUser',
          action: 'CheckIfUserCanBeDeleted',
          message: `User '${user.firstName} ${user.name}' cannot be deleted in Billing provider`,
          detailedMessages: e.message
        });
      }
    }
    if (req.user.activeComponents.includes(Constants.COMPONENTS.ORGANIZATION)) {
      // Delete from site
      const siteIDs: string[] = (await UserStorage.getSites(req.user.tenantID, { userID: id },
        Constants.DB_PARAMS_MAX_LIMIT)).result.map(
        (siteUser) => siteUser.site.id
      );
      await UserStorage.removeSitesFromUser(req.user.tenantID, user.id, siteIDs);
    }
    // Delete User
    await UserStorage.deleteUser(req.user.tenantID, user.id);
    if (billingImpl) {
      try {
        await billingImpl.deleteUser(user);
      } catch (e) {
        Logging.logError({
          tenantID: req.user.tenantID,
          module: 'UserService',
          method: 'handleDeleteUser',
          action: 'UserDelete',
          message: `User '${user.firstName} ${user.name}' cannot be deleted in Billing provider`,
          detailedMessages: e.message
        });
      }
    }

    // Synchronize badges with IOP
    const tenant = await TenantStorage.getTenant(req.user.tenantID);
    try {
      const ocpiClient: EmspOCPIClient = await OCPIClientFactory.getAvailableOcpiClient(tenant, Constants.OCPI_ROLE.EMSP) as EmspOCPIClient;
      if (ocpiClient) {
        // Invalidate no more used tags
        for (const tag of user.tags) {
          if (tag.issuer) {
            await ocpiClient.pushToken({
              uid: tag.id,
              type: 'RFID',
              'auth_id': user.id,
              'visual_number': user.id,
              issuer: tenant.name,
              valid: false,
              whitelist: 'ALLOWED_OFFLINE',
              'last_updated': new Date()
            });
          }
        }
      }
    } catch (e) {
      Logging.logError({
        tenantID: req.user.tenantID,
        module: 'UserService',
        method: 'handleUpdateUser',
        action: 'UserUpdate',
        message: `Unable to synchronize tokens of user ${user.id} with IOP`,
        detailedMessages: e.message
      });
    }

    // Delete Connections
    await ConnectionStorage.deleteConnectionByUserId(req.user.tenantID, user.id);
    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: req.user, actionOnUser: user,
      module: 'UserService', method: 'handleDeleteUser',
      message: `User with ID '${user.id}' has been deleted successfully`,
      action: action
    });
    // Ok
    res.json(Constants.REST_RESPONSE_SUCCESS);
    next();
  }

  public static async handleUpdateUser(action: string, req: Request, res: Response, next: NextFunction) {
    let statusHasChanged = false;
    // Filter
    const filteredRequest = UserSecurity.filterUserUpdateRequest(req.body, req.user);
    // Check Mandatory fields
    if (!filteredRequest.id) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s ID must be provided',
        module: 'UserService',
        method: 'handleUpdateUser',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canUpdateUser(req.user, filteredRequest.id)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.UPDATE,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleUpdateUser',
        value: filteredRequest.id
      });
    }
    // Get User
    let user = await UserStorage.getUser(req.user.tenantID, filteredRequest.id);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.id}' does not exist anymore`,
        module: 'UserService',
        method: 'handleUpdateUser',
        user: req.user,
        action: action
      });
    }
    // Deleted?
    if (user.deleted) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.id}' is logically deleted`,
        module: 'UserService',
        method: 'handleUpdateUser',
        user: req.user,
        action: action
      });
    }
    // Check email
    const userWithEmail = await UserStorage.getUserByEmail(req.user.tenantID, filteredRequest.email);
    // Check if EMail is already taken
    if (userWithEmail && user.id !== userWithEmail.id) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPUserError.EMAIL_ALREADY_EXIST_ERROR,
        message: `Email '${filteredRequest.email}' already exists`,
        module: 'UserService',
        method: 'handleUpdateUser',
        user: req.user,
        action: action
      });
    }
    // Check if Status has been changed
    if (filteredRequest.status &&
      filteredRequest.status !== user.status) {
      statusHasChanged = true;
    }
    // Update timestamp
    filteredRequest.lastChangedBy = { id: req.user.id };
    filteredRequest.lastChangedOn = new Date();
    // Clean up request
    delete filteredRequest.passwords;

    // Check User validity
    Utils.checkIfUserValid(filteredRequest, user, req);
    // Check if Tag IDs are valid
    await Utils.checkIfUserTagsAreValid(user, filteredRequest.tags, req);
    const previousTags = user.tags;
    // For integration with Billing
    const billingImpl = await BillingFactory.getBillingImpl(req.user.tenantID);
    // Update user
    user = { ...user, ...filteredRequest, tags: [] };
    // Update User (override TagIDs because it's not of the same type as in filteredRequest)
    await UserStorage.saveUser(req.user.tenantID, user, true);
    if (billingImpl) {
      try {
        const billingData = await billingImpl.updateUser(user);
        await UserStorage.saveUserBillingData(req.user.tenantID, user.id, billingData);
      } catch (e) {
        Logging.logError({
          tenantID: req.user.tenantID,
          module: 'UserService',
          method: 'handleUpdateUser',
          action: 'UserUpdate',
          message: `User '${user.firstName} ${user.name}' cannot be updated in Billing provider`,
          detailedMessages: e.message
        });
      }
    }
    // Save User password
    if (filteredRequest.password) {
      // Update the password
      const newPasswordHashed = await Utils.hashPasswordBcrypt(filteredRequest.password);
      await UserStorage.saveUserPassword(req.user.tenantID, filteredRequest.id,
        {
          password: newPasswordHashed,
          passwordWrongNbrTrials: 0,
          passwordResetHash: null,
          passwordBlockedUntil: null
        });
    }
    // Save Admin info
    if (Authorizations.isAdmin(req.user) || Authorizations.isSuperAdmin(req.user)) {
      // Save Tags
      filteredRequest.tags.forEach((tag) => {
        tag.lastChangedOn = filteredRequest.lastChangedOn;
        tag.lastChangedBy = filteredRequest.lastChangedBy;
      });
      await UserStorage.saveUserTags(req.user.tenantID, filteredRequest.id, filteredRequest.tags);

      // Synchronize badges with IOP
      const tenant = await TenantStorage.getTenant(req.user.tenantID);
      try {
        const ocpiClient: EmspOCPIClient = await OCPIClientFactory.getAvailableOcpiClient(tenant, Constants.OCPI_ROLE.EMSP) as EmspOCPIClient;
        if (ocpiClient) {
          // Invalidate no more used tags
          for (const previousTag of previousTags) {
            const foundTag = filteredRequest.tags.find((tag) => tag.id === previousTag.id);
            if (previousTag.issuer && (!foundTag || !foundTag.issuer)) {
              await ocpiClient.pushToken({
                uid: previousTag.id,
                type: 'RFID',
                'auth_id': filteredRequest.id,
                'visual_number': filteredRequest.id,
                issuer: tenant.name,
                valid: false,
                whitelist: 'ALLOWED_OFFLINE',
                'last_updated': new Date()
              });
            }
          }
          // Push new valid tags
          for (const currentTag of filteredRequest.tags) {
            const foundTag = previousTags.find((tag) => tag.id === currentTag.id);
            if (currentTag.issuer && (!foundTag || !foundTag.issuer)) {
              await ocpiClient.pushToken({
                uid: currentTag.id,
                type: 'RFID',
                'auth_id': filteredRequest.id,
                'visual_number': filteredRequest.id,
                issuer: tenant.name,
                valid: true,
                whitelist: 'ALLOWED_OFFLINE',
                'last_updated': new Date()
              });
            }
          }
        }
      } catch (e) {
        Logging.logError({
          tenantID: req.user.tenantID,
          module: 'UserService',
          method: 'handleUpdateUser',
          action: 'UserUpdate',
          message: `Unable to synchronize tokens of user ${filteredRequest.id} with IOP`,
          detailedMessages: e.message
        });
      }

      // Save User Status
      if (filteredRequest.status) {
        await UserStorage.saveUserStatus(req.user.tenantID, user.id, filteredRequest.status);
      }
      // Save User Role
      if (filteredRequest.role) {
        await UserStorage.saveUserRole(req.user.tenantID, user.id, filteredRequest.role);
      }
      // Save Admin Data
      if (filteredRequest.plateID || filteredRequest.hasOwnProperty('notificationsActive')) {
        const adminData: { plateID?: string; notificationsActive?: boolean; notifications?: UserNotifications } = {};
        if (filteredRequest.plateID) {
          adminData.plateID = filteredRequest.plateID;
        }
        if (filteredRequest.hasOwnProperty('notificationsActive')) {
          adminData.notificationsActive = filteredRequest.notificationsActive;
          if (filteredRequest.notifications) {
            adminData.notifications = filteredRequest.notifications;
          }
        }
        // Save User Admin data
        await UserStorage.saveUserAdminData(req.user.tenantID, user.id, adminData);
      }
    }
    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: req.user, actionOnUser: user,
      module: 'UserService', method: 'handleUpdateUser',
      message: 'User has been updated successfully',
      action: action
    });
    // Notify
    if (statusHasChanged) {
      // Send notification (Async)
      NotificationHandler.sendUserAccountStatusChanged(
        req.user.tenantID,
        Utils.generateGUID(),
        user,
        {
          'user': user,
          'evseDashboardURL': Utils.buildEvseURL((await TenantStorage.getTenant(req.user.tenantID)).subdomain)
        }
      );
    }
    // Ok
    res.json(Constants.REST_RESPONSE_SUCCESS);
    next();
  }

  public static async handleUpdateUserMobileToken(action: string, req: Request, res: Response, next: NextFunction) {
    // Filter
    const filteredRequest = UserSecurity.filterUserUpdateMobileTokenRequest(req.body);
    // Check Mandatory fields
    if (!filteredRequest.mobileToken) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s mobile token ID must be provided',
        module: 'UserService',
        method: 'handleUpdateUserMobileToken',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canUpdateUser(req.user, filteredRequest.id)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.UPDATE,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleUpdateUserMobileToken',
        value: filteredRequest.id
      });
    }
    // Get User
    const user = await UserStorage.getUser(req.user.tenantID, filteredRequest.id);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.id}' does not exist anymore`,
        module: 'UserService',
        method: 'handleUpdateUserMobileToken',
        user: req.user,
        action: action
      });
    }
    // Deleted?
    if (user.deleted) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.id}' is logically deleted`,
        module: 'UserService',
        method: 'handleUpdateUserMobileToken',
        user: req.user,
        action: action
      });
    }
    // Update User (override TagIDs because it's not of the same type as in filteredRequest)
    await UserStorage.saveUserMobileToken(req.user.tenantID, user.id, filteredRequest.mobileToken, filteredRequest.mobileOS, new Date());
    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: user,
      module: 'UserService', method: 'handleUpdateUserMobileToken',
      message: 'User\'s mobile token has been updated successfully',
      action: action,
      detailedMessages: {
        mobileToken: filteredRequest.mobileToken,
        mobileOS: filteredRequest.mobileOS
      }
    });
    // Ok
    res.json(Constants.REST_RESPONSE_SUCCESS);
    next();
  }

  public static async handleGetUser(action: string, req: Request, res: Response, next: NextFunction) {
    // Filter
    const id = UserSecurity.filterUserByIDRequest(req.query);
    // User mandatory
    if (!id) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s ID must be provided',
        module: 'UserService',
        method: 'handleGetUser',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canReadUser(req.user, id)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.READ,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleGetUser',
        value: id
      });
    }
    // Get the user
    const user = await UserStorage.getUser(req.user.tenantID, id);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${id}' does not exist anymore`,
        module: 'UserService',
        method: 'handleGetUser',
        user: req.user,
        action: action
      });
    }
    // Deleted?
    if (user.deleted) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${id}' is logically deleted`,
        module: 'UserService',
        method: 'handleGetUser',
        user: req.user,
        action: action
      });
    }
    // Ok
    res.json(
      // Filter
      UserSecurity.filterUserResponse(
        user, req.user)
    );
    next();
  }

  public static async handleGetUserImage(action: string, req: Request, res: Response, next: NextFunction) {
    // Filter
    const filteredRequest = { ID: UserSecurity.filterUserByIDRequest(req.query) };
    // User mandatory
    if (!filteredRequest.ID) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s ID must be provided',
        module: 'UserService',
        method: 'handleGetUserImage',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canReadUser(req.user, filteredRequest.ID)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.READ,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleGetUserImage',
        value: filteredRequest.ID
      });
    }
    // Get the logged user
    const user = await UserStorage.getUser(req.user.tenantID, filteredRequest.ID);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.ID}' does not exist anymore`,
        module: 'UserService',
        method: 'handleGetUserImage',
        user: req.user,
        action: action
      });
    }
    // Deleted?
    if (user.deleted) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${filteredRequest.ID}' is logically deleted`,
        module: 'UserService',
        method: 'handleGetUserImage',
        user: req.user,
        action: action
      });
    }
    // Get the user image
    const userImage = await UserStorage.getUserImage(req.user.tenantID, filteredRequest.ID);
    // Ok
    res.json(userImage);
    next();
  }

  public static async handleGetSites(action: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    UtilsService.assertComponentIsActiveFromToken(
      req.user, Constants.COMPONENTS.ORGANIZATION,
      Action.UPDATE, Entity.USER, 'UserService', 'handleGetSites');
    // Filter
    const filteredRequest = UserSecurity.filterUserSitesRequest(req.query);
    // Check Mandatory fields
    if (!filteredRequest.UserID) {
      // Not Found!
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'The User\'s ID must be provided',
        module: 'UserService',
        method: 'handleGetSites',
        user: req.user,
        action: action
      });
    }
    const user = await UserStorage.getUser(req.user.tenantID, filteredRequest.UserID);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `The User with ID '${filteredRequest.UserID}' does not exist`,
        module: 'UserService',
        method: 'handleGetSites',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canUpdateUser(req.user, filteredRequest.UserID)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.UPDATE,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleGetSites',
        value: user.id
      });
    }
    // Get users
    const userSites = await UserStorage.getSites(req.user.tenantID,
      {
        search: filteredRequest.Search,
        userID: filteredRequest.UserID
      },
      {
        limit: filteredRequest.Limit,
        skip: filteredRequest.Skip,
        sort: filteredRequest.Sort,
        onlyRecordCount: filteredRequest.OnlyRecordCount
      },
      ['site.id', 'site.name', 'site.address.city', 'site.address.country', 'siteAdmin', 'siteOwner', 'userID']
    );
    // Filter
    userSites.result = userSites.result.map((userSite) => ({
      userID: userSite.userID,
      siteAdmin: userSite.siteAdmin,
      siteOwner: userSite.siteOwner,
      site: userSite.site
    }));
    res.json(userSites);
    next();
  }

  public static async handleGetUsers(action: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Check auth
    if (!Authorizations.canListUsers(req.user)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.LIST,
        entity: Entity.USERS,
        module: 'UserService',
        method: 'handleGetUsers'
      });
    }
    // Filter
    const filteredRequest = UserSecurity.filterUsersRequest(req.query);
    // Check component
    if (filteredRequest.SiteID || filteredRequest.ExcludeSiteID) {
      UtilsService.assertComponentIsActiveFromToken(req.user,
        Constants.COMPONENTS.ORGANIZATION, Action.READ, Entity.USER, 'UserService', 'handleGetUsers');
    }
    // Get users
    const users = await UserStorage.getUsers(req.user.tenantID,
      {
        search: filteredRequest.Search,
        siteIDs: (filteredRequest.SiteID ? filteredRequest.SiteID.split('|') : null),
        roles: (filteredRequest.Role ? filteredRequest.Role.split('|') : null),
        statuses: (filteredRequest.Status ? filteredRequest.Status.split('|') : null),
        excludeSiteID: filteredRequest.ExcludeSiteID,
      },
      {
        limit: filteredRequest.Limit,
        skip: filteredRequest.Skip,
        sort: filteredRequest.Sort,
        onlyRecordCount: filteredRequest.OnlyRecordCount
      }
    );
    // Filter
    UserSecurity.filterUsersResponse(users, req.user);
    // Ok
    res.json(users);
    next();
  }

  public static async handleGetUsersInError(action: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Check auth
    if (!Authorizations.canListUsers(req.user)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.LIST,
        entity: Entity.USERS,
        module: 'UserService',
        method: 'handleGetUsersInError'
      });
    }
    // Filter
    const filteredRequest = UserSecurity.filterUsersRequest(req.query);
    // Check component
    if (filteredRequest.SiteID || filteredRequest.ExcludeSiteID) {
      UtilsService.assertComponentIsActiveFromToken(req.user,
        Constants.COMPONENTS.ORGANIZATION, Action.READ, Entity.USER, 'UserService', 'handleGetUsersInError');
    }
    // Get users
    const users = await UserStorage.getUsersInError(req.user.tenantID,
      {
        search: filteredRequest.Search,
        roles: (filteredRequest.Role ? filteredRequest.Role.split('|') : null),
        errorTypes: (filteredRequest.ErrorType ? filteredRequest.ErrorType.split('|') : ['inactive_user', 'unassigned_user', 'inactive_user_account'])
      },
      {
        limit: filteredRequest.Limit,
        onlyRecordCount: filteredRequest.OnlyRecordCount,
        skip: filteredRequest.Skip,
        sort: filteredRequest.Sort
      }
    );
    // Filter
    UserSecurity.filterUsersResponse(users, req.user);
    // Return
    res.json(users);
    next();
  }

  public static async handleCreateUser(action: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Check auth
    if (!Authorizations.canCreateUser(req.user)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.CREATE,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleCreateUser'
      });
    }
    // Filter
    const filteredRequest = UserSecurity.filterUserCreateRequest(req.body, req.user);
    // Check Mandatory fields
    Utils.checkIfUserValid(filteredRequest, null, req);
    // Get the email
    const foundUser = await UserStorage.getUserByEmail(req.user.tenantID, filteredRequest.email);
    if (foundUser) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPUserError.EMAIL_ALREADY_EXIST_ERROR,
        message: `Email '${filteredRequest.email}' already exists`,
        module: 'UserService',
        method: 'handleCreateUser',
        user: req.user,
        action: action
      });
    }
    // Check if Tag IDs are valid
    await Utils.checkIfUserTagsAreValid(null, filteredRequest.tags, req);
    // Clean request
    delete filteredRequest.passwords;
    // Set timestamp
    filteredRequest.createdBy = { id: req.user.id };
    filteredRequest.createdOn = new Date();
    // Create the User
    const newUserID = await UserStorage.saveUser(req.user.tenantID, filteredRequest, true);
    // Save password
    if (filteredRequest.password) {
      const newPasswordHashed = await Utils.hashPasswordBcrypt(filteredRequest.password);
      await UserStorage.saveUserPassword(req.user.tenantID, newUserID,
        {
          password: newPasswordHashed,
          passwordWrongNbrTrials: 0,
          passwordResetHash: null,
          passwordBlockedUntil: null
        });
    }
    // Save Admin Data
    if (Authorizations.isAdmin(req.user) || Authorizations.isSuperAdmin(req.user)) {
      // Save the Tag IDs
      filteredRequest.tags.forEach((tag) => {
        tag.lastChangedOn = filteredRequest.createdOn;
        tag.lastChangedBy = filteredRequest.createdBy;
      });
      await UserStorage.saveUserTags(req.user.tenantID, newUserID, filteredRequest.tags);

      // Synchronize badges with IOP
      const tenant = await TenantStorage.getTenant(req.user.tenantID);
      try {
        const ocpiClient: EmspOCPIClient = await OCPIClientFactory.getAvailableOcpiClient(tenant, Constants.OCPI_ROLE.EMSP) as EmspOCPIClient;
        if (ocpiClient) {
          for (const tag of filteredRequest.tags) {
            if (tag.issuer) {
              await ocpiClient.pushToken({
                uid: tag.id,
                type: 'RFID',
                'auth_id': newUserID,
                'visual_number': newUserID,
                issuer: tenant.name,
                valid: true,
                whitelist: 'ALLOWED_OFFLINE',
                'last_updated': new Date()
              });
            }
          }
        }
      } catch (e) {
        Logging.logError({
          tenantID: req.user.tenantID,
          module: 'UserService',
          method: 'handleCreateUser',
          action: 'UserCreate',
          message: `Unable to synchronize tokens of user ${newUserID} with IOP`,
          detailedMessages: e.message
        });
      }

      // Save User Status
      if (filteredRequest.status) {
        await UserStorage.saveUserStatus(req.user.tenantID, newUserID, filteredRequest.status);
      }
      // Save User Role
      if (filteredRequest.role) {
        await UserStorage.saveUserRole(req.user.tenantID, newUserID, filteredRequest.role);
      }
      // Save Admin Data
      if (filteredRequest.plateID || filteredRequest.hasOwnProperty('notificationsActive')) {
        const adminData: { plateID?: string; notificationsActive?: boolean; notifications?: UserNotifications } = {};
        if (filteredRequest.plateID) {
          adminData.plateID = filteredRequest.plateID;
        }
        if (filteredRequest.hasOwnProperty('notificationsActive')) {
          adminData.notificationsActive = filteredRequest.notificationsActive;
          if (filteredRequest.notifications) {
            adminData.notifications = filteredRequest.notifications;
          }
        }
        // Save User Admin data
        await UserStorage.saveUserAdminData(req.user.tenantID, newUserID, adminData);
      }
    }
    // Assign user to all sites with auto-assign flag set
    const sites = await SiteStorage.getSites(req.user.tenantID,
      { withAutoUserAssignment: true },
      Constants.DB_PARAMS_MAX_LIMIT
    );
    if (sites.count > 0) {
      const siteIDs = sites.result.map((site) => site.id);
      if (siteIDs && siteIDs.length > 0) {
        await UserStorage.addSitesToUser(req.user.tenantID, newUserID, siteIDs);
      }
    }
    // For integration with billing
    const billingImpl = await BillingFactory.getBillingImpl(req.user.tenantID);
    if (billingImpl) {
      const user = await UserStorage.getUser(req.user.tenantID, newUserID);
      try {
        const billingData = await billingImpl.createUser(user);
        await UserStorage.saveUserBillingData(req.user.tenantID, newUserID, billingData);
      } catch (e) {
        Logging.logError({
          tenantID: req.user.tenantID,
          module: 'UserService',
          method: 'handleUpdateUser',
          action: 'UserCreate',
          message: `User '${user.firstName} ${user.name}' cannot be created in Billing provider`,
          detailedMessages: e.message
        });
      }
    }

    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: req.user, actionOnUser: req.user,
      module: 'UserService', method: 'handleCreateUser',
      message: `User with ID '${newUserID}' has been created successfully`,
      action: action
    });
    // Ok
    res.json(Object.assign({ id: newUserID }, Constants.REST_RESPONSE_SUCCESS));
    next();
  }

  public static async handleGetUserInvoice(action: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Filter
    const id = UserSecurity.filterUserByIDRequest(req.query);
    // User mandatory
    if (!id) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'User\'s ID must be provided',
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action
      });
    }
    // Check auth
    if (!Authorizations.canReadUser(req.user, id)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.READ,
        entity: Entity.USER,
        module: 'UserService',
        method: 'handleGetUserInvoice',
        value: id
      });
    }
    // Get the user
    const user = await UserStorage.getUser(req.user.tenantID, id);
    if (!user) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${id}' does not exist anymore`,
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action
      });
    }
    // Deleted?
    if (user.deleted) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.OBJECT_DOES_NOT_EXIST_ERROR,
        message: `User with ID '${id}' is logically deleted`,
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action
      });
    }
    // Get the settings
    const pricingSetting = await SettingStorage.getPricingSettings(req.user.tenantID);
    if (!pricingSetting || !pricingSetting.convergentCharging) {
      Logging.logException(
        new Error('Convergent Charging setting is missing'),
        'UserInvoice', Constants.CENTRAL_SERVER, 'UserService', 'handleGetUserInvoice', req.user.tenantID, req.user);

      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPAuthError.ERROR,
        message: 'An issue occurred while creating the invoice',
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action
      });
    }
    // Create services
    const ratingService = new RatingService(pricingSetting.convergentCharging.url, pricingSetting.convergentCharging.user, pricingSetting.convergentCharging.password);
    const erpService = new ERPService(pricingSetting.convergentCharging.url, pricingSetting.convergentCharging.user, pricingSetting.convergentCharging.password);
    let invoiceNumber;
    try {
      await ratingService.loadChargedItemsToInvoicing();
      invoiceNumber = await erpService.createInvoice(req.user.tenantID, user);
    } catch (exception) {
      Logging.logException(exception, 'UserInvoice', Constants.CENTRAL_SERVER, 'UserService', 'handleGetUserInvoice', req.user.tenantID, req.user);

      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPAuthError.ERROR,
        message: 'An issue occurred while creating the invoice',
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action
      });
    }
    if (!invoiceNumber) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: 404,
        message: 'No invoices available',
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action
      });
    }
    try {
      const invoiceHeader = await erpService.getInvoiceDocumentHeader(invoiceNumber);
      let invoice = await erpService.getInvoiceDocument(invoiceHeader, invoiceNumber);
      if (!invoice) {
        // Retry to get invoice
        invoice = await erpService.getInvoiceDocument(invoiceHeader, invoiceNumber);
      }
      if (!invoice) {
        throw new AppError({
          source: Constants.CENTRAL_SERVER,
          errorCode: HTTPError.PRICING_REQUEST_INVOICE_ERROR,
          message: `An error occurred while requesting invoice ${invoiceNumber}`,
          module: 'UserService',
          method: 'handleGetUserInvoice',
          user: req.user,
          action: action
        });
      }
      const filename = 'invoice.pdf';
      fs.writeFile(filename, invoice, (err) => {
        if (err) {
          throw err;
        }
        res.download(filename, (err2) => {
          if (err2) {
            throw err2;
          }
          fs.unlink(filename, (err3) => {
            if (err3) {
              throw err3;
            }
          });
        });
      });
    } catch (e) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.PRICING_REQUEST_INVOICE_ERROR,
        message: `An error occurred while requesting invoice ${invoiceNumber}`,
        module: 'UserService',
        method: 'handleGetUserInvoice',
        user: req.user,
        action: action,
        detailedMessages: e
      });
    }
  }
}
