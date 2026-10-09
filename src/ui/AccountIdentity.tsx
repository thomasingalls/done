/** Keep the full account ID visible; truncated prefixes need not be unique. */
export function AccountIdentity({ id }: { id: string }) {
  return (
    <span className="account-identity">
      <span>Account ID</span>
      <code aria-label="Account ID">{id}</code>
    </span>
  );
}
