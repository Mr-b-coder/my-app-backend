// server/buildInteriorIdml.ts

import jszip from 'jszip';
import { TemplatePayload } from './server.js';

/**
 * Builds a single-page IDML template suitable for a book interior.
 * @param payload - The dimension and details payload from the frontend.
 * @returns A promise that resolves with the interior IDML file as a Buffer.
 */
const INCH_TO_POINTS = 72;

/**
 * IDML GeometricBounds are "TOP LEFT BOTTOM RIGHT" in points (1/72 inch).
 * For a single page: top=0, left=0, bottom=height in pts, right=width in pts.
 */
export async function buildInteriorIdml(payload: TemplatePayload): Promise<Buffer> {
  const { trimWidth, trimHeight } = payload;
  const widthPt = trimWidth * INCH_TO_POINTS;
  const heightPt = trimHeight * INCH_TO_POINTS;
  const bounds = `0 0 ${heightPt} ${widthPt}`;

  // Minimal set of files for a valid single-page IDML.
  const idmlFiles: Record<string, string> = {
    "mimetype": "application/vnd.adobe.indesign-idml-package",
    "designmap.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><DesignMap><MasterSpread src="MasterSpreads/MasterSpread_u1.xml"/><Spread src="Spreads/Spread_u1.xml"/></DesignMap>`,
    "MasterSpreads/MasterSpread_u1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" Self="u1" Name="A-Master"><Page Self="u2" GeometricBounds="${bounds}"/></idPkg:MasterSpread>`,
    "Spreads/Spread_u1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" Self="u3"><Page Self="u4" AppliedMaster="u1" GeometricBounds="${bounds}"/></idPkg:Spread>`,
    "Resources/Graphic.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Graphic/>`,
    "Resources/Fonts.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Fonts/>`,
    "Resources/Styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Styles/>`,
    "META-INF/manifest.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><idPkg:Manifest xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"><idPkg:FilePath src="designmap.xml"/><idPkg:FilePath src="MasterSpreads/MasterSpread_u1.xml"/><idPkg:FilePath src="Spreads/Spread_u1.xml"/></idPkg:Manifest>`
  };

  const zip = new jszip();

  for (const [path, content] of Object.entries(idmlFiles)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: "STORE" });
}