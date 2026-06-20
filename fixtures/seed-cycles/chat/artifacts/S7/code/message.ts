/**
 * Message aggregate — pure domain, no framework or I/O dependencies.
 * S7 domain code for 社内チャット v0.0.1
 */

import type { ChannelId, UserId } from "./channel.js";

export type MessageId = string & { readonly _brand: "MessageId" };

/** Value object: MessageBody */
export class MessageBody {
  private constructor(private readonly value: string) {}

  static readonly MAX_LENGTH = 4000;

  static create(raw: string): MessageBody {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new EmptyBodyError();
    }
    if (raw.length > MessageBody.MAX_LENGTH) {
      throw new BodyTooLongError(raw.length, MessageBody.MAX_LENGTH);
    }
    return new MessageBody(raw); // preserve original formatting (newlines)
  }

  toString(): string {
    return this.value;
  }

  /** Extract @mention usernames from the message body. */
  extractMentions(): string[] {
    const pattern = /@([a-zA-Z0-9_\-]+)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(this.value)) !== null) {
      matches.push(match[1]);
    }
    // deduplicate
    return [...new Set(matches)];
  }
}

export interface Message {
  readonly id: MessageId;
  readonly channelId: ChannelId;
  readonly authorId: UserId;
  readonly body: MessageBody;
  readonly postedAt: Date;
  readonly deletedAt: Date | null;
}

export interface PostMessageInput {
  id: MessageId;
  channelId: ChannelId;
  authorId: UserId;
  body: string;
  now: Date;
}

/** Factory: creates a new Message. Validates body. */
export function postMessage(input: PostMessageInput): Message {
  const body = MessageBody.create(input.body);
  return {
    id: input.id,
    channelId: input.channelId,
    authorId: input.authorId,
    body,
    postedAt: input.now,
    deletedAt: null,
  };
}

/**
 * Marks a message as deleted (logical delete).
 * Only the author can delete.
 */
export function deleteMessage(
  message: Message,
  requestingUserId: UserId,
  now: Date
): Message {
  if (message.authorId !== requestingUserId) {
    throw new NotMessageAuthorError(requestingUserId, message.id);
  }
  if (message.deletedAt !== null) {
    throw new MessageAlreadyDeletedError(message.id);
  }
  return { ...message, deletedAt: now };
}

// --- Domain errors ---

export class EmptyBodyError extends Error {
  constructor() {
    super("メッセージ本文を入力してください");
    this.name = "EmptyBodyError";
  }
}

export class BodyTooLongError extends Error {
  constructor(actual: number, max: number) {
    super(`メッセージは ${max} 文字以内にしてください（現在 ${actual} 文字）`);
    this.name = "BodyTooLongError";
  }
}

export class NotMessageAuthorError extends Error {
  constructor(userId: UserId, messageId: MessageId) {
    super(`ユーザー ${userId} はメッセージ ${messageId} の作成者ではありません`);
    this.name = "NotMessageAuthorError";
  }
}

export class MessageAlreadyDeletedError extends Error {
  constructor(messageId: MessageId) {
    super(`メッセージ ${messageId} はすでに削除されています`);
    this.name = "MessageAlreadyDeletedError";
  }
}

export class MessageNotFoundError extends Error {
  constructor(messageId: string) {
    super(`メッセージ ${messageId} が見つかりません`);
    this.name = "MessageNotFoundError";
  }
}
