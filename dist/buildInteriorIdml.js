// server/buildInteriorIdml.ts
import jszip from 'jszip';
/**
 * Builds a single-page IDML template suitable for a book interior.
 * @param payload - The dimension and details payload from the frontend.
 * @returns A promise that resolves with the interior IDML file as a Buffer.
 */
export async function buildInteriorIdml(payload) {
    const { trimWidth, trimHeight } = payload;
    // Define the bounds for a single page.
    const bounds = `0 0 ${trimHeight} ${trimWidth}`;
    // Minimal set of files for a valid single-page IDML.
    const idmlFiles = {
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
