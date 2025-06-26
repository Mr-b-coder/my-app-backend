// server/idmlBuilder.ts

import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from 'xmldom';
import fs from 'fs/promises';
import path from 'path';
import { TemplatePayload } from './server.js';
import { fileURLToPath } from 'url';

// --- FINAL, SIMPLIFIED ROBUST PATHING ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// After our build step, template.idml will be right next to this running file.
const TEMPLATE_IDML_PATH = path.join(__dirname, 'template.idml');

const COLOR_SWATCH_MAP = {
    BLEED: 'Color/BleedColor',
    BACKGROUND: 'Color/BackgroundColor',
    SPINE: 'Color/SpineColor',
    SAFE_AREA: 'Color/SafeColor',
    BARCODE: 'Color/BarcodeColor',
};

const IDML_MAP = {
    SPREAD_FILE_PATH: 'Spreads/Spread_ue9.xml',
    PREFERENCES_FILE_PATH: 'Resources/Preferences.xml',
    
    FRAME_NAME_BLEED: 'Bleed_Rectangle',
    FRAME_NAME_BACKGROUND: 'Background_Rectangle',
    FRAME_NAME_SPINE: 'Spine_Rectangle',
    FRAME_NAME_LEFT_SAFE: 'LeftSafe_Rectangle',
    FRAME_NAME_RIGHT_SAFE: 'RightSafe_Rectangle',
    FRAME_NAME_BARCODE: 'Barcode_Rectangle',
    
    TEXT_FRAME_LHS_LOGO: 'Text_Logo_LHS',
    TEXT_FRAME_RHS_LOGO: 'Text_Logo_RHS',
    
    TEXT_FRAME_BLEED_INFO: 'Text_BleedInfo',
    TEXT_FRAME_SAFETY_INFO: 'Text_SafetyInfo',
    TEXT_FRAME_BARCODE_INFO: 'Text_BarcodeInfo',
    TEXT_FRAME_TOTAL_SIZE: 'Text_TotalSize',
    TEXT_FRAME_TRIM_SIZE: 'Text_TrimSize',
    TEXT_FRAME_SPINE_WIDTH: 'Text_SpineWidth',
    
    STORY_FILE_LHS_LOGO_TEXT: 'Stories/Story_u317.xml',  CONTENT_ID_LHS_LOGO_TEXT: 'u317',
    STORY_FILE_RHS_LOGO_TEXT: 'Stories/Story_u389.xml',  CONTENT_ID_RHS_LOGO_TEXT: 'u389',
    STORY_FILE_BLEED_VAL: 'Stories/Story_u331.xml',        CONTENT_ID_BLEED_VAL: 'u331',
    STORY_FILE_BLEED_DESC: 'Stories/Story_u3ed.xml',       CONTENT_ID_BLEED_DESC: 'u3ed',
    STORY_FILE_SAFETY_VAL: 'Stories/Story_u409.xml',      CONTENT_ID_SAFETY_VAL: 'u409',
    STORY_FILE_SAFETY_DESC: 'Stories/Story_u420.xml',     CONTENT_ID_SAFETY_DESC: 'u420',
    STORY_FILE_BARCODE_VAL: 'Stories/Story_u437.xml',     CONTENT_ID_BARCODE_VAL: 'u437',
    STORY_FILE_BARCODE_DESC: 'Stories/Story_u44e.xml',    CONTENT_ID_BARCODE_DESC: 'u44e',
    STORY_FILE_TOTAL_SIZE_VAL: 'Stories/Story_u4a6.xml',   CONTENT_ID_TOTAL_SIZE_VAL: 'u4a6',
    STORY_FILE_TOTAL_SIZE_DESC: 'Stories/Story_u4bd.xml',  CONTENT_ID_TOTAL_SIZE_DESC: 'u4bd',
    STORY_FILE_TRIM_SIZE_VAL: 'Stories/Story_u4d4.xml',    CONTENT_ID_TRIM_SIZE_VAL: 'u4d4',
    STORY_FILE_TRIM_SIZE_DESC: 'Stories/Story_u4eb.xml',   CONTENT_ID_TRIM_SIZE_DESC: 'u4eb',
    STORY_FILE_SPINE_VAL: 'Stories/Story_u509.xml',        CONTENT_ID_SPINE_VAL: 'u509',
    STORY_FILE_SPINE_DESC: 'Stories/Story_u520.xml',       CONTENT_ID_SPINE_DESC: 'u520',
};

