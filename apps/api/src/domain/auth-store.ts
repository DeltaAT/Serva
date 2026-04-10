import { ApiError } from "./api-error";
import { EventStore } from "./event-store";
import type { UserStore } from "./user-store";

export class AuthStore {
  constructor(
    private readonly eventStore: EventStore,
    private readonly userStore: UserStore
  ) {}

  authenticateMaster(input: { username: string; password: string }) {
    const masterUsername = process.env.MASTER_USERNAME;
    const masterPassword = process.env.MASTER_PASSWORD;
    if (!masterUsername || !masterPassword) {
      throw new ApiError(500, "MASTER_AUTH_NOT_CONFIGURED", "Master credentials are not configured");
    }

    if (input.username !== masterUsername || input.password !== masterPassword) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid master credentials");
    }
  }

  authenticateAdmin(input: { eventId: number; username: string; password: string }) {
    this.eventStore.verifyEventAdminCredentials(input.eventId, input.username, input.password);
    return { eventId: input.eventId };
  }

  loginWaiter(input: { username: string; eventPasscode: string }) {
    const eventId = this.eventStore.verifyActiveEventPasscode(input.eventPasscode);
    const user = this.userStore.getOrCreateUserForEvent(eventId, input.username);

    if (user.isLocked) {
      throw new ApiError(423, "USER_LOCKED", "User account is locked");
    }

    return {
      eventId,
      user,
    };
  }

  getPrincipalFromClaims(claims: {
    role: "master" | "admin" | "waiter";
    eventId?: number;
    username?: string;
  }) {
    if (claims.role === "master") {
      return { role: "master" as const };
    }

    if (claims.role === "admin") {
      return {
        role: "admin" as const,
        eventId: claims.eventId,
      };
    }

    if (!claims.eventId || !claims.username) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid waiter token");
    }

    if (!this.eventStore.getEvent(claims.eventId)) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid waiter token");
    }

    const user = this.userStore.getUserForEventByUsername(claims.eventId, claims.username);
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Waiter session not found");
    }

    if (user.isLocked) {
      throw new ApiError(423, "USER_LOCKED", "User account is locked");
    }

    return {
      role: "waiter" as const,
      eventId: claims.eventId,
      user: {
        id: user.id,
        username: user.username,
        isLocked: user.isLocked,
      },
    };
  }
}

