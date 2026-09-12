
/* Small, bounded EPUB reader. No third-party dependencies, scripts, remote
   resources, ZIP64, encryption, or DRM removal. Text-only EPUB 2/3 spine import. */
(() => {
  'use strict';
  const MAX_ARCHIVE = 10 * 1024 * 1024;
  const MAX_TEXT_ENTRY = 2 * 1024 * 1024;
  const MAX_TOTAL_TEXT = 3 * 1024 * 1024;
  const utf8 = new TextDecoder('utf-8');
  function safePath(path, base = '') {
    const parts = (base + path.split('#')[0]).split('/');
    const out = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!out.length) throw new Error('This EPUB has an invalid file path.'); out.pop(); }
      else out.push(part);
    }
    return out.join('/');
  }
  function xml(text) {
    // Parse as XML: never attach an imported DOM or load its assets.
    const safe = text.replace(/<!DOCTYPE[\s\S]*?(?:\]>|>)/gi, '')
      .replace(/&(?!(?:amp|lt|gt|quot|apos);)[a-zA-Z][a-zA-Z0-9]+;/g, ' ');
    const doc = new DOMParser().parseFromString(safe, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('A chapter in this EPUB is not readable XHTML. Try a TXT export.');
    return doc;
  }
  const all = (doc, name) => Array.from(doc.getElementsByTagName('*')).filter(el => el.localName === name);
  async function unzip(buffer) {
    if (buffer.byteLength > MAX_ARCHIVE) throw new Error('Please use a file smaller than 10 MB.');
    const data = new DataView(buffer); let end = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (data.getUint32(i, true) === 0x06054b50 && i + 22 + data.getUint16(i + 20, true) === buffer.byteLength) { end = i; break; }
    }
    if (end < 0) throw new Error('This is not a valid EPUB archive.');
    const count = data.getUint16(end + 10, true); let pos = data.getUint32(end + 16, true);
    if (data.getUint16(end + 4, true) !== 0 || data.getUint16(end + 6, true) !== 0 || count > 2000 || pos === 0xffffffff) throw new Error('Split or very large EPUB archives are not supported in this prototype.');
    const entries = new Map(); let totalExpanded = 0;
    for (let i = 0; i < count; i++) {
      if (pos + 46 > buffer.byteLength || data.getUint32(pos, true) !== 0x02014b50) throw new Error('The EPUB archive is damaged.');
      const flags = data.getUint16(pos + 8, true), method = data.getUint16(pos + 10, true);
      const compressed = data.getUint32(pos + 20, true), expanded = data.getUint32(pos + 24, true);
      const nameLen = data.getUint16(pos + 28, true), extraLen = data.getUint16(pos + 30, true), commentLen = data.getUint16(pos + 32, true);
      const offset = data.getUint32(pos + 42, true);
      if (pos + 46 + nameLen + extraLen + commentLen > buffer.byteLength || offset === 0xffffffff || compressed === 0xffffffff || expanded === 0xffffffff) throw new Error('The EPUB uses an unsupported ZIP format.');
      const name = safePath(utf8.decode(new Uint8Array(buffer, pos + 46, nameLen)));
      totalExpanded += expanded;
      if (totalExpanded > 80 * 1024 * 1024) throw new Error('This EPUB expands to more than the prototype’s 80 MB safety limit.');
      entries.set(name, { flags, method, compressed, expanded, offset });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return {
      has: name => entries.has(name),
      async text(name) {
        const e = entries.get(name);
        if (!e) throw new Error('The EPUB is missing a required chapter or metadata file.');
        if (e.flags & 1) throw new Error('Encrypted EPUB files are not supported. Please provide DRM-free text.');
        if (e.expanded > MAX_TEXT_ENTRY) throw new Error('An EPUB text section exceeds the 2 MB safety limit.');
        if (e.offset + 30 > buffer.byteLength || data.getUint32(e.offset, true) !== 0x04034b50) throw new Error('The EPUB archive has an invalid entry.');
        const start = e.offset + 30 + data.getUint16(e.offset + 26, true) + data.getUint16(e.offset + 28, true);
        if (start + e.compressed > buffer.byteLength) throw new Error('The EPUB archive is incomplete.');
        const bytes = new Uint8Array(buffer, start, e.compressed);
        if (e.method === 0) { if (bytes.length > MAX_TEXT_ENTRY) throw new Error('Text section too large.'); return utf8.decode(bytes); }
        if (e.method !== 8 || !window.DecompressionStream) throw new Error('Your browser cannot unpack this EPUB. Try a current browser or a TXT export.');
        let stream;
        try { stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
        catch { throw new Error('Your browser does not support this EPUB compression. Try a TXT export.'); }
        const reader = stream.getReader(); const chunks = []; let size = 0;
        try {
          while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_TEXT_ENTRY) { await reader.cancel(); throw new Error('Expanded text section exceeds 2 MB.'); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        if (size !== e.expanded) throw new Error('An EPUB section failed its size integrity check.');
        const result = new Uint8Array(size); let cursor = 0; for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
        return utf8.decode(result);
      }
    };
  }
  window.parseBookWormAIEPUB = async function(file) {
    const zip = await unzip(await file.arrayBuffer());
    if (zip.has('META-INF/encryption.xml')) throw new Error('This EPUB declares encrypted resources. This prototype only reads unencrypted EPUBs; a TXT export also works.');
    const container = xml(await zip.text('META-INF/container.xml'));
    const root = all(container, 'rootfile')[0];
    if (!root) throw new Error('The EPUB does not contain a readable package.');
    const opfPath = safePath(root.getAttribute('full-path') || '');
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opf = xml(await zip.text(opfPath));
    const title = all(opf, 'title')[0]?.textContent.trim() || file.name.replace(/\.epub$/i, '');
    const author = all(opf, 'creator')[0]?.textContent.trim() || 'From your personal library';
    const manifest = new Map(all(opf, 'item').map(el => [el.getAttribute('id'), el]));
    const spine = all(opf, 'itemref').filter(el => el.getAttribute('linear') !== 'no');
    if (spine.length > 250) throw new Error('This prototype supports up to 250 EPUB sections.');
    const chapters = []; let total = 0;
    for (const ref of spine) {
      const item = manifest.get(ref.getAttribute('idref'));
      if (!item || !/xhtml|html/.test(item.getAttribute('media-type') || '')) continue;
      const href = decodeURIComponent(item.getAttribute('href') || '');
      const doc = xml(await zip.text(safePath(href, base)));
      for (const tag of ['script','style','nav','svg','math','head']) for (const el of all(doc, tag)) el.remove();
      const heading = [...all(doc,'h1'),...all(doc,'h2')][0]?.textContent.replace(/\s+/g,' ').trim();
      const body = all(doc,'body')[0] || doc.documentElement;
      let nodes = Array.from(body.getElementsByTagName('*')).filter(el => ['p','li','blockquote','h3','h4'].includes(el.localName) && !el.parentElement?.closest('p, li, blockquote'));
      let texts = nodes.map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (!texts.length) { const fallback = body.textContent.replace(/\s+/g,' ').trim(); if (fallback.length > 25) texts = [fallback]; }
      // Keep bounded, text-only reading chunks.
      const paragraphs = [];
      for (let text of texts) {
        total += text.length;
        if (total > MAX_TOTAL_TEXT) throw new Error('This book has more than 3 MB of text. Please upload a shorter book or excerpt.');
        while (text.length > 1400) { let cut = text.lastIndexOf(' ', 1300); if (cut < 1) cut = 1300; paragraphs.push({text:text.slice(0,cut).trim()}); text = text.slice(cut).trim(); }
        if (text) paragraphs.push({text});
      }
      if (paragraphs.length) chapters.push({title:heading || `Section ${chapters.length + 1}`, paragraphs});
    }
    if (!chapters.length) throw new Error('No readable text was found in this EPUB. Scanned/image-only books are not supported.');
    return { id:'upload-' + cryptoRandomId(), title:title.slice(0,180), author:author.slice(0,180), category:'Your personal library', cover:'upload', description:'Your own book, with progressive narration and a space for questions.', uploaded:true, chapters };
  };
  function cryptoRandomId(){return window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2,9);}
})();
