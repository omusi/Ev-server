import Billing, { BillingDataStart, BillingDataStop, BillingDataUpdate, BillingResponse, BillingSettings, BillingUserData } from '../Billing';
import ChargingStationStorage from '../../../storage/mongodb/ChargingStationStorage';
import { Request } from 'express';
import { StripeBillingSettings } from '../../../types/Setting';
import Transaction from '../../../types/Transaction';
import User from '../../../types/User';
import UserStorage from '../../../storage/mongodb/UserStorage';

import AppError from '../../../exception/AppError';
import Constants from '../../../utils/Constants';
import Cypher from '../../../utils/Cypher';
import Logging from '../../../utils/Logging';
import Utils from '../../../utils/Utils';

import moment from 'moment';
import sanitize from 'mongo-sanitize';

// Recommended import:
// import * as Stripe from 'stripe';
import Stripe from 'stripe';

export interface StripeBillingSettingsContent extends BillingSettings, StripeBillingSettings {
}

export interface TransactionIdemPotencyKey {
  transactionID: number;
  keyNewInvoiceItem: string;
  keyNewInvoice: string;
  timestamp: number;
}

export default class StripeBilling extends Billing<StripeBillingSettingsContent> {
  private static transactionIdemPotencyKeys: TransactionIdemPotencyKey[];
  private stripe: Stripe;

  constructor(tenantId: string, settings: StripeBillingSettings, currency: string) {
    const stripeSettings: StripeBillingSettingsContent = settings as StripeBillingSettingsContent;
    stripeSettings.currency = currency;
    super(tenantId, stripeSettings);
    if (this.settings.secretKey) {
      this.settings.secretKey = Cypher.decrypt(stripeSettings.secretKey);
    }
    // Currently the public key is not encrypted

    try {
      this.stripe = new Stripe(this.settings.secretKey);
    } catch (error) {
      delete this.stripe;
    }

    // Delete outdated keys for creating new invoices and invoice items
    if (StripeBilling.transactionIdemPotencyKeys && StripeBilling.transactionIdemPotencyKeys.length > 0) {
      const timeNow = new Date();
      const pastTimeStamp = timeNow.getTime() - 24 * 60 * 60 * 1000; // Go back 24 hours
      StripeBilling.transactionIdemPotencyKeys = StripeBilling.transactionIdemPotencyKeys.filter((record) => record.timestamp > pastTimeStamp);
    }
  }

  public async checkConnection(key?: string): Promise<BillingResponse> {
    if (!key && !this.settings.secretKey) {
      return {
        success: false,
        message: 'No secret key provided for connection to Stripe'
      };
    }

    let keyForCheck = this.settings.secretKey;
    if (key) {
      keyForCheck = sanitize(key);
    }

    // Validate the connection
    let isKeyValid = false;
    let stripeRef: Stripe;
    try {
      if (keyForCheck === this.settings.secretKey) {
        if (!this.stripe) {
          this.stripe = new Stripe(this.settings.secretKey);
        }
        stripeRef = this.stripe;
      } else {
        stripeRef = new Stripe(keyForCheck);
      }
      const list = await stripeRef.customers.list(
        { limit: 1 }
      );
      if (('object' in list) &&
        (list['object'] === 'list')) {
        isKeyValid = true;
      }
    } catch (error) {
      // Invalid
    }

    if (isKeyValid) {
      return {
        success: true,
        message: 'Valid secret key was provided to successfully connect to Stripe.'
      };
    }
    return {
      success: false,
      message: 'Provided secret key for Stripe is not valid.'
    };
  }

  public async synchronizeUser(user: User): Promise<BillingResponse> {
    const buildReq: Partial<Request> = {};
    buildReq.body = {};
    if (user.email) {
      buildReq.body.email = user.email;
    }
    if (user.name) {
      buildReq.body.name = user.name;
    }
    if (user.firstName) {
      buildReq.body.firstName = user.firstName;
    }
    if (user.locale) {
      buildReq.body.locale = user.locale;
    }
    const fullReq = buildReq as Request;
    if (!user.billingData) {
      user.billingData = {} as BillingUserData;
    }
    const oldCustomerID = user.billingData.customerID;
    const oldLastUpdate = user.billingData.lastUpdate;
    const response = await this.updateUser(user, fullReq);
    if (response.customerID) {
      await UserStorage.saveUserBillingData(this.tenantId, user.id, response);
      if (oldCustomerID) {
        if (oldLastUpdate !== response.lastUpdate) {
          return {
            success: true,
            message: 'updated'
          };
        }
        return {
          success: true,
          message: 'unchanged'
        };
      }
      return {
        success: true,
        message: 'created'
      };
    }
    return {
      success: false,
      message: 'error'
    };
  }

