export function fitPageZoom(width: number, height: number, pageWidth: number, pageHeight: number) {
  return Math.max(.05, Math.min(3.5, Math.max(1, width - 48) / pageWidth, Math.max(1, height - 48) / pageHeight));
}

/** Leave enough canvas around a fitted page to pan it in either direction. */
export function centerPageInViewport(container: HTMLElement, page: HTMLElement) {
  const canvas = page.closest<HTMLElement>('.canvas-workspace-area, .notebook-pan-canvas');
  if (canvas) canvas.style.paddingBlock = `${container.clientHeight / 2}px`;
  const bounds = container.getBoundingClientRect();
  const paper = page.getBoundingClientRect();
  container.scrollLeft += paper.left - bounds.left - (container.clientWidth - paper.width) / 2;
  container.scrollTop += paper.top - bounds.top - (container.clientHeight - paper.height) / 2;
}
