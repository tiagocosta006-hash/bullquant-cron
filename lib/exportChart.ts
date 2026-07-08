export async function exportSvgToPng(container: HTMLElement, filename: string = 'chart.png') {
  const svgElement = container.querySelector('svg');
  if (!svgElement) return;

  // Clone to avoid mutating the original
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  
  // Explicitly set width/height from bounding box to ensure it renders correctly on canvas
  const rect = svgElement.getBoundingClientRect();
  clonedSvg.setAttribute('width', rect.width.toString());
  clonedSvg.setAttribute('height', rect.height.toString());

  // Replace 'currentColor' with actual computed color to prevent SVG bugs
  const computedColor = window.getComputedStyle(container).color || '#ffffff';
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clonedSvg);
  
  // SVG embedded in img tag can't access external CSS variables easily.
  // Replacing 'currentColor' helps with typical axis strokes in Recharts.
  svgString = svgString.replace(/currentColor/g, computedColor);

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = new Image();
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // Setup canvas dimensions with scale for high-DPI (Retina) displays
  const scale = window.devicePixelRatio || 2;
  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;
  ctx.scale(scale, scale);

  // Draw background (solid color for PNG)
  const computedBg = window.getComputedStyle(document.body).backgroundColor;
  // If transparent (default), use a sensible dark theme bg
  ctx.fillStyle = computedBg === 'rgba(0, 0, 0, 0)' ? '#09090b' : computedBg;
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Draw SVG image
  ctx.drawImage(img, 0, 0, rect.width, rect.height);

  // Load and draw watermark
  try {
    const logo = new Image();
    logo.src = '/logo-watermark.png'; // Make sure this is in public/
    await new Promise((resolve, reject) => {
      logo.onload = resolve;
      logo.onerror = reject;
    });

    ctx.globalAlpha = 0.3; // 30% opacity
    const padding = 20;
    const logoWidth = Math.min(120, logo.width);
    const ratio = logoWidth / logo.width;
    const logoHeight = logo.height * ratio;
    
    ctx.drawImage(
      logo, 
      rect.width - logoWidth - padding, 
      rect.height - logoHeight - padding,
      logoWidth,
      logoHeight
    );
  } catch (e) {
    console.warn("Watermark logo not found or failed to load. Exporting without it.", e);
  }

  // Trigger download
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
}