  public async startTransaction(user: User, transaction: Transaction): Promise<BillingDataStart> {
    // Check configuration and user definition - it something is missing/invalid, set a status code, but
    // DO NOT STOP THE TRANSACTION

    // Error Codes:
    // blank or '00': OK
    // '01': No connection to Stripe or wrong secret key
    // '02': Transaction has no user ID
    // '03': User has no billing method or no customer in Stripe
    // '04': User is assigned to unknown billing method
    // '05': Selected billing method currently not supported
    // '06': User is not subscribed to Stripe billing plan
    // '07': Stripe subscription ID of the user is invalid
    // '08': Stripe customer ID of the user is invalid
    // '50': Invoice item could not be created (Stripe error)

    const connection = await this.checkConnection();
    if (!connection.success || !this.stripe) {
      return {
        errorCode: '01',
        errorCodeDesc: 'No connection to Stripe or wrong secret key'
      };
    }

    if (!transaction.userID) {
      return {
        errorCode: '02',
        errorCodeDesc: 'Transaction has no user ID'
      };
    }

    let billingUser: User;
    if ((!user || !user.billingData) && transaction.userID) {
      billingUser = await UserStorage.getUser(this.tenantId, transaction.userID);
    } else {
      billingUser = user;
    }

    if (!billingUser.billingData || !billingUser.billingData.customerID || !billingUser.billingData.method) {
      return {
        errorCode: '03',
        errorCodeDesc: 'Transaction user has no billing method or no customer in Stripe'
      };
    }

    if (billingUser.billingData.method !== Constants.BILLING_METHOD_IMMEDIATE &&
      billingUser.billingData.method !== Constants.BILLING_METHOD_PERIODIC &&
      billingUser.billingData.method !== Constants.BILLING_METHOD_ADVANCE) {
      return {
        errorCode: '04',
        errorCodeDesc: 'Transaction user is assigned to unknown billing method'
      };
    }

    if (billingUser.billingData.method === Constants.BILLING_METHOD_ADVANCE) {
      return {
        errorCode: '05',
        errorCodeDesc: `Selected billing method '${billingUser.billingData.method}' currently not supported`
      };
    }

    if (!billingUser.billingData.subscriptionID &&
      billingUser.billingData.method !== Constants.BILLING_METHOD_IMMEDIATE) {
      return {
        errorCode: '06',
        errorCodeDesc: 'Transaction user is not subscribed to Stripe billing plan'
      };
    }

    if (billingUser.billingData.subscriptionID &&
      billingUser.billingData.method !== Constants.BILLING_METHOD_IMMEDIATE) {
      const subscription = await this._getSubscription(billingUser.billingData.subscriptionID);
      if (!subscription || subscription['id'] !== billingUser.billingData.subscriptionID) {
        return {
          errorCode: '07',
          errorCodeDesc: 'Stripe subscription ID of the transaction user is invalid'
        };
      }
    }

    const customer = await this._getCustomer(billingUser);
    if (!customer || customer['id'] !== billingUser.billingData.customerID) {
      return {
        errorCode: '08',
        errorCodeDesc: 'Stripe customer ID of the transaction user is invalid'
      };
    }

    return {
      errorCode: '00',
      errorCodeDesc: 'OK'
    };
  }

  public async updateTransaction(transaction: Transaction): Promise<BillingDataUpdate> {
    // Only relevant for Advance Billing to stop the running transaction, if the credit amount is no more sufficient
    // TODO

    return {
      errorCode: transaction.billingData.errorCode ? transaction.billingData.errorCode : null,
      errorCodeDesc: transaction.billingData.errorCodeDesc ? transaction.billingData.errorCodeDesc : null,
      stopTransaction: false,
    };
  }

