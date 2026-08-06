type ExportOptions = {
  /** Título desenhado no topo do PNG — torna a imagem autossuficiente quando
   *  é partilhada fora do site, onde não há cartão nem cabeçalho à volta. */
  title?: string
  subtitle?: string
}

export async function exportSvgToPng(
  container: HTMLElement,
  filename: string = 'chart.png',
  options: ExportOptions = {},
) {
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

  // Os design tokens (var(--chart-1), var(--border), ...) NÃO resolvem dentro
  // de um SVG servido como data URL: não há folha de estilos, e o browser
  // desenha-os como preto. Resolvemos cada token para o seu valor computado
  // antes de serializar, senão o PNG sai com cores erradas — e é justamente
  // nos gráficos que usam tokens em vez de hex que isso se nota.
  const styles = window.getComputedStyle(container);
  svgString = svgString.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, token, fallback) => {
    const value = styles.getPropertyValue(token).trim();
    return value || (fallback ? String(fallback).trim() : computedColor);
  });

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

  // Faixa de cabeçalho reservada acima do gráfico quando há título.
  const headerHeight = options.title ? (options.subtitle ? 58 : 40) : 0;
  const totalHeight = rect.height + headerHeight;

  // Setup canvas dimensions with scale for high-DPI (Retina) displays
  const scale = window.devicePixelRatio || 2;
  canvas.width = rect.width * scale;
  canvas.height = totalHeight * scale;
  ctx.scale(scale, scale);

  // Draw background (solid color for PNG)
  const computedBg = window.getComputedStyle(document.body).backgroundColor;
  // If transparent (default), use a sensible dark theme bg
  ctx.fillStyle = computedBg === 'rgba(0, 0, 0, 0)' ? '#09090b' : computedBg;
  ctx.fillRect(0, 0, rect.width, totalHeight);

  if (options.title) {
    const cs = window.getComputedStyle(container);
    const family = cs.fontFamily || 'system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cs.getPropertyValue('--foreground').trim() || computedColor;
    ctx.font = `600 16px ${family}`;
    ctx.fillText(options.title, 16, 26);
    if (options.subtitle) {
      ctx.fillStyle = cs.getPropertyValue('--muted-foreground').trim() || computedColor;
      ctx.font = `400 12px ${family}`;
      ctx.fillText(options.subtitle, 16, 45);
    }
  }

  // Draw SVG image
  ctx.drawImage(img, 0, headerHeight, rect.width, rect.height);

  // Load and draw watermark
  try {
    const logo = new Image();
    logo.src = '/brand/bullocracy-logo.png';
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
      totalHeight - logoHeight - padding,
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
