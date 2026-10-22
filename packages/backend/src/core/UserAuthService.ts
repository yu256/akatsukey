/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as OTPAuth from 'otpauth';
import { DI } from '@/di-symbols.js';
import type { MiUserProfile, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class UserAuthService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
	) {
	}

	@bindThis
	public async twoFactorAuthenticate(profile: MiUserProfile, token: string): Promise<void> {
		if (profile.twoFactorBackupSecret?.includes(token)) {
			await this.userProfilesRepository.update({ userId: profile.userId }, {
				twoFactorBackupSecret: profile.twoFactorBackupSecret.filter((secret) => secret !== token),
			});
		} else {
			const now = Date.now();
			const normalizedToken = token.trim();
			const validationWindow = 1;
			const timeStep = 30;

			const totp = new OTPAuth.TOTP({
				secret: OTPAuth.Secret.fromBase32(profile.twoFactorSecret!),
				digits: 6,
				period: timeStep,
			});

			const delta = totp.validate({
				token: normalizedToken,
				window: validationWindow,
				timestamp: now,
			});

			if (delta === null) {
				throw new Error('authentication failed');
			}

			const currentStep = totp.counter({ timestamp: now });
			const step = currentStep + delta;
			const usedTokenRedisKey = `2fa:used:${profile.userId}:${step}`;
			const ttl = timeStep * (validationWindow * 2 + 1);
			const setResult = await this.redisClient.set(usedTokenRedisKey, normalizedToken, 'EX', ttl, 'NX');

			if (setResult === null) {
				throw new Error('authentication failed');
			}
		}
	}
}
