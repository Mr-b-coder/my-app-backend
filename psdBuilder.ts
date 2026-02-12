// server/psdBuilder.ts

import * as agPsd from 'ag-psd';
const { writePsd, initializeCanvas } = agPsd;
import { Canvas, createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemplatePayload, BindingType } from './server.js'; // Import shared types

// FIX: This tells TypeScript to treat the 'node-canvas' Canvas as compatible with what ag-psd expects.
initializeCanvas(createCanvas as any);

// --- FINAL, SIMPLIFIED ROBUST PATHING ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// After our build step, the 'Assets' folder will be right next to this running file.
const LOGO_PATH = path.join(__dirname, 'Assets', 'logo.png');
const FONT_REGULAR_PATH = path.join(__dirname, 'Assets', 'Poppins-Regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, 'Assets', 'Poppins-Bold.ttf');


// Register fonts for canvas text rendering
try {
    registerFont(FONT_REGULAR_PATH, { family: 'Poppins-Regular' });
    registerFont(FONT_BOLD_PATH, { family: 'Poppins-Bold' });
} catch (error) {
    console.warn('Could not load custom fonts, falling back to system fonts');
}

const COLORS = {
  background: '#204B7F', 
  bleedArea: '#018685',
  spine: '#EB746C',
  page: '#FFFFFF',
  safety: 'rgba(0, 255, 0, 0.7)',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  white: '#FFFFFF',
  indicator: {
    bleed: '#018685',
    safety: '#204B7F', 
    barcode: '#FAD571',
    docSize: '#018685',
    trim: '#204B7F',
    spine: '#EB746C',
    punchHole: '#999999',
  }
};

const inchesToPixels = (inches: number, dpi: number = 300): number => Math.round(inches * dpi);

export async function buildPsd(payload: TemplatePayload): Promise<Buffer> {
    const dpi = 300;
    const canvasWidth = inchesToPixels(payload.totalWidth, dpi);
    const canvasHeight = inchesToPixels(payload.totalHeight, dpi);
    let layers: any[] = [];
    let guides: any[] = [];

    // Load assets
    const logoBuffer = await fs.readFile(LOGO_PATH).catch(() => null);
    const assets = { logoImage: logoBuffer ? await loadImage(logoBuffer) : null };

    switch (payload.bindingName) {
        case BindingType.PERFECT_BIND:
        case BindingType.SADDLE_STITCH:
            layers = buildPerfectBindLayers(payload, dpi, assets);
            guides = createPerfectBindGuides(payload, dpi);
            break;
        case BindingType.CASE_BIND:
            layers = buildCaseBindLayers(payload, dpi, assets);
            guides = createCaseBindGuides(payload, dpi);
            break;
        case BindingType.COIL_WIRE_O_SOFTCOVER:
            layers = buildCoilWireLayers(payload, dpi, assets, false);
            guides = createCoilWireGuides(payload, dpi, false);
            break;
        case BindingType.COIL_WIRE_O_HARDCOVER:
            layers = buildCoilWireLayers(payload, dpi, assets, true);
            guides = createCoilWireGuides(payload, dpi, true);
            break;
        default:
            const errorCanvas = createCanvas(canvasWidth, canvasHeight);
            const errorCtx = errorCanvas.getContext('2d');
            errorCtx.fillStyle = COLORS.background;
            errorCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            errorCtx.fillStyle = COLORS.white;
            errorCtx.font = 'bold 80px Arial';
            errorCtx.textAlign = 'center';
            errorCtx.fillText(`PSD for ${payload.bindingName}`, canvasWidth / 2, canvasHeight / 2 - 40);
            errorCtx.fillText('coming soon.', canvasWidth / 2, canvasHeight / 2 + 40);
            layers.push({ name: 'Coming Soon', canvas: errorCanvas });
    }
    
    const compositeCanvas = createCanvas(canvasWidth, canvasHeight);
    const compositeCtx = compositeCanvas.getContext('2d');
    
    function flattenAndDrawLayers(layersArray: any[], context: CanvasRenderingContext2D) {
        for (const layer of layersArray) {
            if (layer.canvas) {
                context.drawImage(layer.canvas, 0, 0);
            }
            if (layer.children && Array.isArray(layer.children)) {
                flattenAndDrawLayers(layer.children, context);
            }
        }
    }

    flattenAndDrawLayers(layers, compositeCtx);

    const psd = {
        width: canvasWidth,
        height: canvasHeight,
        imageResources: {
            resolutionInfo: {
                horizontalResolution: dpi,
                horizontalResolutionUnit: 'ppi',
                widthUnit: 'in',
                verticalResolution: dpi,
                verticalResolutionUnit: 'ppi',
                heightUnit: 'in',
            },
            gridAndGuidesInformation: guides.length > 0 ? { guides } : undefined,
        },
        children: layers,
        canvas: compositeCanvas
    };
    
    const buffer = writePsd(psd as unknown as agPsd.Psd, { 
        generateThumbnail: true,
    });

    return Buffer.from(buffer);
}

// --- GUIDE CREATION FUNCTIONS ---

function createPerfectBindGuides(p: TemplatePayload, dpi: number) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, bleed, spineWidth, safetyMargin } = p;
    const bleedPx = inchesToPixels(bleed ?? 0, dpi);
    const spinePx = inchesToPixels(spineWidth ?? 0, dpi);
    const trimWidthPx = inchesToPixels(trimWidth, dpi);
    const trimHeightPx = inchesToPixels(trimHeight, dpi);
    const safetyPx = inchesToPixels(safetyMargin ?? 0.375, dpi);
    const totalWidthPx = inchesToPixels(totalWidth, dpi);
    const totalHeightPx = inchesToPixels(totalHeight, dpi);
    const leftSpineFoldX = bleedPx + trimWidthPx;
    const rightSpineFoldX = leftSpineFoldX + spinePx;
    
    return [
        { location: bleedPx, direction: 'horizontal' }, { location: totalHeightPx - bleedPx, direction: 'horizontal' },
        { location: bleedPx + safetyPx, direction: 'horizontal' }, { location: totalHeightPx - bleedPx - safetyPx, direction: 'horizontal' },
        { location: bleedPx, direction: 'vertical' }, { location: bleedPx + safetyPx, direction: 'vertical' },
        { location: leftSpineFoldX - safetyPx, direction: 'vertical' }, { location: leftSpineFoldX, direction: 'vertical' },
        { location: rightSpineFoldX, direction: 'vertical' }, { location: rightSpineFoldX + safetyPx, direction: 'vertical' },
        { location: totalWidthPx - bleedPx - safetyPx, direction: 'vertical' }, { location: totalWidthPx - bleedPx, direction: 'vertical' },
    ];
}

