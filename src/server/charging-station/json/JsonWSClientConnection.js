const uuid = require('uuid/v4');
const Logging = require('../../../utils/Logging'); 
const WebSocket = require('ws');

//const Commands = require('./Commands');
const SOCKET_TIMEOUT = 30000; // 30 sec

const CALL_MESSAGE = 2; // Client-to-Server
const CALLRESULT_MESSAGE = 3; // Server-to-Client
const CALLERROR_MESSAGE = 4; // Server-to-Client
//import { getObjectValues } from './helpers';
const OCPPError = require('./OcppError');
const OCPPErrorValues = require('./OcppErrorConstants');

const _moduleName = "centralSystemJSONService";

class JsonWSClientConnection {

    constructor(socket, req) {

        this._socket = socket;
        this._req = req;
        this._requests = {};

        if (req) {
            this._url = req && req.url;
            const ip = req && ((req.connection && req.connection.remoteAddress) || req.headers['x-forwarded-for']);
            Logging.logInfo({
                module: _moduleName, method: "constructor", action: "Connection",
                message: `New connection from '${ip}', Protocol '${socket.protocol}', URL '${this._url}'`
            });

            if (this._url.startsWith("/OCPP16/") === false) { //In princple already checked in connection opening from server
                throw new Error("invalid url");
            }

            // Fill in standard JSON object for communication with central server
            try {
                let chargeBoxIdWithNameSpace = this._url.split("/")[2];

                this._headers = {
                    chargeBoxIdentity: this._url.split("/")[2],
                    ocppVersion: (socket.protocol.startsWith("ocpp") ? socket.protocol.replace("ocpp", "") : socket.protocol),
                    From : {
                        Address: ip
                    }
                }; 
            } catch (error) {
                throw new Error("invalid url");
            }
            
        } else {
// should not happen as connection is initiated by the box always
            throw new Error("invalid url");
        }

        // Check protocol
        if (this._socket.protocol !== "ocpp1.6") { //it is a require field of OCPP spec
            throw new Error("protocol not supported");
        } 

        socket.on('message', (msg) => this.onMessage(msg));

        socket.on('error', (err) => {
            Logging.logError({
                module: _moduleName, method: "OnError", action: "ConnectionError",
                message: err
            });
//            debug(err);
        });

        socket.on('close', (code, reason) => {
            Logging.logWarning({
                module: _moduleName, method: "OnClose", action: "ConnectionClose",
                message: JSON.stringify({code: code, reason: reason}, null, " ")
            });
//            global.centralSystemJson.closeConnection(this.getChargeBoxId());
        })
    }

