'use strict';

const ExcelImageParser = (() => {

  /**
   * Parses an xlsx File and extracts embedded images mapped to cell coordinates (row, col)
   * @param {File} file The uploaded File object
   * @returns {Promise<Object>} Map of "row,col" -> Blob (0-indexed coordinates)
   */
  async function extractImages(file) {
    if (typeof JSZip === 'undefined') {
      console.warn('JSZip is not loaded.');
      return {};
    }

    try {
      const zip = await JSZip.loadAsync(file);
      const mediaMap = {}; // filename -> blob
      const drawingsMap = {}; // relId -> filename
      const cellImageMap = {}; // "row,col" -> blob

      // 1. Extract all media files from xl/media/
      const mediaFiles = Object.keys(zip.files).filter(path => path.startsWith('xl/media/'));
      for (const path of mediaFiles) {
        const blob = await zip.files[path].async('blob');
        const filename = path.replace('xl/media/', '');
        mediaMap[filename] = blob;
      }

      // 2. Extract drawing relationships (relId -> filename)
      const relsFiles = Object.keys(zip.files).filter(path => path.startsWith('xl/drawings/_rels/') && path.endsWith('.rels'));
      for (const path of relsFiles) {
        try {
          const text = await zip.files[path].async('text');
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          const relationships = xml.getElementsByTagName('Relationship');
          for (let i = 0; i < relationships.length; i++) {
            const rel = relationships[i];
            const id = rel.getAttribute('Id');
            const target = rel.getAttribute('Target');
            if (id && target) {
              const filename = target.replace('../media/', '');
              drawingsMap[id] = filename;
            }
          }
        } catch (err) {
          console.error('Error parsing drawing rels:', err);
        }
      }

      // 3. Parse drawings XML (row, col -> relId)
      const drawingFiles = Object.keys(zip.files).filter(path => path.startsWith('xl/drawings/') && path.endsWith('.xml'));
      for (const path of drawingFiles) {
        try {
          const text = await zip.files[path].async('text');
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          
          // Query twoCellAnchor and oneCellAnchor nodes
          const anchors = xml.querySelectorAll('twoCellAnchor, oneCellAnchor, TwoCellAnchor, OneCellAnchor');
          for (let i = 0; i < anchors.length; i++) {
            const anchor = anchors[i];
            
            const from = anchor.getElementsByTagName('from')[0] || anchor.getElementsByTagName('xdr:from')[0];
            if (!from) continue;
            
            const colEl = from.getElementsByTagName('col')[0] || from.getElementsByTagName('xdr:col')[0];
            const rowEl = from.getElementsByTagName('row')[0] || from.getElementsByTagName('xdr:row')[0];
            if (!colEl || !rowEl) continue;
            
            const col = parseInt(colEl.textContent, 10);
            const row = parseInt(rowEl.textContent, 10);
            
            const pic = anchor.getElementsByTagName('pic')[0] || anchor.getElementsByTagName('xdr:pic')[0];
            if (!pic) continue;
            
            const blip = pic.getElementsByTagName('blip')[0] || pic.getElementsByTagName('a:blip')[0];
            if (!blip) continue;
            
            const embedId = blip.getAttribute('r:embed') || blip.getAttribute('embed') || blip.getAttribute('r:id');
            if (embedId && drawingsMap[embedId]) {
              const filename = drawingsMap[embedId];
              if (mediaMap[filename]) {
                cellImageMap[`${row},${col}`] = mediaMap[filename];
              }
            }
          }
        } catch (err) {
          console.error('Error parsing drawing XML:', err);
        }
      }

      return cellImageMap;
    } catch (err) {
      console.error('Failed to parse Excel images:', err);
      return {};
    }
  }

  return { extractImages };
})();
