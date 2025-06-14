import {
	updateMetaGroup,
	cachedGroupMetadataAll,
	cachedGroupMetadata,
} from "../models/group.ts";
import { getAutoMute } from "../models/automute.ts";
import {
	getCurrentTimeString,
	startClockAlignedScheduler,
} from "../utils/constants.ts";
import lang from "../utils/lang.ts";
import { getAutoKick } from "../models/autokick.ts";
import type { WASocket } from "baileys";

export default function (sock: WASocket) {
	const fetchAndUpdateGroups = async () => {
		try {
			if (!sock.authState?.creds?.registered) return;

			const data = await sock.groupFetchAllParticipating();
			for (const [jid, metadata] of Object.entries(data)) {
				await updateMetaGroup(jid, metadata);
			}
			console.log(`Saved ${Object.keys(data).length} groups metadata.`);
		} catch (e) {}
	};

	setTimeout(() => {
		fetchAndUpdateGroups();
		autoKick(sock);
		setInterval(fetchAndUpdateGroups, 45 * 1000);
		startClockAlignedScheduler(() => groupAutoMute(sock));
	}, 5000);
}

async function groupAutoMute(client: WASocket) {
	const currentTime = getCurrentTimeString();
	const allGroupMetadata = await cachedGroupMetadataAll();

	for (const [jid] of Object.entries(allGroupMetadata)) {
		const automute = await getAutoMute(jid);
		if (!automute) continue;

		const isGroupLocked = await client.groupMetadata(jid).then(
			metadata => metadata?.announce === true,
			() => false,
		);

		if (currentTime === automute.startTime.toLowerCase() && !isGroupLocked) {
			await client.sendMessage(jid, {
				text: lang.GROUP_NOW_AUTO_MUTED,
			});
			await client.groupSettingUpdate(jid, "announcement");
			continue;
		}

		if (
			automute.endTime &&
			currentTime === automute.endTime.toLowerCase() &&
			isGroupLocked
		) {
			await client.sendMessage(jid, {
				text: lang.GROUP_NOW_AUTO_UNMUTED,
			});
			await client.groupSettingUpdate(jid, "not_announcement");
			continue;
		}
	}
}

export async function autoKick(client: WASocket) {
	client.ev.on("group-participants.update", async update => {
		const groupJid = update.id;
		const groupInfo = await cachedGroupMetadata(groupJid);
		const addedParticipants = update.participants ?? [];

		const useLid = groupInfo.addressingMode === "lid";

		const autoKickList = await getAutoKick(groupJid);

		if (!autoKickList.length) return;

		for (const user of addedParticipants) {
			const identifier = useLid ? user.split(":")[1] : user;
			if (autoKickList.includes(identifier)) {
				await client.groupParticipantsUpdate(groupJid, [user], "remove");
			}
		}
	});
}
