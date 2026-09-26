import { io } from "socket.io-client";
import { SERVER_URL } from "./api";

// autoConnect is off so callers can attach 'connect'/'disconnect' listeners
// before the handshake starts — otherwise a fast connect can fire before
// anyone is listening and the UI gets stuck thinking it's disconnected.
// The sign-in token is sent with every (re)connect so the server can put this
// socket in the right rooms and deliver only events meant for this person.
let token = null;
export const socket = io(SERVER_URL, { autoConnect: false, auth: (cb) => cb({ token }) });

// Call whenever the sign-in token changes (login, logout, session restore).
export function setSocketToken(next) {
  token = next;
  if (socket.connected || socket.active) {
    socket.disconnect();
    socket.connect();
  }
}
