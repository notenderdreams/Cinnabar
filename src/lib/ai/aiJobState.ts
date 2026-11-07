export type AiJobState =
  | { phase: 'compose' }
  | { phase: 'running'; requestId: string }
  | { phase: 'error'; message: string };

export function transitionAiJob(
  jobs: Record<string, AiJobState>,
  annotationId: string,
  next: AiJobState | null
): Record<string, AiJobState> {
  const updated = { ...jobs };
  if (next) updated[annotationId] = next;
  else delete updated[annotationId];
  return updated;
}
