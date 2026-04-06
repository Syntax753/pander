import Friend from "./types/Friend";

// Hardcoded default friends list. Will be expanded with Discord guild member lookup later.
const DEFAULT_FRIENDS: Friend[] = [
  {
    discordId: 'syntax_38139',
    username: 'Peter',
    avatarUrl: null,
  },
  {
    discordId: 'erikh2000',
    username: 'Erik',
    avatarUrl: null,
  },
  {
    discordId: 've_esse_code',
    username: 'Eduardo',
    avatarUrl: null,
  },
];

export function getFriendsList(): Friend[] {
  return DEFAULT_FRIENDS;
}
