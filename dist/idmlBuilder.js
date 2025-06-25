// server/idmlBuilder.ts
import jszip from 'jszip';
/**
 * Builds a complete IDML cover template (which is a zipped package).
 * @param payload - An object containing all necessary final dimensions from the frontend.
 * @returns A promise that resolves with the IDML file as a Buffer.
 */
export async function buildIdml(payload) {
    const { totalWidth, totalHeight, spineWidth, bleed } = payload;
    // Calculate the trim width of a single page (front or back cover)
    const singlePageWidth = (totalWidth - spineWidth - (bleed * 2)) / 2;
    const singlePageHeight = totalHeight - (bleed * 2);
    // Define the XML content for the various files that make up an IDML package.
    const idmlFiles = {
        "mimetype": "application/vnd.adobe.indesign-idml-package",
        // designmap.xml: Points to the main spread.
        "designmap.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<DesignMap>
  <MasterSpread src="MasterSpreads/MasterSpread_u1a.xml" />
  <Spread src="Spreads/Spread_u1a.xml" />
</DesignMap>`,
        // MasterSpreads/MasterSpread_u1a.xml: Defines the two-page master spread.
        "MasterSpreads/MasterSpread_u1a.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0" Self="u1a" Name="A-Master" NamePrefix="A">
  <Properties>
    <PageColor type="enumeration">UseMasterColor</PageColor>
  </Properties>
  <Page Self="u1b" GeometricBounds="0 ${-singlePageWidth} ${singlePageHeight} 0" ItemTransform="1 0 0 1 0 0" Name="2" />
  <Page Self="u1c" GeometricBounds="0 0 ${singlePageHeight} ${singlePageWidth}" ItemTransform="1 0 0 1 ${spineWidth} 0" Name="1" />
</idPkg:MasterSpread>`,
        // Spreads/Spread_u1a.xml: Defines the actual working spread applying the master.
        "Spreads/Spread_u1a.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0" Self="u1a" AppliedMaster="u1a" PageCount="2" BindingLocation="1">
  <Properties>
    <ViewPreference HorizontalScaling="100" VerticalScaling="100" />
    <PageColor type="enumeration">UseMasterColor</PageColor>
  </Properties>
  <Page Self="u1b" AppliedMaster="u1a" GeometricBounds="0 ${-singlePageWidth} ${singlePageHeight} 0" ItemTransform="1 0 0 1 0 0" Override="false" />
  <Page Self="u1c" AppliedMaster="u1a" GeometricBounds="0 0 ${singlePageHeight} ${singlePageWidth}" ItemTransform="1 0 0 1 ${spineWidth} 0" Override="false" />
</idPkg:Spread>`,
        // Boilerplate files required for a valid IDML.
        "Resources/Graphic.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Graphic />`,
        "Resources/Fonts.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Fonts />`,
        "Resources/Styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Styles><RootCharacterStyleGroup Self="u1d" Name="$ID/Root"><CharacterStyle Self="u1e" Name="$ID/None" /> </RootCharacterStyleGroup><RootParagraphStyleGroup Self="u1f" Name="$ID/Root"><ParagraphStyle Self="u20" Name="$ID/NormalParagraphStyle" /> </RootParagraphStyleGroup></Styles>`,
        "META-INF/manifest.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><manifest><file-entry media-type="application/vnd.adobe.indesign-idml-package" full-path="/"/>
<file-entry media-type="text/xml" full-path="designmap.xml"/>
<file-entry media-type="text/xml" full-path="MasterSpreads/MasterSpread_u1a.xml"/>
<file-entry media-type="text/xml" full-path="Spreads/Spread_u1a.xml"/>
<file-entry media-type="text/xml" full-path="Resources/Graphic.xml"/>
<file-entry media-type="text/xml" full-path="Resources/Fonts.xml"/>
<file-entry media-type="text/xml" full-path="Resources/Styles.xml"/>
</manifest>`,
    };
    const zip = new jszip();
    // Add all the IDML component files to the zip.
    for (const [path, content] of Object.entries(idmlFiles)) {
        zip.file(path, content);
    }
    // Generate the final IDML file (which is a zip) as a buffer.
    return zip.generateAsync({ type: 'nodebuffer', compression: "STORE" });
}