  public async stopTransaction(transaction: Transaction): Promise<BillingDataStop> {

    if (transaction.billingData.errorCode && transaction.billingData.errorCode !== '0'
      && transaction.billingData.errorCode !== '00') {
      Logging.logError({
        tenantID: this.tenantId,
        source: transaction.chargeBoxID,
        action: Constants.ACTION_STOP_TRANSACTION,
        user: transaction.userID,
        module: 'StripeBilling', method: 'stopTransaction',
        message: `Billing not possible for transaction '${transaction.id}'`,
        detailedMessages: `Impossible to create new invoice item in Stripe Billing for transaction '${transaction.id}' ` +
          `(error code: '${transaction.billingData.errorCode}')`
      });
      return {
        status: Constants.BILLING_STATUS_UNBILLED,
        errorCode: transaction.billingData.errorCode,
        errorCodeDesc: transaction.billingData.errorCodeDesc,
        invoiceStatus: null,
        invoiceItem: null
      };
    }

    // Create or update invoice in Stripe
    const user = await UserStorage.getUser(this.tenantId, transaction.userID);
    let locale = user.locale;
    locale = locale.substr(0, 2).toLocaleLowerCase();

    let description = '';
    // LOCALE_SUPPORT_NEEDED #BEGIN
    const chargeBox = await ChargingStationStorage.getChargingStation(this.tenantId, transaction.chargeBoxID);
    if (chargeBox && chargeBox.siteArea && chargeBox.siteArea.name) {
      if (locale === 'fr') {
        description = 'Charger {{totalConsumption}} kWh à {{siteArea}} (terminé à {{time}})';
      } else {
        description = 'Charging {{totalConsumption}} kWh at {{siteArea}} (finished at {{time}})';
      }
      description = description.replace('{{siteArea}}', chargeBox.siteArea.name);
    } else {
      if (locale === 'fr') {
        description = 'Charger {{totalConsumption}} kWh à la borne {{chargeBox}} (terminé à {{time}})';
      } else {
        description = 'Charging {{totalConsumption}} kWh at charging station {{chargeBox}} (finished at {{time}})';
      }
      description = description.replace('{{chargeBox}}', transaction.chargeBoxID);
    }
    description = description.replace('{{totalConsumption}}', `${Math.round(transaction.stop.totalConsumption / 100) / 10}`);
    description = description.replace('{{time}}', transaction.stop.timestamp.toLocaleTimeString(user.locale.replace('_', '-')));
    // LOCALE_SUPPORT_NEEDED #END

    let collectionMethod = 'send_invoice';
    let daysUntilDue = 30;
    if (user.billingData.cardID) {
      collectionMethod = 'charge_automatically';
      daysUntilDue = 0;
    }

    let invoiceStatus: string;
    let invoiceItem: string;
    let newInvoiceItem: Stripe.invoiceItems.InvoiceItem;
    let newInvoice: Stripe.invoices.IInvoice;

    let idemPotencyKey: TransactionIdemPotencyKey = {} as TransactionIdemPotencyKey;
    if (!StripeBilling.transactionIdemPotencyKeys) {
      idemPotencyKey.transactionID = transaction.id;
      idemPotencyKey.keyNewInvoice = Utils.generateGUID();
      idemPotencyKey.keyNewInvoiceItem = Utils.generateGUID();
      idemPotencyKey.timestamp = new Date().getTime();
      StripeBilling.transactionIdemPotencyKeys = [idemPotencyKey];
    } else {
      idemPotencyKey = StripeBilling.transactionIdemPotencyKeys.find((record) => record.transactionID === transaction.id);
      if (!idemPotencyKey || idemPotencyKey.transactionID !== transaction.id) {
        idemPotencyKey = {} as TransactionIdemPotencyKey;
        idemPotencyKey.transactionID = transaction.id;
        idemPotencyKey.keyNewInvoice = Utils.generateGUID();
        idemPotencyKey.keyNewInvoiceItem = Utils.generateGUID();
        idemPotencyKey.timestamp = new Date().getTime();
        StripeBilling.transactionIdemPotencyKeys.push(idemPotencyKey);
      }
    }
    try {
      switch (user.billingData.method) {

        case Constants.BILLING_METHOD_IMMEDIATE:
          // Create pending invoice item without subscription
          newInvoiceItem = await this.stripe.invoiceItems.create({
            customer: user.billingData.customerID,
            currency: this.settings.currency.toLocaleLowerCase(),
            amount: Math.round(transaction.stop.roundedPrice * 100),
            description: description
          }, {
            idempotency_key: idemPotencyKey.keyNewInvoiceItem
          });
          // Create invoice without subscription which automatically adds all pending invoice items
          if (collectionMethod === 'send_invoice') {
            newInvoice = await this.stripe.invoices.create({
              customer: user.billingData.customerID,
              billing: 'send_invoice',
              days_until_due: daysUntilDue,
              auto_advance: true
            }, {
              idempotency_key: idemPotencyKey.keyNewInvoice
            });
            newInvoice = await this.stripe.invoices.sendInvoice(newInvoice.id);
          } else {
            newInvoice = await this.stripe.invoices.create({
              customer: user.billingData.customerID,
              billing: 'charge_automatically',
              auto_advance: true
            }, {
              idempotency_key: idemPotencyKey.keyNewInvoice
            });
            newInvoice = await this.stripe.invoices.finalizeInvoice(newInvoice.id);
          }
          invoiceStatus = newInvoice.status;
          invoiceItem = newInvoiceItem.id;
          break;

        case Constants.BILLING_METHOD_PERIODIC:
          // Create new invoice item for next invoice to come
          // (with subscription, but usually this invoice does not yet exist!)
          newInvoiceItem = await this.stripe.invoiceItems.create({
            customer: user.billingData.customerID,
            subscription: user.billingData.subscriptionID,
            currency: this.settings.currency.toLocaleLowerCase(),
            amount: Math.round(transaction.stop.roundedPrice * 100),
            description: description
          }, {
            idempotency_key: idemPotencyKey.keyNewInvoiceItem
          });
          if (!newInvoiceItem.invoice) {
            invoiceStatus = 'pending';
          } else {
            if (typeof (newInvoiceItem.invoice) === 'string') {
              newInvoice.id = newInvoiceItem.invoice;
            } else {
              newInvoice = newInvoiceItem.invoice;
            }
            try {
              newInvoice = await this.stripe.invoices.retrieve(
                newInvoice.id
              );
              invoiceStatus = newInvoice.status;
            } catch (error) {
              invoiceStatus = 'unknown';
            }
          }
          invoiceItem = newInvoiceItem.id;
          break;

        // TODO: advance billing...
        default:

      }
    } catch (error) {
      Logging.logError({
        tenantID: this.tenantId,
        source: transaction.chargeBoxID,
        action: Constants.ACTION_STOP_TRANSACTION,
        user: transaction.userID,
        module: 'StripeBilling', method: 'stopTransaction',
        message: `Billing not possible for transaction '${transaction.id}'`,
        detailedMessages: `Impossible to create new invoice item in Stripe Billing for transaction '${transaction.id}' ` +
          '(error code: "50")'
      });
      return {
        status: Constants.BILLING_STATUS_UNBILLED,
        errorCode: '50',
        errorCodeDesc: 'Invoice item could not be created (Stripe error)',
        invoiceStatus: null,
        invoiceItem: null
      };
    }

    StripeBilling.transactionIdemPotencyKeys = StripeBilling.transactionIdemPotencyKeys.filter((record) => record.transactionID !== transaction.id);

    // TODO: log info message?

    return {
      status: Constants.BILLING_STATUS_BILLED,
      errorCode: '',
      errorCodeDesc: '',
      invoiceStatus: invoiceStatus,
      invoiceItem: invoiceItem,
    };
  }

