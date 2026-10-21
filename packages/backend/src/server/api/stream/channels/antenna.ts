/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { isUserRelated } from '@/misc/is-user-related.js';
import { DI } from '@/di-symbols.js';
import type { AntennasRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteStreamingHidingService } from '../NoteStreamingHidingService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import Channel, { type MiChannelService } from '../channel.js';

class AntennaChannel extends Channel {
	public readonly chName = 'antenna';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private antennaId: string;

	constructor(
		private antennasRepository: AntennasRepository,
		private noteEntityService: NoteEntityService,
		private noteStreamingHidingService: NoteStreamingHidingService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
		//this.onEvent = this.onEvent.bind(this);
	}

	@bindThis
	public async init(params: any) {
		if (typeof params.antennaId !== 'string') return;
		if (!this.user) return;
		this.antennaId = params.antennaId;

		const antennaExists = await this.antennasRepository.exists({
			where: {
				id: this.antennaId,
				userId: this.user.id,
			},
		});
		if (!antennaExists) return;

		// Subscribe stream
		this.subscriber.on(`antennaStream:${this.antennaId}`, this.onEvent);
	}

	@bindThis
	private async onEvent(data: GlobalEvents['antenna']['payload']) {
		if (data.type === 'note') {
			let note = await this.noteEntityService.pack(data.body.id, this.user, { detail: true });

			if (!this.isNoteVisibleForMe(note)) return;

			// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
			if (isUserRelated(note, this.userIdsWhoMeMuting)) return;
			// 流れてきたNoteがブロックされているユーザーが関わるものだったら無視する
			if (isUserRelated(note, this.userIdsWhoBlockingMe)) return;

			if (note.renote && !note.text && isUserRelated(note, this.userIdsWhoMeMutingRenotes)) return;

			const filtered = await this.noteStreamingHidingService.filter(note, this.user?.id ?? null);
			if (!filtered) return;
			note = filtered;

			this.connection.cacheNote(note);

			this.send('note', note);
		} else {
			this.send(data.type, data.body);
		}
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`antennaStream:${this.antennaId}`, this.onEvent);
	}
}

@Injectable()
export class AntennaChannelService implements MiChannelService<true> {
	public readonly shouldShare = AntennaChannel.shouldShare;
	public readonly requireCredential = AntennaChannel.requireCredential;
	public readonly kind = AntennaChannel.kind;

	constructor(
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private noteEntityService: NoteEntityService,
		private noteStreamingHidingService: NoteStreamingHidingService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): AntennaChannel {
		return new AntennaChannel(
			this.antennasRepository,
			this.noteEntityService,
			this.noteStreamingHidingService,
			id,
			connection,
		);
	}
}
