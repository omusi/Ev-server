import { BillingSetting, BillingSettingsType, SettingDB, StripeBillingSetting } from '../../src/types/Setting';
import chai, { assert, expect } from 'chai';
import Billing from '../../src/integration/billing/Billing';
import CONTEXTS from './contextProvider/ContextConstants';
import CentralServerService from './client/CentralServerService';
import { default as ClientConstants } from './client/utils/Constants';
import Constants from '../../src/utils/Constants';
import ContextProvider from './contextProvider/ContextProvider';
import Cypher from '../../src/utils/Cypher';
import Factory from '../factories/Factory';
import { HTTPAuthError } from '../../src/types/HTTPError';
import { ObjectID } from 'mongodb';
import SiteContext from './contextProvider/SiteContext';
import StripeBilling from '../../src/integration/billing/stripe/StripeBilling';
import TenantContext from './contextProvider/TenantContext';
import User from '../../src/types/User';
import chaiSubset from 'chai-subset';
import config from '../config';

chai.use(chaiSubset);

const billingSettings = {
  url: config.get('billing.url'),
  publicKey: config.get('billing.publicKey'),
  secretKey: config.get('billing.secretKey'),
  noCardAllowed: config.get('billing.noCardAllowed'),
  advanceBillingAllowed: config.get('billing.advanceBillingAllowed'),
  currency: config.get('billing.currency'),
  immediateBillingAllowed: config.get('billing.immediateBillingAllowed'),
  periodicBillingAllowed: config.get('billing.periodicBillingAllowed')
} as StripeBillingSetting;

let billingImpl: Billing<BillingSetting>;

class TestData {
  public tenantContext: TenantContext;
  public centralUserContext: any;
  public centralUserService: CentralServerService;
  public userContext: any;
  public userService: CentralServerService;
  public siteContext: SiteContext;
  public createdUsers: User[] = [];
}

const testData: TestData = new TestData();