function createCaseBindGuides(p: TemplatePayload, dpi: number) {
    const { totalWidth, totalHeight, wrapAmount, spineWidth, safetyMargin } = p;
    const wrapPx = inchesToPixels(wrapAmount ?? 0.75, dpi);
    const spinePx = inchesToPixels(spineWidth ?? 0, dpi);
    const safetyPx = inchesToPixels(safetyMargin ?? 0.5, dpi);
    const totalWidthPx = inchesToPixels(totalWidth, dpi);
    const totalHeightPx = inchesToPixels(totalHeight, dpi);
    const backgroundWidth = totalWidthPx - 2 * wrapPx;
    const leftCoverWidth = (backgroundWidth - spinePx) / 2;
    const spineStartX = wrapPx + leftCoverWidth;

    return [
        { location: wrapPx, direction: 'horizontal' }, { location: totalHeightPx - wrapPx, direction: 'horizontal' },
        { location: wrapPx + safetyPx, direction: 'horizontal' }, { location: totalHeightPx - wrapPx - safetyPx, direction: 'horizontal' },
        { location: wrapPx, direction: 'vertical' }, { location: wrapPx + safetyPx, direction: 'vertical' },
        { location: spineStartX - safetyPx, direction: 'vertical' }, { location: spineStartX, direction: 'vertical' },
        { location: spineStartX + spinePx, direction: 'vertical' }, { location: spineStartX + spinePx + safetyPx, direction: 'vertical' },
        { location: totalWidthPx - wrapPx - safetyPx, direction: 'vertical' }, { location: totalWidthPx - wrapPx, direction: 'vertical' },
    ];
}

function createCoilWireGuides(p: TemplatePayload, dpi: number, isHardcover: boolean) {
    const { totalWidth, totalHeight } = p;
    const totalWidthPx = inchesToPixels(totalWidth, dpi);
    const totalHeightPx = inchesToPixels(totalHeight, dpi);
    
    let topMargin, bottomMargin, outsideMargin, bindingMargin, trimAreaOffset;

    if (isHardcover) {
        const wrapPx = inchesToPixels(p.wrapAmount ?? 0, dpi);
        topMargin = inchesToPixels(0.375, dpi); bottomMargin = inchesToPixels(0.375, dpi);
        outsideMargin = inchesToPixels(0.375, dpi); bindingMargin = inchesToPixels(0.625, dpi);
        trimAreaOffset = wrapPx;
    } else {
        const bleedPx = inchesToPixels(p.bleed ?? 0, dpi);
        topMargin = inchesToPixels(p.safetyMarginTopBottom ?? 0.375, dpi); bottomMargin = inchesToPixels(p.safetyMarginTopBottom ?? 0.375, dpi);
        outsideMargin = inchesToPixels(p.safetyMarginOutsideEdge ?? 0.375, dpi); bindingMargin = inchesToPixels(p.safetyMarginBindingEdge ?? 0.75, dpi);
        trimAreaOffset = bleedPx;
    }

    return [
        { location: trimAreaOffset, direction: 'horizontal' }, { location: totalHeightPx - trimAreaOffset, direction: 'horizontal' },
        { location: trimAreaOffset + bottomMargin, direction: 'horizontal' }, { location: totalHeightPx - trimAreaOffset - topMargin, direction: 'horizontal' },
        { location: trimAreaOffset, direction: 'vertical' }, { location: trimAreaOffset + bindingMargin, direction: 'vertical' },
        { location: totalWidthPx - trimAreaOffset - outsideMargin, direction: 'vertical' }, { location: totalWidthPx - trimAreaOffset, direction: 'vertical' },
        { location: trimAreaOffset + inchesToPixels(0.375, dpi), direction: 'vertical' }, { location: totalWidthPx - trimAreaOffset - inchesToPixels(0.375, dpi), direction: 'vertical' },
    ];
}

