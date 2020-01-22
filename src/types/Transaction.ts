import { BillingTransactionData } from './Billing';
import ChargingStation from '../types/ChargingStation';
import Consumption from './Consumption';
import User from './User';
import { OCPPNormalizedMeterValue } from './ocpp/OCPPServer';
import { type } from 'os';

export type InactivityStatusLevel =
 'info' |
 'warning' |
 'danger'
;

export interface MultipleDeleteResult {
  deleted: number;
  notFound: number;
};

export interface MultipleTransactionsDeleteResult extends MultipleDeleteResult {
  refunded: number;
};

export enum InactivityStatus {
  INFO = 'I',
  WARNING = 'W',
  ERROR = 'E'
}

export enum TransactionAction {
  START = 'start',
  UPDATE = 'update',
  STOP = 'stop'
}

export default interface Transaction {
  id?: number;
  siteID: string;
  siteAreaID: string;
  connectorId: number;
  tagID: string;
  userID: string;
  chargeBoxID: string;
  signedData?: any;
  user?: User;
  stop?: {
    tagID: string;
    userID: string;
    user?: User;
    meterStop: number;
    price: number;
    roundedPrice: number;
    priceUnit: string;
    pricingSource: string;
    stateOfCharge: number;
    totalInactivitySecs: number;
    extraInactivitySecs: number;
    extraInactivityComputed: boolean;
    totalConsumption: number;
    totalDurationSecs: number;
    inactivityStatusLevel: InactivityStatusLevel; // TODO: Use in the mobile app, to be removed in V1.3
    inactivityStatus?: InactivityStatus;
    timestamp: Date;
    transactionData?: any;
    signedData?: any;
  };
  remotestop?: {
    timestamp: Date;
    tagID: string;
    userID: string;
  };
  refundData?: {
    refundId: string;
    refundedAt: Date;
    type: any;
    reportId?: string;
    status?: any;
  };
  lastMeterValue?: Partial<OCPPNormalizedMeterValue>;
  chargeBox?: ChargingStation;
  meterStart: number;
  timestamp: Date;
  price?: number;
  roundedPrice?: number;
  priceUnit?: string;
  pricingSource?: string;
  stateOfCharge: number;
  timezone: string;
  lastUpdate?: Date;
  currentTotalInactivitySecs: number;
  currentInactivityStatusLevel?: InactivityStatusLevel; // TODO: Use in the mobile app, to be removed in V1.3
  currentInactivityStatus?: InactivityStatus;
  currentStateOfCharge: number;
  numberOfMeterValues: number;
  currentConsumption: number;
  currentConsumptionWh?: number;
  currentCumulatedPrice?: number;
  currentTotalConsumption: number;
  currentSignedData?: string;
  uniqueId?: string;
  errorCode?: number;
  values?: Consumption[];
  billingData?: BillingTransactionData;
}
