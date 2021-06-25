import { HttpUserAssignSitesRequest, HttpUsersInErrorRequest, HttpUsersRequest } from '../../../../types/requests/HttpUserRequest';
import User, { ImportedUser } from '../../../../types/User';

import HttpByIDRequest from '../../../../types/requests/HttpByIDRequest';
import Schema from '../../../../types/validator/Schema';
import SchemaValidator from './SchemaValidator';
import fs from 'fs';
import global from '../../../../types/GlobalType';

export default class UserValidator extends SchemaValidator {
  private static instance: UserValidator|null = null;
  private importedUserCreation: Schema;
  private userCreate: Schema;
  private userAssignSites: Schema;
  private userGetByID: Schema;
  private usersGet: Schema;
  private usersGetInError: Schema;

  private constructor() {
    super('UserValidator');
    this.importedUserCreation = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/imported-user-create-req.json`, 'utf8'));
    this.userCreate = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/user-create.json`, 'utf8'));
    this.userAssignSites = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/user-assign-sites.json`, 'utf8'));
    this.userGetByID = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/user-get.json`, 'utf8'));
    this.usersGet = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/users-get.json`, 'utf8'));
    this.usersGetInError = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/users-inerror-get.json`, 'utf8'));
  }

  public static getInstance(): UserValidator {
    if (!UserValidator.instance) {
      UserValidator.instance = new UserValidator();
    }
    return UserValidator.instance;
  }

  validateImportedUserCreation(importedUser: ImportedUser): void {
    this.validate(this.importedUserCreation, importedUser);
  }

  validateUserCreate(user: any): Partial<User> {
    this.validate(this.userCreate, user);
    user.password = user.passwords.password;
    return user;
  }

  validateUserAssignToSites(data: HttpUserAssignSitesRequest): HttpUserAssignSitesRequest {
    this.validate(this.userAssignSites, data);
    return data;
  }

  validateUserGetByID(data: any): HttpByIDRequest {
    this.validate(this.userGetByID, data);
    return data;
  }

  validateUsersGet(data: any): HttpUsersRequest {
    this.validate(this.usersGet, data);
    return data;
  }

  validateUsersGetInError(data: any): HttpUsersInErrorRequest {
    this.validate(this.usersGetInError, data);
    return data;
  }
}
