// Writes the marketplace icons. The design is imgs/actions/pr-slot/key.svg, scaled.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUTPUT_FOLDER = new URL("../com.nocture.prvitals.sdPlugin/imgs/plugin/", import.meta.url);
const KEY_SIZE = 144;
const ICON_SIZE = 256;
const RETINA_SCALE = 2;
const BAND_HEIGHT = 25;
const BACKGROUND = [0x26, 0x26, 0x2a];
const BAND = [0x1f, 0x8a, 0x42];
const BYTES_PER_PIXEL = 4;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
});

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(typeAndData));
	return Buffer.concat([length, typeAndData, checksum]);
}

function rowColor(y, size) {
	const keyY = (y / size) * KEY_SIZE;
	return keyY >= BAND_HEIGHT ? BACKGROUND : BAND;
}

function encodePng(size) {
	const rowLength = 1 + size * BYTES_PER_PIXEL;
	const raw = Buffer.alloc(rowLength * size);
	for (let y = 0; y < size; y++) {
		const rowStart = y * rowLength;
		raw[rowStart] = 0;
		const [red, green, blue] = rowColor(y, size);
		for (let x = 0; x < size; x++) {
			raw.set([red, green, blue, 0xff], rowStart + 1 + x * BYTES_PER_PIXEL);
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(new URL("marketplace.png", OUTPUT_FOLDER), encodePng(ICON_SIZE));
writeFileSync(new URL("marketplace@2x.png", OUTPUT_FOLDER), encodePng(ICON_SIZE * RETINA_SCALE));
