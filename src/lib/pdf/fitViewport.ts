import { MAX_ZOOM } from './zoomLimits';

const FIT_GUTTER = 48;

export function fitPageZoom(width: number, height: number, pageWidth: number, pageHeight: number) {
  return Math.max(
    0.05,
    Math.min(
      MAX_ZOOM,
      Math.max(1, width - FIT_GUTTER) / pageWidth,
      Math.max(1, height - FIT_GUTTER) / pageHeight,
    ),
  );
}

/** Zoom at which the page width fills the pane width, however tall the page is. */
export function fitPageWidthZoom(width: number, pageWidth: number) {
  return Math.max(0.05, Math.min(MAX_ZOOM, Math.max(1, width - FIT_GUTTER) / pageWidth));
}

/** Leave enough canvas around a fitted page to pan it in either direction. */
export function centerPageInViewport(
  container: HTMLElement,
  page: HTMLElement,
  vertical: 'center' | 'start' = 'center',
) {
  const canvas = page.closest<HTMLElement>('.canvas-workspace-area, .notebook-pan-canvas');
  if (canvas) canvas.style.paddingBlock = `${container.clientHeight / 2}px`;
  const bounds = container.getBoundingClientRect();
  const paper = page.getBoundingClientRect();
  container.scrollLeft += paper.left - bounds.left - (container.clientWidth - paper.width) / 2;
  container.scrollTop +=
    paper.top -
    bounds.top -
    (vertical === 'start' ? 0 : (container.clientHeight - paper.height) / 2);
}
