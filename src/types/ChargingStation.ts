import Connector from "./Connector";
import CreatedUpdatedProps from "./CreatedUpdatedProps";
import SiteArea from "./SiteArea";
import ChargingStationClient from "../client/ocpp/ChargingStationClient";

export default interface ChargingStation extends CreatedUpdatedProps {

  id?: string;
  siteAreaID: string;
  chargePointSerialNumber: string;
  chargePointModel: string;
  chargeBoxSerialNumber: string;
  chargePointVendor: string;
  iccid: string;
  imsi: string;
  meterType: string;
  firmwareVersion: string;
  meterSerialNumber: string;
  endpoint: string;
  ocppVersion: string;
  ocppProtocol: string;
  cfApplicationIDAndInstanceIndex: string;
  lastHeartBeat: Date;
  deleted: boolean;
  inactive: boolean;
  lastReboot: Date;
  chargingStationURL: string;
  numberOfConnectedPhase: number;
  maximumPower: number;
  cannotChargeInParallel: boolean;
  powerLimitUnit: string;
  latitude: number;
  longitude: number;
  connectors: Connector[];
  errorCode?: string;

  siteArea?: SiteArea;

  client?: ChargingStationClient;//TODO: where to place this?? sn ot a class anymore...

  //TODO: include site here or remove it fro mstorage
}