// --- LAYER BUILDER FUNCTIONS ---

function buildPerfectBindLayers(p: TemplatePayload, dpi: number, assets: any) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, bleed, spineWidth, safetyMargin } = p;
    const canvasWidth = inchesToPixels(totalWidth, dpi); const canvasHeight = inchesToPixels(totalHeight, dpi);
    const bleedPx = inchesToPixels(bleed ?? 0, dpi); const spinePx = inchesToPixels(spineWidth ?? 0, dpi);
    const trimWidthPx = inchesToPixels(trimWidth, dpi); const trimHeightPx = inchesToPixels(trimHeight, dpi);
    const safetyPx = inchesToPixels(safetyMargin ?? 0.375, dpi);
    const leftSpineFoldX = bleedPx + trimWidthPx; const rightSpineFoldX = leftSpineFoldX + spinePx;
    
    const bleedAreaCanvas = createCanvas(canvasWidth, canvasHeight);
    const bleedCtx = bleedAreaCanvas.getContext('2d');
    bleedCtx.fillStyle = COLORS.bleedArea; bleedCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    const backgroundCanvas = createCanvas(canvasWidth, canvasHeight);
    const bgCtx = backgroundCanvas.getContext('2d');
    bgCtx.fillStyle = COLORS.background; bgCtx.fillRect(bleedPx, bleedPx, canvasWidth - 2 * bleedPx, trimHeightPx);

    const spineCanvas = createCanvas(canvasWidth, canvasHeight);
    const spineCtx = spineCanvas.getContext('2d');
    spineCtx.fillStyle = COLORS.spine; spineCtx.fillRect(leftSpineFoldX, 0, spinePx, canvasHeight);

    const whitePageCanvas = createCanvas(canvasWidth, canvasHeight);
    const pageCtx = whitePageCanvas.getContext('2d');
    pageCtx.fillStyle = COLORS.page;
    pageCtx.fillRect(bleedPx + safetyPx, bleedPx + safetyPx, trimWidthPx - 2 * safetyPx, trimHeightPx - 2 * safetyPx);
    pageCtx.fillRect(rightSpineFoldX + safetyPx, bleedPx + safetyPx, trimWidthPx - 2 * safetyPx, trimHeightPx - 2 * safetyPx);

    const infoCanvas = createCanvas(canvasWidth, canvasHeight);
    const infoCtx = infoCanvas.getContext('2d');
    drawPerfectBindInfo(infoCtx, p, dpi, bleedPx, safetyPx, trimWidthPx, trimHeightPx, leftSpineFoldX, rightSpineFoldX, canvasHeight);

    const textLogoCanvas = createCanvas(canvasWidth, canvasHeight);
    const textCtx = textLogoCanvas.getContext('2d');
    drawLogosAndLabels(textCtx, assets, dpi, bleedPx, safetyPx, trimWidthPx, trimHeightPx, leftSpineFoldX, rightSpineFoldX);

    return [
        { name: 'Bleed/Wrap Area', canvas: bleedAreaCanvas, locked: true },
        { name: 'Background Color', canvas: backgroundCanvas },
        { name: 'Spine Color', canvas: spineCanvas },
        { 
            name: 'Your Artwork Here',
            children: [
                { name: 'White Page Area', canvas: whitePageCanvas },
                { name: 'Information', canvas: infoCanvas },
                { name: 'Logo & Text', canvas: textLogoCanvas }
            ]
        },
    ];
}

