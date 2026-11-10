import { commands } from '../../lib/bindings';
import { isTauri, unwrapNativeResult } from './runtime';

export interface DiscoveredAiProvider {
  id: string;
  name: string;
  executable: string;
  version?: string | null;
  status: string;
  message?: string | null;
}

export type AiProviderStatus =
  | {
      status: 'ready';
      provider: string;
      version: string;
      executable: string;
      message?: string | null;
      availableProviders: DiscoveredAiProvider[];
    }
  | {
      status: 'native_required' | 'missing_cli' | 'unauthenticated' | 'incompatible_cli';
      provider?: string | null;
      version?: string | null;
      executable?: string | null;
      message: string;
      availableProviders: DiscoveredAiProvider[];
    };

export type AiExplanationErrorCode =
  | 'native_required'
  | 'missing_cli'
  | 'unauthenticated'
  | 'incompatible_cli'
  | 'timeout'
  | 'cancelled'
  | 'process_failed'
  | 'malformed_output';

export interface AiExplanationRequest {
  requestId: string;
  prompt: string;
  pngDataUrl: string;
  responseFormat?: 'notebook';
}

export type AiExplanationResult =
  | { ok: true; response: string }
  | { ok: false; code: AiExplanationErrorCode; message: string };

const AI_ERROR_CODES = new Set<AiExplanationErrorCode>([
  'native_required',
  'missing_cli',
  'unauthenticated',
  'incompatible_cli',
  'timeout',
  'cancelled',
  'process_failed',
  'malformed_output',
]);

function normalizeProviderStatus(status: Awaited<ReturnType<typeof commands.getAiProviderStatus>>): AiProviderStatus {
  const value = unwrapNativeResult(status);
  const availableProviders: DiscoveredAiProvider[] = (value.availableProviders || []).map((p) => ({
    id: p.id,
    name: p.name,
    executable: p.executable,
    version: p.version ?? null,
    status: p.status,
    message: p.message ?? null,
  }));

  if (
    value.status === 'ready' &&
    typeof value.provider === 'string' &&
    typeof value.version === 'string' &&
    typeof value.executable === 'string'
  ) {
    return {
      status: 'ready',
      provider: value.provider,
      version: value.version,
      executable: value.executable,
      message: value.message ?? null,
      availableProviders,
    };
  }
  const errorStatus =
    value.status === 'unauthenticated' || value.status === 'incompatible_cli'
      ? value.status
      : 'missing_cli';
  return {
    status: errorStatus,
    provider: value.provider ?? null,
    version: value.version ?? null,
    executable: value.executable ?? null,
    message: value.message || 'No AI CLI is currently ready.',
    availableProviders,
  };
}

function normalizeExplanationResult(
  result: Awaited<ReturnType<typeof commands.runAiExplanation>>,
): AiExplanationResult {
  const value = unwrapNativeResult(result);
  if (value.ok && typeof value.response === 'string') {
    return { ok: true, response: value.response };
  }
  const code = typeof value.code === 'string' && AI_ERROR_CODES.has(value.code as AiExplanationErrorCode)
    ? value.code as AiExplanationErrorCode
    : 'process_failed';
  return {
    ok: false,
    code,
    message: value.message || 'The explanation could not be completed.',
  };
}

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  if (!isTauri()) {
    return {
      status: 'native_required',
      message: 'Local CLI explanations require the Cinnabar desktop app.',
      availableProviders: [],
    };
  }
  return normalizeProviderStatus(await commands.getAiProviderStatus());
}

export async function setAiProviderExecutable(executablePath: string): Promise<AiProviderStatus> {
  if (!isTauri()) {
    return {
      status: 'native_required',
      message: 'Local CLI explanations require the Cinnabar desktop app.',
      availableProviders: [],
    };
  }
  return normalizeProviderStatus(await commands.setAiProviderExecutable(executablePath));
}

export async function setAiProviderPreference(
  providerId: string,
  executablePath?: string | null,
): Promise<AiProviderStatus> {
  if (!isTauri()) {
    return {
      status: 'native_required',
      message: 'Local CLI explanations require the Cinnabar desktop app.',
      availableProviders: [],
    };
  }
  return normalizeProviderStatus(await commands.setAiProviderPreference(providerId, executablePath ?? null));
}

export async function runAiExplanation(request: AiExplanationRequest): Promise<AiExplanationResult> {
  if (!isTauri()) {
    return { ok: false, code: 'native_required', message: 'Local CLI explanations require the Cinnabar desktop app.' };
  }
  try {
    return normalizeExplanationResult(await commands.runAiExplanation({ ...request, responseFormat: request.responseFormat ?? null }));
  } catch (error) {
    return { ok: false, code: 'process_failed', message: error instanceof Error ? error.message : String(error) };
  }
}

export async function cancelAiExplanation(requestId: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await commands.cancelAiExplanation(requestId);
  } catch {
    return false;
  }
}