  public async checkIfUserCanBeCreated(req: Request): Promise<void> {
    // Preliminary check to block creating a new user (optional - currently not used)
    const buildUser: Partial<User> = {};
    if (req.body.email) {
      buildUser.email = req.body.email;
    }
    if (req.body.name) {
      buildUser.name = req.body.name;
    }
    if (req.body.firstName) {
      buildUser.firstName = req.body.firstName;
    }
    if (req.body.locale) {
      buildUser.locale = req.body.locale;
    }
    const fullUser = buildUser as User;
    const response = await this._possibleToModifyUser(fullUser, req, true);
    // Throw an error
    if (!response.success) {
      throw new AppError(
        Constants.CENTRAL_SERVER,
        response.message,
        Constants.HTTP_GENERAL_ERROR, // TODO: use a new constant
        'UserService', 'handleCreateUser', req.user);
    }
  }

  public async checkIfUserCanBeUpdated(user: User, req: Request): Promise<void> {
    // Preliminary check to block changing a user (optional - currently not used)
    const response = await this._possibleToModifyUser(user, req);
    // Throw an error
    if (!response.success) {
      throw new AppError(
        Constants.CENTRAL_SERVER,
        response.message,
        Constants.HTTP_GENERAL_ERROR, // TODO: use a new constant
        'UserService', 'handleUpdateUser', req.user);
    }
  }

  public async checkIfUserCanBeDeleted(user: User, req: Request): Promise<void> {
    // Preliminary check to block deleting a user with open Billing data
    const response = await this._possibleToDeleteUser(user, req);
    // Throw an error
    if (!response.success) {
      throw new AppError(
        Constants.CENTRAL_SERVER,
        response.message,
        Constants.HTTP_GENERAL_ERROR, // TODO: use a new constant
        'UserService', 'handleDeleteUser', req.user);
    }
  }

