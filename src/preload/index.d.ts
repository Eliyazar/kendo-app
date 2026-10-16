import type { AdminBridge, PublicBridge } from '../shared/ipc'

declare global {
  interface Window {
    /** Present only in the Admin window. */
    kendoAdmin: AdminBridge
    /** Present only in the Public window. */
    kendoPublic: PublicBridge
  }
}

export {}
