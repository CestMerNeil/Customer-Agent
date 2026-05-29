import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcRequest, IpcResponse } from "@customer-agent/core";

const api = {
  invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequest<TChannel>,
  ): Promise<IpcResponse<TChannel>> {
    return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<TChannel>>;
  },
};

contextBridge.exposeInMainWorld("customerAgent", api);

export type CustomerAgentBridge = typeof api;