  public async createUser(req: Request): Promise<BillingUserData> {
    const buildUser: Partial<User> = {};
    if (req.body.email) {
      buildUser.email = req.body.email;
    }
    if (req.body.name) {
      buildUser.name = req.body.name;
    }
    if (req.body.firstName) {
      buildUser.firstName = req.body.firstName;
    }
    if (req.body.locale) {
      buildUser.locale = req.body.locale;
    }
    const fullUser = buildUser as User;
    const response = await this._possibleToModifyUser(fullUser, req, true);
    if (!response.success) {
      Logging.logError({
        tenantID: this.tenantId,
        source: req.body.email,
        action: Constants.ACTION_CREATE,
        module: 'StripeBilling', method: 'createUser',
        message: `Impossible to create Stripe customer for user '${req.body.email}'`,
        detailedMessages: response.message
      });
      return {} as BillingUserData;
    }
    return await this._modifyUser(fullUser, req);
  }

  public async updateUser(user: User, req: Request): Promise<BillingUserData> {
    const response = await this._possibleToModifyUser(user, req);
    if (!response.success) {
      Logging.logError({
        tenantID: this.tenantId,
        source: user.email,
        action: Constants.ACTION_UPDATE,
        module: 'StripeBilling', method: 'updateUser',
        message: `Impossible to update Stripe customer for user '${user.email}'`,
        detailedMessages: response.message
      });
      return {} as BillingUserData;
    }
    return await this._modifyUser(user, req);
  }

  public async deleteUser(user: User, req: Request): Promise<void> {
    const response = await this._possibleToDeleteUser(user, req);
    if (!response.success) {
      Logging.logError({
        tenantID: this.tenantId,
        source: user.email,
        action: Constants.ACTION_DELETE,
        module: 'StripeBilling', method: 'deleteUser',
        message: `Impossible to delete Stripe customer for user '${user.email}'`,
        detailedMessages: response.message
      });
      return;
    }
    if (user.billingData && user.billingData.customerID) {
      const customer = await this._getCustomer(user, req);
      if (customer && customer['id']) {
        try {
          await this.stripe.customers.del(
            customer['id']
          );
        } catch (error) {
          Logging.logError({
            tenantID: this.tenantId,
            source: user.email,
            action: Constants.ACTION_DELETE,
            module: 'StripeBilling', method: 'deleteUser',
            message: `Impossible to delete Stripe customer for user '${user.email}'`,
            detailedMessages: error
          });
        }
      }
    }
  }

  private async _getCustomer(user: User, req?: Request): Promise<object> {
    try {
      if (user.billingData && user.billingData.customerID) {
        return await this.stripe.customers.retrieve(
          user.billingData.customerID
        );
      }
      const email = req.body.email ? sanitize(req.body.email) : user.email;
      if (email) {
        const list = await this.stripe.customers.list(
          { email: email, limit: 1 }
        );
        if (list && list['data'] && list['data'].length > 0) {
          return list['data'][0];
        }
      }
    } catch (error) {
      return {};
    }
    return {};
  }

