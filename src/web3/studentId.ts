import { keccak256, toUtf8Bytes } from "ethers";

/** Hashes the app's local student id into the bytes32 identifier the contract uses. */
export function toStudentIdHash(localId: string): string {
  return keccak256(toUtf8Bytes(localId));
}
