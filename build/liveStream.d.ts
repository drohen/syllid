import { PathProvider, StreamHandler, StreamProvider } from "./streamCore";
export declare class LiveStream implements Stream, PathProvider {
    private id;
    private endpoint;
    private bufferSize;
    private handler;
    private provider;
    private core;
    private endpointSet;
    type: `live`;
    constructor(id: string, endpoint: string, bufferSize: number, handler: StreamHandler, provider: StreamProvider);
    private bindFns;
    private handleResponseURL;
    private endpointWithQuery;
    private addSlash;
    nextSegments(): void;
    path(): string;
    start(): void;
    stop(): void;
}
//# sourceMappingURL=liveStream.d.ts.map