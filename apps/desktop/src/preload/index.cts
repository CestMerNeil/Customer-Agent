import { contextBridge, ipcRenderer } from "electron";
import type { AppUpdateStatus, DocumentKnowledgeProgressEvent, IpcChannel, IpcRequest, IpcResponse, ModelDownloadProgressEvent, ProductSyncProgress } from "@customer-agent/core";

type RendererEventMap = {
  "inference.modelscope.download.progress": ModelDownloadProgressEvent;
  "product.sync.progress": ProductSyncProgress;
  "knowledge.document.progress": DocumentKnowledgeProgressEvent;
  "app.update.status": AppUpdateStatus;
};

const api = {
  invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequest<TChannel>,
  ): Promise<IpcResponse<TChannel>> {
    return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<TChannel>>;
  },
  on<TChannel extends keyof RendererEventMap>(
    channel: TChannel,
    listener: (payload: RendererEventMap[TChannel]) => void,
  ): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: RendererEventMap[TChannel]) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld("customerAgent", api);

export type CustomerAgentBridge = typeof api;
