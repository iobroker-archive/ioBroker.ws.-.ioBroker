"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsAdapter = void 0;
const node_crypto_1 = require("node:crypto");
const session = __importStar(require("express-session"));
const adapter_core_1 = require("@iobroker/adapter-core"); // Get common adapter utils
const webserver_1 = require("@iobroker/webserver");
const ws_server_1 = require("@iobroker/ws-server");
const socketWS_1 = require("./lib/socketWS");
const node_fs_1 = require("node:fs");
class WsAdapter extends adapter_core_1.Adapter {
    wsConfig;
    server = {
        server: null,
        io: null,
        app: null,
    };
    socketIoFile;
    bruteForce = {};
    store = null;
    secret = 'Zgfr56gFe87jJOM';
    certificates;
    constructor(options = {}) {
        super({
            ...options,
            name: 'ws',
            unload: callback => this.onUnload(callback),
            message: obj => this.onMessage(obj),
            stateChange: (id, state) => {
                this.server?.io?.publishAll('stateChange', id, state);
            },
            ready: () => this.main(),
            objectChange: (id, obj) => {
                this.server?.io?.publishAll('objectChange', id, obj);
            },
            fileChange: (id, fileName, size) => {
                this.server?.io?.publishFileAll(id, fileName, size);
            },
        });
        this.socketIoFile = (0, node_fs_1.readFileSync)(`${__dirname}/lib/socket.io.js`).toString('utf-8');
        this.wsConfig = this.config;
        this.on('log', (obj) => this.server?.io?.sendLog(obj));
    }
    onUnload(callback) {
        try {
            void this.setState('info.connected', '', true);
            void this.setState('info.connection', false, true);
            this.log.info(`terminating http${this.wsConfig.secure ? 's' : ''} server on port ${this.wsConfig.port}`);
            this.server.io?.close();
            this.server.server?.close();
            callback();
        }
        catch {
            callback();
        }
    }
    onMessage(obj) {
        if (obj?.command !== 'im') {
            // if not instance message
            return;
        }
        // to make messages shorter, we code the answer as:
        // m - message type
        // s - socket ID
        // d - data
        this.server?.io?.publishInstanceMessageAll(obj.from, obj.message.m, obj.message.s, obj.message.d);
    }
    checkUser(username, password, cb) {
        username = (username || '')
            .toString()
            .replace(this.FORBIDDEN_CHARS, '_')
            .replace(/\s/g, '_')
            .replace(/\./g, '_')
            .toLowerCase();
        if (this.bruteForce[username] && this.bruteForce[username].errors > 4) {
            let minutes = Date.now() - this.bruteForce[username].time;
            if (this.bruteForce[username].errors < 7) {
                if (Date.now() - this.bruteForce[username].time < 60000) {
                    minutes = 1;
                }
                else {
                    minutes = 0;
                }
            }
            else if (this.bruteForce[username].errors < 10) {
                if (Date.now() - this.bruteForce[username].time < 180000) {
                    minutes = Math.ceil((180000 - minutes) / 60000);
                }
                else {
                    minutes = 0;
                }
            }
            else if (this.bruteForce[username].errors < 15) {
                if (Date.now() - this.bruteForce[username].time < 600000) {
                    minutes = Math.ceil((600000 - minutes) / 60000);
                }
                else {
                    minutes = 0;
                }
            }
            else if (Date.now() - this.bruteForce[username].time < 3600000) {
                minutes = Math.ceil((3600000 - minutes) / 60000);
            }
            else {
                minutes = 0;
            }
            if (minutes) {
                return cb(new Error(`Too many errors. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`));
            }
        }
        void this.checkPassword(username, password, (success, _user) => {
            if (!success) {
                this.bruteForce[username] = this.bruteForce[username] || { errors: 0 };
                this.bruteForce[username].time = Date.now();
                this.bruteForce[username].errors++;
            }
            else if (this.bruteForce[username]) {
                delete this.bruteForce[username];
            }
            if (success) {
                return cb(null, { logged_in: true });
            }
            return cb(null);
        });
    }
    initWebServer() {
        this.wsConfig.port = parseInt(this.wsConfig.port, 10) || 0;
        if (this.wsConfig.port) {
            if (this.wsConfig.secure && !this.certificates) {
                return;
            }
            this.wsConfig.ttl = this.wsConfig.ttl || 3600;
            if (this.wsConfig.auth) {
                const AdapterStore = adapter_core_1.commonTools.session(session, this.wsConfig.ttl);
                // Authentication checked by server itself
                this.store = new AdapterStore({ adapter: this });
            }
            this.getPort(this.wsConfig.port, !this.wsConfig.bind || this.wsConfig.bind === '0.0.0.0' ? undefined : this.wsConfig.bind || undefined, async (port) => {
                if (parseInt(port, 10) !== this.wsConfig.port) {
                    this.log.error(`port ${this.wsConfig.port} already in use`);
                    return this.terminate
                        ? this.terminate(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION)
                        : process.exit(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
                }
                this.server.app = (req, res) => {
                    if (req.url?.includes('socket.io.js')) {
                        // @ts-expect-error
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end(this.socketIoFile);
                    }
                    else {
                        // @ts-expect-error
                        res.writeHead(404);
                        res.end('Not found');
                    }
                };
                try {
                    const webserver = new webserver_1.WebServer({
                        adapter: this,
                        secure: this.wsConfig.secure,
                        app: this.server.app,
                    });
                    this.server.server = await webserver.init();
                }
                catch (err) {
                    this.log.error(`Cannot create server: ${err}`);
                    this.terminate
                        ? this.terminate(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION)
                        : process.exit(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
                    return;
                }
                if (!this.server.server) {
                    this.log.error(`Cannot create server`);
                    this.terminate
                        ? this.terminate(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION)
                        : process.exit(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
                    return;
                }
                let serverListening = false;
                this.server.server.on('error', e => {
                    if (e.toString().includes('EACCES') && port <= 1024) {
                        this.log.error(`node.js process has no rights to start server on the port ${port}.\n` +
                            'Do you know that on linux you need special permissions for ports under 1024?\n' +
                            'You can call in shell following scrip to allow it for node.js: "iobroker fix"');
                    }
                    else {
                        this.log.error(`Cannot start server on ${this.wsConfig.bind || '0.0.0.0'}:${port}: ${e}`);
                    }
                    if (!serverListening) {
                        this.terminate
                            ? this.terminate(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION)
                            : process.exit(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
                    }
                });
                // Start the web server
                this.server.server.listen(this.wsConfig.port, !this.wsConfig.bind || this.wsConfig.bind === '0.0.0.0'
                    ? undefined
                    : this.wsConfig.bind || undefined, () => {
                    void this.setState('info.connection', true, true);
                    serverListening = true;
                });
                const settings = {
                    ttl: this.wsConfig.ttl,
                    port: this.wsConfig.port,
                    secure: this.wsConfig.secure,
                    auth: this.wsConfig.auth,
                    crossDomain: true,
                    forceWebSockets: true, // this is irrelevant for ws
                    defaultUser: this.wsConfig.defaultUser,
                };
                this.server.io = new socketWS_1.SocketWS(settings, this);
                this.server.io.start(this.server.server, ws_server_1.SocketIO, {
                    checkUser: this.checkUser,
                    store: this.store,
                    secret: this.secret,
                });
            });
        }
        else {
            this.log.error('port missing');
            this.terminate
                ? this.terminate(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION)
                : process.exit(adapter_core_1.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
        }
    }
    async main() {
        this.wsConfig = this.config;
        if (this.wsConfig.auth) {
            // Generate secret for session manager
            const systemConfig = await this.getForeignObjectAsync('system.config');
            if (systemConfig) {
                if (!systemConfig.native?.secret) {
                    systemConfig.native = systemConfig.native || {};
                    await new Promise(resolve => (0, node_crypto_1.randomBytes)(24, (_err, buf) => {
                        this.secret = buf.toString('hex');
                        void this.extendForeignObject('system.config', { native: { secret: this.secret } });
                        resolve();
                    }));
                }
                else {
                    this.secret = systemConfig.native.secret;
                }
            }
            else {
                this.log.error('Cannot find object system.config');
            }
        }
        if (this.wsConfig.secure) {
            // Load certificates
            await new Promise(resolve => this.getCertificates(undefined, undefined, undefined, (_err, certificates) => {
                this.certificates = certificates;
                resolve();
            }));
        }
        this.initWebServer();
    }
}
exports.WsAdapter = WsAdapter;
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new WsAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new WsAdapter())();
}
//# sourceMappingURL=main.js.map