"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { cn } from "@/lib/utils"

// Single, app-consistent feedback channel for the slow story-generation actions. Mounted
// (scoped) around the learner page so the in-flight "Writing…" toast auto-clears when a
// successful generation redirects to the reader and unmounts this subtree.

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      className={cn(
        "rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10",
        "data-[type=error]:border-destructive data-[type=error]:text-destructive",
      )}
    >
      <ToastPrimitive.Title className="font-medium" />
      <ToastPrimitive.Description className="text-muted-foreground" />
    </ToastPrimitive.Root>
  ))
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

/** Next's redirect() throws this control-flow signal; it must propagate, not be swallowed. */
function isNextRedirect(e: unknown): boolean {
  if (e instanceof Error && e.message === "NEXT_REDIRECT") return true
  return (
    typeof e === "object" &&
    e != null &&
    "digest" in e &&
    String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  )
}

/**
 * Wrap a generation server action with a single live toast: a persistent "Writing your story… Ns"
 * that ticks each second, replaced in place by an error toast on failure. On success the action
 * redirects, unmounting the provider — so the loading toast disappears on its own.
 */
export function useGenerationToast() {
  const toast = ToastPrimitive.useToastManager()
  return React.useCallback(
    async (action: () => Promise<void>) => {
      const id = toast.add({ title: "Writing your story… 0s", type: "loading", timeout: 0 })
      const started = Date.now()
      const timer = setInterval(
        () => toast.update(id, { title: `Writing your story… ${Math.round((Date.now() - started) / 1000)}s` }),
        1000,
      )
      try {
        await action()
      } catch (e) {
        if (isNextRedirect(e)) throw e
        toast.update(id, {
          title: "Generation failed",
          description: e instanceof Error ? e.message : "Please try again.",
          type: "error",
          timeout: 8000,
        })
      } finally {
        clearInterval(timer)
      }
    },
    [toast],
  )
}
