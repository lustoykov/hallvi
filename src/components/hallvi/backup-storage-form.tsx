"use client";

import { useState } from "react";

/**
 * The owner connects the one off-host bucket backups upload to. The key is
 * typed here once and stored privately by the controller; Pi never sees it.
 */
export function BackupStorageForm({
  onConnected,
  className = "hv-op-approval",
}: {
  onConnected?: () => Promise<void>;
  /** The surrounding surface. Backups and Settings host the same form. */
  className?: string;
}) {
  const [values, setValues] = useState({
    provider: "r2",
    endpoint: "",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const field = (name: keyof typeof values, label: string, secret = false) => (
    <label>
      {label}
      <input
        type={secret ? "password" : "text"}
        autoComplete="off"
        required
        value={values[name]}
        onChange={(event) =>
          setValues((current) => ({ ...current, [name]: event.target.value }))
        }
      />
    </label>
  );
  return (
    <form
      className={className}
      aria-label="Connect backup storage"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
          const response = await fetch("/api/setup/backup-storage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error ?? "The storage access was refused.");
          await onConnected?.();
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "Could not connect.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <strong>Connect backup storage</strong>
      <p className="hv-section-note">
        One Cloudflare R2 or Amazon S3 bucket with an access key limited to it.
        The key is stored on this controller and copied only to the application
        host that uploads the backups.
      </p>
      <label>
        Provider
        <select
          value={values.provider}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              provider: event.target.value,
            }))
          }
        >
          <option value="r2">Cloudflare R2</option>
          <option value="s3">Amazon S3</option>
        </select>
      </label>
      {field("endpoint", "HTTPS endpoint")}
      {field("bucket", "Bucket")}
      {field("region", "Region")}
      {field("accessKeyId", "Access key ID")}
      {field("secretAccessKey", "Secret access key", true)}
      {error && (
        <p role="alert" className="hv-deployment-error">
          {error}
        </p>
      )}
      <button type="submit" className="hv-primary-button" disabled={saving}>
        {saving ? "Connecting…" : "Connect storage"}
      </button>
    </form>
  );
}
