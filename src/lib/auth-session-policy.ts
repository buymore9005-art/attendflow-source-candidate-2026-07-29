export interface AuthIdentityTransition {
  identityChanged: boolean;
  shouldLoadBootstrap: boolean;
  userIdToClear: string | null;
}

export function planAuthIdentityTransition(
  previousUserId: string,
  nextUserId: string
): AuthIdentityTransition {
  const identityChanged = previousUserId !== nextUserId;
  return {
    identityChanged,
    shouldLoadBootstrap: identityChanged && Boolean(nextUserId),
    userIdToClear: identityChanged && previousUserId ? previousUserId : null
  };
}