const DPI = 72;

// --- HELPER FUNCTIONS ---

const findElementByName = (doc: Document, name: string): Element | null => {
    const allElements = doc.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].getAttribute('Name') === name) return allElements[i];
    }
    return null;
};

const findElementById = (doc: Document, elementId: string): Element | null => {
    const allElements = doc.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].getAttribute('Self') === elementId) return allElements[i];
    }
    return null;
};

const setTransformAndColor = (doc: Document, elementName: string, transform: { x: number; y: number; width: number; height: number; color?: string }) => {
    const element = findElementByName(doc, elementName);
    if (!element) {
        console.warn(`IDML Warning: Element named '${elementName}' not found.`);
        return;
    }
    const transformValue = `${transform.width} 0 0 ${transform.height} ${transform.x} ${transform.y}`;
    element.setAttribute('ItemTransform', transformValue);
    if (transform.color) {
        element.setAttribute('FillColor', transform.color);
    }
};

const updateStoryContent = (storyDoc: Document | undefined, storyId: string, newText: string, contentIndex: number = 0) => {
    if (!storyDoc) return;
    const storyElement = findElementById(storyDoc, storyId);
    if (storyElement) {
        const contentElements = storyElement.getElementsByTagName('Content');
        if (contentElements[contentIndex]) contentElements[contentIndex].textContent = newText;
    }
};

const updatePageSetup = (preferencesDoc: Document, spreadDoc: Document, payload: TemplatePayload) => {
    const { totalWidth, totalHeight, spineWidth, bleed } = payload;
    const widthPt = totalWidth * DPI;
    const heightPt = totalHeight * DPI;
    const gutterPt = (spineWidth ?? 0) * DPI;
    const bleedPt = (bleed ?? 0) * DPI;

    const docPrefs = preferencesDoc.getElementsByTagName('DocumentPreference')[0];
    if (docPrefs) {
        docPrefs.setAttribute('PageWidth', String(widthPt));
        docPrefs.setAttribute('PageHeight', String(heightPt));
    }
    
    const marginPrefs = preferencesDoc.getElementsByTagName('MarginPreference')[0];
    if (marginPrefs) {
        marginPrefs.setAttribute('ColumnCount', '2');
        marginPrefs.setAttribute('ColumnGutter', String(gutterPt));
    }

    const spread = spreadDoc.getElementsByTagName('Spread')[0];
    if (spread) {
        const page = spread.getElementsByTagName('Page')[0];
        if (page) page.setAttribute('GeometricBounds', `0 0 ${heightPt} ${widthPt}`);
    }
};