function buildCaseBindLayers(p: TemplatePayload, dpi: number, assets: any) {
    const { totalWidth, totalHeight, wrapAmount, spineWidth, safetyMargin } = p;
    const canvasWidth = inchesToPixels(totalWidth, dpi); const canvasHeight = inchesToPixels(totalHeight, dpi);
    const wrapPx = inchesToPixels(wrapAmount ?? 0.75, dpi); const spinePx = inchesToPixels(spineWidth ?? 0, dpi);
    const safetyPx = inchesToPixels(safetyMargin ?? 0.5, dpi);
    const backgroundWidth = canvasWidth - 2 * wrapPx; const backgroundHeight = canvasHeight - 2 * wrapPx;
    const leftCoverWidth = (backgroundWidth - spinePx) / 2; const spineStartX = wrapPx + leftCoverWidth;

    const wrapAreaCanvas = createCanvas(canvasWidth, canvasHeight);
    const wrapCtx = wrapAreaCanvas.getContext('2d');
    wrapCtx.fillStyle = COLORS.bleedArea; wrapCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    const backgroundCanvas = createCanvas(canvasWidth, canvasHeight);
    const bgCtx = backgroundCanvas.getContext('2d');
    bgCtx.fillStyle = COLORS.background; bgCtx.fillRect(wrapPx, wrapPx, backgroundWidth, backgroundHeight);

    const spineCanvas = createCanvas(canvasWidth, canvasHeight);
    const spineCtx = spineCanvas.getContext('2d');
    spineCtx.fillStyle = COLORS.spine; spineCtx.fillRect(spineStartX, 0, spinePx, canvasHeight);

    const whitePageCanvas = createCanvas(canvasWidth, canvasHeight);
    const pageCtx = whitePageCanvas.getContext('2d');
    pageCtx.fillStyle = COLORS.page;
    pageCtx.fillRect(wrapPx + safetyPx, wrapPx + safetyPx, leftCoverWidth - 2 * safetyPx, backgroundHeight - 2 * safetyPx);
    pageCtx.fillRect(spineStartX + spinePx + safetyPx, wrapPx + safetyPx, leftCoverWidth - 2 * safetyPx, backgroundHeight - 2 * safetyPx);

    const infoCanvas = createCanvas(canvasWidth, canvasHeight);
    const infoCtx = infoCanvas.getContext('2d');
    drawCaseBindInfo(infoCtx, p, dpi, wrapPx, safetyPx, leftCoverWidth, backgroundHeight, spineStartX, spinePx, canvasHeight);

    const textLogoCanvas = createCanvas(canvasWidth, canvasHeight);
    const textCtx = textLogoCanvas.getContext('2d');
    drawCaseBindLogosAndLabels(textCtx, assets, dpi, wrapPx, safetyPx, leftCoverWidth, backgroundHeight, spineStartX, spinePx);

    return [
        { name: 'Wrap Area', canvas: wrapAreaCanvas, locked: true },
        { name: 'Background Color', canvas: backgroundCanvas },
        { name: 'Spine Color', canvas: spineCanvas },
        { 
            name: 'Your Artwork Here',
            children: [
                { name: 'White Page Area', canvas: whitePageCanvas },
                { name: 'Information', canvas: infoCanvas },
                { name: 'Logo & Text', canvas: textLogoCanvas }
            ]
        },
    ];
}

function buildCoilWireLayers(p: TemplatePayload, dpi: number, assets: any, isHardcover: boolean) {
    const frontLayers = buildCoilWirePage(p, dpi, assets, true, isHardcover, 'FRONT');
    const backLayers = buildCoilWirePage(p, dpi, assets, false, isHardcover, 'BACK');

    return [
        {
            name: 'Back Cover', 
            children: backLayers
        },
        {
            name: 'Front Cover',
            children: frontLayers
        }
    ];
}

