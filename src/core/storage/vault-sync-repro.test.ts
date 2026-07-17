/**
 * Reproduces the cross-device (new browser / incognito) sync scenario:
 * Device A creates a vault + records and pushes to the cloud. Device B unlocks
 * for the first time (no local meta, generates its own random salt), pulls the
 * remote backup, adopts Device A's salt/canary, and after a forced relogin
 * must be able to decrypt all synced records with the correct password.
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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("Cross-device sync (salt adoption + forced relogin)", () => {
  it("device B can decrypt Device A's records after adopting the remote salt and relogging in", async () => {
    const encoder = new TextEncoder();

    // ============= DEVICE A: first-time unlock (fresh) =============
    const dbA = new DynamicVaultDatabase("deviceA");
    await dbA.open();

    const passA = encoder.encode(PASSWORD);
    const { key: keyA, salt: saltA } = await KeyDerivationEngine.deriveKey(passA);
    const canaryA = await AesGcmEngine.encrypt(CANARY_STRING, keyA);
    const metaA: VaultMeta = {
      id: META_ID,
      salt: saltA,
      canaryCipherText: canaryA.cipherText,
      canaryIv: canaryA.iv,
    };
    await dbA.meta.put(metaA);

    // Add 3 records on Device A
    for (let i = 0; i < 3; i++) {
      const enc = await AesGcmEngine.encrypt(JSON.stringify({ title: `rec${i}`, username: "u" }), keyA);
      const record: VaultRecord = {
        id: `id-${i}`,
        cipherText: enc.cipherText,
        iv: enc.iv,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await dbA.records.add(record);
    }

    // Export vault and round-trip through JSON, like a real Google Drive upload/download
    const exported = await VaultSyncEngine.exportVault(dbA, SAME_VAULT_ID);
    const remotePayload: SyncPayload = JSON.parse(JSON.stringify(exported));

    // ============= DEVICE B (incognito): first-time unlock (fresh, 0 records) =============
    const dbB = new DynamicVaultDatabase("deviceB");
    await dbB.open();

    const passB1 = encoder.encode(PASSWORD);
    expect(await dbB.meta.get(META_ID)).toBeUndefined();

    const { key: keyB1, salt: saltB } = await KeyDerivationEngine.deriveKey(passB1);
    const canaryB = await AesGcmEngine.encrypt(CANARY_STRING, keyB1);
    const freshMetaB: VaultMeta = {
      id: META_ID,
      salt: saltB,
      canaryCipherText: canaryB.cipherText,
      canaryIv: canaryB.iv,
    };
    await dbB.meta.put(freshMetaB);
    expect(toHex(saltB)).not.toBe(toHex(saltA));

    // ============= DEVICE B: click Sync =============
    const result = await VaultSyncEngine.mergeAndSave(dbB, remotePayload, SAME_VAULT_ID);
    expect(result.requireRelogin).toBe(true);
    expect(result.added).toBe(3);

    // ============= DEVICE B: forced relogin (lockVault then unlockVault again) =============
    await dbB.close();

    const dbB2 = new DynamicVaultDatabase("deviceB");
    await dbB2.open();

    const metaAfterAdopt = await dbB2.meta.get(META_ID);
    expect(metaAfterAdopt).toBeDefined();
    expect(toHex(metaAfterAdopt!.salt)).toBe(toHex(saltA));

    const passB2 = encoder.encode(PASSWORD);
    const { key: keyB2 } = await KeyDerivationEngine.deriveKey(passB2, metaAfterAdopt!.salt);

    // Canary check (this is what unlockVault does to validate the password)
    const decryptedCanary = await AesGcmEngine.decrypt(
      { cipherText: metaAfterAdopt!.canaryCipherText, iv: metaAfterAdopt!.canaryIv },
      keyB2,
    );
    expect(decryptedCanary).toBe(CANARY_STRING);

    // Now decrypt all records like fetchAndDecryptVault does
    const records = await dbB2.records.toArray();
    expect(records.length).toBe(3);

    let decryptedCount = 0;
    for (const record of records) {
      const jsonStr = await AesGcmEngine.decrypt({ cipherText: record.cipherText, iv: record.iv }, keyB2);
      expect(JSON.parse(jsonStr).title).toMatch(/^rec\d$/);
      decryptedCount++;
    }
    expect(decryptedCount).toBe(3);
  });
});

