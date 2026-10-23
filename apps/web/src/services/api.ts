import { ApiResponse, ApiErrorResponse } from '@campusbite/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  public code: string;
  public details?: Array<{ field?: string; message: string }> | null;
  public statusCode: number;

  constructor(message: string, code: string, statusCode: number, details?: Array<{ field?: string; message: string }> | null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // Sends & receives HTTP-only cookies
  });

  const json: ApiResponse<T> = await response.json().catch(() => ({
    success: false,
    error: {
      code: 'NETWORK_ERROR',
      message: 'Failed to parse response from server'
    }
  } as ApiErrorResponse));

  if (!response.ok || !json.success) {
    const errorData = (json as ApiErrorResponse).error || {
      code: 'HTTP_ERROR',
      message: `Request failed with status ${response.status}`
    };

    throw new ApiError(errorData.message, errorData.code, response.status, errorData.details);
  }

  return (json as { success: true; data: T }).data;
}

export async function downloadCsv(endpoint: string, filename: string): Promise<void> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    credentials: 'include'
  });

  if (!response.ok) {
    let msg = `Failed to download report (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        msg = errJson.error.message;
      }
    } catch {
      // Keep default msg
    }
    throw new ApiError(msg, 'DOWNLOAD_ERROR', response.status);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

