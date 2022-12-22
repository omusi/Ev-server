import Tenant, { TenantComponents } from '../../../types/Tenant';

import Constants from '../../../utils/Constants';
import LockingHelper from '../../../locking/LockingHelper';
import LockingManager from '../../../locking/LockingManager';
import Logging from '../../../utils/Logging';
import OCPIClientFactory from '../../../client/ocpi/OCPIClientFactory';
import OCPIEndpoint from '../../../types/ocpi/OCPIEndpoint';
import OCPIEndpointStorage from '../../../storage/mongodb/OCPIEndpointStorage';
import { OCPIRegistrationStatus } from '../../../types/ocpi/OCPIRegistrationStatus';
import { OCPIRole } from '../../../types/ocpi/OCPIRole';
import { ServerAction } from '../../../types/Server';
import { TaskConfig } from '../../../types/TaskConfig';
import TenantSchedulerTask from '../../TenantSchedulerTask';
import Utils from '../../../utils/Utils';

const MODULE_NAME = 'OCPICheckLocationsTask';

export default class OCPICheckLocationsTask extends TenantSchedulerTask {
  public async processTenant(tenant: Tenant, config: TaskConfig): Promise<void> {
    try {
      // Check if OCPI component is active
      if (Utils.isTenantComponentActive(tenant, TenantComponents.OCPI)) {
        // Get all available endpoints
        const ocpiEndpoints = await OCPIEndpointStorage.getOcpiEndpoints(tenant, { role: OCPIRole.CPO }, Constants.DB_PARAMS_MAX_LIMIT);
        for (const ocpiEndpoint of ocpiEndpoints.result) {
          await this.processOCPIEndpoint(tenant, ocpiEndpoint);
        }
      }
    } catch (error) {
      // Log error
      await Logging.logActionExceptionMessage(tenant.id, ServerAction.OCPI_CPO_CHECK_SESSIONS, error);
    }
  }

  private async processOCPIEndpoint(tenant: Tenant, ocpiEndpoint: OCPIEndpoint): Promise<void> {
    // Get the lock
    const ocpiLock = await LockingHelper.createOCPICheckLocationsLock(tenant.id, ocpiEndpoint);
    if (ocpiLock) {
      try {
        // Check if OCPI endpoint is registered
        if (ocpiEndpoint.status !== OCPIRegistrationStatus.REGISTERED) {
          Logging.beDebug()?.log({
            tenantID: tenant.id,
            module: MODULE_NAME, method: 'processOCPIEndpoint',
            action: ServerAction.OCPI_CPO_CHECK_SESSIONS,
            message: `The OCPI endpoint '${ocpiEndpoint.name}' is not registered. Skipping the OCPI endpoint.`
          });
          return;
        }
        if (!ocpiEndpoint.backgroundPatchJob) {
          Logging.beDebug()?.log({
            tenantID: tenant.id,
            module: MODULE_NAME, method: 'processOCPIEndpoint',
            action: ServerAction.OCPI_CPO_CHECK_SESSIONS,
            message: `The OCPI endpoint '${ocpiEndpoint.name}' is inactive.`
          });
          return;
        }
        Logging.beInfo()?.log({
          tenantID: tenant.id,
          module: MODULE_NAME, method: 'processOCPIEndpoint',
          action: ServerAction.OCPI_CPO_CHECK_SESSIONS,
          message: `Check of Locations for endpoint '${ocpiEndpoint.name}' is being processed`
        });
        // Build OCPI Client
        const ocpiClient = await OCPIClientFactory.getCpoOcpiClient(tenant, ocpiEndpoint);
        // Check Locations
        const result = await ocpiClient.checkLocations();
        Logging.beInfo()?.log({
          tenantID: tenant.id,
          module: MODULE_NAME, method: 'processOCPIEndpoint',
          action: ServerAction.OCPI_CPO_CHECK_SESSIONS,
          message: `Check of Locations for endpoint '${ocpiEndpoint.name}' is completed`,
          detailedMessages: { result }
        });
      } catch (error) {
        await Logging.logActionExceptionMessage(tenant.id, ServerAction.OCPI_CPO_CHECK_LOCATIONS, error);
      } finally {
        await LockingManager.release(ocpiLock);
      }
    }
  }
}