function buildCoilWirePage(p: TemplatePayload, dpi: number, assets: any, isFrontCover: boolean, isHardcover: boolean, pageType: string) {
    const { totalWidth, totalHeight } = p;
    const canvasWidth = inchesToPixels(totalWidth, dpi);
    const canvasHeight = inchesToPixels(totalHeight, dpi);
    
    let topMargin, bottomMargin, outsideMargin, bindingMargin;
    let trimAreaOffset, trimAreaWidth, trimAreaHeight;

    if (isHardcover) {
        const wrapPx = inchesToPixels(p.wrapAmount ?? 0, dpi);
        topMargin = inchesToPixels(0.375, dpi); bottomMargin = inchesToPixels(0.375, dpi);
        outsideMargin = inchesToPixels(0.375, dpi); bindingMargin = inchesToPixels(0.625, dpi);
        trimAreaOffset = wrapPx;
        trimAreaWidth = canvasWidth - 2 * wrapPx; trimAreaHeight = canvasHeight - 2 * wrapPx;
    } else {
        const bleedPx = inchesToPixels(p.bleed ?? 0, dpi);
        topMargin = inchesToPixels(p.safetyMarginTopBottom ?? 0.375, dpi); bottomMargin = inchesToPixels(p.safetyMarginTopBottom ?? 0.375, dpi);
        outsideMargin = inchesToPixels(p.safetyMarginOutsideEdge ?? 0.375, dpi); bindingMargin = inchesToPixels(p.safetyMarginBindingEdge ?? 0.75, dpi);
        trimAreaOffset = bleedPx;
        trimAreaWidth = canvasWidth - 2 * bleedPx; trimAreaHeight = canvasHeight - 2 * bleedPx;
    }

    const leftMargin = isFrontCover ? bindingMargin : outsideMargin;
    const rightMargin = isFrontCover ? outsideMargin : bindingMargin;

    const bleedCanvas = createCanvas(canvasWidth, canvasHeight);
    const bleedCtx = bleedCanvas.getContext('2d');
    bleedCtx.fillStyle = COLORS.bleedArea; bleedCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    const backgroundCanvas = createCanvas(canvasWidth, canvasHeight);
    const bgCtx = backgroundCanvas.getContext('2d');
    bgCtx.fillStyle = COLORS.background; bgCtx.fillRect(trimAreaOffset, trimAreaOffset, trimAreaWidth, trimAreaHeight);

    const whitePageCanvas = createCanvas(canvasWidth, canvasHeight);
    const pageCtx = whitePageCanvas.getContext('2d');
    pageCtx.fillStyle = COLORS.page;
    pageCtx.fillRect(
        trimAreaOffset + leftMargin, 
        trimAreaOffset + bottomMargin, 
        trimAreaWidth - leftMargin - rightMargin, 
        trimAreaHeight - topMargin - bottomMargin
    );

    const punchHoleCanvas = createCanvas(canvasWidth, canvasHeight);
    const punchCtx = punchHoleCanvas.getContext('2d');
    drawPunchHoles(punchCtx, dpi, isFrontCover, trimAreaOffset, trimAreaWidth, trimAreaHeight, canvasHeight);

    const infoCanvas = createCanvas(canvasWidth, canvasHeight);
    const infoCtx = infoCanvas.getContext('2d');
    drawCoilWireInfo(infoCtx, p, dpi, trimAreaOffset, bindingMargin, outsideMargin, topMargin, bottomMargin, canvasWidth, canvasHeight, isHardcover, isFrontCover);

    const logoCanvas = createCanvas(canvasWidth, canvasHeight);
    const logoCtx = logoCanvas.getContext('2d');
    drawCoilWireLogosAndLabels(logoCtx, assets, dpi, trimAreaOffset, bindingMargin, outsideMargin, topMargin, bottomMargin, canvasWidth, canvasHeight, isFrontCover, pageType);

    return [
        { name: `${pageType} - Bleed/Wrap Area`, canvas: bleedCanvas, locked: true },
        { name: `${pageType} - Background Color`, canvas: backgroundCanvas },
        { name: `${pageType} - White Page Area`, canvas: whitePageCanvas },
        { name: `${pageType} - Punch Holes`, canvas: punchHoleCanvas },
        { name: `${pageType} - Information`, canvas: infoCanvas },
        { name: `${pageType} - Logo & Text`, canvas: logoCanvas },
    ];
}

// --- DRAWING HELPER FUNCTIONS ---

function drawLogosAndLabels(ctx: CanvasRenderingContext2D, assets: any, dpi: number, bleedPx: number, safetyPx: number, trimWidthPx: number, trimHeightPx: number, leftSpineFoldX: number, rightSpineFoldX: number) {
    if (assets.logoImage) {
        const logoScale = 1.2;
        const logoY = bleedPx + safetyPx + inchesToPixels(0.5, dpi);
        
        const backCoverCenterX = bleedPx + safetyPx + (trimWidthPx - 2 * safetyPx) / 2;
        ctx.drawImage(
            assets.logoImage, 
            backCoverCenterX - (assets.logoImage.width * logoScale / 2), logoY, 
            assets.logoImage.width * logoScale, assets.logoImage.height * logoScale
        );
        
        const frontCoverCenterX = rightSpineFoldX + safetyPx + (trimWidthPx - 2 * safetyPx) / 2;
        ctx.drawImage(
            assets.logoImage, 
            frontCoverCenterX - (assets.logoImage.width * logoScale / 2), logoY, 
            assets.logoImage.width * logoScale, assets.logoImage.height * logoScale
        );
        
        const fontSize = inchesToPixels(0.25, dpi);
        ctx.font = `bold ${fontSize}px Poppins-Bold, Arial, sans-serif`;
        ctx.fillStyle = COLORS.textPrimary; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        
        const textY = logoY + (assets.logoImage.height * logoScale) + inchesToPixels(0.3, dpi);
        ctx.fillText('BACK COVER', backCoverCenterX, textY);
        ctx.fillText('FRONT COVER', frontCoverCenterX, textY);
    }
}

