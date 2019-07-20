import faker from 'faker';
import TenantContext from './TenantContext';
import Utils from '../../../src/utils/Utils';
import CentralServerService from '../client/CentralServerService';
import CONTEXTS from '../contextProvider/ContextConstants';

export default class ChargingStationContext {

  private chargingStation: any;
  private tenantContext: TenantContext;
  private transactionsStarted: any;
  private transactionsStopped: any;
  private userService: CentralServerService;

  constructor(chargingStation, tenantContext) {
    this.chargingStation = chargingStation;
    this.tenantContext = tenantContext;
    this.transactionsStarted = [];
    this.transactionsStopped = [];
  }

  async cleanUpCreatedData() {
    // Clean up transactions
    for (const transaction of this.transactionsStarted) {
      await this.tenantContext.getAdminCentralServerService().transactionApi.delete(transaction.transactionId);
    }
  }

  getChargingStation() {
    return this.chargingStation;
  }

  addTransactionStarted(transaction) {
    this.transactionsStarted.push(transaction);
  }

  addTransactionStopped(transaction) {
    this.transactionsStopped.push(transaction);
  }

  async authorize(tagId) {
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeAuthorize(this.chargingStation.id, {
      idTag: tagId
    });
    return response;
  }

  async readChargingStation(userService?: CentralServerService) {
    if (userService) {
      this.userService = userService;
    } else if (!this.userService) {
      this.userService = new CentralServerService(this.tenantContext.getTenant().subdomain, this.tenantContext.getUserContext(CONTEXTS.USER_CONTEXTS.DEFAULT_ADMIN));
    }
    const response = await this.userService.chargingStationApi.readById(this.chargingStation.id);
    return response;
  }

  async sendHeartbeat() {
    const response = await await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeHeartbeat(this.chargingStation.id, {});
    return response;
  }

  async startTransaction(connectorId, tagId, meterStart, startDate) {
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeStartTransaction(this.chargingStation.id, {
      connectorId: connectorId,
      idTag: tagId,
      meterStart: meterStart,
      timestamp: startDate.toISOString()
    });
    if (response.data) {
      this.addTransactionStarted(response.data);
    }
    return response;
  }

  async stopTransaction(transactionId, tagId, meterStop, stopDate) {
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeStopTransaction(this.chargingStation.id, {
      transactionId: transactionId,
      idTag: tagId,
      meterStop: meterStop,
      timestamp: stopDate.toISOString()
    });
    if (response.data) {
      this.addTransactionStopped(response.data);
    }
    return response;
  }

