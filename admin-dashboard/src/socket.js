import { io } from "socket.io-client";
import { SERVER_URL } from "./api";

// autoConnect is off so callers can attach 'connect'/'disconnect' listeners
// before the handshake starts — otherwise a fast connect can fire before
// anyone is listening and the UI gets stuck thinking it's disconnected.
export const socket = io(SERVER_URL, { autoConnect: false });
