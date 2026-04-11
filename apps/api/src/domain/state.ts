import { AuthStore } from "./auth-store";
import { EventStore } from "./event-store";
import { MenuStore } from "./menu-store";
import { StockStore } from "./stock-store";
import { TableStore } from "./table-store";
import { UserStore } from "./user-store";

export const eventStore = new EventStore();
export const userStore = new UserStore(eventStore);
export const authStore = new AuthStore(eventStore, userStore);
export const menuStore = new MenuStore(eventStore);
export const stockStore = new StockStore(eventStore);
export const tableStore = new TableStore(eventStore);

