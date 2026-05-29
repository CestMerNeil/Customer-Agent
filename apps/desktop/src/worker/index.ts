type WorkerStatus = "starting" | "ready" | "stopped" | "error";

let status: WorkerStatus = "starting";

export function getWorkerStatus(): WorkerStatus {
  return status;
}

export function markWorkerReady(): WorkerStatus {
  status = "ready";
  return status;
}

markWorkerReady();
