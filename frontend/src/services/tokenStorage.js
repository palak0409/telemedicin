/**
 * JWT storage.
 *
 * sessionStorage is per browser tab and is cleared when the tab closes, which
 * suits shared clinic computers and lets you sign in as a patient and a doctor
 * in two tabs of the same browser while testing calls.
 */
const KEY = 'telemed.token'

export const tokenStorage = {
  get: () => sessionStorage.getItem(KEY),
  set: (token) => sessionStorage.setItem(KEY, token),
  clear: () => sessionStorage.removeItem(KEY),
}
