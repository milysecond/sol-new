/**
 * sonner toast + brand SFX
 */
import { toast as base } from "sonner";
import type { ExternalToast } from "sonner";
import type { ReactNode } from "react";
import { playSfx } from "@/lib/sfx";

type Msg = string | ReactNode;

function withSound<T extends (...args: never[]) => unknown>(
  fn: T,
  kind: "success" | "error" | "notify"
): T {
  return ((...args: Parameters<T>) => {
    playSfx(kind);
    return fn(...args);
  }) as T;
}

export const toast = Object.assign(
  (message: Msg, data?: ExternalToast) => {
    playSfx("notify");
    return base(message, data);
  },
  {
    success: (message: Msg, data?: ExternalToast) => {
      playSfx("success");
      return base.success(message, data);
    },
    error: (message: Msg, data?: ExternalToast) => {
      playSfx("error");
      return base.error(message, data);
    },
    info: (message: Msg, data?: ExternalToast) => {
      playSfx("notify");
      return base.info(message, data);
    },
    warning: (message: Msg, data?: ExternalToast) => {
      playSfx("notify");
      return base.warning(message, data);
    },
    message: (message: Msg, data?: ExternalToast) => {
      playSfx("notify");
      return base.message(message, data);
    },
    loading: base.loading.bind(base),
    promise: base.promise.bind(base),
    custom: base.custom.bind(base),
    dismiss: base.dismiss.bind(base),
    /** Cash / claim / airdrop */
    money: (message: Msg, data?: ExternalToast) => {
      playSfx("money");
      return base.success(message, data);
    },
  }
);

export { playSfx, setSfxMuted, isSfxMuted } from "@/lib/sfx";
