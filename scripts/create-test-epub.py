"""Create original, disposable EPUB fixtures for the browser importer checks."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED

directory = Path('output/fixtures')
directory.mkdir(parents=True, exist_ok=True)
for compression, name in [(ZIP_STORED, 'audio-stored.epub'), (ZIP_DEFLATED, 'audio-deflated.epub')]:
    with ZipFile(directory / name, 'w', compression=compression) as archive:
        archive.writestr('mimetype', 'application/epub+zip', compress_type=ZIP_STORED)
        archive.writestr('META-INF/container.xml', '''<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''')
        archive.writestr('OEBPS/book.opf', '''<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book">bookworm-original-audio-fixture</dc:identifier><dc:title>Audio MVP Test Book</dc:title><dc:creator>BookWormAI test fixture</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="second" href="second.xhtml" media-type="application/xhtml+xml"/><item id="first" href="first.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>''')
        archive.writestr('OEBPS/first.xhtml', '''<html xmlns="http://www.w3.org/1999/xhtml"><head><title>First</title></head><body><h1>The quiet garden</h1><p>The gate opened slowly. A small bird waited beside the path.</p><p>Beyond the apple tree, a lamp was still burning in the window.</p></body></html>''')
        archive.writestr('OEBPS/second.xhtml', '''<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second</title></head><body><h1>A new morning</h1><p>The sun rose above the wall. It was time to begin again.</p></body></html>''')
    print(directory / name)
