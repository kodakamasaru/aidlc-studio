/**
 * Channel aggregate — pure domain, no framework or I/O dependencies.
 * S7 domain code for 社内チャット v0.0.1
 */

export type ChannelId = string & { readonly _brand: "ChannelId" };
export type UserId = string & { readonly _brand: "UserId" };

/** Value object: ChannelName */
export class ChannelName {
  private constructor(private readonly value: string) {}

  static readonly MAX_LENGTH = 50;
  // 英数字・ひらがな・カタカナ(長音符 ー U+30FC を含む)・CJK統合漢字・ハイフン・アンダースコア
  // BUG-DOMAIN-01 fix: 旧 `ァ-ヶ`(U+30A1–U+30F6)は長音符 ー(U+30FC)を含まず
  // 「サーバー」「メンバー」等を誤拒否していた。`ー` を許可文字に追加。
  private static readonly VALID_PATTERN =
    /^[a-zA-Z0-9ぁ-ゖァ-ヶー一-鿿\-_]+$/;

  static create(raw: string): ChannelName {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new InvalidChannelNameError("チャンネル名は空にできません");
    }
    if (trimmed.length > ChannelName.MAX_LENGTH) {
      throw new InvalidChannelNameError(
        `チャンネル名は ${ChannelName.MAX_LENGTH} 文字以内にしてください`
      );
    }
    if (!ChannelName.VALID_PATTERN.test(trimmed)) {
      throw new InvalidChannelNameError(
        "チャンネル名に使用できない文字が含まれています(スペース不可)"
      );
    }
    return new ChannelName(trimmed);
  }

  toString(): string {
    return this.value;
  }

  equals(other: ChannelName): boolean {
    return this.value === other.value;
  }
}

export interface Channel {
  readonly id: ChannelId;
  readonly name: ChannelName;
  readonly description: string | null;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
}

export interface CreateChannelInput {
  id: ChannelId;
  name: string;
  description?: string;
  createdByUserId: UserId;
  now: Date;
}

/** Factory: creates a new Channel aggregate root. */
export function createChannel(input: CreateChannelInput): Channel {
  const name = ChannelName.create(input.name);
  return {
    id: input.id,
    name,
    description: input.description?.trim() || null,
    createdByUserId: input.createdByUserId,
    createdAt: input.now,
  };
}

// --- Domain errors ---

export class InvalidChannelNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidChannelNameError";
  }
}

export class ChannelNameDuplicateError extends Error {
  constructor(name: string) {
    super(`チャンネル名「${name}」はすでに使われています`);
    this.name = "ChannelNameDuplicateError";
  }
}

export class ChannelNotFoundError extends Error {
  constructor(channelId: string) {
    super(`チャンネル ${channelId} が見つかりません`);
    this.name = "ChannelNotFoundError";
  }
}

export class AlreadyMemberError extends Error {
  constructor(userId: string, channelId: string) {
    super(`ユーザー ${userId} はすでにチャンネル ${channelId} のメンバーです`);
    this.name = "AlreadyMemberError";
  }
}