function drawPerfectBindInfo(ctx: CanvasRenderingContext2D, p: TemplatePayload, dpi: number, bleedPx: number, safetyPx: number, trimWidthPx: number, trimHeightPx: number, leftSpineFoldX: number, rightSpineFoldX: number, canvasHeight: number) {
    const leftColumnX = bleedPx + safetyPx + inchesToPixels(0.3, dpi);
    const rightColumnX = rightSpineFoldX + safetyPx + inchesToPixels(0.3, dpi);
    let leftCurrentY = bleedPx + inchesToPixels(3.0, dpi);
    let rightCurrentY = bleedPx + inchesToPixels(3.0, dpi);
    const lineHeight = inchesToPixels(0.8, dpi);
    const headerSize = inchesToPixels(0.18, dpi);
    const descSize = inchesToPixels(0.14, dpi);
    
    drawInfoLine(ctx, leftColumnX, leftCurrentY, COLORS.indicator.bleed, `${(p.bleed ?? 0).toFixed(3)} in`, 'Bleed Area - Extend your color or BG till bleed area', headerSize, descSize);
    leftCurrentY += lineHeight;
    drawInfoLine(ctx, leftColumnX, leftCurrentY, COLORS.indicator.safety, `${(p.safetyMargin ?? 0.375).toFixed(3)} in`, 'Safety Margin Keep all your important text inside it', headerSize, descSize);
    leftCurrentY += lineHeight;
    drawInfoLine(ctx, leftColumnX, leftCurrentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional', headerSize, descSize);
    
    drawInfoLine(ctx, rightColumnX, rightCurrentY, COLORS.indicator.docSize, `${p.totalWidth.toFixed(3)} x ${p.totalHeight.toFixed(3)} in`, 'Total Document Size with bleed', headerSize, descSize);
    rightCurrentY += lineHeight;
    drawInfoLine(ctx, rightColumnX, rightCurrentY, COLORS.indicator.trim, `${p.trimWidth} x ${p.trimHeight} in`, 'Trim Size', headerSize, descSize);
    rightCurrentY += lineHeight;
    
    const spineWidth = (p.spineWidth ?? 0).toFixed(3);
    let spineDescription = `Spine Area for ${p.pageCount || 190} pages using ${p.paperStock || '60# Uncoated'}`;
    if ((p.spineWidth ?? 0) < 0.125) { spineDescription = `(Do not add text on Spine if it's below 0.125")`; }
    drawInfoLine(ctx, rightColumnX, rightCurrentY, COLORS.indicator.spine, spineWidth, spineDescription, headerSize, descSize);
    
    const barcodeW = inchesToPixels(1.75, dpi); const barcodeH = inchesToPixels(1, dpi);
    const barcodeX = bleedPx + trimWidthPx - safetyPx - barcodeW - inchesToPixels(0.1, dpi);
    const barcodeY = bleedPx + trimHeightPx - safetyPx - barcodeH - inchesToPixels(0.1, dpi);
    ctx.fillStyle = COLORS.indicator.barcode; ctx.globalAlpha = 0.8;
    ctx.fillRect(barcodeX, barcodeY, barcodeW, barcodeH); ctx.globalAlpha = 1.0;
}

function drawCaseBindInfo(ctx: CanvasRenderingContext2D, p: TemplatePayload, dpi: number, wrapPx: number, safetyPx: number, leftCoverWidth: number, backgroundHeight: number, spineStartX: number, spinePx: number, canvasHeight: number) {
    const leftColumnX = wrapPx + safetyPx + inchesToPixels(0.3, dpi);
    const rightColumnX = spineStartX + spinePx + safetyPx + inchesToPixels(0.3, dpi);
    let leftCurrentY = wrapPx + inchesToPixels(3.0, dpi);
    let rightCurrentY = wrapPx + inchesToPixels(3.0, dpi);
    const lineHeight = inchesToPixels(0.8, dpi);
    const headerSize = inchesToPixels(0.18, dpi);
    const descSize = inchesToPixels(0.14, dpi);
    
    drawInfoLine(ctx, leftColumnX, leftCurrentY, COLORS.indicator.bleed, `${(p.wrapAmount ?? 0.75).toFixed(3)} in`, 'Wrap Area - Extend your color or BG till here', headerSize, descSize);
    leftCurrentY += lineHeight;
    drawInfoLine(ctx, leftColumnX, leftCurrentY, COLORS.indicator.safety, `${(p.safetyMargin ?? 0.5).toFixed(3)} in`, 'Safety Margin Keep all your important text inside it', headerSize, descSize);
    leftCurrentY += lineHeight;
    drawInfoLine(ctx, leftColumnX, leftCurrentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional', headerSize, descSize);
    
    drawInfoLine(ctx, rightColumnX, rightCurrentY, COLORS.indicator.docSize, `${p.totalWidth.toFixed(3)} x ${p.totalHeight.toFixed(3)} in`, 'Total Document Size with wrap', headerSize, descSize);
    rightCurrentY += lineHeight;
    drawInfoLine(ctx, rightColumnX, rightCurrentY, COLORS.indicator.trim, `${p.trimWidth} x ${p.trimHeight} in`, 'Trim Size', headerSize, descSize);
    rightCurrentY += lineHeight;
    
    const spineWidth = (p.spineWidth ?? 0).toFixed(3);
    let spineDescription = `Spine Area for ${p.pageCount || 190} pages using ${p.paperStock || '60# Uncoated'}`;
    if ((p.spineWidth ?? 0) < 0.25) { spineDescription = `(Spine text not recommended if below 0.25")`; }
    drawInfoLine(ctx, rightColumnX, rightCurrentY, COLORS.indicator.spine, spineWidth, spineDescription, headerSize, descSize);
    
    const barcodeW = inchesToPixels(1.75, dpi); const barcodeH = inchesToPixels(1, dpi);
    const barcodeX = wrapPx + leftCoverWidth - safetyPx - barcodeW - inchesToPixels(0.1, dpi);
    const barcodeY = wrapPx + backgroundHeight - safetyPx - barcodeH - inchesToPixels(0.1, dpi);
    ctx.fillStyle = COLORS.indicator.barcode; ctx.globalAlpha = 0.8;
    ctx.fillRect(barcodeX, barcodeY, barcodeW, barcodeH); ctx.globalAlpha = 1.0;
}

function drawCaseBindLogosAndLabels(ctx: CanvasRenderingContext2D, assets: any, dpi: number, wrapPx: number, safetyPx: number, leftCoverWidth: number, backgroundHeight: number, spineStartX: number, spinePx: number) {
    if (assets.logoImage) {
        const logoScale = 1.2;
        const logoY = wrapPx + safetyPx + inchesToPixels(0.5, dpi);
        
        const backCoverCenterX = wrapPx + safetyPx + (leftCoverWidth - 2 * safetyPx) / 2;
        ctx.drawImage(
            assets.logoImage,
            backCoverCenterX - (assets.logoImage.width * logoScale / 2), logoY,
            assets.logoImage.width * logoScale, assets.logoImage.height * logoScale
        );
        
        const frontCoverCenterX = spineStartX + spinePx + safetyPx + (leftCoverWidth - 2 * safetyPx) / 2;
        ctx.drawImage(
            assets.logoImage,
            frontCoverCenterX - (assets.logoImage.width * logoScale / 2), logoY,
            assets.logoImage.width * logoScale, assets.logoImage.height * logoScale
        );
        
        const fontSize = inchesToPixels(0.25, dpi);
        ctx.font = `bold ${fontSize}px Poppins-Bold, Arial, sans-serif`;
        ctx.fillStyle = COLORS.textPrimary; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        
        const textY = logoY + (assets.logoImage.height * logoScale) + inchesToPixels(0.3, dpi);
        ctx.fillText('BACK COVER', backCoverCenterX, textY);
        ctx.fillText('FRONT COVER', frontCoverCenterX, textY);
    }
}

function drawCoilWireInfo(ctx: CanvasRenderingContext2D, p: TemplatePayload, dpi: number, trimAreaOffset: number, bindingMargin: number, outsideMargin: number, topMargin: number, bottomMargin: number, canvasWidth: number, canvasHeight: number, isHardcover: boolean, isFrontCover: boolean) {
    const leftMargin = isFrontCover ? bindingMargin : outsideMargin;
    const columnX = trimAreaOffset + leftMargin + inchesToPixels(0.3, dpi);
    let currentY = trimAreaOffset + inchesToPixels(3.0, dpi);
    const lineHeight = inchesToPixels(0.8, dpi);
    const headerSize = inchesToPixels(0.18, dpi);
    const descSize = inchesToPixels(0.14, dpi);
    
    if (isFrontCover) {
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.docSize, `${p.totalWidth.toFixed(3)} x ${p.totalHeight.toFixed(3)} in`, isHardcover ? 'Total Document Size with wrap' : 'Total Document Size with bleed', headerSize, descSize);
        currentY += lineHeight;
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.trim, `${p.trimWidth} x ${p.trimHeight} in`, 'Trim Size', headerSize, descSize);
        currentY += lineHeight;
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.punchHole, `0.375" punchhole`, 'leave extra margin on left side', headerSize, descSize);
    } else {
        const val = isHardcover ? `${(p.wrapAmount ?? 0).toFixed(3)} in` : `${(p.bleed ?? 0).toFixed(3)} in`;
        const desc = isHardcover ? 'Wrap Area - Extend your color or BG till here' : 'Bleed Area - Extend your color or BG till bleed area';
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.bleed, val, desc, headerSize, descSize);
        currentY += lineHeight;
        
        const safetyValue = (p.safetyMarginOutsideEdge ?? p.safetyMargin ?? 0.375).toFixed(3);
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.safety, `${safetyValue} in`, 'Safety Margin Keep all your important text inside it', headerSize, descSize);
        currentY += lineHeight;
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional', headerSize, descSize);
        currentY += lineHeight;
        drawInfoLine(ctx, columnX, currentY, COLORS.indicator.punchHole, `0.375" punchhole`, 'leave extra margin on Right side', headerSize, descSize);
        
        const barcodeW = inchesToPixels(1.75, dpi);
        const barcodeH = inchesToPixels(1, dpi);
        const trimAreaWidth = canvasWidth - 2 * trimAreaOffset;
        const trimAreaHeight = canvasHeight - 2 * trimAreaOffset;
        const whiteAreaRightEdge = trimAreaOffset + trimAreaWidth - outsideMargin;
        const whiteAreaBottomEdge = trimAreaOffset + trimAreaHeight - topMargin;
        
        const tenPointsInPixels = inchesToPixels(10 / 72, dpi);
        const barcodeX = whiteAreaRightEdge - barcodeW - inchesToPixels(0.1, dpi) - tenPointsInPixels;
        const barcodeY = whiteAreaBottomEdge - barcodeH - inchesToPixels(0.1, dpi);

        ctx.fillStyle = COLORS.indicator.barcode;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(barcodeX, barcodeY, barcodeW, barcodeH);
        ctx.globalAlpha = 1.0;
    }
}

