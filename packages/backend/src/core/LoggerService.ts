/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { LoggerColor } from '@/logger.js';

@Injectable()
export class LoggerService {
	constructor(
	) {
	}

	@bindThis
	public getLogger(domain: string, color?: LoggerColor | undefined, store?: boolean) {
		return new Logger(domain, color, store);
	}
}
