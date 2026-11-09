import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AiExplanationAnnotation, Annotation } from '../lib/types/index';
import { buildAiPrompt, getRegionContext } from '../lib/ai/regionContext';
import { cancelAiExplanation, runAiExplanation } from '../utils/tauriBridge';
import { transitionAiJob } from '../lib/ai/aiJobState';
export type { AiJobState } from '../lib/ai/aiJobState';
import type { AiJobState } from '../lib/ai/aiJobState';

interface Options {
  pdfDoc: PDFDocumentProxy | null;
  documentName: string;
  docKey: string;
  pageIdPrefix?: string;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
}

export function useAiExplanations({ pdfDoc, documentName, docKey, updateAnnotation, pageIdPrefix = 'pdf-page' }: Options) {
  const [jobs, setJobs] = useState<Record<string, AiJobState>>({});
  const activeRequests = useRef(new Map<string, string>());
  const generationRef = useRef(0);

  const openComposer = useCallback((annotationId: string) => {
    setJobs((current) => {
      const runningOnly = Object.fromEntries(Object.entries(current).filter(([, state]) => state.phase === 'running'));
      return transitionAiJob(runningOnly, annotationId, { phase: 'compose' });
    });
  }, []);

  const close = useCallback((annotationId: string) => {
    setJobs((current) => transitionAiJob(current, annotationId, null));
  }, []);

  const cancel = useCallback(async (annotationId: string) => {
    const requestId = activeRequests.current.get(annotationId);
    activeRequests.current.delete(annotationId);
    setJobs((current) => transitionAiJob(current, annotationId, { phase: 'error', message: 'Explanation cancelled.' }));
    if (requestId) await cancelAiExplanation(requestId);
  }, []);

  const submit = useCallback(async (annotation: AiExplanationAnnotation, question: string) => {
    if (!pdfDoc || !question.trim()) return;
    const requestId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const generation = generationRef.current;
    activeRequests.current.set(annotation.id, requestId);
    updateAnnotation(annotation.id, { prompt: question.trim(), updatedAt: Date.now() });
    setJobs((current) => transitionAiJob(current, annotation.id, { phase: 'running', requestId }));

    try {
      const context = await getRegionContext(pdfDoc, annotation.pageNumber, annotation, documentName, pageIdPrefix);
      if (generation !== generationRef.current || activeRequests.current.get(annotation.id) !== requestId) return;
      const result = await runAiExplanation({
        requestId,
        pngDataUrl: context.pngDataUrl,
        prompt: buildAiPrompt(question, context),
      });
      if (generation !== generationRef.current || activeRequests.current.get(annotation.id) !== requestId) return;
      activeRequests.current.delete(annotation.id);
      if (result.ok) {
        updateAnnotation(annotation.id, { response: result.response, isOpen: true, updatedAt: Date.now() });
        close(annotation.id);
      } else {
        setJobs((current) => transitionAiJob(current, annotation.id, { phase: 'error', message: result.message }));
      }
    } catch (error) {
      if (generation === generationRef.current) {
        activeRequests.current.delete(annotation.id);
        setJobs((current) => transitionAiJob(current, annotation.id, { phase: 'error', message: error instanceof Error ? error.message : String(error) }));
      }
    }
  }, [close, documentName, pdfDoc, updateAnnotation, pageIdPrefix]);

  useEffect(() => {
    generationRef.current += 1;
    const requests = [...activeRequests.current.values()];
    activeRequests.current.clear();
    setJobs({});
    for (const requestId of requests) void cancelAiExplanation(requestId);
  }, [docKey]);

  useEffect(() => () => {
    for (const requestId of activeRequests.current.values()) void cancelAiExplanation(requestId);
    activeRequests.current.clear();
  }, []);

  return { jobs, openComposer, close, cancel, submit };
}
