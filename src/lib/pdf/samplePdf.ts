import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Creates a rich, multi-page sample PDF document on-the-fly
 * containing articles, code snippets, charts, quotes, and diagrams to test
 * smooth reading, dark mode inversion, image attachments, and highlighting.
 */
export async function createSamplePDF(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  // --- PAGE 1: Executive Overview & System Architecture ---
  const page1 = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width: p1W, height: p1H } = page1.getSize();

  // Top header bar
  page1.drawRectangle({
    x: 40,
    y: p1H - 70,
    width: p1W - 80,
    height: 4,
    color: rgb(0.23, 0.51, 0.96),
  });

  page1.drawText('WHITE PAPER 2026 // RESEARCH & SYSTEMS', {
    x: 40,
    y: p1H - 60,
    size: 9,
    font: fontHelveticaBold,
    color: rgb(0.4, 0.45, 0.55),
  });

  page1.drawText('High-Performance Document Systems', {
    x: 40,
    y: p1H - 110,
    size: 26,
    font: fontHelveticaBold,
    color: rgb(0.08, 0.08, 0.12),
  });

  page1.drawText('Next-Generation Vector Rendering, Canvas Blending & Real-Time PDF Mutation', {
    x: 40,
    y: p1H - 135,
    size: 12,
    font: fontHelvetica,
    color: rgb(0.3, 0.35, 0.42),
  });

  // Callout Box
  page1.drawRectangle({
    x: 40,
    y: p1H - 225,
    width: p1W - 80,
    height: 70,
    color: rgb(0.96, 0.97, 1.0),
    borderColor: rgb(0.8, 0.86, 0.98),
    borderWidth: 1,
  });

  page1.drawText('EXECUTIVE SUMMARY & INTERACTIVE TESTING GUIDE', {
    x: 55,
    y: p1H - 175,
    size: 10,
    font: fontHelveticaBold,
    color: rgb(0.15, 0.35, 0.8),
  });

  page1.drawText('Welcome to Cinnabar. You can test all features on this document:\n1. Use the Highlighter (H) to mark key phrases or draw highlight boxes over charts.\n2. Invert colors (Cmd+I) or switch between OLED, Sepia, Nord & Matrix reading themes.\n3. Attach images, stamps, or logos (I) anywhere on the page and resize/drag them.\n4. Click "Export PDF" (Cmd+S) to permanently bake all annotations into a new PDF!', {
    x: 55,
    y: p1H - 195,
    size: 9.5,
    font: fontHelvetica,
    color: rgb(0.2, 0.25, 0.35),
    lineHeight: 14,
  });

  // Section 1
  page1.drawText('1. Continuous Canvas Rendering Pipeline', {
    x: 40,
    y: p1H - 260,
    size: 15,
    font: fontHelveticaBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  const p1Text = `Modern document readers require continuous virtualized viewport pipelines to deliver 120Hz smooth scrolling across documents exceeding hundreds of pages. By decoupling page rasterization into dedicated web workers and leveraging devicePixelRatio scaling, pixel density remains pristine regardless of viewport zoom level.

Color inversion shaders calculate per-pixel luminance transformations. By preserving chrominance angles while flipping the lightness channel, photographic assets and colored vector diagrams retain their original color temperatures, completely preventing eye fatigue during night reading.`;

  page1.drawText(p1Text, {
    x: 40,
    y: p1H - 285,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.22, 0.22, 0.25),
    lineHeight: 16,
    maxWidth: p1W - 80,
  });

  // Code Block Simulation
  page1.drawRectangle({
    x: 40,
    y: p1H - 450,
    width: p1W - 80,
    height: 80,
    color: rgb(0.1, 0.12, 0.16),
  });

  page1.drawText('// Real-Time PDF Mutation Pipeline with pdf-lib', {
    x: 55,
    y: p1H - 390,
    size: 9,
    font: fontCourier,
    color: rgb(0.5, 0.7, 0.9),
  });
  page1.drawText('const pdfDoc = await PDFDocument.load(sourceBuffer);', {
    x: 55,
    y: p1H - 408,
    size: 9,
    font: fontCourier,
    color: rgb(0.9, 0.9, 0.95),
  });
  page1.drawText('const page = pdfDoc.getPage(pageIndex);', {
    x: 55,
    y: p1H - 424,
    size: 9,
    font: fontCourier,
    color: rgb(0.9, 0.9, 0.95),
  });
  page1.drawText('page.drawImage(embeddedImage, { x, y, width, height, opacity });', {
    x: 55,
    y: p1H - 440,
    size: 9,
    font: fontCourier,
    color: rgb(0.4, 0.85, 0.6),
  });

  // Chart Box / Figure Simulation
  page1.drawText('Figure 1.1: Document Memory Footprint & Frame Budget', {
    x: 40,
    y: p1H - 485,
    size: 11,
    font: fontHelveticaBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  // Draw simulated bar chart
  const barY = p1H - 590;
  page1.drawRectangle({
    x: 40,
    y: barY,
    width: p1W - 80,
    height: 90,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.88, 0.9, 0.93),
    borderWidth: 1,
  });

  // Bars
  const bars = [
    { label: 'Standard PDF.js', val: 70, color: rgb(0.85, 0.35, 0.35) },
    { label: 'DOM Layering', val: 120, color: rgb(0.95, 0.65, 0.25) },
    { label: 'Virtual Worker (Cinnabar)', val: 240, color: rgb(0.2, 0.75, 0.5) },
    { label: 'GPU Accelerated', val: 280, color: rgb(0.25, 0.55, 0.95) },
  ];

  bars.forEach((bar, i) => {
    const yPos = barY + 15 + i * 18;
    page1.drawText(bar.label, {
      x: 50,
      y: yPos + 2,
      size: 8,
      font: fontHelvetica,
      color: rgb(0.25, 0.25, 0.3),
    });
    page1.drawRectangle({
      x: 180,
      y: yPos,
      width: bar.val,
      height: 12,
      color: bar.color,
    });
  });

  // Footer
  page1.drawText('Page 1 of 3 — Cinnabar Research Edition', {
    x: 40,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.5, 0.55, 0.6),
  });

  // --- PAGE 2: Advanced Annotation & Color Inversion Science ---
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  const { width: p2W, height: p2H } = page2.getSize();

  page2.drawText('2. Color Inversion & Ergonomic Reading Science', {
    x: 40,
    y: p2H - 70,
    size: 18,
    font: fontHelveticaBold,
    color: rgb(0.08, 0.08, 0.12),
  });

  const p2Text = `Standard white PDF pages emit high levels of short-wavelength blue spectrum light, resulting in digital eye strain during prolonged sessions. Simple negative inversion often destroys image clarity and inverts photographic gradients into garish artifacts.

Cinnabar solves this through multi-matrix luminance mapping:
• OLED True Black: Remaps page white to deep pitch black #000000, eliminating power consumption on OLED displays while maximizing contrast.
• Warm Sepia Filter: Calibrated to 5200K color temperature, mimicking natural Japanese book paper.
• Nord Slate & Cyberpunk Matrix: Specialized dark palettes optimized for technical literature, engineering schematics, and code documentation.`;

  page2.drawText(p2Text, {
    x: 40,
    y: p2H - 105,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.2, 0.2, 0.25),
    lineHeight: 16,
    maxWidth: p2W - 80,
  });

  // Quote Card
  page2.drawRectangle({
    x: 40,
    y: p2H - 310,
    width: p2W - 80,
    height: 75,
    color: rgb(0.98, 0.96, 0.92),
    borderColor: rgb(0.9, 0.84, 0.75),
    borderWidth: 1,
  });

  page2.drawText('"Simplicity is about subtracting the obvious and adding the meaningful."', {
    x: 60,
    y: p2H - 265,
    size: 12,
    font: fontTimes,
    color: rgb(0.3, 0.25, 0.2),
  });
  page2.drawText('— John Maeda, The Laws of Simplicity', {
    x: 60,
    y: p2H - 285,
    size: 9.5,
    font: fontHelveticaBold,
    color: rgb(0.45, 0.4, 0.35),
  });

  // Section on Image Attachment
  page2.drawText('3. Attaching Images, Stamps & Signatures', {
    x: 40,
    y: p2H - 345,
    size: 15,
    font: fontHelveticaBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  const p2Text2 = `You can drop any PNG, JPEG, SVG or WebP file straight onto any page in Cinnabar. Try clicking the "Attach Image" tool on the floating toolbar or pressing the "I" key. You can also paste an image from your clipboard (Cmd+V).

Once attached, click the image to reveal transform handles:
• Drag anywhere to reposition across the page
• Drag bottom-right corner to resize with automatic aspect ratio lock
• Use the quick stamp drawer to insert "APPROVED", "CONFIDENTIAL", or signature stamps.`;

  page2.drawText(p2Text2, {
    x: 40,
    y: p2H - 370,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.2, 0.2, 0.25),
    lineHeight: 16,
    maxWidth: p2W - 80,
  });

  // Sample Interactive Target Box
  page2.drawRectangle({
    x: 40,
    y: p2H - 580,
    width: p2W - 80,
    height: 100,
    color: rgb(0.95, 0.98, 0.95),
    borderColor: rgb(0.75, 0.9, 0.75),
    borderWidth: 1.5,
    borderDashArray: [4, 4],
  });

  page2.drawText('DROP IMAGE OR STAMP HERE TO TEST', {
    x: p2W / 2 - 110,
    y: p2H - 520,
    size: 11,
    font: fontHelveticaBold,
    color: rgb(0.2, 0.6, 0.3),
  });

  page2.drawText('This dedicated zone is ready for image overlay & resize testing', {
    x: p2W / 2 - 140,
    y: p2H - 540,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.35, 0.5, 0.35),
  });

  // Footer
  page2.drawText('Page 2 of 3 — Cinnabar Research Edition', {
    x: 40,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.5, 0.55, 0.6),
  });

  // --- PAGE 3: Mutation Integrity & Export Verification ---
  const page3 = pdfDoc.addPage([595.28, 841.89]);
  const { width: p3W, height: p3H } = page3.getSize();

  page3.drawText('4. Saving, Baking & PDF Specification Compliance', {
    x: 40,
    y: p3H - 70,
    size: 18,
    font: fontHelveticaBold,
    color: rgb(0.08, 0.08, 0.12),
  });

  const p3Text = `When you choose "Save Modified PDF" in Cinnabar, the application performs native PDF binary stream synthesis using pdf-lib:

1. Color Matrix Conversion: Highlights are converted to translucent PDF RGB fill operations with standard blend modes (Multiply).
2. Raster Image Embedding: Attached PNG/JPEG images are encoded into native XObject Image dictionaries and mapped into the target page's transformation matrix.
3. Vector Preservation: Freehand pen strokes and geometric boxes are written as true PDF vector paths, guaranteeing infinite resolution printing without pixelation.
4. Session Persistence: An editable JSON project manifest can be saved alongside, letting you reopen and tweak individual annotations at any time.`;

  page3.drawText(p3Text, {
    x: 40,
    y: p3H - 105,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.2, 0.2, 0.25),
    lineHeight: 16,
    maxWidth: p3W - 80,
  });

  // Checklist table
  page3.drawRectangle({
    x: 40,
    y: p3H - 370,
    width: p3W - 80,
    height: 140,
    color: rgb(0.98, 0.98, 1.0),
    borderColor: rgb(0.85, 0.88, 0.95),
    borderWidth: 1,
  });

  page3.drawText('FEATURE READINESS MATRIX', {
    x: 55,
    y: p3H - 250,
    size: 10,
    font: fontHelveticaBold,
    color: rgb(0.2, 0.3, 0.6),
  });

  const features = [
    { name: 'Smooth Trackpad & Wheel Scrolling', status: 'VERIFIED [120 FPS]' },
    { name: 'Instant Luminance & Dark Inversion', status: 'VERIFIED [6 THEMES]' },
    { name: 'Text Selection & Freehand Highlighting', status: 'VERIFIED [TRANSLUCENT]' },
    { name: 'Draggable Image Attachment & Stamps', status: 'VERIFIED [MULTI-FORMAT]' },
    { name: 'PDF-Lib Binary Mutation & Export', status: 'VERIFIED [COMPLIANT]' },
  ];

  features.forEach((feat, idx) => {
    const yLine = p3H - 275 - idx * 16;
    page3.drawText(`[x] ${feat.name}`, {
      x: 55,
      y: yLine,
      size: 9,
      font: fontHelvetica,
      color: rgb(0.2, 0.25, 0.35),
    });
    page3.drawText(feat.status, {
      x: 390,
      y: yLine,
      size: 8.5,
      font: fontCourier,
      color: rgb(0.1, 0.55, 0.3),
    });
  });

  // Sign-off signature box
  page3.drawRectangle({
    x: 40,
    y: p3H - 490,
    width: 240,
    height: 70,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.8, 0.8, 0.85),
    borderWidth: 1,
  });

  page3.drawText('AUTHORIZED SIGNATURE / STAMP', {
    x: 50,
    y: p3H - 440,
    size: 8,
    font: fontHelveticaBold,
    color: rgb(0.5, 0.55, 0.6),
  });

  page3.drawText('Attach your signature image or stamp here', {
    x: 50,
    y: p3H - 475,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.65, 0.7, 0.75),
  });

  // Footer
  page3.drawText('Page 3 of 3 — Cinnabar Research Edition', {
    x: 40,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.5, 0.55, 0.6),
  });

  return await pdfDoc.save();
}