// --- Main Exported Function ---
export async function buildIdml(payload: TemplatePayload): Promise<Buffer> {
    const templateData = await fs.readFile(TEMPLATE_IDML_PATH);
    
    const zip = await JSZip.loadAsync(templateData);
    const parser = new DOMParser();

    const storyFilePaths = [...new Set(Object.values(IDML_MAP).filter(val => typeof val === 'string' && val.startsWith('Stories/')))];
    const storyDocs: { [key: string]: Document | undefined } = {};
    for (const filePath of storyFilePaths) {
        const file = zip.file(filePath);
        if (file) { storyDocs[filePath] = parser.parseFromString(await file.async("string"), "application/xml"); }
    }
    
    const spreadFile = zip.file(IDML_MAP.SPREAD_FILE_PATH);
    const preferencesFile = zip.file(IDML_MAP.PREFERENCES_FILE_PATH);
    if (!spreadFile || !preferencesFile) throw new Error("Spread or Preferences file not found.");
    const spreadDoc = parser.parseFromString(await spreadFile.async("string"), "application/xml");
    const preferencesDoc = parser.parseFromString(await preferencesFile.async("string"), "application/xml");

    if (payload.bindingType === 'Perfect Bind / Softcover') {
        
        updatePageSetup(preferencesDoc, spreadDoc, payload);

        const totalW_pt = payload.totalWidth * DPI, totalH_pt = payload.totalHeight * DPI;
        const trimW_pt = payload.trimWidth * DPI, trimH_pt = payload.trimHeight * DPI;
        const bleed_pt = (payload.bleed ?? 0) * DPI, spine_pt = (payload.spineWidth ?? 0) * DPI, safety_pt = (payload.safetyMargin ?? 0) * DPI;
        const leftSpineX = bleed_pt + trimW_pt, rightSpineX = leftSpineX + spine_pt;

        // Size, Position, and Color All Elements
        setTransformAndColor(spreadDoc, IDML_MAP.FRAME_NAME_BLEED, { x: 0, y: 0, width: totalW_pt, height: totalH_pt, color: COLOR_SWATCH_MAP.BLEED });
        setTransformAndColor(spreadDoc, IDML_MAP.FRAME_NAME_BACKGROUND, { x: bleed_pt, y: bleed_pt, width: totalW_pt - (2 * bleed_pt), height: trimH_pt, color: COLOR_SWATCH_MAP.BACKGROUND });
        setTransformAndColor(spreadDoc, IDML_MAP.FRAME_NAME_SPINE, { x: leftSpineX, y: 0, width: spine_pt, height: totalH_pt, color: COLOR_SWATCH_MAP.SPINE });
        setTransformAndColor(spreadDoc, IDML_MAP.FRAME_NAME_LEFT_SAFE, { x: bleed_pt + safety_pt, y: bleed_pt + safety_pt, width: trimW_pt - (2 * safety_pt), height: trimH_pt - (2 * safety_pt), color: COLOR_SWATCH_MAP.SAFE_AREA });
        setTransformAndColor(spreadDoc, IDML_MAP.FRAME_NAME_RIGHT_SAFE, { x: rightSpineX + safety_pt, y: bleed_pt + safety_pt, width: trimW_pt - (2 * safety_pt), height: trimH_pt - (2 * safety_pt), color: COLOR_SWATCH_MAP.SAFE_AREA });
        const barcodeW = 1.75 * DPI, barcodeH = 1 * DPI;
        const barcodeX = leftSpineX - safety_pt - barcodeW - 5, barcodeY = bleed_pt + safety_pt + 5;
        setTransformAndColor(spreadDoc, IDML_MAP.FRAME_NAME_BARCODE, { x: barcodeX, y: barcodeY, width: barcodeW, height: barcodeH, color: COLOR_SWATCH_MAP.BARCODE });

        // Update Text
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_LHS_LOGO_TEXT], IDML_MAP.CONTENT_ID_LHS_LOGO_TEXT, `BACK COVER`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_RHS_LOGO_TEXT], IDML_MAP.CONTENT_ID_RHS_LOGO_TEXT, `FRONT COVER`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_SAFETY_VAL], IDML_MAP.CONTENT_ID_SAFETY_VAL, `${(payload.safetyMargin ?? 0).toFixed(3)} in`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_TRIM_SIZE_VAL], IDML_MAP.CONTENT_ID_TRIM_SIZE_VAL, `${payload.trimWidth}x${payload.trimHeight} in`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_SPINE_VAL], IDML_MAP.CONTENT_ID_SPINE_VAL, `${(payload.spineWidth ?? 0).toFixed(3)} in`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_SPINE_DESC], IDML_MAP.CONTENT_ID_SPINE_DESC, `Spine Text Area for ${payload.pageCount} pages using ${payload.paperStock}`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_BLEED_VAL], IDML_MAP.CONTENT_ID_BLEED_VAL, `${(payload.bleed ?? 0).toFixed(3)} in`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_TOTAL_SIZE_VAL], IDML_MAP.CONTENT_ID_TOTAL_SIZE_VAL, `${payload.totalWidth.toFixed(3)} x ${payload.totalHeight.toFixed(3)} in`);
        updateStoryContent(storyDocs[IDML_MAP.STORY_FILE_BARCODE_VAL], IDML_MAP.CONTENT_ID_BARCODE_VAL, "1.75 x 1 in");
    }

    const serializer = new XMLSerializer();
    for (const filePath in storyDocs) { if(storyDocs[filePath]) { zip.file(filePath, serializer.serializeToString(storyDocs[filePath]!)); }}
    zip.file(IDML_MAP.SPREAD_FILE_PATH, serializer.serializeToString(spreadDoc));
    zip.file(IDML_MAP.PREFERENCES_FILE_PATH, serializer.serializeToString(preferencesDoc));
    
    return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/vnd.adobe.indesign-idml-package', compression: 'DEFLATE' });
}