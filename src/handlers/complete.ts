import { isPhoto, type PhaseHandler } from "../router.js";
import { resetSession } from "../session.js";
import { awaitingPhoto } from "./awaitingPhoto.js";

// Phase "complete": a new photo starts a fresh session and runs exactly like the first photo.
export const complete: PhaseHandler = async (session, msg) => {
  if (!isPhoto(msg.content))
    return [{ type: "text", text: "Your desk is done! Send a new photo or text 'start over' to go again." }];
  resetSession(session);
  return awaitingPhoto(session, msg);
};