function drawCoilWireLogosAndLabels(ctx: CanvasRenderingContext2D, assets: any, dpi: number, trimAreaOffset: number, bindingMargin: number, outsideMargin: number, topMargin: number, bottomMargin: number, canvasWidth: number, canvasHeight: number, isFrontCover: boolean, pageType: string) {
    if (assets.logoImage) {
        const leftMargin = isFrontCover ? bindingMargin : outsideMargin;
        const rightMargin = isFrontCover ? outsideMargin : bindingMargin;
        const trimAreaWidth = canvasWidth - 2 * trimAreaOffset;
        
        const logoScale = 1.2;
        const logoY = trimAreaOffset + bottomMargin + inchesToPixels(0.5, dpi);
        const coverCenterX = trimAreaOffset + leftMargin + (trimAreaWidth - leftMargin - rightMargin) / 2;
        
        ctx.drawImage(
            assets.logoImage,
            coverCenterX - (assets.logoImage.width * logoScale / 2), logoY,
            assets.logoImage.width * logoScale, assets.logoImage.height * logoScale
        );
        
        const fontSize = inchesToPixels(0.25, dpi);
        ctx.font = `bold ${fontSize}px Poppins-Bold, Arial, sans-serif`;
        ctx.fillStyle = COLORS.textPrimary; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        
        const textY = logoY + (assets.logoImage.height * logoScale) + inchesToPixels(0.3, dpi);
        ctx.fillText(`${pageType} COVER`, coverCenterX, textY);
    }
}

