/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { } from '@/models/Blocking.js';
import type { MiSignin } from '@/models/Signin.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { filterSigninHeaders } from '@/misc/signin-headers.js';

@Injectable()
export class SigninEntityService {
	constructor(
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiSignin,
	) {
		return {
			id: src.id,
			createdAt: this.idService.parse(src.id).date.toISOString(),
			ip: src.ip,
			// Filter here too so pre-existing rows that persisted sensitive
			// headers (Authorization, Cookie, etc.) before the write-path
			// filter was added don't leak to /i/signin-history clients.
			headers: filterSigninHeaders(src.headers),
			success: src.success,
		};
	}
}

