export function matchesEitherLineProtocol(
  selectedProtocol: string | null,
  ownProtocolId: string,
  opponentProtocolId: string,
): boolean {
  if (!selectedProtocol) return false;
  return selectedProtocol === ownProtocolId || selectedProtocol === opponentProtocolId;
}