describe('Billing Service', function() {
  this.timeout(1000000);
  describe('With component Billing (tenant ut-billing)', () => {
    before(async () => {
      testData.tenantContext = await ContextProvider.DefaultInstance.getTenantContext(CONTEXTS.TENANT_CONTEXTS.TENANT_BILLING);
      testData.centralUserContext = testData.tenantContext.getUserContext(CONTEXTS.USER_CONTEXTS.DEFAULT_ADMIN);
      testData.userContext = testData.tenantContext.getUserContext(CONTEXTS.USER_CONTEXTS.DEFAULT_ADMIN);
      expect(testData.userContext).to.not.be.null;
      testData.centralUserService = new CentralServerService(
        testData.tenantContext.getTenant().subdomain,
        testData.centralUserContext
      );
    });

    describe('Where admin user', () => {
      before(async () => {
        testData.userContext = testData.tenantContext.getUserContext(CONTEXTS.USER_CONTEXTS.DEFAULT_ADMIN);
        assert(testData.userContext, 'User context cannot be null');
        if (testData.userContext === testData.centralUserContext) {
          // Reuse the central user service (to avoid double login)
          testData.userService = testData.centralUserService;
        } else {
          testData.userService = new CentralServerService(
            testData.tenantContext.getTenant().subdomain,
            testData.userContext
          );
        }
        assert(!!testData.userService, 'User service cannot be null');
        const tenant = testData.tenantContext.getTenant();
        if (tenant.id) {
          const tenantBillingSettings = await testData.userService.settingApi.readAll({ 'Identifier': 'billing' });
          expect(tenantBillingSettings.data.count).to.be.eq(1);
          const componentSetting: SettingDB = tenantBillingSettings.data.result[0];
          componentSetting.content.type = BillingSettingsType.STRIPE;
          componentSetting.content.stripe = { ...billingSettings };
          componentSetting.sensitiveData = ['content.stripe.secretKey'];
          await testData.userService.settingApi.update(componentSetting);

          billingSettings.secretKey = Cypher.encrypt(billingSettings.secretKey);
          billingImpl = new StripeBilling(tenant.id, billingSettings);
          expect(billingImpl).to.not.be.null;
        } else {
          throw new Error(`Unable to get Tenant ID for tenant : ${CONTEXTS.TENANT_CONTEXTS.TENANT_BILLING}`);
        }
      });

      it('Should connect to Billing Provider', async () => {
        const response = await testData.userService.billingApi.testConnection({}, ClientConstants.DEFAULT_PAGING, ClientConstants.DEFAULT_ORDERING);
        expect(response.data).containSubset({ connectionIsValid: true });
        expect(response.data).containSubset(Constants.REST_RESPONSE_SUCCESS);
      });

      it('Should create a user', async () => {
        const fakeUser = {
          ...Factory.user.build(),
          billingData: {
            method: 'immediate'
          }
        } as User;

        await testData.userService.createEntity(
          testData.userService.userApi,
          fakeUser
        );
        testData.createdUsers.push(fakeUser);

        const exists = await billingImpl.userExists(fakeUser);
        expect(exists).to.be.true;
      });

      it('Should update a user', async () => {
        testData.createdUsers[0].firstName = 'Test';
        testData.createdUsers[0].name = 'Name';
        await testData.userService.updateEntity(
          testData.userService.userApi,
          testData.createdUsers[0],
          false
        );

        const billingUser = await billingImpl.getUserByEmail(testData.createdUsers[0].email);
        expect(billingUser.name).to.be.eq(testData.createdUsers[0].firstName + ' ' + testData.createdUsers[0].name);
      });

      it('Should delete a user', async () => {
        await testData.userService.deleteEntity(
          testData.userService.userApi,
          { id: testData.createdUsers[0].id }
        );

        const exists = await billingImpl.userExists(testData.createdUsers[0]);
        expect(exists).to.be.false;
        testData.createdUsers.pop();
      });

      it('Should force a user synchronization', async () => {
        const fakeUser = {
          ...Factory.user.build(),
          billingData: {
            method: 'immediate'
          }
        } as User;

        await testData.userService.createEntity(
          testData.userService.userApi,
          fakeUser
        );
        testData.createdUsers.push(fakeUser);
        const response = await testData.userService.userApi.getByEmail(fakeUser.email);
        const billingUserBefore = response.data.result[0];
        await testData.userService.billingApi.forceUserSynchronization({ id: fakeUser.id });
        const billingUserAfter = await billingImpl.getUserByEmail(fakeUser.email);
        expect(billingUserBefore.billingData.customerID).to.not.be.eq(billingUserAfter.billingData.customerID);
      });

      after(async () => {
        for (const user of testData.createdUsers) {
          await testData.userService.deleteEntity(
            testData.userService.userApi,
            user
          );
        }
      });
    });

    describe('Where basic user', () => {
      before(async () => {
        testData.tenantContext = await ContextProvider.DefaultInstance.getTenantContext(CONTEXTS.TENANT_CONTEXTS.TENANT_BILLING);
        testData.centralUserContext = testData.tenantContext.getUserContext(CONTEXTS.USER_CONTEXTS.BASIC_USER);
        testData.userContext = testData.tenantContext.getUserContext(CONTEXTS.USER_CONTEXTS.BASIC_USER);
        expect(testData.userContext).to.not.be.null;
        testData.centralUserService = new CentralServerService(
          testData.tenantContext.getTenant().subdomain,
          testData.centralUserContext
        );
        if (testData.userContext === testData.centralUserContext) {
          // Reuse the central user service (to avoid double login)
          testData.userService = testData.centralUserService;
        } else {
          testData.userService = new CentralServerService(
            testData.tenantContext.getTenant().subdomain,
            testData.userContext
          );
        }
        expect(testData.userService).to.not.be.null;
        const tenant = testData.tenantContext.getTenant();
        if (tenant.id) {
          const tenantBillingSettings = await testData.userService.settingApi.readAll({ 'Identifier': 'billing' });
          expect(tenantBillingSettings.data.count).to.be.eq(1);
          const componentSetting: SettingDB = tenantBillingSettings.data.result[0];
          componentSetting.content.type = BillingSettingsType.STRIPE;
          componentSetting.content.stripe = { ...billingSettings };
          componentSetting.sensitiveData = ['content.stripe.secretKey'];
          await testData.userService.settingApi.update(componentSetting);

          billingSettings.secretKey = Cypher.encrypt(billingSettings.secretKey);
          billingImpl = new StripeBilling(tenant.id, billingSettings);
          expect(billingImpl).to.not.be.null;
        } else {
          throw new Error(`Unable to get Tenant ID for tenant : ${CONTEXTS.TENANT_CONTEXTS.TENANT_BILLING}`);
        }
      });

      it('Should not be able to test connection to Billing Provider', async () => {
        const response = await testData.userService.billingApi.testConnection({}, ClientConstants.DEFAULT_PAGING, ClientConstants.DEFAULT_ORDERING);
        expect(response.status).to.be.eq(HTTPAuthError.ERROR);
      });

      it('Should not create a user', async () => {
        const fakeUser = {
          ...Factory.user.build(),
          billingData: {
            method: 'immediate'
          }
        } as User;

        const response = await testData.userService.createEntity(
          testData.userService.userApi,
          fakeUser,
          false
        );
        testData.createdUsers.push(fakeUser);
        expect(response.status).to.be.eq(HTTPAuthError.ERROR);
      });

      it('Should not update a user', async () => {
        const fakeUser = {
          id: new ObjectID(),
          ...Factory.user.build(),
          billingData: {
            method: 'immediate'
          }
        } as User;
        fakeUser.firstName = 'Test';
        fakeUser.name = 'Name';
        const response = await testData.userService.updateEntity(
          testData.userService.userApi,
          fakeUser,
          false
        );
        expect(response.status).to.be.eq(HTTPAuthError.ERROR);
      });

      it('Should not delete a user', async () => {
        const response = await testData.userService.deleteEntity(
          testData.userService.userApi,
          { id: 0 },
          false
        );

        expect(response.status).to.be.eq(HTTPAuthError.ERROR);
      });

      it('Should not force synchronization of a user', async () => {
        const fakeUser = {
          ...Factory.user.build(),
          billingData: {
            method: 'immediate'
          }
        } as User;
        const response = await testData.userService.billingApi.forceUserSynchronization({ UserID: fakeUser.id });

        expect(response.status).to.be.eq(HTTPAuthError.ERROR);
      });
    });
  });
});
