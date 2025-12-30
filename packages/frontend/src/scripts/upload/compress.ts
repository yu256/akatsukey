/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import isAnimated from 'is-file-animated';
import encode from '@jsquash/webp/encode.js';

export async function createImageData(file: File): Promise<ImageData> {
	const img = await new Promise<HTMLImageElement>(resolve => {
		const image = new Image();

		image.onload = () => {
			URL.revokeObjectURL(image.src);
			resolve(image);
		};

		image.src = URL.createObjectURL(file);
	});

	const cv = document.createElement('canvas');
	[cv.width, cv.height] = [img.naturalWidth, img.naturalHeight];
	const ctx = cv.getContext('2d');
	ctx!.drawImage(img, 0, 0);
	return ctx!.getImageData(0, 0, cv.width, cv.height);
}

export const compressTypes = {
	'image/jpeg': /(jpg|jpeg)$/,
	'image/png': /png$/,
	'image/webp': /webp$/,
	'image/svg+xml': /svg$/,
} as const satisfies Record<string, RegExp>;

export async function shouldBeCompressed(file: File): Promise<boolean> {
	return (compressTypes[file.type] && !await isAnimated(file));
}

/**
 * Compress image with specified options
 * @param file Original file
 * @param options Compression options
 * @returns Compressed blob or null if compression failed
 */
export async function compressImage(
	file: File,
	options: {
		targetSize?: boolean; // Use target size compression (1MB)
		quality?: number; // Fixed quality (default: 80)
		minQuality?: number; // Minimum quality for target size compression (default: 50)
		highQuality?: boolean; // Use high quality WebP settings (default: false)
	} = {}
): Promise<Blob | null> {
	if (!compressTypes[file.type] || await isAnimated(file)) {
		return null;
	}

	const imageData = await createImageData(file);
	
	if (options.targetSize) {
		// Use target size compression
		const targetSizeBytes = 1048576; // 1MB
		const minQuality = options.minQuality ?? 50;
		let quality = 80;
		let compressedBlob: Blob | null = null;

		// Try different quality levels from 80 down to minQuality
		while (quality >= minQuality) {
			try {
				const webpOptions = options.highQuality ? {
					quality,
					method: 6, // effort=6
					stripMetadata: true
				} : {
					quality,
					stripMetadata: true
				};

				const compressed = new Blob([
					await encode(imageData, webpOptions)
				], { type: 'image/webp' });

				compressedBlob = compressed;

				// If we've reached the target size, return this version
				if (compressed.size <= targetSizeBytes) {
					break;
				}

				quality -= 5;
			} catch (err) {
				console.error('Failed to compress image at quality', quality, err);
				break;
			}
		}

		// Return the compressed version if it's smaller than original, otherwise null
		return compressedBlob && compressedBlob.size < file.size ? compressedBlob : null;
	} else {
		// Use fixed quality compression
		const quality = options.quality ?? 80;
		try {
			const webpOptions = options.highQuality ? {
				quality,
				method: 6, // effort=6
				stripMetadata: true
			} : { 
				quality,
				stripMetadata: true
			};

			const compressed = new Blob([
				await encode(imageData, webpOptions)
			], { type: 'image/webp' });

			// Return compressed version if it's smaller than original or if it's WebP
			return compressed.size < file.size || file.type === 'image/webp' ? compressed : null;
		} catch (err) {
			console.error('Failed to compress image at quality', quality, err);
			return null;
		}
	}
}

/**
 * Compress image to target file size (1MB by default)
 * @param file Original file
 * @param targetSizeBytes Target file size in bytes (default: 1MB)
 * @param minQuality Minimum quality to try (default: 50)
 * @returns Compressed blob or null if compression failed
 * @deprecated Use compressImage with targetSize option instead
 */
export async function compressToTargetSize(
	file: File, 
	targetSizeBytes: number = 1048576, // 1MB
	minQuality: number = 50
): Promise<Blob | null> {
	return compressImage(file, { targetSize: true, minQuality });
}
