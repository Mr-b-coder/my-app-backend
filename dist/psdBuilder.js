// server/psdBuilder.ts
import { writePsd, initializeCanvas } from 'ag-psd';
import { createCanvas } from 'canvas';
initializeCanvas(createCanvas);
var BindingType;
(function (BindingType) {
})(BindingType || (BindingType = {}));
const inchesToPixels = (inches, dpi = 300) => Math.round(inches * dpi);
export async function buildPsd(payload) {
    const dpi = 300;
    const canvasWidth = inchesToPixels(payload.totalWidth, dpi);
    const canvasHeight = inchesToPixels(payload.totalHeight, dpi);
    let layers = [];
    switch (payload.bindingName) {
        case BindingType.PERFECT_BIND:
            layers = buildPerfectBindLayers(payload, dpi);
            break;
        case BindingType.CASE_BIND:
            layers = buildCaseBindLayers(payload, dpi);
            break;
        case BindingType.COIL_WIRE_O_SOFTCOVER:
            layers = buildCoilWireLayers(payload, dpi, false);
            break;
        case BindingType.COIL_WIRE_O_HARDCOVER:
            layers = buildCoilWireLayers(payload, dpi, true);
            break;
        default:
            const errorCanvas = createCanvas(canvasWidth, canvasHeight);
            const errorCtx = errorCanvas.getContext('2d');
            errorCtx.font = '30px Arial';
            errorCtx.fillText(`PSD not supported for: ${payload.bindingName}`, 50, 50);
            layers.push({ name: 'Error', canvas: errorCanvas });
    }
    const psd = { width: canvasWidth, height: canvasHeight, children: layers };
    const buffer = writePsd(psd, { generateThumbnail: true });
    return Buffer.from(buffer);
}
function buildPerfectBindLayers(p, dpi) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, bleed, spineWidth, safetyMargin } = p;
    const canvasWidth = inchesToPixels(totalWidth, dpi);
    const canvasHeight = inchesToPixels(totalHeight, dpi);
    const bleedPx = inchesToPixels(bleed ?? 0, dpi);
    const spinePx = inchesToPixels(spineWidth ?? 0, dpi);
    const trimWidthPx = inchesToPixels(trimWidth, dpi);
    const trimHeightPx = inchesToPixels(trimHeight, dpi);
    const safetyPx = inchesToPixels(safetyMargin ?? 0, dpi);
    const leftSpineFoldX = bleedPx + trimWidthPx;
    const rightSpineFoldX = leftSpineFoldX + spinePx;
    // --- Create Canvases for Layers ---
    const bgFillCanvas = createCanvas(canvasWidth, canvasHeight);
    const spineFillCanvas = createCanvas(canvasWidth, canvasHeight);
    const pageFillCanvas = createCanvas(canvasWidth, canvasHeight);
    const guidesCanvas = createCanvas(canvasWidth, canvasHeight);
    const textCanvas = createCanvas(canvasWidth, canvasHeight);
    // Draw Background
    const bgCtx = bgFillCanvas.getContext('2d');
    bgCtx.fillStyle = '#093b6c';
    bgCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    // Draw Spine Fill
    const spineCtx = spineFillCanvas.getContext('2d');
    spineCtx.fillStyle = '#018685';
    spineCtx.fillRect(leftSpineFoldX, bleedPx, spinePx, trimHeightPx);
    // Draw Page Fill
    const pageCtx = pageFillCanvas.getContext('2d');
    pageCtx.fillStyle = '#f5f5f2';
    pageCtx.fillRect(bleedPx, bleedPx, trimWidthPx, trimHeightPx);
    pageCtx.fillRect(rightSpineFoldX, bleedPx, trimWidthPx, trimHeightPx);
    // Draw Dashed Safety Guides
    const guidesCtx = guidesCanvas.getContext('2d');
    guidesCtx.strokeStyle = '#22C55E';
    guidesCtx.lineWidth = 10;
    guidesCtx.setLineDash([25, 15]);
    guidesCtx.strokeRect(bleedPx + safetyPx, bleedPx + safetyPx, trimWidthPx - 2 * safetyPx, trimHeightPx - 2 * safetyPx);
    guidesCtx.strokeRect(rightSpineFoldX + safetyPx, bleedPx + safetyPx, trimWidthPx - 2 * safetyPx, trimHeightPx - 2 * safetyPx);
    guidesCtx.setLineDash([]);
    // Draw Text Labels
    const textCtx = textCanvas.getContext('2d');
    textCtx.font = `bold 64px Arial`;
    textCtx.fillStyle = 'rgba(0,0,0,0.5)';
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.fillText('BACK COVER', bleedPx + trimWidthPx / 2, canvasHeight / 2);
    textCtx.fillText('FRONT COVER', rightSpineFoldX + trimWidthPx / 2, canvasHeight / 2);
    textCtx.save();
    textCtx.translate(leftSpineFoldX + spinePx / 2, canvasHeight / 2);
    textCtx.rotate(-Math.PI / 2);
    textCtx.fillText(`Spine ${(spineWidth ?? 0).toFixed(3)} in`, 0, 0);
    textCtx.restore();
    return [
        { name: 'Background Color', canvas: bgFillCanvas },
        { name: 'Page & Spine Color', children: [{ name: 'Spine Fill', canvas: spineFillCanvas }, { name: 'Page Fill', canvas: pageFillCanvas }] },
        { name: 'Your Artwork Here', opacity: 255 },
        { name: 'GUIDES (Hide or Delete)', children: [{ name: 'Safety Margin', canvas: guidesCanvas }, { name: 'Labels', canvas: textCanvas }], opacity: 0.8 },
    ];
}
function buildCaseBindLayers(p, dpi) {
    // This can be built out similarly, creating multiple canvases for each element
    return buildPerfectBindLayers(p, dpi); // Placeholder to return a valid PSD
}
function buildCoilWireLayers(p, dpi, isHardcover) {
    const { totalWidth, totalHeight, safetyMargin } = p;
    const canvasWidth = inchesToPixels(totalWidth, dpi);
    const canvasHeight = inchesToPixels(totalHeight, dpi);
    const bgFillCanvas = createCanvas(canvasWidth, canvasHeight);
    const pageFillCanvas = createCanvas(canvasWidth, canvasHeight);
    const guidesCanvas = createCanvas(canvasWidth, canvasHeight);
    const textCanvas = createCanvas(canvasWidth, canvasHeight);
    const safetyPx = inchesToPixels(safetyMargin ?? 0.375, dpi);
    // Draw Background
    const bgCtx = bgFillCanvas.getContext('2d');
    bgCtx.fillStyle = '#093b6c';
    bgCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    // Draw Page Area
    let trimAreaX_px = 0, trimAreaY_px = 0, trimAreaW_px = 0, trimAreaH_px = 0;
    if (isHardcover) {
        const wrapPx = inchesToPixels(p.wrapAmount ?? 0, dpi);
        trimAreaX_px = wrapPx;
        trimAreaY_px = wrapPx;
        trimAreaW_px = canvasWidth - 2 * wrapPx;
        trimAreaH_px = canvasHeight - 2 * wrapPx;
    }
    else {
        const bleedPx = inchesToPixels(p.bleed ?? 0, dpi);
        trimAreaX_px = bleedPx;
        trimAreaY_px = bleedPx;
        trimAreaW_px = canvasWidth - 2 * bleedPx;
        trimAreaH_px = canvasHeight - 2 * bleedPx;
    }
    const pageCtx = pageFillCanvas.getContext('2d');
    pageCtx.fillStyle = '#f5f5f2';
    pageCtx.fillRect(trimAreaX_px, trimAreaY_px, trimAreaW_px, trimAreaH_px);
    // Draw Guides
    const guidesCtx = guidesCanvas.getContext('2d');
    guidesCtx.strokeStyle = '#22C55E';
    guidesCtx.lineWidth = 10;
    guidesCtx.setLineDash([25, 15]);
    guidesCtx.strokeRect(trimAreaX_px + safetyPx, trimAreaY_px + safetyPx, trimAreaW_px - 2 * safetyPx, trimAreaH_px - 2 * safetyPx);
    guidesCtx.setLineDash([]);
    // Draw text
    const textCtx = textCanvas.getContext('2d');
    textCtx.font = `bold 64px Arial`;
    textCtx.fillStyle = 'rgba(0,0,0,0.5)';
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.fillText('FRONT COVER', canvasWidth / 2, canvasHeight / 2);
    return [
        { name: 'Background Color', canvas: bgFillCanvas },
        { name: 'Page Color', canvas: pageFillCanvas },
        { name: 'Your Artwork Here', opacity: 255 },
        { name: 'GUIDES (Hide or Delete)', children: [{ name: 'Safety Margin', canvas: guidesCanvas }, { name: 'Labels', canvas: textCanvas }], opacity: 0.8 },
    ];
}
