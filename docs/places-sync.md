# Account places

Legacy feature: the public dashboard no longer mounts account-place sync or a sign-in link. Places remain device-local. Existing account data stays private; see [the current browser architecture](browser-workspaces.md). The adapter and ownership tests remain for compatibility.

My weather keeps its existing device-local list and adds an optional private
account list in the hosted edition. Sign in and choose **Use account places** to
open the account list on each device. Opening it never uploads the device list.
**Add device places to account** explicitly imports locations, skipping coordinates
already present; it does not replace the account list. Each list holds up to 12
places. Adding and removing while in account mode saves to the account immediately.
Choose **Use device places** to return to the unchanged local list.

Account mode is session-only and defaults off after reload. Account names and
coordinates are held in memory, not copied to localStorage. Planner preferences
and tab-notification consent remain device-local. Creating account places does not
enroll watches or push subscriptions; deleting a place does not delete a watch.
Share links remain explicit and include the selected name and coordinates.

## Synchronization and ownership

- `GET /api/places` and same-origin JSON `POST /api/places` use the existing trusted
  hosted identity boundary. Anonymous requests receive 401. Ownership comes only
  from the signed-in identity, never a caller-supplied owner. Responses carry
  `private, no-store`, `nosniff`, no-referrer and noindex headers.
- `place_libraries` stores one row per owner: a revision UUID, bounded location
  array and update time. Migration `0005_windy_tag.sql` adds the table. Names are
  limited to 60 characters; coordinates must be finite numeric latitude/longitude;
  duplicate IDs, malformed IDs, control characters and oversized bodies fail.
- Every save includes its observed revision and an account fingerprint. An atomic
  compare-and-swap rejects a stale edit or changed account with 409. The page then
  reloads the current list without automatically replaying the user's stale edit.
  A failed/uncertain save disables further writes until a successful refresh.
  Reusing the same mutation UUID and payload is idempotent while it is the current
  revision; reusing it with another payload fails.
- Open, visible account views check once per minute and on focus/visibility return.
  Refresh is also explicit. This is polling, not instantaneous collaboration.
  A detected sign-out or changed account clears account data and restores the
  device list. A lost connection preserves the last displayed list with an error
  and blocks editing until refresh; it cannot detect an unseen remote sign-out.
- Switching lists invalidates pending forecast and sync responses, clears weather
  baselines, and prevents a prior account/location response repopulating a new view.
- Removing every place stores an empty list with a new revision. The owner/revision
  row remains so stale clients cannot resurrect deleted names or coordinates. The
  public instance admits at most 2,000 account-library rows atomically. Empty rows
  count toward this cap; existing accounts can still edit or clear their locations.
  No automatic expiry or export of private account libraries is provided yet.

The standalone/Python edition retains local places and hides account controls.
Hourly weather upkeep is unchanged; account-place polling runs only in the page.

## Verification limits

Tests cover service persistence, owner isolation, concurrent edits, stale-save
rejection after deletion, retry semantics, validation, capacity, HTTP boundaries,
UI opt-in/import, account switching, failed writes and response races. Built Worker
checks use explicit development identities on loopback only. Rendered sign-in and
two real signed-in browsers still need verification; DOM tests are not that proof.
