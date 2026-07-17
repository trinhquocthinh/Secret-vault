/**
 * Reproduces the 2 "death traps" described for Delete/Update sync logic:
 *
 * 1) "Zombie Resurrection" trap: Device A deletes a record and syncs. Device B
 *    (which has been offline and still holds the old copy) must NOT resurrect
 *    the record and push it back to the cloud. It must instead adopt the
 *    tombstone (isDeleted=true) and soft-delete its own local copy.
 *
 * 2) "Lost Update" trap: Device A updates a record's password. As long as
 *    `updatedAt` is bumped on every update, a stale remote copy with an older
 *    `updatedAt` must NOT win over the newer local change (Last-Write-Wins).
 */
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { DynamicVaultDatabase, type VaultMeta, type VaultRecord } from "./dexie-client";
import { KeyDerivationEngine } from "../crypto/key-derivation";
import { AesGcmEngine } from "../crypto/aes-gcm";
import { VaultSyncEngine } from "./vault-sync-engine";
import type { SyncPayload } from "./google-drive-client";

const CANARY_STRING = "ZERO_KNOWLEDGE_VAULT_VALID_CANARY";
const META_ID = "VAULT_CONFIG";
const PASSWORD = "1234";
const SAME_VAULT_ID = "sameVaultIdHash";

async function setupMeta(db: DynamicVaultDatabase, password: string, salt?: Uint8Array) {
  const encoder = new TextEncoder();
  const { key, salt: usedSalt } = await KeyDerivationEngine.deriveKey(encoder.encode(password), salt);
  const canary = await AesGcmEngine.encrypt(CANARY_STRING, key);
  const meta: VaultMeta = {
    id: META_ID,
    salt: usedSalt,
    canaryCipherText: canary.cipherText,
    canaryIv: canary.iv,
  };
  await db.meta.put(meta);
  return key;
}

describe("Tombstone (soft-delete) & Last-Write-Wins update sync", () => {
  it("does NOT resurrect a record deleted on Device A when merging into a stale Device B", async () => {
    // ============= DEVICE A: create record, then delete it (tombstone) =============
    const dbA = new DynamicVaultDatabase("deviceA-tombstone");
    await dbA.open();
    const keyA = await setupMeta(dbA, PASSWORD);
    // Both devices already share the same salt (as if a prior sync had happened), so this
    // test can focus purely on the tombstone merge logic instead of salt-adoption.
    const sharedSalt = (await dbA.meta.get(META_ID))!.salt;

    const enc = await AesGcmEngine.encrypt(JSON.stringify({ title: "GitHub", username: "u" }), keyA);
    const createdAt = Date.now() - 10_000;
    const original: VaultRecord = {
      id: "shared-id",
      cipherText: enc.cipherText,
      iv: enc.iv,
      createdAt,
      updatedAt: createdAt,
    };
    await dbA.records.add(original);

    // ============= DEVICE B: stale offline copy of the SAME record (never deleted) =============
    const dbB = new DynamicVaultDatabase("deviceB-tombstone");
    await dbB.open();
    await setupMeta(dbB, PASSWORD, sharedSalt);
    await dbB.records.add({ ...original });

    // Device A deletes the record -> tombstone with a NEWER updatedAt
    const now = Date.now();
    const tombstone: VaultRecord = {
      id: "shared-id",
      cipherText: new ArrayBuffer(0),
      iv: new Uint8Array(0),
      createdAt,
      updatedAt: now,
      isDeleted: true,
      deletedAt: now,
    };
    await dbA.records.put(tombstone);

    // Device A syncs up: export + upload (simulated as JSON round-trip)
    const exported = await VaultSyncEngine.exportVault(dbA, SAME_VAULT_ID);
    const remotePayload: SyncPayload = JSON.parse(JSON.stringify(exported));

    // Sanity: the tombstone WAS included in the exported payload (not filtered out)
    const remoteRecord = remotePayload.records.find((r) => r.id === "shared-id");
    expect(remoteRecord?.isDeleted).toBe(true);

    // ============= DEVICE B: pulls remote payload and merges =============
    await VaultSyncEngine.mergeAndSave(dbB, remotePayload, SAME_VAULT_ID);

    const localAfterMerge = await dbB.records.get("shared-id");
    expect(localAfterMerge?.isDeleted).toBe(true);

    // Device B now exports its own vault (as if it were about to push back to the cloud)
    const dbBExport = await VaultSyncEngine.exportVault(dbB, SAME_VAULT_ID);
    const dbBRemoteRecord = dbBExport.records.find((r) => r.id === "shared-id");

    // The record must remain deleted - it must NOT be resurrected as a live record
    expect(dbBRemoteRecord?.isDeleted).toBe(true);
  });

  it("a newer local update wins over a stale remote copy (Last-Write-Wins by updatedAt)", async () => {
    const db = new DynamicVaultDatabase("device-lww");
    await db.open();
    const key = await setupMeta(db, PASSWORD);

    const createdAt = Date.now() - 10_000;
    const oldEnc = await AesGcmEngine.encrypt(JSON.stringify({ title: "Bank", password: "old-pass" }), key);
    const localNewer: VaultRecord = {
      id: "rec-1",
      cipherText: oldEnc.cipherText,
      iv: oldEnc.iv,
      createdAt,
      updatedAt: Date.now(), // Local was JUST updated (newest)
    };
    await db.records.add(localNewer);

    // A stale remote copy with an OLDER updatedAt (simulates a lagging device pushing old data,
    // possibly with a clock skew that makes it look "newer" than it really is chronologically,
    // but here we assert the engine strictly trusts updatedAt as the source of truth).
    const staleEnc = await AesGcmEngine.encrypt(JSON.stringify({ title: "Bank", password: "stale-pass" }), key);
    const remotePayload: SyncPayload = {
      version: 1,
      vaultId: SAME_VAULT_ID,
      syncedAt: Date.now(),
      meta: {
        salt: Array.from((await db.meta.get(META_ID))!.salt),
        canaryCipherText: Array.from(new Uint8Array((await db.meta.get(META_ID))!.canaryCipherText)),
        canaryIv: Array.from((await db.meta.get(META_ID))!.canaryIv),
      },
      records: [
        {
          id: "rec-1",
          cipherText: Array.from(new Uint8Array(staleEnc.cipherText)),
          iv: Array.from(staleEnc.iv),
          createdAt,
          updatedAt: createdAt, // older than localNewer.updatedAt
        },
      ],
    };

    const result = await VaultSyncEngine.mergeAndSave(db, remotePayload, SAME_VAULT_ID);
    expect(result.updated).toBe(0); // stale remote must be rejected, not applied

    const finalRecord = await db.records.get("rec-1");
    const decrypted = await AesGcmEngine.decrypt(
      { cipherText: finalRecord!.cipherText, iv: finalRecord!.iv },
      key,
    );
    expect(JSON.parse(decrypted).password).toBe("old-pass"); // local (newer) copy survives
  });
});
