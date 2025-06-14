import {
	makeWASocket,
	makeCacheableSignalKeyStore,
	Browsers,
	fetchLatestBaileysVersion,
} from "baileys";
import { HttpsProxyAgent } from "https-proxy-agent";
import NodeCache from "@cacheable/node-cache";

import config from "../../config.mjs";
import events from "./events.ts";
import hooks from "./hooks.ts";
import useSqliteAuthState from "../utils/useSqliteAuthState.ts";
import { pairClient } from "./pair.ts";
import { getMessage, cachedGroupMetadata } from "../models/index.ts";

(async () => {
	const { state, saveCreds } = await useSqliteAuthState();
	const { version } = await fetchLatestBaileysVersion();
	const cache = new NodeCache();

	const sock = makeWASocket({
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys),
		},
		agent: config.PROXY ? new HttpsProxyAgent(config.PROXY) : undefined,
		version,
		keepAliveIntervalMs: 2000,
		browser: Browsers.windows("chrome"),
		syncFullHistory: true,
		emitOwnEvents: true,
		generateHighQualityLinkPreview: true,
		linkPreviewImageThumbnailWidth: 1920,
		msgRetryCounterCache: cache,
		mediaCache: cache,
		userDevicesCache: cache,
		callOfferCache: cache,
		getMessage,
		cachedGroupMetadata,
	});

	await pairClient(sock);

	await Promise.all([events(sock, { saveCreds }), hooks(sock)]);

	return sock;
})();
