import { AuthStore } from "./auth-store";
import { EventStore } from "./event-store";
import { MenuStore } from "./menu-store";
import { TableStore } from "./table-store";

export const eventStore = new EventStore();
export const authStore = new AuthStore(eventStore);
export const menuStore = new MenuStore(eventStore);
export const tableStore = new TableStore(eventStore);

