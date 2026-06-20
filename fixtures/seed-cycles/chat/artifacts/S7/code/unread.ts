/**
 * UnreadCount value object — pure domain, no framework or I/O dependencies.
 * S7 domain code for 社内チャット v0.0.1
 */

import type { ChannelId, UserId } from "./channel.js";

export const UNREAD_DISPLAY_MAX = 99;

export interface UnreadCount {
  readonly userId: UserId;
  readonly channelId: ChannelId;
  readonly count: number; // non-negative integer, real value (not capped)
}

/**
 * Returns the display label for the unread count badge.
 * Real count is preserved in the UnreadCount value; only the display is capped.
 */
export function unreadDisplayLabel(unread: UnreadCount): string {
  if (unread.count === 0) return "";
  return unread.count > UNREAD_DISPLAY_MAX
    ? `${UNREAD_DISPLAY_MAX}+`
    : String(unread.count);
}

/**
 * Increments the unread count for a channel member when a new message is posted.
 * The message author's own count is NOT incremented (invariant).
 */
export function incrementUnread(
  unread: UnreadCount,
  postingUserId: UserId
): UnreadCount {
  if (unread.userId === postingUserId) {
    // Invariant: author does not get their own message counted as unread.
    return unread;
  }
  return { ...unread, count: unread.count + 1 };
}

/**
 * Resets unread count to zero when a user opens the channel.
 */
export function markChannelRead(unread: UnreadCount): UnreadCount {
  return { ...unread, count: 0 };
}

/**
 * Initialises a zero-unread entry for a new channel member.
 */
export function initialUnread(
  userId: UserId,
  channelId: ChannelId
): UnreadCount {
  return { userId, channelId, count: 0 };
}