    async onMessage(message) {
        let messageType, messageId, commandNameOrPayload, commandPayload, errorDetails;

        try {
            [messageType, messageId, commandNameOrPayload, commandPayload, errorDetails] = JSON.parse(message);
        } catch (err) {
            throw new Error(`Failed to parse message: '${message}', ${err.message}`);
        }

        switch (messageType) {
            case CALL_MESSAGE:
                // request 
//                debug(`>> url ${this._url} message: ${message} type: ${messageType} commandNameOrPayload: ${commandNameOrPayload} commandPayload: ${commandPayload}`);
                Logging.logReceivedAction(_moduleName, this._headers.chargeBoxIdentity, commandNameOrPayload, message, this._headers);

                try {
                    // Check if method exist in central server
                    if ( typeof global.centralSystemJson["handle" + commandNameOrPayload] === 'function') {
                        let result = await global.centralSystemJson["handle" + commandNameOrPayload](Object.assign(commandPayload, this._headers));
                        // Get answer from central server
                        // Response should like { commandNameRespons : { attributes of teh response } }
                        Logging.logReturnedAction(_moduleName, this._headers.chargeBoxIdentity, commandNameOrPayload, {
                            "result": result
                        });
                        // Check if response contains proper attribute
                        let reponseNameProperty = commandNameOrPayload.charAt(0).toLowerCase() + commandNameOrPayload.slice(1) + "Response";
                        if (result.hasOwnProperty(reponseNameProperty)) {
                            // Send Response
                            result = await this.sendMessage(messageId, result[reponseNameProperty], CALLRESULT_MESSAGE);
                        } else {
                            // TO DO what shall we do if we did not code it correctly :)
                            // Sacrifice Gerald to the gods ? :)
                        }
                    } else {
                        let error = new OCPPError(OCPPErrorValues.ERROR_NOTIMPLEMENTED, "");
                        let result = await this.sendError(messageId, error);

                        Logging.logError({ module: _moduleName, method: "sendMessage", action: "NOT_IMPLEMENTED",
                            message: {message: messageId, error: JSON.stringify(error, null, " ")}
                        });
                    }
                } catch (err) {
                    // send error if payload didn't pass the validation
                    let error = new OCPPError(OCPPErrorValues.ERROR_FORMATIONVIOLATION, err.message);
                    let result = await this.sendError(messageId, error);
                    Logging.logError({ module: _moduleName, method: "sendMessage", action: "FORMATVIOLATION",
                        message: {message: messageId, error: JSON.stringify(error, null, " ")}  });
                }
                break;

            case CALLRESULT_MESSAGE:
                // response
//                debug(`>> ${this._url}: ${message}`);
                Logging.logReturnedAction(_moduleName, this._headers.chargeBoxIdentity, commandNameOrPayload, {
                    "result": message
                });
                const [responseCallback] = this._requests[messageId];
                if (!responseCallback) {
                    throw new Error(`Response for unknown message ${messageId}`);
                }
                delete this._requests[messageId];

                responseCallback(commandNameOrPayload);
                break;

            case CALLERROR_MESSAGE:
                // error response
//                debug(`>> ERROR ${this._url}: ${message}`);
                Logging.logError({ module: _moduleName, method: "sendMessage", action: "ErrorMessage",
                    message: {message: messageId, error: JSON.stringify(message, null, " ")}  
                });

                if (!this._requests[messageId]) {
                    throw new Error(`Response for unknown message ${messageId}`);
                }
                const [, rejectCallback] = this._requests[messageId];
                delete this._requests[messageId];

                rejectCallback(new OCPPError(commandNameOrPayload, commandPayload, errorDetails));
                break;
            default:
                throw new Error(`Wrong message type ${messageType}`);
        }
    }

    send(command, messageType = CALL_MESSAGE) {
        return this.sendMessage(uuid(), command, messageType);
    }

    sendError(messageId, err) {
//        debug(`Error: ${err.message}`);
//        Logging.logError({ module: _moduleName, method: "sendError", action: "OCPPError",
//        message: JSON.stringify({message: messageId, error: err}, null, " ")  });

        const error = err instanceof OCPPError ? err : new OCPPError(OCPPErrorValues.ERROR_INTERNALERROR, err.message);

        return this.sendMessage(messageId, error, CALLERROR_MESSAGE);
    }

    sendMessage(messageId, command, messageType = CALLRESULT_MESSAGE, commandName = "") {
// send a message through websocket
        const socket = this._socket;
        const self = this;

        return new Promise((resolve, reject) => {
            let messageToSend;

            switch (messageType) {
                case CALL_MESSAGE:
                    this._requests[messageId] = [onResponse, onRejectResponse];
                    messageToSend = JSON.stringify([messageType, messageId, commandName, command]);
                    break;
                case CALLRESULT_MESSAGE:
                    messageToSend = JSON.stringify([messageType, messageId, command]);
                    break;
                case CALLERROR_MESSAGE:
                    const {
                        code,
                        message,
                        details
                    } = command;
                    messageToSend = JSON.stringify([messageType, messageId, code, message, details]);
                    break;
            }

//            debug(`<< ${messageToSend}`);
            if (socket.readyState === 1) {
                socket.send(messageToSend);
            } else {
                return onRejectResponse(`Socket closed ${messageId}`);
            }
            if (messageType !== CALL_MESSAGE) {
                resolve();
            } else {
                setTimeout(() => onRejectResponse(`Timeout for message ${messageId}`), SOCKET_TIMEOUT);
            }

            function onResponse(payload) {
//                const response = command.createResponse(payload);
                return resolve(payload);
            }

            function onRejectResponse(reason) {
                self._requests[messageId] = () => {};
                const error = reason instanceof OCPPError ? reason : new Error(reason);
                reject(error);
            }
        });
    }

