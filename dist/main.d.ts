import { type NextFunction, type Request, type Response } from 'express';
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import type { WsAdapterConfig } from './types';
export declare class WsAdapter extends Adapter {
    config: WsAdapterConfig;
    private server;
    private readonly socketIoFile;
    private store;
    private secret;
    private certificates;
    private bruteForce;
    constructor(options?: Partial<AdapterOptions>);
    onUnload(callback: () => void): void;
    onMessage(obj: ioBroker.Message): void;
    checkUser: (username: string, password: string, cb: (error: null | Error, result?: {
        logged_in: boolean;
        user?: string;
    }) => void) => void;
    detectUser: (req: Request, res: Response, next: NextFunction) => void;
    serveStaticFile: (req: Request, res: Response, next: NextFunction) => void;
    initWebServer(): void;
    main(): Promise<void>;
}
