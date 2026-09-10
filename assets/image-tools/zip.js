// ZIP "store" entries: image formats are already compressed. UTF-8 filenames, CRC-32.
const table = Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
export async function createZip(files) {
    if (!files.length) throw new Error('沒有可下載的圖片。');
    const total = files.reduce((sum, file) => sum + file.blob.size, 0);
    if (total > 200 * 1024 ** 2) throw new Error('ZIP 上限為 200 MB，請分批處理。');
    const chunks = [], directory = [], used = new Set(), encoder = new TextEncoder();
    let offset = 0, directorySize = 0;
    for (const file of files) {
        const dot = file.name.lastIndexOf('.'), stem = file.name.slice(0, dot), ext = file.name.slice(dot);
        let name = file.name, count = 2;
        while (used.has(name.toLowerCase())) name = `${stem}_${count++}${ext}`;
        used.add(name.toLowerCase());
        const bytes = new Uint8Array(await file.blob.arrayBuffer()), label = encoder.encode(name);
        let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
        const local = new Uint8Array(30 + label.length), lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
        lv.setUint16(12, 33, true); lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, label.length, true); local.set(label, 30);
        const central = new Uint8Array(46 + label.length), cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(14, 33, true);
        cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, label.length, true); cv.setUint32(42, offset, true); central.set(label, 46);
        chunks.push(local, bytes); directory.push(central); offset += local.length + bytes.length; directorySize += central.length;
    }
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