    getChargeBoxId () {
        return this._headers.chargeBoxIdentity;
    }

    startTransaction(idTag, connectorId, chargingProfile = {}) {
        let payload = { connectorId:connectorId, idTag: idTag};
        chargingProfile = testProfileFlo;
        if (chargingProfile !== null && Object.getOwnPropertyNames(chargingProfile).length > 0 ) {
            payload.chargingProfile = chargingProfile;
        }

        return this.sendMessage(uuid(), payload, 2, "RemoteStartTransaction").then(
                (payload)=> { 
                    return payload; 
                }, 
                (error)=> { 
//                    debug("sendMessage ERROR result", error);
                    Logging.logError({ module: _moduleName, method: "startTransaction", action: "sendMessage",
                                                    message: JSON.stringify(error, null, " ")  });
                    throw error;
                } );
            //, meterStart: 32, timestamp: date }
    }

    reset(type) {
        return this.sendMessage(uuid(), {type:type}, 2, "Reset").then(
            (payload)=> { 
                return payload; 
            }, 
            (error)=> { 
//                debug("sendMessage ERROR result", error);
                Logging.logError({ module: _moduleName, method: "reset", action: "sendMessage",
                                                message: JSON.stringify(error, null, " ")  });
                throw error;
            } );
	}

	clearCache() {
        return this.sendMessage(uuid(), {}, 2, "ClearCache").then(
            (payload)=> { 
                return payload; 
            }, 
            (error)=> { 
//                debug("sendMessage ERROR result", error);
                Logging.logError({ module: _moduleName, method: "clearCache", action: "sendMessage",
                                                message: JSON.stringify(error, null, " ")  });
                throw error;
            } );
	}

	getConfiguration(keys) {
        return this.sendMessage(uuid(), ((keys === null)? {} : {key:keys}), 2, "GetConfiguration").then(
            (payload)=> { 
                return payload; 
            }, 
            (error)=> { 
//                debug("sendMessage ERROR result", error);
                Logging.logError({ module: _moduleName, method: "getConfiguration", action: "sendMessage",
                                                message: JSON.stringify(error, null, " ")  });
                throw error;
            } );
	}

	changeConfiguration(key, value) {
        return this.sendMessage(uuid(), {key:key, value: value}, 2, "ChangeConfiguration").then(
            (payload)=> { 
                return payload; 
            }, 
            (error)=> { 
//                debug("sendMessage ERROR result", error);
                Logging.logError({ module: _moduleName, method: "ChangeConfiguration", action: "sendMessage",
                                                message: JSON.stringify(error, null, " ")  });
                throw error;
            } );
	}

	stopTransaction(transactionId) {
        return this.sendMessage(uuid(), {transactionId:transactionId}, 2, "RemoteStopTransaction").then(
            (payload)=> { 
                return payload; 
            }, 
            (error)=> { 
//                debug("sendMessage ERROR result", error);
                Logging.logError({ module: _moduleName, method: "stopTransaction", action: "sendMessage",
                                                message: JSON.stringify(error, null, " ")  });
                throw error;
            } );
	}

	unlockConnector(connectorId) {
        return this.sendMessage(uuid(), {connectorId:connectorId}, 2, "UnlockConnector").then(
            (payload)=> { 
                return payload; 
            }, 
            (error)=> { 
//                debug("sendMessage ERROR result", error);
                Logging.logError({ module: _moduleName, method: "unlockConnector", action: "sendMessage",
                                                message: JSON.stringify(error, null, " ")  });
                throw error;
            } );
	}
}

module.exports = JsonWSClientConnection;