import { AuthStore } from "./auth-store";
import { EventStore } from "./event-store";

export const eventStore = new EventStore();
export const authStore = new AuthStore(eventStore);

