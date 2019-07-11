const convict = require('convict');
const fs = require('fs');

// Define a schema
const config = convict({
  env: {
    doc: 'The test environment.',
    format: ['local', 'production', 'development'],
    default: 'local',
    env: 'TEST_ENV'
  },
  trace_logs: {
    doc: 'true to trace communication with servers',
    format: Boolean,
    default: 'false',
    env: 'TRACE_LOGS'
  },
  ocpp: {
    soap: {
      scheme: {
        doc: 'The OCPP server scheme.',
        format: ['http', 'https'],
        default: 'http',
        env: 'OCPP_SOAP_SCHEME',
      },
      host: {
        doc: 'The OCPP server IP address to bind.',
        format: String,
        default: '127.0.0.1',
        env: 'OCPP_SOAP_HOSTNAME'
      },
      port: {
        doc: 'The OCPP server port to bind.',
        format: 'port',
        default: 8000,
        env: 'OCPP_SOAP_PORT',
        arg: 'ocpp_soap_port'
      },
      logs: {
        doc: '"json"/"xml" to trace ocpp communication according to type, "none" to not trace them',
        format: ['json', 'xml', 'none'],
        default: 'none',
        env: 'OCPP_SOAP_LOGS'
      }
    },
    json: {
      scheme: {
        doc: 'The OCPP server scheme.',
        format: ['ws', 'wss'],
        default: 'ws',
        env: 'OCPP_JSON_SCHEME',
      },
      host: {
        doc: 'The OCPP server IP address to bind.',
        format: String,
        default: '127.0.0.1',
        env: 'OCPP_JSON_HOSTNAME'
      },
      port: {
        doc: 'The OCPP server port to bind.',
        format: 'port',
        default: 8010,
        env: 'OCPP_JSON_PORT',
        arg: 'ocpp_json_port'
      },
      logs: {
        doc: '"json" to trace ocpp communication according to type, "none" to not trace them',
        format: ['json', 'none'],
        default: 'none',
        env: 'OCPP_JSON_LOGS'
      }
    }
  },
  ocpi: {
    scheme: {
      doc: 'The OCPI server scheme.',
      format: ['http', 'https'],
      default: 'http',
      env: 'OCPI_SCHEME',
    },
    host: {
      doc: 'The OCPI server host address to bind.',
      format: String,
      default: 'localhost',
      env: 'OCPI_HOSTNAME'
    },
    port: {
      doc: 'The OCPI server port to bind.',
      format: 'port',
      default: 9090,
      env: 'OCPI_PORT',
      arg: 'ocpi_port'
    },
    token: {
      doc: 'OCPI token',
      format: String,
      default: 'eyJhayI6NTEsInRpZCI6InNsZiIsInprIjoxMn0=',
      env: 'OCPI_TOKEN'
    },
    logs: {
      doc: '"json" to trace ocpi communication, "none" to not trace them',
      format: ['json', 'none'],
      default: 'none',
      env: 'OCPI_LOGS'
    },
    enabled: {
      doc: 'Tests enabled flag',
      format: Boolean,
      default: false,
      env: 'OCPI_TESTS_ENABLED'
    }
  },
  server: {
    scheme: {
      doc: 'The SERVER server scheme.',
      format: ['http', 'https'],
      default: 'http',
      env: 'SERVER_SCHEME',
    },
    host: {
      doc: 'The SERVER server IP address to bind.',
      format: String,
      default: '127.0.0.1',
      env: 'SERVER_HOSTNAME'
    },
    port: {
      doc: 'The SERVER server port to bind.',
      format: 'port',
      default: 80,
      env: 'SERVER_PORT',
      arg: 'server_port'
    },
    logs: {
      doc: '"json" to trace central server communication, "none" to not trace them',
      format: ['json', 'none'],
      default: 'none',
      env: 'SERVER_LOGS'
    }
  },
  admin: {
    username: {
      doc: 'The admin username',
      format: String,
      default: 'jean.pierre.demessant@sap.com',
      env: 'ADMIN_USERNAME'
    },
    password: {
      doc: 'The admin password',
      format: String,
      default: 'EQPQLwBIC0XgUgX@1Aa',
      env: 'ADMIN_PASSWORD'
    },
    tenant: {
      doc: 'The admin tenant',
      format: String,
      default: '',
      env: 'ADMIN_TENANT'
    }
  },
  superadmin: {
    username: {
      doc: 'The super admin email',
      format: String,
      default: 'super.admin@ev.com',
      env: 'SUPERADMIN_USERNAME'
    },
    password: {
      doc: 'The super admin password',
      format: String,
      default: 'EQPQLwBIC0XgUgX@1Aa',
      env: 'SUPERADMIN_PASSWORD'
    }
  },
  mailServer: {
    host: {
      doc: 'The mail server IP address to bind.',
      format: String,
      default: '127.0.0.1',
    },
    port: {
      doc: 'The mail server port to bind.',
      format: 'port',
      default: 1080,
    },
  },
  wsClient: {
    autoReconnectMaxRetries: {
      doc: 'Web Socket client re-connection max retries.',
      format: 'int',
      default: 10,
    },
    autoReconnectTimeout: {
      doc: 'Web Socket client re-connection timeout.',
      format: 'int',
      default: 0,
    },
  },
  storage: {
    implementation: {
      doc: 'DB type',
      format: String,
      default: 'mongodb'
    },
    uri: {
      doc: 'URL',
      // pragma format: String,
      default: null
    },
    host: {
      doc: 'host name',
      format: String,
      default: 'localhost'
    },
    port: {
      doc: 'port number',
      format: 'port',
      default: 32500
    },
    user: {
      doc: 'user name',
      format: String,
      default: ''
    },
    password: {
      doc: 'password',
      format: String,
      default: ''
    },
    database: {
      doc: 'db name',
      format: String,
      default: 'evse'
    },
    poolSize: {
      doc: 'pool size',
      format: Number,
      default: 20
    },
    replicaSet: {
      doc: 'replica set name',
      format: String,
      default: 'rs0'
    },
    monitorDBChange: {
      doc: 'monitor changes',
      format: Boolean,
      default: false
    },
    debug: {
      doc: 'debug',
      format: Boolean,
      default: false
    }
  }
});

// Load environment dependent configuration
const env = config.get('env');
const fileName = './test/config/' + env + '.json';

if (fs.existsSync(fileName)) {
  config.loadFile(fileName);
}

// Perform validation
config.validate({
  allowed: 'strict'
});

module.exports = config;
