const moment = require('moment');
const {
  expect
} = require('chai');
const chai = require('chai');
const chaiSubset = require('chai-subset');
chai.use(chaiSubset);
const CentralServerService = require('./client/CentralServerService');
const OCPPBootstrap = require('./OCPPBootstrap');

class OCPPCommonTests {
  constructor(ocpp) {
    this.ocpp = ocpp;
  }

  async before() {
    // Create Bootstrap with OCPP
    this.bootstrap = new OCPPBootstrap(this.ocpp);
    // Create data
    this.context = await this.bootstrap.createContext();
    // Default Connector values
    this.chargingStationConnector1 = {
      connectorId: 1,
      status: 'Available',
      errorCode: 'NoError',
      timestamp: new Date().toISOString()
    };
    this.chargingStationConnector2 = {
      connectorId: 2,
      status: 'Available',
      errorCode: 'NoError',
      timestamp: new Date().toISOString()
    };
    // Set meter value start
    this.transactionStartUser = this.context.newUser;
    this.transactionStopUser = this.context.newUser;
    this.transactionStartTime = moment().subtract(1, "h")
    this.transactionStartMeterValue = 10000;
    this.transactionMeterValueIntervalSecs = 60;
    this.transactionMeterValues = [200, 10, 500, 250, 120, 50, 0, 0, 0, 100];
    this.transactionTotalConsumption = this.transactionMeterValues.reduce((sum, meterValue) => sum + meterValue);
    this.transactionEndMeterValue = this.transactionStartMeterValue + this.transactionTotalConsumption;
    this.transactionTotalInactivity = this.transactionMeterValues.reduce(
      (sum, meterValue, index) => (meterValue === 0 ? sum + this.transactionMeterValueIntervalSecs : (index === 1 ? 0 : sum)));
    if (this.transactionTotalInactivity > 0) {
      // Remove one
      this.transactionTotalInactivity -= this.transactionMeterValueIntervalSecs;
    }
  }

  async after() {
    // Destroy context
    await this.bootstrap.destroyContext(this.context);
  }

  async testConnectorStatus() {
    // Update Status of Connector 1
    let response = await this.ocpp.executeStatusNotification(this.context.tenantID, this.context.newChargingStation.id,this.chargingStationConnector1);
    // Check
    expect(response.data).to.eql({});
    // Check Connector 1
    await CentralServerService.chargingStationApi.checkConnector(
      this.context.newChargingStation, 1, this.chargingStationConnector1);


    // Update Status of Connector 2
    response = await this.ocpp.executeStatusNotification(this.context.tenantID, this.context.newChargingStation.id,this.chargingStationConnector2);
    // Check
    expect(response.data).to.eql({});
    // Check Connector 2
    await CentralServerService.chargingStationApi.checkConnector(
      this.context.newChargingStation, 2, this.chargingStationConnector2);
  }

  async testChangeConnectorStatus() {
    // Set it to Occupied
    this.chargingStationConnector1.status = 'Occupied';
    this.chargingStationConnector1.timestamp = new Date().toISOString();
    // Update
    let response = await this.ocpp.executeStatusNotification(this.context.tenantID, this.context.newChargingStation.id,this.chargingStationConnector1);
    // Check
    expect(response.data).to.eql({});

    // Check Connector 1
    await CentralServerService.chargingStationApi.checkConnector(
      this.context.newChargingStation, 1, this.chargingStationConnector1);

    // Connector 2 should be still available
    await CentralServerService.chargingStationApi.checkConnector(
      this.context.newChargingStation, 2, this.chargingStationConnector2);

    // Reset Status of Connector 1
    this.chargingStationConnector1.status = 'Available';
    this.chargingStationConnector1.timestamp = new Date().toISOString();
    // Update
    response = await this.ocpp.executeStatusNotification(this.context.tenantID, this.context.newChargingStation.id,this.chargingStationConnector1);
    // Check
    expect(response.data).to.eql({});

    // Check Connector 1
    await CentralServerService.chargingStationApi.checkConnector(
      this.context.newChargingStation, 1, this.chargingStationConnector1);
  }

  async testHeartbeat() {
    // Update Status of Connector 1
    let response = await this.ocpp.executeHeartbeat(this.context.tenantID, this.context.newChargingStation.id,{});
    // Check
    expect(response.data).to.have.property('currentTime');
  }

  async testDataTransfer() {
    // Check
    let response = await this.ocpp.executeDataTransfer(this.context.tenantID, this.context.newChargingStation.id,{
      "vendorId": "Schneider Electric",
      "messageId": "Detection loop",
      "data": "{\\\"connectorId\\\":2,\\\"name\\\":\\\"Vehicle\\\",\\\"state\\\":\\\"0\\\",\\\"timestamp\\\":\\\"2018-08-08T10:21:11Z:\\\"}",
      "chargeBoxID": this.context.newChargingStation.id,
      "timestamp": new Date().toDateString()
    });
    // Check
    expect(response.data).to.have.property('status');
    expect(response.data.status).to.equal('Accepted');
  }

