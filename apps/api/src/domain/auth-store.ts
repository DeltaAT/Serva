import { ApiError } from "./api-error";
import { EventStore } from "./event-store";

type UserRecord = {
  id: number;
  username: string;
  isLocked: boolean;
  eventId: number;
};

export class AuthStore {
  private usersByKey = new Map<string, UserRecord>();
  private nextUserId = 1;

  constructor(private readonly eventStore: EventStore) {}

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
    const key = `${eventId}:${input.username}`;
    let user = this.usersByKey.get(key);
    if (!user) {
      user = {
        id: this.nextUserId++,
        username: input.username,
        isLocked: false,
        eventId,
      };
      this.usersByKey.set(key, user);
    }

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

    const key = `${claims.eventId}:${claims.username}`;
    const user = this.usersByKey.get(key);
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Waiter session not found");
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

