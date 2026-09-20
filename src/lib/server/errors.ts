import type { ErrorCode } from "../../../shared/api-contract";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(message = "This resource is unavailable."): never {
  throw new ApiError(404, "not_found", message);
}

export function invalidRequest(message: string): never {
  throw new ApiError(400, "invalid_request", message);
}