  async testAuhtorize() {
    // Check
    let response = await this.ocpp.executeAuthorize(this.context.tenantID, this.context.newChargingStation.id,{
      idTag: this.transactionStartUser.tagIDs[0]
    });
    // Check
    expect(response.data).to.have.property('idTagInfo');
    expect(response.data.idTagInfo.status).to.equal('Accepted');

    // Check
    response = await this.ocpp.executeAuthorize(this.context.tenantID, this.context.newChargingStation.id,{
      idTag: this.transactionStopUser.tagIDs[0]
    });
    // Check
    expect(response.data).to.have.property('idTagInfo');
    expect(response.data.idTagInfo.status).to.equal('Accepted');
  }

  async testStartTransaction() {
    // Start a new Transaction
    this.newTransaction = await CentralServerService.transactionApi.startTransaction(
      this.ocpp,
      this.context.newChargingStation,
      this.chargingStationConnector1,
      this.transactionStartUser,
      this.transactionStartMeterValue,
      this.transactionStartTime);
    // Check on Transaction
    expect(this.newTransaction).to.not.be.null;
  }

  async testStartAgainTransaction() {
      // Check on Transaction
      expect(this.newTransaction).to.not.be.null;
      // Set
      let transactionId = this.newTransaction.id;
      this.transactionStartTime = moment().subtract(1, "h");
      // Clear old one
      this.newTransaction = null;

      // Start the Transaction
      this.newTransaction = await CentralServerService.transactionApi.startTransaction(
        this.ocpp,
        this.context.newChargingStation,
        this.chargingStationConnector1, 
        this.transactionStartUser,
        this.transactionStartMeterValue,
        this.transactionStartTime);
      // Check
      expect(this.newTransaction).to.not.be.null;
      expect(this.newTransaction.id).to.not.equal(transactionId);
  }

  async testSendMeterValues() {
      // Check on Transaction
      expect(this.newTransaction).to.not.be.null;
      // Current Time matches Transaction one
      this.transactionCurrentTime = moment(this.newTransaction.timestamp);
      // Start Meter Value matches Transaction one
      let transactionCurrentMeterValue = this.transactionStartMeterValue; 
      // Send Meter Values (except the last one which will be used in Stop Transaction)
      for (let index = 0; index <= this.transactionMeterValues.length-2; index++) {
        // Set new meter value
        transactionCurrentMeterValue += this.transactionMeterValues[index];
        // Add time
        this.transactionCurrentTime.add(this.transactionMeterValueIntervalSecs, "s");
        // Send Meter Values
        await CentralServerService.transactionApi.sendTransactionMeterValue(
          this.ocpp,
          this.newTransaction,
          this.context.newChargingStation,
          this.transactionStartUser,
          transactionCurrentMeterValue,
          this.transactionCurrentTime,
          this.transactionMeterValues[index] * this.transactionMeterValueIntervalSecs,
          transactionCurrentMeterValue - this.transactionStartMeterValue);
      }
  }

  async testStopTransaction() {
      // Check on Transaction
      expect(this.newTransaction).to.not.be.null;
      expect(this.transactionCurrentTime).to.not.be.null;

      // Set end time
      this.transactionCurrentTime.add(this.transactionMeterValueIntervalSecs, "s");

      // Stop the Transaction
      await CentralServerService.transactionApi.stopTransaction(
        this.ocpp,
        this.newTransaction,
        this.transactionStartUser,
        this.transactionStopUser,
        this.transactionEndMeterValue,
        this.transactionCurrentTime,
        this.chargingStationConnector1,
        this.transactionTotalConsumption,
        this.transactionTotalInactivity);
  }

  async testTransactionMetrics() {
      // Check on Transaction
      expect(this.newTransaction).to.not.be.null;

      // Get the consumption
      let response = await CentralServerService.transactionApi.readAllConsumption(this.newTransaction.id);
      expect(response.status).to.equal(200);
      // Check Headers
      expect(response.data).to.deep.include({
        "chargeBoxID": this.newTransaction.chargeBoxID,
        "connectorId": this.newTransaction.connectorId,
        "totalConsumption": this.transactionTotalConsumption,
        "transactionId": this.newTransaction.id,
        "user": {
          "id": this.transactionStartUser.id,
          "name": this.transactionStartUser.name,
          "firstName": this.transactionStartUser.firstName
        }
      });
      // Init
      let transactionCurrentTime = moment(this.newTransaction.timestamp);
      let transactionCumulatedConsumption = 0;
      // Check Consumption
      for (let i = 0; i < response.data.values.length; i++) {
        // Get the value
        const value = response.data.values[i];
        // Add time
        transactionCurrentTime.add(this.transactionMeterValueIntervalSecs, "s");
        // Sum
        transactionCumulatedConsumption += this.transactionMeterValues[i];
        // Check
        expect(value).to.include({
          "date": transactionCurrentTime.toISOString(),
          "value": this.transactionMeterValues[i] * this.transactionMeterValueIntervalSecs,
          "cumulated": transactionCumulatedConsumption
        });      
      }
  }

    async testDeleteTransaction() {
    // Delete the created entity
    await CentralServerService.deleteEntity(
      CentralServerService.transactionApi, this.newTransaction);
  }
}

module.exports = OCPPCommonTests;