  private async _getSubscription(subscriptionID: string): Promise<object> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionID);
    } catch (error) {
      return {};
    }
  }

  private async _possibleToModifyUser(user: User, req: Request, createUser = false): Promise<BillingResponse> {
    const response = await this.checkConnection();
    if (!response.success) {
      if (createUser) {
        return {
          success: false,
          message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. Reason: ${response.message}`
        };
      }
      return {
        success: false,
        message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. Reason: ${response.message}`
      };
    }

    if (!user.billingData || !user.billingData.customerID) {
      const existingCustomer = await this._getCustomer(user, req);
      if (existingCustomer && existingCustomer['email']) {
        return {
          success: false,
          message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
            `Reason: a customer with email ${existingCustomer['email']} already exists in Stripe`
        };
      }
    } else {
      try {
        await this.stripe.customers.retrieve(
          user.billingData.customerID
        );
      } catch (error) {
        return {
          success: false,
          message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
            `Reason: the customer ID '${user.billingData.customerID}' does not exist in Stripe`
        };
      }
    }

    const newPaymentMethod = req.body.paymentToken ? sanitize(req.body.paymentToken) : null;
    if (!newPaymentMethod && (!user.billingData || !user.billingData.cardID) && !this.settings.noCardAllowed) {
      if (createUser) {
        return {
          success: false,
          message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
            'Reason: Tenant settings require the selection of a payment method (card)'
        };
      }
      return {
        success: false,
        message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
          'Reason: Tenant settings require the selection of a payment method (card)'
      };
    }

    const billingMethod = this._retrieveBillingMethod(user, req);
    if (!billingMethod) {
      if (createUser) {
        return {
          success: false,
          message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
            'Reason: No billing method was selected'
        };
      }
      return {
        success: false,
        message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
          'Reason: No billing method was selected'
      };
    }

    if ((billingMethod === Constants.BILLING_METHOD_IMMEDIATE && !this.settings.immediateBillingAllowed) ||
      (billingMethod === Constants.BILLING_METHOD_PERIODIC && !this.settings.periodicBillingAllowed) ||
      (billingMethod === Constants.BILLING_METHOD_ADVANCE && !this.settings.advanceBillingAllowed)) {
      if (createUser) {
        return {
          success: false,
          message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
            `Reason: Billing method '${billingMethod}' not allowed by tenant settings`
        };
      }
      return {
        success: false,
        message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
          `Reason: Billing method '${billingMethod}' not allowed by tenant settings`
      };
    }

    let billingPlan = req.body.billingPlan ? sanitize(req.body.billingPlan) : null;
    if (!billingPlan && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      billingPlan = await this._retrieveBillingPlan();
    }

    if (!billingPlan && (!user.billingData || !user.billingData.subscriptionID) && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      if (createUser) {
        return {
          success: false,
          message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
            'Reason: No billing plan provided to create a subscription'
        };
      }
      return {
        success: false,
        message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
          'Reason: No billing plan provided to create a subscription'
      };
    }

    if (user.billingData && user.billingData.subscriptionID && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      const subscription = await this._getSubscription(user.billingData.subscriptionID);
      if (!subscription || subscription['id'] !== user.billingData.subscriptionID) {
        return {
          success: false,
          message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
            `Reason: Subscription with ID '${user.billingData.subscriptionID}' does not exist in Stripe`
        };
      }
    }

    if (billingPlan && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      const plan = await this._getBillingPlan(billingPlan);
      if (!plan || !plan['id'] || plan['id'] !== billingPlan) {
        if (createUser) {
          return {
            success: false,
            message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
              `Reason: Billing plan '${billingPlan}' does not exist`
          };
        }
        return {
          success: false,
          message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
            `Reason: Billing plan '${billingPlan}' does not exist`
        };
      } else if (plan['currency'].toLocaleLowerCase() !== this.settings.currency.toLocaleLowerCase()) {
        if (createUser) {
          return {
            success: false,
            message: `Customer cannot be created in Stripe for user ${user.firstName} ${user.name}. ` +
              `Reason: Billing plan '${billingPlan}' uses wrong currency ${plan['currency']}`
          };
        }
        return {
          success: false,
          message: `Customer cannot be updated in Stripe for user ${user.firstName} ${user.name}. ` +
            `Reason: Billing plan '${billingPlan}' uses wrong currency ${plan['currency']}`
        };
      }
    }

    return {
      success: true,
      message: 'OK'
    };
  }

  private _retrieveBillingMethod(user: User, req: Request): string {
    if (req.body.billingMethod) {
      return sanitize(req.body.billingMethod);
    }
    if (user.billingData && user.billingData.method) {
      return user.billingData.method;
    }
    // Take the first allowed method from the settings
    if (this.settings.immediateBillingAllowed) {
      return Constants.BILLING_METHOD_IMMEDIATE;
    }
    if (this.settings.periodicBillingAllowed) {
      return Constants.BILLING_METHOD_PERIODIC;
    }
    if (this.settings.advanceBillingAllowed) {
      return Constants.BILLING_METHOD_ADVANCE;
    }
  }

  private async _getBillingPlan(billingPlanID: string): Promise<object> {
    try {
      return await this.stripe.plans.retrieve(billingPlanID);
    } catch (error) {
      return {};
    }
  }

  private async _retrieveBillingPlan(): Promise<string> {
    // If not provided from the HTTP request (e.g. req.body.billingPlan), try to assign a billing plan from
    // somewhere else, for example a default plan from this.settings... TODO !!!
    return '';
  }

  private async _possibleToDeleteUser(user: User, req: Request): Promise<BillingResponse> {
    if (!user.billingData || !user.billingData.customerID) {
      return {
        success: true,
        message: `No Stripe customer assigned to user ${user.firstName} ${user.name}`
      };
    }

    const response = await this.checkConnection();
    if (!response.success) {
      return {
        success: false,
        message: `Customer cannot be deleted in Stripe for user ${user.firstName} ${user.name}. Reason: ${response.message}`
      };
    }

    const testMode = this._checkIfTestMode();
    if (testMode) {
      const customer = await this._getCustomer(user, req);
      if (customer && !customer['livemode']) {
        return {
          success: true,
          message: `Customer ID '${user.billingData.customerID}' can be deleted in Stripe (test mode)`
        };
      }
    }

    let list = await this.stripe.invoices.list(
      {
        customer: user.billingData.customerID,
        status: 'open',
      }
    );
    if (list && list.data && list.data.length > 0) {
      return {
        success: false,
        message: `Customer cannot be deleted in Stripe for user ${user.firstName} ${user.name}. ` +
          'Reason: Open invoices still exist in Stripe'
      };
    }

    list = await this.stripe.invoices.list(
      {
        customer: user.billingData.customerID,
        status: 'draft',
      }
    );
    if (list && list.data && list.data.length > 0) {
      return {
        success: false,
        message: `Customer cannot be deleted in Stripe for user ${user.firstName} ${user.name}. ` +
          'Reason: Draft invoices still exist in Stripe'
      };
    }

    const itemsList = await this.stripe.invoiceItems.list(
      {
        customer: user.billingData.customerID,
        pending: true,
      }
    );
    if (itemsList && itemsList.data && itemsList.data.length > 0) {
      return {
        success: false,
        message: `Customer cannot be deleted in Stripe for user ${user.firstName} ${user.name}. ` +
          'Reason: Pending invoice items still exist in Stripe'
      };
    }

    return {
      success: true,
      message: `Customer ID '${user.billingData.customerID}' can be deleted in Stripe`
    };
  }

  private _checkIfTestMode(): boolean {
    if (this.settings.secretKey.substr(0, 7) === 'sk_test') {
      return true;
    }
    return false;
  }

  private async _modifyUser(user: User, req: Request): Promise<BillingUserData> {
    const email = req.body.email ? sanitize(req.body.email) : user.email;
    const fullName = Utils.buildUserFullName(user, false);
    let update = false;

    let locale = req.body.locale ? sanitize(req.body.locale) : user.locale;
    locale = locale.substr(0, 2).toLocaleLowerCase();

    let description: string;
    // LOCALE_SUPPORT_NEEDED #BEGIN
    if (locale === 'fr') {
      description = 'Client généré pour {{email}}';
    } else {
      description = 'Generated customer for {{email}}';
    }
    description = description.replace('{{email}}', email);
    // LOCALE_SUPPORT_NEEDED #END

    let customer = await this._getCustomer(user, req);
    if (!customer['id']) {
      try {
        customer = await this.stripe.customers.create({
          email: email,
          description: description,
          name: fullName,
          preferred_locales: [locale]
        });
        update = true;
      } catch (error) {
        Logging.logError({
          tenantID: this.tenantId,
          source: user.email,
          action: Constants.ACTION_CREATE,
          module: 'StripeBilling', method: '_modifyUser',
          message: `Impossible to create Stripe customer for user '${user.email}'`,
          detailedMessages: error
        });
        return {} as BillingUserData;
      }
    }

    if (customer['email'] !== email) {
      try {
        customer = await this.stripe.customers.update(
          customer['id'],
          { email: email }
        );
        update = true;
      } catch (error) {
        Logging.logError({
          tenantID: this.tenantId,
          source: user.email,
          action: Constants.ACTION_UPDATE,
          module: 'StripeBilling', method: '_modifyUser',
          message: `Impossible to update Stripe customer for user '${user.email}'`,
          detailedMessages: error
        });
        return {} as BillingUserData;
      }
    }

    if (customer['description'] !== description) {
      try {
        customer = await this.stripe.customers.update(
          customer['id'],
          { description: description }
        );
        update = true;
      } catch (error) {
        Logging.logError({
          tenantID: this.tenantId,
          source: user.email,
          action: Constants.ACTION_UPDATE,
          module: 'StripeBilling', method: '_modifyUser',
          message: `Impossible to update Stripe customer for user '${user.email}'`,
          detailedMessages: error
        });
        return {} as BillingUserData;
      }
    }

    if (customer['name'] !== fullName) {
      try {
        customer = await this.stripe.customers.update(
          customer['id'],
          { name: fullName }
        );
        update = true;
      } catch (error) {
        Logging.logError({
          tenantID: this.tenantId,
          source: user.email,
          action: Constants.ACTION_UPDATE,
          module: 'StripeBilling', method: '_modifyUser',
          message: `Impossible to update Stripe customer for user '${user.email}'`,
          detailedMessages: error
        });
        return {} as BillingUserData;
      }
    }

    if (locale) {
      if (!customer['preferred_locales'] ||
        customer['preferred_locales'].length === 0 ||
        customer['preferred_locales'][0] !== locale) {
        try {
          customer = await this.stripe.customers.update(
            customer['id'],
            { preferred_locales: null }
          );
          customer = await this.stripe.customers.update(
            customer['id'],
            { preferred_locales: [locale] }
          );
          update = true;
        } catch (error) {
          Logging.logError({
            tenantID: this.tenantId,
            source: user.email,
            action: Constants.ACTION_UPDATE,
            module: 'StripeBilling', method: '_modifyUser',
            message: `Impossible to update Stripe customer for user '${user.email}'`,
            detailedMessages: error
          });
          return {} as BillingUserData;
        }
      }
    }

    const newSource = req.body.paymentToken ? sanitize(req.body.paymentToken) : null;
    if (newSource) {
      try {
        customer = await this.stripe.customers.update(
          customer['id'],
          { source: newSource }
        );
        update = true;
      } catch (error) {
        Logging.logError({
          tenantID: this.tenantId,
          source: user.email,
          action: Constants.ACTION_UPDATE,
          module: 'StripeBilling', method: '_modifyUser',
          message: `Impossible to update Stripe customer for user '${user.email}'`,
          detailedMessages: error
        });
        return {} as BillingUserData;
      }
    }

    const billingMethod = this._retrieveBillingMethod(user, req);
    let collectionMethod;
    let daysUntilDue = 0;
    if (!customer['default_source'] && (!user.billingData || !user.billingData.cardID)) {
      collectionMethod = 'send_invoice';
      daysUntilDue = 30;
    } else {
      collectionMethod = 'charge_automatically';
    }

    let billingPlan = req.body.billingPlan ? sanitize(req.body.billingPlan) : null;
    if (!billingPlan && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      billingPlan = await this._retrieveBillingPlan();
    }

    if (user.billingData && user.billingData.subscriptionID && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      // Check whether existing subscription needs to be updated
      const oldSubscription = await this._getSubscription(user.billingData.subscriptionID);
      if (collectionMethod === 'charge_automatically' && oldSubscription['billing'] === 'send_invoice') {
        try {
          await this.stripe.subscriptions.update(
            user.billingData.subscriptionID,
            {
              billing: collectionMethod,
            });
          update = true;
        } catch (error) {
          Logging.logError({
            tenantID: this.tenantId,
            source: user.email,
            action: Constants.ACTION_UPDATE,
            module: 'StripeBilling', method: '_modifyUser',
            message: `Impossible to update Stripe subscription for user '${user.email}'`,
            detailedMessages: error
          });
          return {} as BillingUserData;
        }
      }
      if (billingPlan && billingPlan !== oldSubscription['plan']) {
        try {
          await this.stripe.subscriptions.update(
            user.billingData.subscriptionID,
            {
              plan: billingPlan,
            });
          update = true;
        } catch (error) {
          Logging.logError({
            tenantID: this.tenantId,
            source: user.email,
            action: Constants.ACTION_UPDATE,
            module: 'StripeBilling', method: '_modifyUser',
            message: `Impossible to update Stripe subscription for user '${user.email}'`,
            detailedMessages: error
          });
          return {} as BillingUserData;
        }
      }
    }

    let newSubscription = user.billingData ? user.billingData.subscriptionID : null;
    if (!newSubscription && billingMethod !== Constants.BILLING_METHOD_IMMEDIATE) {
      // Create subscription
      let billingCycleAnchor = moment().unix(); // Now
      const plan = await this._getBillingPlan(billingPlan);
      if (plan['interval'] === 'year' || plan['interval'] === 'month') {
        billingCycleAnchor = moment().endOf('month').add(1, 'day').unix(); // Begin of next month
      }
      let subscription: Stripe.subscriptions.ISubscription;
      try {
        if (collectionMethod === 'send_invoice') {
          subscription = await this.stripe.subscriptions.create({
            customer: customer['id'],
            items: [
              {
                plan: billingPlan,
              }
            ],
            billing_cycle_anchor: billingCycleAnchor,
            billing: 'send_invoice',
            days_until_due: daysUntilDue,
          });
        } else {
          subscription = await this.stripe.subscriptions.create({
            customer: customer['id'],
            items: [
              {
                plan: billingPlan,
              }
            ],
            billing_cycle_anchor: billingCycleAnchor,
            billing: 'charge_automatically',
          });
        }
        update = true;
      } catch (error) {
        Logging.logError({
          tenantID: this.tenantId,
          source: user.email,
          action: Constants.ACTION_CREATE,
          module: 'StripeBilling', method: '_modifyUser',
          message: `Impossible to create Stripe subscription for user '${user.email}'`,
          detailedMessages: error
        });
        return {} as BillingUserData;
      }
      newSubscription = subscription['id'];
    }

    let lastUpdate = (user.billingData && user.billingData.lastUpdate) ? user.billingData.lastUpdate : null;
    if (update || !lastUpdate) {
      lastUpdate = new Date();
    }
    return {
      method: billingMethod,
      customerID: customer['id'],
      cardID: customer['default_source'] ? customer['default_source'] : null,
      subscriptionID: newSubscription ? newSubscription : null,
      lastUpdate: lastUpdate
    };
  }

}
