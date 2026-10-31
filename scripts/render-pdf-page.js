// Renders PDF pages to PNG for checking where values land (macOS PDFKit, no installs).
// osascript -l JavaScript scripts/render-pdf-page.js <file.pdf> <outdir> <page index>...
function run(argv) {
  ObjC.import("PDFKit"); ObjC.import("AppKit")
  const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]))
  return argv.slice(2).map(Number).map((i) => {
    const page = d.pageAtIndex(i)
    const { size } = page.boundsForBox(0)
    const img = page.thumbnailOfSizeForBox($.NSMakeSize(size.width * 2, size.height * 2), 0)
    const png = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $())
    const out = `${argv[1]}/page${i}.png`
    png.writeToFileAtomically(out, true)
    return out
  }).join("\n")
}