  async sendConsumptionMeterValue(connectorId, transactionId, meterValue, timestamp) {
    let response;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === '1.6') {
      // Yes
      response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
        connectorId: connectorId,
        transactionId: transactionId,
        meterValue: {
          timestamp: timestamp.toISOString(),
          sampledValue: [{
            value: meterValue,
            format: 'Raw',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            location: 'Outlet',
            context: 'Sample.Periodic'
          }]
        },
      });
      // OCPP 1.5
    } else {
      response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
        connectorId: connectorId,
        transactionId: transactionId,
        values: {
          timestamp: timestamp.toISOString(),
          value: {
            $attributes: {
              unit: 'Wh',
              location: 'Outlet',
              measurand: 'Energy.Active.Import.Register',
              format: 'Raw',
              context: 'Sample.Periodic'
            },
            $value: meterValue
          }
        },
      });
    }
    return response;
  }

  async sendTransactionMeterValue(connectorId, transactionId, meterValue, meterSocValue, timestamp, withSoC = false) {
    let response;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === '1.6') {
      // Yes
      if (withSoC) {
        // With State of Charge ?
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: meterValue,
              unit: 'Wh',
              context: 'Sample.Periodic'
            }, {
              value: meterSocValue,
              unit: 'Percent',
              context: 'Sample.Periodic',
              measurand: 'SoC',
              location: 'EV'
            }]
          },
        });
      } else {
        // Regular case
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: meterValue,
              format: 'Raw',
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
              location: 'Outlet',
              context: 'Sample.Periodic'
            }]
          },
        });
      }
    } else {
      // OCPP 1.5 (only without SoC)
      response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
        connectorId: connectorId,
        transactionId: transactionId,
        values: {
          timestamp: timestamp.toISOString(),
          value: {
            $attributes: {
              unit: 'Wh',
              location: 'Outlet',
              measurand: 'Energy.Active.Import.Register',
              format: 'Raw',
              context: 'Sample.Periodic'
            },
            $value: meterValue
          }
        },
      });
    }
    return response;
  }

  async sendBeginMeterValue(connectorId, transactionId, meterValue, meterSocValue, signedValue, timestamp, withSoC = false, withSignedData = false) {
    let response;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === '1.6') {
      // Yes
      if (withSoC) {
        // With State of Charge ?
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: meterValue,
              unit: 'Wh',
              context: 'Transaction.Begin'
            }, {
              value: meterSocValue,
              unit: 'Percent',
              context: 'Transaction.Begin',
              measurand: 'SoC',
              location: 'EV'
            }]
          },
        });
      } else if (withSignedData) {
        // With SignedData ?
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: signedValue,
              unit: 'Wh',
              context: 'Transaction.Begin',
              format: 'SignedData'
            }, {
              value: meterValue,
              unit: 'Wh',
              context: 'Transaction.Begin'
            }]
          },
        });
      } else {
        // Regular case
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: meterValue,
              unit: 'Wh',
              context: 'Transaction.Begin'
            }]
          },
        });
      }
    } // Nothing for OCPP 1.5
    return response;
  }

  async sendEndMeterValue(connectorId, transactionId, meterValue, meterSocValue, signedValue, timestamp, withSoC = false, withSignedData = false) {
    let response;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === '1.6') {
      // Yes
      if (withSoC) {
        // With State of Charge ?
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: meterValue,
              unit: 'Wh',
              context: 'Transaction.End'
            }, {
              value: meterSocValue,
              unit: 'Percent',
              context: 'Transaction.End',
              measurand: 'SoC',
              location: 'EV'
            }]
          },
        });
      } else if (withSignedData) {
        // With SignedData ?
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: signedValue,
              unit: 'Wh',
              context: 'Transaction.End',
              format: 'SignedData'
            }, {
              value: meterValue,
              unit: 'Wh',
              context: 'Transaction.End'
            }]
          },
        });
      } else {
        // Regular case
        response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
          connectorId: connectorId,
          transactionId: transactionId,
          meterValue: {
            timestamp: timestamp.toISOString(),
            sampledValue: [{
              value: meterValue,
              unit: 'Wh',
              context: 'Transaction.End'
            }]
          },
        });
      }
    } // Nothing for OCPP 1.5
    return response;
  }

  async sendSoCMeterValue(connectorId, transactionId, meterValue, timestamp) {
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
      connectorId: connectorId,
      transactionId: transactionId,
      meterValue: {
        timestamp: timestamp.toISOString(),
        sampledValue: [{
          value: meterValue,
          format: 'Raw',
          measurand: 'SoC',
          context: 'Sample.Periodic'
        }]

      },
    });
    return response;
  }

  async sendClockMeterValue(connectorId, transactionId, meterValue, timestamp) {
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeMeterValues(this.chargingStation.id, {
      connectorId: connectorId,
      transactionId: transactionId,
      meterValue: {
        timestamp: timestamp.toISOString(),
        sampledValue: [{
          value: meterValue,
          format: 'Raw',
          measurand: 'Energy.Active.Import.Register',
          unit: 'Wh',
          location: 'Outlet',
          context: 'Sample.Clock'
        }]

      },
    });
    return response;
  }

  async setConnectorStatus(connector) {
    if (!('connectorId' in connector)) {
      connector.connectorId = 1;
    }
    if (!('status' in connector)) {
      connector.status = 'Available';
    }
    if (!('errorCode' in connector)) {
      connector.errorCode = 'NoError';
    }
    if (!('timestamp' in connector)) {
      connector.timestamp = new Date().toISOString;
    }
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeStatusNotification(this.chargingStation.id, connector);
    this.chargingStation.connectors[connector.connectorId - 1].status = connector.status;
    this.chargingStation.connectors[connector.connectorId - 1].errorCode = connector.errorCode;
    this.chargingStation.connectors[connector.connectorId - 1].timestamp = connector.timestamp;
    return response;
  }

  async transferData(data) {
    const response = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion).executeDataTransfer(this.chargingStation.id, data);
    return response;
  }

  getConfiguration() {
    const configuration: any = {
      'stationTemplate': {
        'baseName': 'CS-' + faker.random.alphaNumeric(10),
        'chargePointModel': this.chargingStation.chargePointModel,
        'chargePointVendor': this.chargingStation.chargePointVendor,
        'power': [7200, 16500, 22000, 50000],
        'powerUnit': 'W',
        'numberOfConnectors': this.chargingStation.connectors.length,
        'randomConnectors': false,
        'Configuration': {
          'NumberOfConnectors': this.chargingStation.connectors.length,
          'param1': 'test',
          'meterValueInterval': 60
        },
        'AutomaticTransactionGenerator': {
          'enable': true,
          'minDuration': 70,
          'maxDuration': 180,
          'minDelayBetweenTwoTransaction': 30,
          'maxDelayBetweenTwoTransaction': 60,
          'probabilityOfStart': 1,
          'stopAutomaticTransactionGeneratorAfterHours': 0.3
        },
        'Connectors': {}
      }
    };
    this.chargingStation.connectors.forEach((connector) => {
      configuration.Connectors[connector.connectorId] = {
        'MeterValues': [{
          'unit': 'Percent',
          'context': 'Sample.Periodic',
          'measurand': 'SoC',
          'location': 'EV'
        }, {
          'unit': 'Wh',
          'context': 'Sample.Periodic'
        }]
      };
    });
    return configuration;
  }
}