function drawPunchHoles(ctx: CanvasRenderingContext2D, dpi: number, isFrontCover: boolean, trimAreaOffset: number, trimAreaWidth: number, trimAreaHeight: number, canvasHeight: number) {
    const punchHoleRadius = inchesToPixels(0.075, dpi);
    const punchHoleSpacing = inchesToPixels(0.375, dpi);
    const punchHoleCenterOffset = inchesToPixels(0.375, dpi);
    
    const punchHoleStartX = isFrontCover 
        ? trimAreaOffset + punchHoleCenterOffset 
        : trimAreaOffset + trimAreaWidth - punchHoleCenterOffset;
    
    ctx.fillStyle = COLORS.indicator.punchHole; ctx.globalAlpha = 0.3;
    
    for (let y = trimAreaOffset + punchHoleSpacing / 2; y <= trimAreaOffset + trimAreaHeight; y += punchHoleSpacing) {
        ctx.beginPath();
        ctx.arc(punchHoleStartX, y, punchHoleRadius, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    ctx.globalAlpha = 1.0;
}

function drawInfoLine(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, value: string, description: string, headerSize: number, descSize: number) {
    // Color indicator
    ctx.fillStyle = color;
    ctx.fillRect(x, y, inchesToPixels(0.05, 300), inchesToPixels(0.35, 300));
    
    const textX = x + inchesToPixels(0.15, 300);
    
    // Header text (Value)
    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = `bold ${headerSize}px Poppins-Bold, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(value, textX, y);
    
    // Description text
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = `${descSize}px Poppins-Regular, Arial, sans-serif`;
    const descriptionY = y + headerSize + inchesToPixels(0.04, 300);
    ctx.fillText(description, textX, descriptionY);
}